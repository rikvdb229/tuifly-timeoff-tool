// src/services/emailNotificationService.js - Simple version with console logging
const nodemailer = require('nodemailer');
const { serviceLogger } = require('../utils/logger');

class EmailNotificationService {
  constructor() {
    this.transporter = null;
    this.initialized = false;
    this.mockEmailMode = false;
  }

  // Initialize the email service
  async initialize() {
    if (this.initialized) {
      return;
    }

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
        serviceLogger.info('Email service initialized with SMTP', {
          smtpHost: process.env.SMTP_HOST,
          operation: 'initialize',
          service: 'emailNotificationService',
        });
      } else {
        // No SMTP configured - use console logging
        serviceLogger.warn(
          'No SMTP server configured - using mock email mode',
          {
            operation: 'initialize',
            service: 'emailNotificationService',
            mockMode: true,
          }
        );
        this.mockEmailMode = true;
      }

      this.initialized = true;
    } catch (error) {
      serviceLogger.logError(error, {
        operation: 'initialize',
        service: 'emailNotificationService',
        fallbackMode: 'console',
      });
      serviceLogger.warn('Falling back to console logging mode', {
        operation: 'initialize',
        service: 'emailNotificationService',
        mockMode: true,
      });
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
        serviceLogger.warn('No admin notification email configured', {
          operation: 'notifyAdminOfNewUser',
          service: 'emailNotificationService',
          newUserEmail: newUser.email,
        });
        return false;
      }
      const appUrl = process.env.HOST || 'http://localhost:3000';
      const approvalUrl = `${appUrl}/admin/users`;
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
        serviceLogger.info('Admin notification email - console mode', {
          operation: 'notifyAdminOfNewUser',
          service: 'emailNotificationService',
          to: adminEmail,
          subject: subject,
          bodyLength: textBody.length,
          newUserEmail: newUser.email,
          mockMode: true,
        });
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
      serviceLogger.info('Admin notification sent successfully', {
        operation: 'notifyAdminOfNewUser',
        service: 'emailNotificationService',
        to: adminEmail,
        newUserEmail: newUser.email,
      });
      return true;
    } catch (error) {
      serviceLogger.logError(error, {
        operation: 'notifyAdminOfNewUser',
        service: 'emailNotificationService',
        newUserEmail: newUser.email,
        adminEmail: process.env.ADMIN_NOTIFICATION_EMAIL,
      });
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
        serviceLogger.info('User approval email - console mode', {
          operation: 'notifyUserApproval',
          service: 'emailNotificationService',
          to: user.email,
          subject: subject,
          bodyLength: textBody.length,
          approvedBy: approvedByAdmin.name || approvedByAdmin.email,
          mockMode: true,
        });
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
      serviceLogger.info('Approval notification sent successfully', {
        operation: 'notifyUserApproval',
        service: 'emailNotificationService',
        to: user.email,
        approvedBy: approvedByAdmin.name || approvedByAdmin.email,
      });
      return true;
    } catch (error) {
      serviceLogger.logError(error, {
        operation: 'notifyUserApproval',
        service: 'emailNotificationService',
        userEmail: user.email,
        approvedBy: approvedByAdmin.name || approvedByAdmin.email,
      });
      return false;
    }
  }
}

module.exports = new EmailNotificationService();
