import { Resend } from 'resend';

export default class EmailService {
  constructor() {
    this.transporter = null;
    this.initialized = false;

    this.init();
  }

  init() {
    if (this.initialized) return;

    this.transporter = new Resend(process.env.RESEND_API_KEY);

    this.fromName = process.env.SMTP_FROM_NAME || 'Haku AI Resume Assistant';
    this.fromEmail = process.env.SMTP_USER;
    this.initialized = true;
  }

  async sendVerificationEmail(email, firstName, verificationToken, locale) {
    if (!this.initialized) {
      this.init();
    }

    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/email-verified?token=${verificationToken}`;

    const mailOptions = {
      from: `"${this.fromName}" <${this.fromEmail}>`,
      to: [email],
      subject: 'Verify Your Email - Haku AI Resume Assistant',
      html: this._getVerificationEmailTemplate(
        firstName,
        verificationUrl,
        locale,
      ),
    };

    try {
      const { data, error } = await this.transporter.emails.send(mailOptions);

      if (error) {
        console.error(
          `Failed to send verification email to ${email}:`,
          error.message,
        );
        return { success: false, error: error.message };
      }
      console.log(`Verification email sent to ${email}: ${data.id}`);
      return { success: true, messageId: data.id };
    } catch (error) {
      console.error(
        `Failed to send verification email to ${email}:`,
        error.message,
      );
      return { success: false, error: error.message };
    }
  }

  async sendPasswordResetEmail(email, firstName, resetToken, locale = 'en') {
    if (!this.initialized) {
      this.init();
    }

    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/forgot-password?token=${resetToken}`;

    const mailOptions = {
      from: `"${this.fromName}" <${this.fromEmail}>`,
      to: [email],
      subject: 'Password Reset - Haku AI Resume Assistant',
      html: this._getPasswordResetEmailTemplate(firstName, resetUrl, locale),
    };

    try {
      const { data, error } = await this.transporter.emails.send(mailOptions);

      if (error) {
        console.error(
          `Failed to send password reset email to ${email}:`,
          error.message,
        );
        return { success: false, error: error.message };
      }

      console.log(`Password reset email sent to ${email}: ${data.id}`);
      return { success: true, messageId: data.id };
    } catch (error) {
      console.error(
        `Failed to send password reset email to ${email}:`,
        error.message,
      );
      return { success: false, error: error.message };
    }
  }

