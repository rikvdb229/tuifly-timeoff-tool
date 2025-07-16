// src/services/emailNotificationService.js
const nodemailer = require('nodemailer');

class EmailNotificationService {
  constructor() {
    this.transporter = null;
    this.initialized = false;
  }

  // Initialize the email service
  async initialize() {
    if (this.initialized) return;

    try {
      // Create transporter using Gmail SMTP with App Password
      this.transporter = nodemailer.createTransporter({
        service: 'gmail',
        auth: {
          user: process.env.ADMIN_NOTIFICATION_EMAIL,
          pass: process.env.GMAIL_APP_PASSWORD, // Gmail App Password for system notifications
        },
      });

      // Verify connection
      await this.transporter.verify();
      this.initialized = true;
      console.log('✅ Email notification service initialized');
    } catch (error) {
      console.error(
        '❌ Failed to initialize email notification service:',
        error
      );
      // Don't throw error - notifications are not critical
    }
  }

  // Send new user registration notification to admin
  async notifyAdminOfNewUser(newUser) {
    try {
      if (!this.initialized || !process.env.SEND_APPROVAL_EMAILS === 'true') {
        console.log('📧 Email notifications disabled or not configured');
        return false;
      }

      const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
      if (!adminEmail) {
        console.log('📧 No admin notification email configured');
        return false;
      }

      const approvalUrl = `${process.env.HOST || 'http://localhost:3000'}/admin/users`;

      const subject = 'TUIfly Time-Off Tool - New User Needs Approval';

      const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e40af;">New User Registration</h2>
          
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">User Details:</h3>
            <ul style="list-style: none; padding: 0;">
              <li><strong>Email:</strong> ${newUser.email}</li>
              <li><strong>Name:</strong> ${newUser.name || 'Not set yet'}</li>
              <li><strong>Code:</strong> ${newUser.code || 'Not set yet'}</li>
              <li><strong>Registered:</strong> ${new Date(newUser.createdAt).toLocaleString()}</li>
              <li><strong>Onboarded:</strong> ${newUser.isOnboarded() ? 'Yes' : 'Pending'}</li>
            </ul>
          </div>

          <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b;">
            <p style="margin: 0;"><strong>Action Required:</strong> This user needs admin approval to access the TUIfly Time-Off Tool.</p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${approvalUrl}" 
               style="background-color: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Review User & Approve
            </a>
          </div>

          <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 30px; font-size: 14px; color: #6b7280;">
            <p>You can approve or deny this user by visiting the admin panel:</p>
            <p><a href="${approvalUrl}">${approvalUrl}</a></p>
            
            <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
            
            <p style="font-size: 12px; color: #9ca3af;">
              This is an automated notification from the TUIfly Time-Off Tool.<br>
              If you believe this is an error, please check your admin panel.
            </p>
          </div>
        </div>
      `;

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

      const mailOptions = {
        from: `"TUIfly Time-Off Tool" <${process.env.ADMIN_NOTIFICATION_EMAIL}>`,
        to: adminEmail,
        subject: subject,
        text: textBody,
        html: htmlBody,
      };

      const result = await this.transporter.sendMail(mailOptions);

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
      if (!this.initialized || !process.env.SEND_APPROVAL_EMAILS === 'true') {
        return false;
      }

      const appUrl = `${process.env.HOST || 'http://localhost:3000'}`;

      const subject = 'TUIfly Time-Off Tool - Access Approved!';

      const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #059669;">Welcome to TUIfly Time-Off Tool!</h2>
          
          <div style="background-color: #d1fae5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #059669;">
            <p style="margin: 0;"><strong>Great news!</strong> Your access to the TUIfly Time-Off Tool has been approved.</p>
          </div>

          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">What's Next:</h3>
            <ol>
              <li>Visit the app: <a href="${appUrl}">${appUrl}</a></li>
              <li>Complete your profile setup (if not done already)</li>
              <li>Grant Gmail permissions to send time-off requests</li>
              <li>Start creating and sending time-off requests!</li>
            </ol>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${appUrl}" 
               style="background-color: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Access the App
            </a>
          </div>

          <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 30px; font-size: 14px; color: #6b7280;">
            <p><strong>Need Help?</strong></p>
            <ul style="padding-left: 20px;">
              <li>The tool will guide you through the Gmail setup process</li>
              <li>Your time-off requests will be sent in the proper TUIfly format</li>
              <li>You'll receive automatic status updates when replies are received</li>
            </ul>
            
            <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
            
            <p style="font-size: 12px; color: #9ca3af;">
              Approved by: ${approvedByAdmin.name || approvedByAdmin.email}<br>
              This is an automated notification from the TUIfly Time-Off Tool.
            </p>
          </div>
        </div>
      `;

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

      const mailOptions = {
        from: `"TUIfly Time-Off Tool" <${process.env.ADMIN_NOTIFICATION_EMAIL}>`,
        to: user.email,
        subject: subject,
        text: textBody,
        html: htmlBody,
      };

      const result = await this.transporter.sendMail(mailOptions);

      console.log(`✅ Approval notification sent to user: ${user.email}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to send user approval notification:', error);
      return false;
    }
  }

  // Send user denial notification email
  async notifyUserDenial(user, deniedByAdmin, reason = null) {
    try {
      if (!this.initialized || !process.env.SEND_APPROVAL_EMAILS === 'true') {
        return false;
      }

      const subject = 'TUIfly Time-Off Tool - Access Request';

      const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc2626;">Access Request Update</h2>
          
          <div style="background-color: #fee2e2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
            <p style="margin: 0;">Your access request for the TUIfly Time-Off Tool has been reviewed.</p>
          </div>

          ${
            reason
              ? `
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Administrator Notes:</h3>
            <p style="margin-bottom: 0;">${reason}</p>
          </div>
          `
              : ''
          }

          <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 30px; font-size: 14px; color: #6b7280;">
            <p>If you believe this is an error or have questions, please contact your administrator.</p>
            
            <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
            
            <p style="font-size: 12px; color: #9ca3af;">
              Reviewed by: ${deniedByAdmin.name || deniedByAdmin.email}<br>
              This is an automated notification from the TUIfly Time-Off Tool.
            </p>
          </div>
        </div>
      `;

      const textBody = `
TUIfly Time-Off Tool - Access Request Update

Your access request for the TUIfly Time-Off Tool has been reviewed.

${reason ? `Administrator Notes: ${reason}\n\n` : ''}

If you believe this is an error or have questions, please contact your administrator.

Reviewed by: ${deniedByAdmin.name || deniedByAdmin.email}

---
This is an automated notification from the TUIfly Time-Off Tool.
      `;

      const mailOptions = {
        from: `"TUIfly Time-Off Tool" <${process.env.ADMIN_NOTIFICATION_EMAIL}>`,
        to: user.email,
        subject: subject,
        text: textBody,
        html: htmlBody,
      };

      const result = await this.transporter.sendMail(mailOptions);

      console.log(`✅ Denial notification sent to user: ${user.email}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to send user denial notification:', error);
      return false;
    }
  }
}

module.exports = new EmailNotificationService();
