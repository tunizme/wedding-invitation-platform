import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmailSender } from '../../../src/modules/identity-access/infrastructure/email-sender';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const env = {
  NODE_ENV: 'test',
  IAM_EMAIL_TRANSPORT: 'resend',
  IAM_EMAIL_FROM: 'mail@example.test',
  IAM_RESEND_API_KEY: 're_synthetic_test_key',
};
const message = {
  to: 'customer@example.test',
  link: 'https://web.example.test/verify-email#token=synthetic-proof',
  idempotencyKey: 'challenge-id.template-v1',
};
describe('email adapters', () => {
  it('rejects production SMTP and missing production secrets', () => {
    expect(() =>
      createEmailSender({
        NODE_ENV: 'production',
        IAM_EMAIL_TRANSPORT: 'smtp',
        IAM_EMAIL_FROM: 'mail@example.test',
      }),
    ).toThrow('IAM_EMAIL_TRANSPORT');
    expect(() =>
      createEmailSender({
        NODE_ENV: 'production',
        IAM_EMAIL_FROM: 'mail@example.test',
      }),
    ).toThrow('IAM_RESEND_API_KEY');
  });
  it('uses official SDK idempotency headers and a bounded abort signal', async () => {
    const mock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 'mail-id' }), { status: 200 }),
      );
    vi.stubGlobal('fetch', mock);
    expect(await createEmailSender(env).send(message)).toBe('mail-id');
    const [url, options] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(new Headers(options.headers).get('Idempotency-Key')).toBe(
      message.idempotencyKey,
    );
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
  it('renders reset instructions with a 30-minute expiry instead of verification copy', async () => {
    const mock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 'reset-mail' }), { status: 200 }),
      );
    vi.stubGlobal('fetch', mock);
    const link =
      'https://web.example.test/reset-password#token=synthetic-proof';
    await createEmailSender(env).send({
      ...message,
      purpose: 'PASSWORD_RESET',
      link,
    });
    const [, options] = mock.mock.calls[0] as [string, RequestInit];
    if (typeof options.body !== 'string') throw new Error('Expected JSON body');
    const body = JSON.parse(options.body) as {
      subject: string;
      text: string;
    };
    expect(body.subject).toBe('Đặt lại mật khẩu của bạn');
    expect(body.text).toContain('30 phút');
    expect(body.text).toContain(link);
    expect(body.text).not.toContain('24 giờ');
  });
  it('does not log or propagate provider response bodies', async () => {
    const log = vi.spyOn(console, 'error');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ message: 'sensitive-provider-details' }),
            { status: 400 },
          ),
        ),
    );
    await expect(createEmailSender(env).send(message)).rejects.toThrow(
      /^EMAIL_DELIVERY_FAILED$/,
    );
    expect(log).not.toHaveBeenCalled();
  });
});
