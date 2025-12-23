/**
 * Email service for sending interview invitations
 * Uses SendGrid SMTP for email delivery
 */

import nodemailer, { Transporter } from 'nodemailer';

interface InterviewLinkEmailData {
  candidateName: string;
  candidateEmail: string;
  jobTitle?: string; // For compatibility with AiGenthix format
  examName?: string;
  subcategoryName?: string;
  interviewLink: string;
  scheduledTime?: string;
  scheduledEndTime?: string;
  interviewMode?: string;
  jobDescription?: string;
  jobRequirements?: string;
  department?: string;
}

class EmailService {
  private transporter: Transporter | null = null;

  constructor() {
    // Initialize nodemailer transporter with SendGrid SMTP settings
    if (typeof window === 'undefined') {
      // Server-side only
      try {
        const mailHost = process.env.MAIL_HOST || 'smtp.sendgrid.net';
        const mailPort = parseInt(process.env.MAIL_PORT || '587', 10);
        const mailUsername = process.env.MAIL_USERNAME || 'apikey';
        const mailPassword = process.env.MAIL_PASSWORD;
        const mailEncryption = process.env.MAIL_ENCRYPTION || 'tls';

        if (!mailPassword) {
          console.warn('Email service not configured. Set MAIL_PASSWORD in environment variables.');
          this.transporter = null;
          return;
        }

        this.transporter = nodemailer.createTransport({
          host: mailHost,
          port: mailPort,
          secure: mailEncryption === 'ssl' || mailPort === 465,
          auth: {
            user: mailUsername,
            pass: mailPassword,
          },
          tls: {
            rejectUnauthorized: false,
          },
        });

        console.log('Email service initialized with SendGrid SMTP');
      } catch (error) {
        console.warn('Failed to initialize email service:', error);
        this.transporter = null;
      }
    }
  }

