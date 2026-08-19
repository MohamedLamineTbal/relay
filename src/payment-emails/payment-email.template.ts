type PaymentEmailTemplateInput = {
  workspaceName: string;
  customerName: string;
  description: string;
  amount: number;
  currency: string;
  checkoutUrl: string;
  ownerMessage: string | null;
};

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatAmount(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

export function renderPaymentEmail(input: PaymentEmailTemplateInput) {
  const amount = formatAmount(input.amount, input.currency);
  const ownerMessageText = input.ownerMessage
    ? `\n\n${input.ownerMessage}`
    : '';
  const ownerMessageHtml = input.ownerMessage
    ? `<p style="margin: 20px 0; color: #47514d;">${escapeHtml(input.ownerMessage).replaceAll('\n', '<br>')}</p>`
    : '';
  const statement = `You've received a secure payment request for ${input.description} in the amount of ${amount}. Review the details and complete the payment using the button below.`;

  return {
    subject: 'Your payment request is ready',
    text: [
      `Hello ${input.customerName},`,
      '',
      statement,
      ownerMessageText,
      '',
      'Review and pay securely:',
      input.checkoutUrl,
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; color: #17211e; line-height: 1.6; max-width: 560px; margin: 0 auto;">
        <p>Hello ${escapeHtml(input.customerName)},</p>
        <p>You've received a secure payment request for <strong>${escapeHtml(input.description)}</strong> in the amount of <strong>${escapeHtml(amount)}</strong>. Review the details and complete the payment using the button below.</p>
        ${ownerMessageHtml}
        <p style="margin: 28px 0;">
          <a href="${escapeHtml(input.checkoutUrl)}" style="background: #176f5d; color: #fff; padding: 12px 20px; border-radius: 8px; text-decoration: none;">Review and pay securely</a>
        </p>
        <p style="font-size: 13px; color: #66736e;">Button not working? <a href="${escapeHtml(input.checkoutUrl)}" style="color: #176f5d;">Open the secure payment page</a>.</p>
      </div>
    `.trim(),
  };
}
