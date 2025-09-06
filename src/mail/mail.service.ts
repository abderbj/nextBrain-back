import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private isConfigured: boolean = false;

  constructor(private readonly configService: ConfigService) {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    const mailHost = this.configService.get<string>('MAIL_HOST') || this.configService.get<string>('SMTP_HOST');
    const mailPort = this.configService.get<number>('MAIL_PORT') || this.configService.get<number>('SMTP_PORT');
    const mailUser = this.configService.get<string>('MAIL_USER') || this.configService.get<string>('SMTP_USER');
    const mailPass = this.configService.get<string>('MAIL_PASS') || this.configService.get<string>('SMTP_PASS');
    const mailSecure = this.configService.get<boolean>('MAIL_SECURE') === true;

    console.log('Email configuration:', {
      host: mailHost,
      port: mailPort,
      user: mailUser,
      hasPassword: !!mailPass,
      secure: mailSecure
    });

    if (!mailHost || !mailPort || !mailUser || !mailPass) {
      console.warn('⚠️ Email service is not properly configured. Missing required environment variables:');
      console.warn('Required: MAIL_HOST (or SMTP_HOST), MAIL_PORT (or SMTP_PORT), MAIL_USER (or SMTP_USER), MAIL_PASS (or SMTP_PASS)');
      this.isConfigured = false;
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: mailHost,
        port: mailPort,
        secure: mailSecure,
        auth: {
          user: mailUser,
          pass: mailPass,
        },
      });
      this.isConfigured = true;
      console.log('✅ Email transporter configured successfully');
    } catch (error) {
      console.error('❌ Failed to configure email transporter:', error);
      this.isConfigured = false;
    }
  }

  private compileTemplate(templateName: string, data: any) {
    const templatePath = path.join(
      process.cwd(),
      'src/mail/templates',
      `${templateName}.hbs`,
    );

    const templateSource = fs.readFileSync(templatePath, 'utf-8');
    const template = handlebars.compile(templateSource);

    return template({
      ...data,
      currentYear: new Date().getFullYear(),
    });
  }

  async sendVerificationEmail(
    email: string,
    name: string,
    token: string,
  ): Promise<void> {
    if (!this.isConfigured) {
      console.warn('⚠️ Email service not configured. Skipping verification email.');
      return;
    }

    const backendUrl = this.configService.get<string>('BACKEND_URL');
    const verificationUrl = `${backendUrl}/api/auth/verify-email?token=${token}`;

    const html = this.compileTemplate('email-verification', {
      name,
      verificationUrl,
      token,
    });
    
    try {
      await this.transporter.sendMail({
        from: `"${this.configService.get<string>('MAIL_FROM_NAME')}" <${this.configService.get<string>('MAIL_FROM') || this.configService.get<string>('SMTP_USER')}>`,
        to: email,
        subject: 'Verify Your Email Address',
        html,
      });
      console.log(`✅ Verification email sent successfully to: ${email}`);
    } catch (error) {
      console.error('❌ Failed to send verification email:', error);
      throw new Error('Failed to send verification email');
    }
  }

  async sendPasswordResetEmail(
    email: string,
    name: string,
    token: string,
  ): Promise<void> {
    if (!this.isConfigured) {
      console.warn('⚠️ Email service not configured. Skipping password reset email.');
      return;
    }

    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    const resetUrl = `${frontendUrl}/reset-password`;

    const html = this.compileTemplate('password-reset', {
      name,
      resetUrl,
      token,
    });

    try {
      await this.transporter.sendMail({
        from: `"${this.configService.get<string>('MAIL_FROM_NAME')}" <${this.configService.get<string>('MAIL_FROM') || this.configService.get<string>('SMTP_USER')}>`,
        to: email,
        subject: 'Reset Your Password',
        html,
      });
      console.log(`✅ Password reset email sent successfully to: ${email}`);
    } catch (error) {
      console.error('❌ Failed to send password reset email:', error);
      throw new Error('Failed to send password reset email');
    }
  }

  async sendInvitationEmail(email: string, token: string, tempPassword?: string): Promise<void> {
    if (!this.isConfigured) {
      console.warn('⚠️ Email service not configured. Skipping invitation email.');
      console.warn('To enable email functionality, please configure the following environment variables:');
      console.warn('- MAIL_HOST (or SMTP_HOST): SMTP server hostname');
      console.warn('- MAIL_PORT (or SMTP_PORT): SMTP server port');
      console.warn('- MAIL_USER (or SMTP_USER): SMTP username');
      console.warn('- MAIL_PASS (or SMTP_PASS): SMTP password');
      console.warn('- MAIL_FROM_NAME: Sender name');
      return;
    }

    // For the simplified flow, point users to the frontend login page and include the
    // temporary password in the email. The invitation token is no longer required
    // for the user to complete registration.
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:8080';
    const loginUrl = `${frontendUrl}/login`;
    const html = this.compileTemplate('invitation', {
      loginUrl,
      tempPassword,
      email,
    });
    
    try {
      await this.transporter.sendMail({
        from: `"${this.configService.get<string>('MAIL_FROM_NAME')}" <${this.configService.get<string>('MAIL_FROM') || this.configService.get<string>('SMTP_USER')}>`,
        to: email,
        subject: 'You are invited to join NextBrain',
        html,
      });
      console.log(`✅ Invitation email sent successfully to: ${email}`);
    } catch (error) {
      console.error('❌ Failed to send invitation email:', error);
      throw new Error('Failed to send invitation email');
    }
  }

  // Generic mail method to send arbitrary messages/attachments
  async sendRawMail(opts: {
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
    attachments?: Array<{ filename: string; path?: string; content?: string | Buffer }>;
  }): Promise<{ info: any; preview: string | null }> {
    // Ensure transporter exists; if not configured, fall back to ethereal test account
    if (!this.transporter) {
      try {
        const testAccount = await nodemailer.createTestAccount();
        this.transporter = nodemailer.createTransport({
          host: testAccount.smtp.host,
          port: testAccount.smtp.port,
          secure: testAccount.smtp.secure,
          auth: { user: testAccount.user, pass: testAccount.pass },
        });
        console.warn('EmailService: transporter not configured; using ethereal test account for sendRawMail');
      } catch (err) {
        console.error('EmailService: failed to create ethereal transporter', err);
        throw new Error('Email service is not available');
      }
    }

    const from = `${this.configService.get<string>('MAIL_FROM_NAME') || ''} <${this.configService.get<string>('MAIL_FROM') || this.configService.get<string>('SMTP_USER') || 'no-reply@example.com'}>`;

    const info = await this.transporter.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      attachments: opts.attachments as any,
    });

    const preview = nodemailer.getTestMessageUrl(info) || null;
    return { info, preview };
  }
}

export interface MailAttachment {
  filename: string;
  path?: string;
  content?: string | Buffer;
}