  async sendInterviewLink(data: InterviewLinkEmailData): Promise<boolean> {
    if (!this.transporter) {
      console.warn('Email service not configured. Set MAIL_* environment variables.');
      return false;
    }

    try {
      const mailFromAddress = process.env.MAIL_FROM_ADDRESS || 'communicationt4@gmail.com';
      const mailFromName = process.env.MAIL_FROM_NAME || 'Communicationt4e';
      const fromAddress = `${mailFromName} <${mailFromAddress}>`;

      // Use jobTitle if provided (AiGenthix format), otherwise use examName
      const emailSubject = data.jobTitle || `${data.examName || 'AigenthixAI Interview'}${data.subcategoryName ? ` - ${data.subcategoryName}` : ''}`;

      console.log('EmailService: Starting to send email with data:', {
        to: data.candidateEmail,
        subject: `Interview Invitation - ${emailSubject}`,
        from: fromAddress,
      });

      const result = await this.transporter.sendMail({
        from: fromAddress,
        to: data.candidateEmail,
        subject: `Interview Invitation - ${emailSubject}`,
        html: this.generateInterviewEmailHTML(data),
        text: this.generateInterviewEmailText(data),
      });

      console.log('Email sent successfully:', {
        messageId: result.messageId,
        response: result.response,
      });
      return true;
    } catch (error) {
      console.error('Error sending email - full details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        error: JSON.stringify(error, null, 2),
        errorObject: error
      });
      return false;
    }
  }

  private generateInterviewEmailHTML(data: InterviewLinkEmailData): string {
    let scheduledTimeText = '';
    if (data.scheduledTime) {
      const startTime = new Date(data.scheduledTime).toLocaleString();
      if (data.scheduledEndTime) {
        const endTime = new Date(data.scheduledEndTime).toLocaleString();
        scheduledTimeText = `<p><strong>Scheduled Time Window:</strong> ${startTime} - ${endTime}</p>`;
      } else {
        scheduledTimeText = `<p><strong>Scheduled Start Time:</strong> ${startTime}</p>`;
      }
    } else {
      scheduledTimeText = '<p><strong>Note:</strong> You can take this interview at your convenience within the expiry period.</p>';
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Interview Invitation</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
          }
          .email-container {
            background-color: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          .header {
            background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
            color: white;
            padding: 30px 20px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 700;
            letter-spacing: -0.5px;
          }
          .content {
            background-color: #ffffff;
            padding: 40px 30px;
          }
          .button-container {
            text-align: center;
            margin: 35px 0;
            padding: 20px 0;
          }
          .button {
            display: inline-block;
            background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
            color: white !important;
            padding: 18px 48px;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 700;
            font-size: 18px;
            letter-spacing: 0.5px;
            box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
            transition: all 0.3s ease;
            border: none;
            text-transform: uppercase;
          }
          .button:hover {
            background: linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%);
            box-shadow: 0 6px 20px rgba(37, 99, 235, 0.5);
            transform: translateY(-2px);
          }
          .button:active {
            transform: translateY(0);
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
            font-size: 14px;
            color: #64748b;
          }
          h2 {
            color: #1e293b;
            margin-top: 0;
            font-size: 24px;
          }
          p {
            color: #475569;
            margin: 15px 0;
          }
          ul {
            color: #475569;
            line-height: 1.8;
          }
        </style>
      </head>
      <body>
        <div class="email-container">
          <div class="header">
            <h1>Interview Invitation</h1>
          </div>
          <div class="content">
            <h2>Hello ${data.candidateName}!</h2>
            
            <p>We are pleased to invite you for an interview for the position of <strong>${data.jobTitle || (data.examName ? `${data.examName}${data.subcategoryName ? ` - ${data.subcategoryName}` : ''}` : 'Interview')}</strong>.</p>
            
            ${scheduledTimeText}
            
            ${data.department ? `<p><strong>Department:</strong> ${data.department}</p>` : ''}
            
            ${data.jobDescription ? `
            <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0;">
              <h3>Job Description</h3>
              <div style="white-space: pre-line;">${data.jobDescription}</div>
            </div>
            ` : ''}
            
            ${data.jobRequirements ? `
            <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0;">
              <h3>Requirements</h3>
              <p>${data.jobRequirements}</p>
            </div>
            ` : ''}
            
            <p style="text-align: center; font-size: 16px; color: #1e293b; margin: 30px 0 20px 0;">
              <strong>Please click the button below to start your interview:</strong>
            </p>
            
            <div class="button-container">
              <a href="${data.interviewLink}" class="button" style="color: white !important;">Start Interview</a>
            </div>
            
            <p><strong>Important Notes:</strong></p>
            <ul>
              <li>This interview link is unique to you and can only be used once</li>
              <li>Make sure you have a stable internet connection</li>
              <li>You will need a webcam and microphone for the interview</li>
              <li>The interview will be conducted by our AI interviewer</li>
              <li>Please complete the interview before the expiry date</li>
            </ul>
            
            <p>If you have any questions or technical issues, please contact our support team.</p>
            
            <p>Good luck with your interview!</p>
            
            <div class="footer">
              <p>Best regards,<br>AigenthixAI Interview Team</p>
              <p><em>This is an automated message. Please do not reply to this email.</em></p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generateInterviewEmailText(data: InterviewLinkEmailData): string {
    let scheduledTimeText = '';
    if (data.scheduledTime) {
      const startTime = new Date(data.scheduledTime).toLocaleString();
      if (data.scheduledEndTime) {
        const endTime = new Date(data.scheduledEndTime).toLocaleString();
        scheduledTimeText = `Scheduled Time Window: ${startTime} - ${endTime}`;
      } else {
        scheduledTimeText = `Scheduled Start Time: ${startTime}`;
      }
    } else {
      scheduledTimeText = 'Note: You can take this interview at your convenience within the expiry period.';
    }

    return `
      Interview Invitation - ${data.jobTitle || data.examName || 'AigenthixAI Interview'}
      
      Hello ${data.candidateName}!
      
      We are pleased to invite you for an interview for the position of ${data.jobTitle || (data.examName ? `${data.examName}${data.subcategoryName ? ` - ${data.subcategoryName}` : ''}` : 'Interview')}.
      
      ${scheduledTimeText}
      
      ${data.department ? `Department: ${data.department}\n` : ''}
      
      ${data.jobDescription ? `
      Job Description:
      ${data.jobDescription}
      
      ` : ''}
      
      ${data.jobRequirements ? `
      Requirements:
      ${data.jobRequirements}
      
      ` : ''}
      
      Please use the following link to start your interview:
      ${data.interviewLink}
      
      Important Notes:
      - This interview link is unique to you and can only be used once
      - Make sure you have a stable internet connection
      - You will need a webcam and microphone for the interview
      - The interview will be conducted by our AI interviewer
      - Please complete the interview before the expiry date
      
      If you have any questions or technical issues, please contact our support team.
      
      Good luck with your interview!
      
      Best regards,
      AigenthixAI Interview Team
      
      This is an automated message. Please do not reply to this email.
    `;
  }
}

export const emailService = new EmailService();
export type { InterviewLinkEmailData };