  _getVerificationEmailTemplate(firstName, verificationUrl, locale = 'en') {
    if (locale === 'es') {
      return this._getVerificationEmailTemplateES(firstName, verificationUrl);
    }
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Email</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 40px 0;">
              <table role="presentation" style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <tr>
                  <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Welcome to Haku!</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px 30px;">
                    <h2 style="color: #333333; margin: 0 0 20px;">Hi ${firstName},</h2>
                    <p style="color: #666666; font-size: 16px; line-height: 1.6; margin: 0 0 30px;">
                      Thank you for signing up! To get started, please verify your email address by clicking the button below:
                    </p>
                    <table role="presentation" style="text-align: center;">
                      <tr>
                        <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 5px;">
                          <a href="${verificationUrl}" style="display: inline-block; padding: 14px 40px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: bold;">
                            Verify Email Address
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 30px 0 0;">
                      Or copy and paste this URL into your browser:<br>
                      <a href="${verificationUrl}" style="color: #667eea; word-break: break-all;">${verificationUrl}</a>
                    </p>
                    <p style="color: #999999; font-size: 12px; line-height: 1.6; margin: 20px 0 0;">
                      This link will expire in 24 hours. If you didn't create an account, please ignore this email.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="background: #f8f8f8; padding: 20px 30px; text-align: center; border-top: 1px solid #eeeeee;">
                    <p style="color: #999999; font-size: 12px; margin: 0;">
                      &copy; ${new Date().getFullYear()} Haku AI Resume Assistant. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  _getVerificationEmailTemplateES(firstName, verificationUrl) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verifica tu Correo Electrónico</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 40px 0;">
              <table role="presentation" style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <tr>
                  <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Bienvenido a Haku!</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px 30px;">
                    <h2 style="color: #333333; margin: 0 0 20px;">Hi ${firstName},</h2>
                    <p style="color: #666666; font-size: 16px; line-height: 1.6; margin: 0 0 30px;">
                      Gracias por registrarte! Para comenzar, por favor verifica tu dirección de correo electrónico haciendo clic en el botón de abajo:
                    </p>
                    <table role="presentation" style="text-align: center;">
                      <tr>
                        <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 5px;">
                          <a href="${verificationUrl}" style="display: inline-block; padding: 14px 40px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: bold;">
                            Verificar Correo Electrónico
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 30px 0 0;">
                      O copia y pega esta URL en tu navegador:<br>
                      <a href="${verificationUrl}" style="color: #667eea; word-break: break-all;">${verificationUrl}</a>
                    </p>
                    <p style="color: #999999; font-size: 12px; line-height: 1.6; margin: 20px 0 0;">
                      Este enlace caducará en 24 horas. Si no creaste una cuenta, por favor ignora este correo.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="background: #f8f8f8; padding: 20px 30px; text-align: center; border-top: 1px solid #eeeeee;">
                    <p style="color: #999999; font-size: 12px; margin: 0;">
                      &copy; ${new Date().getFullYear()} Haku AI Resume Assistant. Todos los derechos reservados.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  _getPasswordResetEmailTemplate(firstName, resetUrl, locale = 'en') {
    if (locale === 'es') {
      return this._getPasswordResetEmailTemplateES(firstName, resetUrl);
    }
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 40px 0;">
              <table role="presentation" style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <tr>
                  <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Reset Password</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px 30px;">
                    <h2 style="color: #333333; margin: 0 0 20px;">Hi ${firstName},</h2>
                    <p style="color: #666666; font-size: 16px; line-height: 1.6; margin: 0 0 30px;">
                      We received a request to reset your password. Click the button below to set a new password:
                    </p>
                    <table role="presentation" style="text-align: center;">
                      <tr>
                        <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 5px;">
                          <a href="${resetUrl}" style="display: inline-block; padding: 14px 40px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: bold;">
                            Reset Password
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 30px 0 0;">
                      Or copy and paste this URL into your browser:<br>
                      <a href="${resetUrl}" style="color: #667eea; word-break: break-all;">${resetUrl}</a>
                    </p>
                    <p style="color: #999999; font-size: 12px; line-height: 1.6; margin: 20px 0 0;">
                      This link will expire in 1 hour. If you didn't request this, please ignore this email.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="background: #f8f8f8; padding: 20px 30px; text-align: center; border-top: 1px solid #eeeeee;">
                    <p style="color: #999999; font-size: 12px; margin: 0;">
                      &copy; ${new Date().getFullYear()} Haku AI Resume Assistant. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  _getPasswordResetEmailTemplateES(firstName, resetUrl) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Restablecer tu contraseña</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 40px 0;">
              <table role="presentation" style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <tr>
                  <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Reset Password</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px 30px;">
                    <h2 style="color: #333333; margin: 0 0 20px;">Hi ${firstName},</h2>
                    <p style="color: #666666; font-size: 16px; line-height: 1.6; margin: 0 0 30px;">
                      Recibimos una solicitud para restablecer tu contraseña. Haga clic en el botón de abajo para establecer una nueva contraseña:
                    </p>
                    <table role="presentation" style="text-align: center;">
                      <tr>
                        <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 5px;">
                          <a href="${resetUrl}" style="display: inline-block; padding: 14px 40px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: bold;">
                            Restablecer Contraseña
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 30px 0 0;">
                      O copie y pegue esta URL en su navegador:<br>
                      <a href="${resetUrl}" style="color: #667eea; word-break: break-all;">${resetUrl}</a>
                    </p>
                    <p style="color: #999999; font-size: 12px; line-height: 1.6; margin: 20px 0 0;">
                      Este enlace caducará en 1 hora. Si no solicitó restablecer su contraseña, por favor ignore este correo.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="background: #f8f8f8; padding: 20px 30px; text-align: center; border-top: 1px solid #eeeeee;">
                    <p style="color: #999999; font-size: 12px; margin: 0;">
                      &copy; ${new Date().getFullYear()} Haku AI Resume Assistant. Todos los derechos reservados.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  async verifyConnection() {
    if (!this.initialized) {
      this.init();
    }

    try {
      const { error } = await this.transporter.apiKeys.list();

      if (error) {
        console.error('Resend verification failed:', error.message);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Email service verification failed:', error.message);
      return false;
    }
  }
}
