import { createTransport } from 'nodemailer';
import { Resend, type Response as ResendResponse } from 'resend';
import { isEmail } from 'class-validator';

export interface VerificationEmail {
  purpose?:
    | 'LOCAL_EMAIL_VERIFICATION'
    | 'PASSWORD_RESET'
    | 'SOCIAL_EMAIL_VERIFICATION'
    | 'CUSTOMER_INVITATION';
  to: string;
  link: string;
  idempotencyKey: string;
}
export interface EmailSender {
  send(message: VerificationEmail): Promise<string>;
}
function content(message: VerificationEmail) {
  if (message.purpose === 'CUSTOMER_INVITATION')
    return {
      subject: 'Kích hoạt tài khoản quản lý thiệp',
      text: `Bạn được mời quản lý thiệp và khách mời. Đặt mật khẩu bằng liên kết sau:\n${message.link}\nLiên kết có hiệu lực trong 24 giờ.`,
    };
  if (message.purpose === 'PASSWORD_RESET')
    return {
      subject: 'Đặt lại mật khẩu của bạn',
      text: `Đặt lại mật khẩu bằng liên kết sau:\n${message.link}\nLiên kết có hiệu lực trong 30 phút. Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.`,
    };
  const social = message.purpose === 'SOCIAL_EMAIL_VERIFICATION';
  return {
    subject: 'Xác minh email của bạn',
    text: `Xác minh địa chỉ email để tiếp tục:\n${message.link}\nLiên kết có hiệu lực trong ${social ? '30 phút' : '24 giờ'}. Nếu bạn không yêu cầu đăng ký, hãy bỏ qua email này.`,
  };
}
class BoundedResend extends Resend {
  // Keep SDK serialization/idempotency but omit its non-production raw error logging.
  override async fetchRequest<T>(
    path: string,
    options = {},
  ): Promise<ResendResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error('EMAIL_DELIVERY_FAILED');
      }
      return {
        data: (await response.json()) as T,
        error: null,
        headers: Object.fromEntries(response.headers.entries()),
      };
    } catch {
      return {
        data: null,
        error: {
          name: 'application_error',
          message: 'EMAIL_DELIVERY_FAILED',
          statusCode: null,
        },
        headers: null,
      };
    }
  }
}
export function createEmailSender(env: NodeJS.ProcessEnv): EmailSender {
  const production = env.NODE_ENV === 'production';
  const transport = env.IAM_EMAIL_TRANSPORT ?? (production ? 'resend' : 'smtp');
  const from =
    env.IAM_EMAIL_FROM ?? (production ? '' : 'no-reply@wedding.test');
  if (!isEmail(from))
    throw new Error('Invalid IAM configuration: IAM_EMAIL_FROM');
  if (transport === 'resend') {
    const key = env.IAM_RESEND_API_KEY;
    if (!key || !key.startsWith('re_') || key.length < 16)
      throw new Error('Invalid IAM configuration: IAM_RESEND_API_KEY');
    const resend = new BoundedResend(key, {
      baseUrl: 'https://api.resend.com',
    });
    return {
      async send(message) {
        try {
          const result = await resend.emails.send(
            {
              from,
              to: message.to,
              ...content(message),
            },
            { idempotencyKey: message.idempotencyKey },
          );
          if (result.error || !result.data) throw new Error();
          return result.data.id;
        } catch {
          throw new Error('EMAIL_DELIVERY_FAILED');
        }
      },
    };
  }
  if (transport !== 'smtp' || production)
    throw new Error('Invalid IAM configuration: IAM_EMAIL_TRANSPORT');
  const host = env.IAM_SMTP_HOST ?? '127.0.0.1',
    port = Number(env.IAM_SMTP_PORT ?? 1025);
  if (
    !['127.0.0.1', 'localhost', '::1', 'mailpit'].includes(host) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  )
    throw new Error('Invalid IAM configuration: IAM_SMTP_HOST/IAM_SMTP_PORT');
  return {
    async send(message) {
      const smtp = createTransport({
        host,
        port,
        secure: false,
        ignoreTLS: true,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 10_000,
        logger: false,
        debug: false,
      });
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          smtp.sendMail({
            from,
            to: message.to,
            messageId: `<${message.idempotencyKey}@iam.invalid>`,
            ...content(message),
          }),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              smtp.close();
              reject(new Error('EMAIL_TIMEOUT'));
            }, 10_000);
          }),
        ]);
        return message.idempotencyKey;
      } catch {
        throw new Error('EMAIL_DELIVERY_FAILED');
      } finally {
        clearTimeout(timer);
        smtp.close();
      }
    },
  };
}
