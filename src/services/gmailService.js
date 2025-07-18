// src/services/gmailService.js - Updated to use environment variable for approver email

const { google } = require('googleapis');
const nodemailer = require('nodemailer');

class GmailService {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI // Use same redirect as Passport
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
      access_token: user.gmailAccessToken,
      refresh_token: user.gmailRefreshToken,
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
      EMAIL_FLIGHT_LABEL = 'FLIGHT',
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
    const subject = `${user.code} CREW REQUEST - ${monthName} ${year}`;

    // Generate request lines
    const requestLines = requests
      .map((request) => {
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
            line = `${EMAIL_FLIGHT_LABEL} ${request.flightNumber} - ${formattedDate}`;
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
      console.error('Gmail send error:', error);

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

  // Check for replies to sent emails
  async checkForReplies(user, gmailThreadId, lastCheckTime = null) {
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

      // Find new messages since last check
      const messages = thread.data.messages || [];
      const newMessages = [];

      for (const message of messages) {
        const messageDetails = await gmail.users.messages.get({
          userId: 'me',
          id: message.id,
        });

        const receivedDate = new Date(
          parseInt(messageDetails.data.internalDate)
        );

        // Skip if message is older than last check
        if (lastCheckTime && receivedDate <= lastCheckTime) {
          continue;
        }

        // Skip if message is from the user (not a reply)
        const fromHeader = messageDetails.data.payload.headers.find(
          (h) => h.name.toLowerCase() === 'from'
        );
        if (fromHeader && fromHeader.value.includes(user.email)) {
          continue;
        }

        // Extract message body
        const body = this.extractMessageBody(messageDetails.data.payload);

        newMessages.push({
          id: message.id,
          threadId: gmailThreadId,
          from: fromHeader ? fromHeader.value : 'Unknown',
          body: body,
          receivedAt: receivedDate,
        });
      }

      return {
        success: true,
        newMessages,
        totalMessages: messages.length,
      };
    } catch (error) {
      console.error('Gmail reply check error:', error);
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
      .map((k) => k.trim().toLowerCase());
    const denialKeywords = (
      process.env.DENIAL_KEYWORDS || 'denied,deny,no,rejected,decline'
    )
      .split(',')
      .map((k) => k.trim().toLowerCase());

    const bodyLower = replyBody.toLowerCase();

    // Check for approval keywords
    const hasApprovalKeyword = approvalKeywords.some(
      (keyword) => keyword && bodyLower.includes(keyword)
    );

    // Check for denial keywords
    const hasDenialKeyword = denialKeywords.some(
      (keyword) => keyword && bodyLower.includes(keyword)
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
      console.error('Token refresh error:', error);
      throw new Error('Failed to refresh Gmail token. Please re-authorize.');
    }
  }
}

module.exports = new GmailService();
