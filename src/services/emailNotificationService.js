// src/services/emailNotificationService.js - Simple version with console logging
const nodemailer = require('nodemailer');

class EmailNotificationService {
  constructor() {
    this.transporter = null;
    this.initialized = false;
    this.mockEmailMode = false;
  }

  // Initialize the email service
  async initialize() {
    if (this.initialized) return;

    try {
      // Check if SMTP is configured
      if (
        process.env.SMTP_HOST &&
        process.env.SMTP_USER &&
        process.env.SMTP_PASSWORD
      ) {
        // Use custom SMTP server
        this.transporter = nodemailer.createTransporter({
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
          },
        });

        // Verify connection
        await this.transporter.verify();
        console.log(
          `✅ Email service initialized with SMTP: ${process.env.SMTP_HOST}`
        );
      } else {
        // No SMTP configured - use console logging
        console.log(
          '⚠️ No SMTP server configured - emails will be logged to console'
        );
        console.log(
          '💡 To enable real emails, configure SMTP_* variables in .env'
        );
        this.mockEmailMode = true;
      }

      this.initialized = true;
    } catch (error) {
      console.error('❌ Failed to initialize email service:', error);
      console.log('⚠️ Falling back to console logging mode');
      this.mockEmailMode = true;
      this.initialized = true;
    }
  }

  // Send new user registration notification to admin
  async notifyAdminOfNewUser(newUser) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
      if (!adminEmail) {
        console.log('📧 No admin notification email configured');
        return false;
      }

      const approvalUrl = `${process.env.HOST || 'http://localhost:3000'}/admin/users`;
      const subject = 'TUIfly Time-Off Tool - New User Needs Approval';

      const textBody = `
TUIfly Time-Off Tool - New User Needs Approval

A new user has registered and needs admin approval:

User Details:
- Email: ${newUser.email}
- Name: ${newUser.name || 'Not set yet'}
- Code: ${newUser.code || 'Not set yet'}
- Registered: ${new Date(newUser.createdAt).toLocaleString()}
- Onboarded: ${newUser.isOnboarded() ? 'Yes' : 'Pending'}

ACTION REQUIRED: Please review and approve this user.
Visit the admin panel: ${approvalUrl}

---
This is an automated notification from the TUIfly Time-Off Tool.
      `;

      // Console logging mode
      if (this.mockEmailMode) {
        console.log(
          '\n📧 ================== EMAIL NOTIFICATION =================='
        );
        console.log(`To: ${adminEmail}`);
        console.log(`Subject: ${subject}`);
        console.log(`Body:\n${textBody}`);
        console.log(
          '📧 ====================================================\n'
        );
        return true;
      }

      // Send actual email via SMTP
      const mailOptions = {
        from:
          process.env.SMTP_FROM ||
          `"TUIfly Time-Off Tool" <${process.env.SMTP_USER}>`,
        to: adminEmail,
        subject: subject,
        text: textBody,
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`✅ Admin notification sent for new user: ${newUser.email}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to send admin notification:', error);
      return false;
    }
  }

  // Send user approval confirmation email
  async notifyUserApproval(user, approvedByAdmin) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      const appUrl = `${process.env.HOST || 'http://localhost:3000'}`;
      const subject = 'TUIfly Time-Off Tool - Access Approved!';

      const textBody = `
TUIfly Time-Off Tool - Access Approved!

Great news! Your access to the TUIfly Time-Off Tool has been approved.

What's Next:
1. Visit the app: ${appUrl}
2. Complete your profile setup (if not done already)
3. Grant Gmail permissions to send time-off requests
4. Start creating and sending time-off requests!

Visit the app: ${appUrl}

Approved by: ${approvedByAdmin.name || approvedByAdmin.email}

---
This is an automated notification from the TUIfly Time-Off Tool.
      `;

      // Console logging mode
      if (this.mockEmailMode) {
        console.log(
          '\n📧 ================== APPROVAL EMAIL =================='
        );
        console.log(`To: ${user.email}`);
        console.log(`Subject: ${subject}`);
        console.log(`Body:\n${textBody}`);
        console.log('📧 ================================================\n');
        return true;
      }

      // Send actual email via SMTP
      const mailOptions = {
        from:
          process.env.SMTP_FROM ||
          `"TUIfly Time-Off Tool" <${process.env.SMTP_USER}>`,
        to: user.email,
        subject: subject,
        text: textBody,
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`✅ Approval notification sent to user: ${user.email}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to send user approval notification:', error);
      return false;
    }
  }
}

module.exports = new EmailNotificationService();
