// src/services/gmailService.js - Updated to use environment variable for approver email

const { google } = require('googleapis');
const { serviceLogger } = require('../utils/logger');

class GmailService {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_GMAIL_REDIRECT_URI || '/auth/google/gmail/callback' // ✅ Fixed
    );
  }
  // 🚀 NEW: Check if user needs to re-authorize (redirect to login)
  static needsReauthorization(user) {
    return !user.gmailScopeGranted || !user.gmailAccessToken;
  }

  // 🚀 NEW: Get login URL with Gmail permissions
  static getAuthUrl() {
    return '/auth/google'; // Use Passport OAuth flow instead of separate Gmail auth
  }

  // Set user credentials for OAuth client
  setUserCredentials(user) {
    if (!user.gmailAccessToken) {
      throw new Error(
        'User has no Gmail access token - please re-login to grant Gmail permissions'
      );
    }

    this.oauth2Client.setCredentials({
      access_token: user.getDecryptedGmailAccessToken(),
      refresh_token: user.getDecryptedGmailRefreshToken(),
      expiry_date: user.gmailTokenExpiry
        ? user.gmailTokenExpiry.getTime()
        : null,
    });

    return this.oauth2Client;
  }

  // Generate email content based on request
  generateEmailContent(user, requests) {
    const {
      EMAIL_REQ_DO_LABEL = 'REQ DO',
      EMAIL_PM_OFF_LABEL = 'REQ PM OFF',
      EMAIL_AM_OFF_LABEL = 'REQ AM OFF',
      TUIFLY_APPROVER_EMAIL = 'scheduling@tuifly.be', // Use environment variable
    } = process.env;

    // Group requests by month for subject line
    const firstRequest = requests[0];
    const startDate = new Date(firstRequest.startDate);
    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];

    const monthName = monthNames[startDate.getMonth()];
    const year = startDate.getFullYear();

    // Use user's code or fallback to environment variable
    const employeeCode = user.code || process.env.EMPLOYEE_CODE || 'XXX';

    // Generate subject
    const subject = `${employeeCode} CREW REQUEST - ${monthName} ${year}`;

    // Generate request lines
    const requestLines = requests
      .map(request => {
        const date = new Date(request.startDate);
        const formattedDate = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;

        let line = '';
        switch (request.type) {
          case 'REQ_DO':
            line = `${EMAIL_REQ_DO_LABEL} - ${formattedDate}`;
            break;
          case 'PM_OFF':
            line = `${EMAIL_PM_OFF_LABEL} - ${formattedDate}`;
            break;
          case 'AM_OFF':
            line = `${EMAIL_AM_OFF_LABEL} - ${formattedDate}`;
            break;
          case 'FLIGHT':
            line = `REQ FLIGHT ${request.flightNumber} - ${formattedDate}`; // ✅ FIXED: REQ FLIGHT
            break;
          default:
            line = `${request.type} - ${formattedDate}`;
        }

        return line.trim();
      })
      .join('\n');

    // Generate email body
    const customMessage = requests[0]?.customMessage || '';
    let body = `Dear,\n\n${requestLines}`;

    if (customMessage) {
      body += `\n\n${customMessage}`;
    }

    // Use user's signature or fallback
    const signature =
      user.signature || `Brgds,\n${user.name || user.email.split('@')[0]}`;
    body += `\n\n${signature}`;

    return {
      to: TUIFLY_APPROVER_EMAIL,
      subject: subject,
      text: body,
      html: body.replace(/\n/g, '<br>'),
    };
  }

  // Send email using Gmail API
  async sendEmail(user, requests) {
    try {
      // Set user credentials
      this.setUserCredentials(user);

      // Check if token needs refresh
      await this.refreshTokenIfNeeded(user);

      // Generate email content
      const emailContent = this.generateEmailContent(user, requests);

      // Create Gmail API client
      const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

      // Create email message
      const message = [
        `To: ${emailContent.to}`,
        `Subject: ${emailContent.subject}`,
        '',
        emailContent.text,
      ].join('\n');

      // Encode message
      const encodedMessage = Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      // Send email
      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage,
        },
      });

      return {
        success: true,
        messageId: response.data.id,
        threadId: response.data.threadId,
        to: emailContent.to,
        subject: emailContent.subject,
      };
    } catch (error) {
      serviceLogger.logError(error, {
        operation: 'sendEmail',
        service: 'gmailService',
        userId: user.id,
        userEmail: user.email,
        requestCount: requests.length,
        requestIds: requests.map(r => r.id),
        errorCode: error.code
      });

      // Handle specific error types
      if (error.code === 401) {
        throw new Error('Gmail authentication failed. Please re-authorize.');
      } else if (error.code === 403) {
        throw new Error(
          'Gmail send permission denied. Please grant send permission.'
        );
      } else if (error.message.includes('invalid_grant')) {
        throw new Error('Gmail token expired. Please re-authorize.');
      }

      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  // Check for replies to sent emails - SIMPLIFIED: No more timestamp comparison issues!
  async checkForReplies(user, gmailThreadId, lastProcessedMessageId = null) {
    try {
      // Set user credentials
      this.setUserCredentials(user);

      // Check if token needs refresh
      await this.refreshTokenIfNeeded(user);

      // Create Gmail API client
      const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

      // Get thread messages
      const thread = await gmail.users.threads.get({
        userId: 'me',
        id: gmailThreadId,
      });

      // Find new messages since last processed message
      const messages = thread.data.messages || [];
      const newMessages = [];

      serviceLogger.info(`Thread ${gmailThreadId} has ${messages.length} total messages. Last processed message: ${lastProcessedMessageId || 'none'}`);

      // Find the index of the last processed message
      let startIndex = 0;
      if (lastProcessedMessageId) {
        const lastProcessedIndex = messages.findIndex(m => m.id === lastProcessedMessageId);
        if (lastProcessedIndex !== -1) {
          startIndex = lastProcessedIndex + 1; // Start after the last processed message
          serviceLogger.info(`Found last processed message at index ${lastProcessedIndex}, starting from index ${startIndex}`);
        } else {
          serviceLogger.info(`Last processed message ${lastProcessedMessageId} not found in thread, checking all messages`);
        }
      }

      // Process only new messages (after the last processed one)
      for (let i = startIndex; i < messages.length; i++) {
        const message = messages[i];
        
        const messageDetails = await gmail.users.messages.get({
          userId: 'me',
          id: message.id,
        });

        const receivedDate = new Date(
          parseInt(messageDetails.data.internalDate)
        );

        const fromHeader = messageDetails.data.payload.headers.find(
          h => h.name.toLowerCase() === 'from'
        );
        const fromEmail = fromHeader ? fromHeader.value : 'unknown';
        
        // Flag to track if this is a user reply (vs scheduling reply)
        let isUserReply = false;

        serviceLogger.info(`Processing message ${message.id}: from=${fromEmail}, received=${receivedDate.toISOString()}`);

        // Handle messages from the user differently
        if (fromHeader && fromHeader.value.includes(user.email)) {
          // If this is the first message in the thread, skip it (original request)
          if (i === 0) {
            serviceLogger.info(`Skipping message ${message.id} - original request from user (${user.email})`);
            continue;
          } else {
            // This is a user reply to scheduling - mark as user has reviewed
            serviceLogger.info(`Found user reply ${message.id} from ${user.email} - user has reviewed by responding`);
            // Add flag to indicate this is a user reply (not scheduling reply)
            isUserReply = true;
          }
        }

        serviceLogger.info(`Found NEW message ${message.id} from ${fromEmail} - will process as reply`);

        // Extract message body
        const body = this.extractMessageBody(messageDetails.data.payload);

        newMessages.push({
          id: message.id,
          threadId: gmailThreadId,
          from: fromHeader ? fromHeader.value : 'Unknown',
          body: body,
          receivedAt: receivedDate,
          isUserReply: isUserReply, // Flag to indicate if this is user reply
        });
      }

      return {
        success: true,
        newMessages,
        totalMessages: messages.length,
      };
    } catch (error) {
      serviceLogger.logError(error, {
        operation: 'checkForReplies',
        service: 'gmailService',
        userId: user.id,
        userEmail: user.email,
        threadId: gmailThreadId,
        lastProcessedMessageId: lastProcessedMessageId
      });
      throw new Error(`Failed to check for replies: ${error.message}`);
    }
  }

  // Extract message body from Gmail payload
  extractMessageBody(payload) {
    let body = '';

    if (payload.body && payload.body.data) {
      body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    } else if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body && part.body.data) {
          body += Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
      }
    }

    return body.trim();
  }

  // Analyze reply content for approval/denial keywords
  analyzeReplyContent(replyBody) {
    const approvalKeywords = (
      process.env.APPROVAL_KEYWORDS || 'approved,approve,yes,ok,confirmed'
    )
      .split(',')
      .map(k => k.trim().toLowerCase());
    const denialKeywords = (
      process.env.DENIAL_KEYWORDS || 'denied,deny,no,rejected,decline'
    )
      .split(',')
      .map(k => k.trim().toLowerCase());

    const bodyLower = replyBody.toLowerCase();

    // Check for approval keywords
    const hasApprovalKeyword = approvalKeywords.some(
      keyword => keyword && bodyLower.includes(keyword)
    );

    // Check for denial keywords
    const hasDenialKeyword = denialKeywords.some(
      keyword => keyword && bodyLower.includes(keyword)
    );

    // Determine status
    if (hasApprovalKeyword && !hasDenialKeyword) {
      return 'APPROVED';
    } else if (hasDenialKeyword && !hasApprovalKeyword) {
      return 'DENIED';
    } else {
      return null; // Ambiguous or no clear status
    }
  }

  // Refresh OAuth token if needed
  async refreshTokenIfNeeded(user) {
    try {
      // Check if token is expired or expires soon (within 5 minutes)
      const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);

      if (
        !user.gmailTokenExpiry ||
        user.gmailTokenExpiry <= fiveMinutesFromNow
      ) {
        if (!user.gmailRefreshToken) {
          throw new Error('No refresh token available');
        }

        // Refresh the token
        const { credentials } = await this.oauth2Client.refreshAccessToken();

        // Update user with new token
        await user.updateGmailTokens(credentials);

        // Update OAuth client with new credentials
        this.oauth2Client.setCredentials(credentials);
      }
    } catch (error) {
      serviceLogger.logError(error, {
        operation: 'refreshTokenIfNeeded',
        service: 'gmailService',
        userId: user.id,
        userEmail: user.email,
        tokenExpiry: user.gmailTokenExpiry,
        hasRefreshToken: !!user.gmailRefreshToken
      });
      throw new Error('Failed to refresh Gmail token. Please re-authorize.');
    }
  }

  /**
   * Send threaded reply to maintain conversation continuity
   */
  async sendThreadedReply(user, threadId, toEmail, messageContent) {
    try {
      // Set user credentials
      this.setUserCredentials(user);

      // Check if token needs refresh
      await this.refreshTokenIfNeeded(user);

      // Create Gmail API client
      const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

      // Get original thread to extract message IDs and subject for proper threading
      const thread = await gmail.users.threads.get({
        userId: 'me',
        id: threadId
      });

      const lastMessage = thread.data.messages[thread.data.messages.length - 1];
      const messageIdHeader = lastMessage.payload.headers.find(h => h.name === 'Message-ID');
      const subjectHeader = lastMessage.payload.headers.find(h => h.name.toLowerCase() === 'subject');
      const originalMessageId = messageIdHeader ? messageIdHeader.value : null;
      
      // Extract original subject and ensure proper Re: prefix
      let replySubject = 'Re: Time-off Request';
      if (subjectHeader && subjectHeader.value) {
        const originalSubject = subjectHeader.value;
        replySubject = originalSubject.startsWith('Re:') ? originalSubject : `Re: ${originalSubject}`;
      }

      // Build reply content - just the user message (no signature for replies)
      const fullContent = messageContent;
      
      // Create reply headers for proper threading
      const headerLines = [
        `To: ${toEmail}`,
        `Subject: ${replySubject}`,
        originalMessageId ? `In-Reply-To: ${originalMessageId}` : '',
        originalMessageId ? `References: ${originalMessageId}` : '',
        'Content-Type: text/plain; charset=utf-8'
      ].filter(header => header !== '');
      
      // Join headers and add empty line before body content
      const headers = headerLines.join('\n') + '\n\n' + fullContent;

      // Encode message
      const encodedMessage = Buffer.from(headers)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      // Send threaded reply
      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage,
          threadId: threadId
        }
      });

      serviceLogger.info('Threaded reply sent successfully', {
        userId: user.id,
        threadId: threadId,
        messageId: response.data.id,
        subject: replySubject,
        contentLength: messageContent.length
      });

      return {
        success: true,
        messageId: response.data.id,
        threadId: response.data.threadId,
        subject: replySubject
      };

    } catch (error) {
      serviceLogger.logError(error, {
        operation: 'sendThreadedReply',
        service: 'gmailService',
        userId: user.id,
        threadId: threadId,
        messageContent: messageContent?.substring(0, 100) + '...'
      });
      throw new Error(`Failed to send reply: ${error.message}`);
    }
  }
}

module.exports = GmailService;
