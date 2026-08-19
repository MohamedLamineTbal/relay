import { ConfigService } from '@nestjs/config';
import { PaymentEmailProviderError } from '../src/payment-emails/email-provider';
import { ResendEmailProvider } from '../src/payment-emails/resend-email.provider';

describe('Resend payment email adapter contract', () => {
  const originalFetch = global.fetch;
  const config = new ConfigService({ RESEND_API_KEY: 're_contract_test' });
  const provider = new ResendEmailProvider(config);
  const input = {
    from: 'Acme via Relay <onboarding@resend.dev>',
    replyTo: 'owner@example.com',
    to: 'customer@example.com',
    subject: 'Payment request from Acme',
    html: '<p>Pay securely</p>',
    text: 'Pay securely',
    idempotencyKey: 'payment-email:stable-key',
  };

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('translates the internal contract and returns the accepted message ID', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'resend_message_123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    global.fetch = fetchMock;

    await expect(provider.sendPaymentEmail(input)).resolves.toEqual({
      messageId: 'resend_message_123',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(request.headers);
    expect(url).toBe('https://api.resend.com/emails');
    expect(headers.get('authorization')).toBe('Bearer re_contract_test');
    expect(headers.get('idempotency-key')).toBe(input.idempotencyKey);
    if (typeof request.body !== 'string') {
      throw new Error('Expected Resend request body to be JSON');
    }
    const requestBody: unknown = JSON.parse(request.body);
    expect(requestBody).toMatchObject({
      from: input.from,
      to: [input.to],
      reply_to: [input.replyTo],
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
  });

  it('maps provider validation details to a permanent safe error', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          name: 'validation_error',
          message: 'raw provider detail that must not escape',
          statusCode: 422,
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(provider.sendPaymentEmail(input)).rejects.toMatchObject({
      name: 'PaymentEmailProviderError',
      kind: 'PERMANENT',
      safeCode: 'PROVIDER_REJECTED',
      message: 'PROVIDER_REJECTED',
    } satisfies Partial<PaymentEmailProviderError>);
  });
});
