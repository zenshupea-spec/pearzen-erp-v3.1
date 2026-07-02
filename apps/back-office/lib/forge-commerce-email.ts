import { formatLkr } from './saas-billing';
import type { ForgeProductCatalogItem, ForgeProductInvoice } from './forge-commerce';

export async function sendForgeProductInvoiceEmail(input: {
  invoice: ForgeProductInvoice;
  product: Pick<ForgeProductCatalogItem, 'name' | 'code'>;
}): Promise<{ ok: boolean; emailed: boolean; error?: string; resendMessageId?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.FORGE_EMAIL_FROM?.trim() ??
    process.env.FORGE_CONTACT_FROM?.trim() ??
    'Pearzen <info@pearzen.tech>';

  const { invoice, product } = input;
  const subject = `Pearzen invoice — ${product.name}`;

  const body = [
    `Hello ${invoice.buyerName},`,
    '',
    'Please find your Pearzen product invoice below.',
    '',
    `Product: ${product.name}`,
    `Amount: ${formatLkr(invoice.amountLkr)}`,
    `Due date: ${invoice.dueDate}`,
    '',
    'This purchase is billed separately from any ERP tenant subscription.',
    '',
    'Reply to this email or contact info@pearzen.tech if you have questions.',
    '',
    '— Pearzen Technologies',
  ].join('\n');

  if (!apiKey) {
    return { ok: true, emailed: false };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [invoice.buyerEmail],
        subject,
        text: body,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return {
        ok: false,
        emailed: false,
        error: detail || `Email API returned ${response.status}.`,
      };
    }

    const json = (await response.json()) as { id?: string };
    return { ok: true, emailed: true, resendMessageId: json.id };
  } catch (err) {
    return {
      ok: false,
      emailed: false,
      error: err instanceof Error ? err.message : 'Email delivery failed.',
    };
  }
}
