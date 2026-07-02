'use server';

import { revalidatePath } from 'next/cache';

import {
  recordPartnerPayoutForForgeProductInvoice,
} from '../../../lib/forge-payout-ledger';

import { sendForgeContactReply } from '../../../lib/forge-contact-inbox';
import { sendForgeProductInvoiceEmail } from '../../../lib/forge-commerce-email';
import {
  buildInvoiceThreadReply,
  inferProductCodeFromInquiry,
  resolveSuggestedProductCode,
  type ForgeInquiryProductCode,
} from '../../../lib/forge-commerce-inbox';
import {
  billingIntervalForModel,
  dueDateInDays,
  invoiceMonthForDate,
  type ForgeBillingInterval,
  type ForgeBillingModel,
  type ForgeProductCatalogItem,
  type ForgeProductInvoice,
  type ForgeProductPurchase,
  type ForgeProjectMilestone,
  type ForgeProjectMilestoneStatus,
  type ForgePurchaseStatus,
} from '../../../lib/forge-commerce';
import { assertForgeOperator } from '../../../lib/forge-operator-server';
import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';

const COMMERCE_PATHS = [
  '/forge',
  '/forge/inbox',
  '/forge/commerce/catalog',
  '/forge/commerce/pricing',
  '/forge/commerce/purchases',
  '/forge/commerce/invoices',
  '/forge/partners/payouts',
  '/partners/payouts',
  '/partners',
] as const;

const FORGE_COMMERCE_OPERATOR = 'forge-commerce';

function revalidateCommerce() {
  for (const path of COMMERCE_PATHS) {
    revalidatePath(path);
  }
}

async function maybeNotifyInboxThreadOfInvoice(input: {
  contactThreadId: string | null | undefined;
  productName: string;
  amountLkr: number;
  dueDate: string;
  emailed: boolean;
}) {
  if (!input.contactThreadId || !input.emailed) return;

  try {
    await sendForgeContactReply({
      threadId: input.contactThreadId,
      body: buildInvoiceThreadReply({
        productName: input.productName,
        amountLkr: input.amountLkr,
        dueDate: input.dueDate,
        emailed: input.emailed,
      }),
      operatorEmail: FORGE_COMMERCE_OPERATOR,
    });
  } catch (err) {
    console.error('maybeNotifyInboxThreadOfInvoice:', err);
  }
}

function assertServiceRoleConfigured() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is missing on the server. Add it in Vercel → Environment Variables, then redeploy.',
    );
  }
}

function mapCatalog(row: Record<string, unknown>): ForgeProductCatalogItem {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    description: row.description != null ? String(row.description) : null,
    billingModel: String(row.billing_model) as ForgeBillingModel,
    basePriceLkr: Number(row.base_price_lkr ?? 0),
    isActive: Boolean(row.is_active),
    metadata:
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
    updatedAt: String(row.updated_at ?? ''),
  };
}

function mapPurchase(
  row: Record<string, unknown>,
  product?: { code: string; name: string } | null,
  company?: { name: string } | null,
): ForgeProductPurchase {
  const nestedProduct = row.forge_product_catalog as Record<string, unknown> | null;
  const nestedCompany = row.companies as Record<string, unknown> | null;

  return {
    id: String(row.id),
    productId: String(row.product_id),
    productCode: product?.code ?? String(nestedProduct?.code ?? ''),
    productName: product?.name ?? String(nestedProduct?.name ?? 'Product'),
    billingModel: (product?.billingModel ??
      String(nestedProduct?.billing_model ?? 'one_time')) as ForgeBillingModel,
    companyId: row.company_id != null ? String(row.company_id) : null,
    companyName:
      company?.name ??
      (nestedCompany?.name != null ? String(nestedCompany.name) : null),
    buyerName: String(row.buyer_name),
    buyerEmail: String(row.buyer_email),
    status: String(row.status) as ForgePurchaseStatus,
    priceLkr: Number(row.price_lkr ?? 0),
    billingInterval: row.billing_interval
      ? (String(row.billing_interval) as ForgeBillingInterval)
      : null,
    startedAt: row.started_at ? String(row.started_at) : null,
    contactThreadId: row.contact_thread_id != null ? String(row.contact_thread_id) : null,
    notes: row.notes != null ? String(row.notes) : null,
    metadata:
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
    createdAt: String(row.created_at ?? ''),
  };
}

function mapMilestone(row: Record<string, unknown>): ForgeProjectMilestone {
  return {
    id: String(row.id),
    purchaseId: String(row.purchase_id),
    title: String(row.title),
    description: row.description != null ? String(row.description) : null,
    amountLkr: Number(row.amount_lkr ?? 0),
    dueDate: row.due_date != null ? String(row.due_date) : null,
    sortOrder: Number(row.sort_order ?? 0),
    status: String(row.status) as ForgeProjectMilestoneStatus,
    invoiceId: row.invoice_id != null ? String(row.invoice_id) : null,
    invoicedAt: row.invoiced_at ? String(row.invoiced_at) : null,
    paidAt: row.paid_at ? String(row.paid_at) : null,
    createdAt: String(row.created_at ?? ''),
  };
}

function mapInvoice(
  row: Record<string, unknown>,
  purchase?: ForgeProductPurchase,
): ForgeProductInvoice {
  const nested = row.forge_product_purchases as Record<string, unknown> | null;
  const nestedProduct = nested?.forge_product_catalog as Record<string, unknown> | null;

  return {
    id: String(row.id),
    purchaseId: String(row.purchase_id),
    productName:
      purchase?.productName ?? String(nestedProduct?.name ?? nested?.product_id ?? 'Product'),
    buyerName: purchase?.buyerName ?? String(nested?.buyer_name ?? ''),
    buyerEmail: purchase?.buyerEmail ?? String(nested?.buyer_email ?? ''),
    contactThreadId:
      purchase?.contactThreadId ??
      (nested?.contact_thread_id != null ? String(nested.contact_thread_id) : null),
    invoiceMonth: row.invoice_month != null ? String(row.invoice_month) : null,
    dueDate: String(row.due_date),
    amountLkr: Number(row.amount_lkr ?? 0),
    status: String(row.status) as ForgeProductInvoice['status'],
    sentAt: row.sent_at ? String(row.sent_at) : null,
    paidAt: row.paid_at ? String(row.paid_at) : null,
    resendMessageId: row.resend_message_id ? String(row.resend_message_id) : null,
    createdAt: String(row.created_at ?? ''),
  };
}

async function resolveInboxThreadForPurchase(input: {
  buyerEmail: string;
  productCode: string;
  explicitThreadId?: string | null;
}): Promise<string | null> {
  if (input.explicitThreadId?.trim()) {
    return input.explicitThreadId.trim();
  }

  const supabase = createSupabaseServiceClient();
  const email = input.buyerEmail.trim().toLowerCase();
  const { data, error } = await supabase
    .from('forge_contact_threads')
    .select('id, subject, suggested_product_code')
    .eq('visitor_email', email)
    .eq('status', 'open')
    .order('last_message_at', { ascending: false })
    .limit(12);

  if (error || !data?.length) return null;

  const productMatch = data.find((row) => {
    const code =
      (row.suggested_product_code as ForgeInquiryProductCode | null) ??
      inferProductCodeFromInquiry(String(row.subject ?? ''));
    return code === input.productCode;
  });

  if (productMatch?.id) return String(productMatch.id);
  return String(data[0].id);
}

export async function fetchLinkableInboxThreads(buyerEmail: string) {
  try {
    await assertForgeOperator();
    assertServiceRoleConfigured();
    const supabase = createSupabaseServiceClient();
    const email = buyerEmail.trim().toLowerCase();
    if (!email) {
      return { success: true as const, threads: [] };
    }

    const { data, error } = await supabase
      .from('forge_contact_threads')
      .select('id, subject, visitor_email, suggested_product_code, last_message_at')
      .eq('visitor_email', email)
      .eq('status', 'open')
      .order('last_message_at', { ascending: false })
      .limit(12);

    if (error) throw new Error(error.message);

    return {
      success: true as const,
      threads: (data ?? []).map((row) => ({
        id: String(row.id),
        subject: String(row.subject),
        visitorEmail: String(row.visitor_email),
        suggestedProductCode: row.suggested_product_code
          ? (String(row.suggested_product_code) as ForgeInquiryProductCode)
          : null,
        lastMessageAt: String(row.last_message_at),
      })),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load inbox threads';
    return { success: false as const, error: message, threads: [] };
  }
}

export async function linkPurchaseToInboxThread(purchaseId: string, threadId: string) {
  try {
    await assertForgeOperator();
    assertServiceRoleConfigured();
    const supabase = createSupabaseServiceClient();

    const { data: thread, error: threadError } = await supabase
      .from('forge_contact_threads')
      .select('id')
      .eq('id', threadId)
      .maybeSingle();

    if (threadError) throw new Error(threadError.message);
    if (!thread) throw new Error('Inbox thread not found.');

    const { error } = await supabase
      .from('forge_product_purchases')
      .update({ contact_thread_id: threadId })
      .eq('id', purchaseId);

    if (error) throw new Error(error.message);

    revalidateCommerce();
    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to link thread';
    return { success: false as const, error: message };
  }
}

export async function fetchForgeProductCatalog() {
  try {
    await assertForgeOperator();
    assertServiceRoleConfigured();
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from('forge_product_catalog')
      .select('*')
      .order('code', { ascending: true });

    if (error) throw new Error(error.message);

    return {
      success: true as const,
      products: (data ?? []).map((row) => mapCatalog(row as Record<string, unknown>)),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load catalog';
    return { success: false as const, error: message, products: [] };
  }
}

export async function updateForgeProductPricing(input: {
  id: string;
  basePriceLkr: number;
  isActive: boolean;
  description?: string;
}) {
  try {
    await assertForgeOperator();
    assertServiceRoleConfigured();
    const supabase = createSupabaseServiceClient();
    const patch: Record<string, unknown> = {
      base_price_lkr: input.basePriceLkr,
      is_active: input.isActive,
      updated_at: new Date().toISOString(),
    };
    if (input.description !== undefined) {
      patch.description = input.description.trim() || null;
    }

    const { error } = await supabase
      .from('forge_product_catalog')
      .update(patch)
      .eq('id', input.id);

    if (error) throw new Error(error.message);

    revalidateCommerce();
    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save pricing';
    return { success: false as const, error: message };
  }
}

export async function fetchForgeCommerceCompanies() {
  try {
    await assertForgeOperator();
    assertServiceRoleConfigured();
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from('companies')
      .select('id, name, slug')
      .order('name', { ascending: true });

    if (error) throw new Error(error.message);

    return {
      success: true as const,
      companies: (data ?? []).map((row) => ({
        id: String(row.id),
        name: String(row.name),
        slug: row.slug != null ? String(row.slug) : null,
      })),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load companies';
    return { success: false as const, error: message, companies: [] };
  }
}

export async function fetchPurchasesForContactThread(threadId: string) {
  try {
    await assertForgeOperator();
    assertServiceRoleConfigured();
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from('forge_product_purchases')
      .select('*, forge_product_catalog(code, name), companies(name)')
      .eq('contact_thread_id', threadId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    return {
      success: true as const,
      purchases: (data ?? []).map((row) => mapPurchase(row as Record<string, unknown>)),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load thread purchases';
    return { success: false as const, error: message, purchases: [] };
  }
}

export async function fetchThreadCommerceContext(threadId: string) {
  try {
    await assertForgeOperator();
    assertServiceRoleConfigured();
    const supabase = createSupabaseServiceClient();

    const { data: thread, error: threadError } = await supabase
      .from('forge_contact_threads')
      .select('id, subject, visitor_email, visitor_name, suggested_product_code')
      .eq('id', threadId)
      .maybeSingle();

    if (threadError) throw new Error(threadError.message);
    if (!thread) throw new Error('Conversation not found.');

    const subject = String(thread.subject ?? '');
    const [catalogResult, purchasesResult] = await Promise.all([
      fetchForgeProductCatalog(),
      fetchPurchasesForContactThread(threadId),
    ]);

    if (!catalogResult.success) {
      throw new Error(catalogResult.error ?? 'Failed to load catalog');
    }

    const suggestedProductCode = resolveSuggestedProductCode({
      subject,
      storedCode: thread.suggested_product_code
        ? String(thread.suggested_product_code)
        : null,
    });
    const activeProducts = catalogResult.products.filter((p) => p.isActive);
    const suggestedProduct =
      activeProducts.find((p) => p.code === suggestedProductCode) ?? null;

    return {
      success: true as const,
      suggestedProductCode,
      suggestedProductId: suggestedProduct?.id ?? null,
      products: activeProducts,
      purchases: purchasesResult.success ? purchasesResult.purchases : [],
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load commerce context';
    return { success: false as const, error: message };
  }
}

export async function fetchForgeProductPurchases() {
  try {
    await assertForgeOperator();
    assertServiceRoleConfigured();
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from('forge_product_purchases')
      .select(
        '*, forge_product_catalog(code, name, billing_model), companies(name)',
      )
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw new Error(error.message);

    return {
      success: true as const,
      purchases: (data ?? []).map((row) =>
        mapPurchase(row as Record<string, unknown>),
      ),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load purchases';
    return { success: false as const, error: message, purchases: [] };
  }
}

export async function createForgeProductPurchase(input: {
  productId: string;
  buyerName: string;
  buyerEmail: string;
  companyId?: string | null;
  priceLkr?: number | null;
  notes?: string | null;
  contactThreadId?: string | null;
  createInvoice?: boolean;
  sendInvoice?: boolean;
}) {
  try {
    await assertForgeOperator();
    assertServiceRoleConfigured();
    const supabase = createSupabaseServiceClient();

    const buyerName = input.buyerName.trim();
    const buyerEmail = input.buyerEmail.trim().toLowerCase();
    if (!buyerName || !buyerEmail) {
      throw new Error('Buyer name and email are required.');
    }

    const { data: productRow, error: productError } = await supabase
      .from('forge_product_catalog')
      .select('*')
      .eq('id', input.productId)
      .maybeSingle();

    if (productError) throw new Error(productError.message);
    if (!productRow) throw new Error('Product not found.');

    const product = mapCatalog(productRow as Record<string, unknown>);
    if (!product.isActive) throw new Error('This product is not active.');

    const contactThreadId = await resolveInboxThreadForPurchase({
      buyerEmail,
      productCode: product.code,
      explicitThreadId: input.contactThreadId,
    });

    const priceLkr =
      input.priceLkr != null && Number.isFinite(input.priceLkr)
        ? Number(input.priceLkr)
        : product.basePriceLkr;

    const { data: purchaseRow, error: purchaseError } = await supabase
      .from('forge_product_purchases')
      .insert({
        product_id: product.id,
        company_id: input.companyId?.trim() || null,
        buyer_name: buyerName,
        buyer_email: buyerEmail,
        status: 'pending',
        price_lkr: priceLkr,
        billing_interval: billingIntervalForModel(product.billingModel),
        started_at: new Date().toISOString(),
        contact_thread_id: contactThreadId,
        notes: input.notes?.trim() || null,
      })
      .select('id')
      .single();

    if (purchaseError || !purchaseRow?.id) {
      throw new Error(purchaseError?.message ?? 'Could not create purchase.');
    }

    const purchaseId = String(purchaseRow.id);
    let invoiceId: string | null = null;
    let invoiceDueDate = dueDateInDays(14);
    let emailWarning: string | undefined;
    let invoiceEmailed = false;

    if (input.createInvoice !== false && product.billingModel !== 'milestone') {
      const invoiceResult = await createForgeProductInvoiceForPurchase(purchaseId, {
        skipRevalidate: true,
      });
      if (!invoiceResult.success) {
        throw new Error(invoiceResult.error ?? 'Purchase saved but invoice failed.');
      }
      invoiceId = invoiceResult.invoiceId ?? null;
      invoiceDueDate = invoiceResult.dueDate ?? invoiceDueDate;

      if (input.sendInvoice && invoiceId) {
        const sendResult = await sendForgeProductInvoice(invoiceId, {
          skipRevalidate: true,
          skipThreadNotify: true,
        });
        if (!sendResult.success) {
          emailWarning = sendResult.error ?? 'Invoice created but email failed.';
        } else if (!sendResult.emailed) {
          emailWarning = 'Invoice created. Configure RESEND_API_KEY to auto-send email.';
        } else {
          invoiceEmailed = true;
        }
      }
    }

    if (contactThreadId && invoiceId && invoiceEmailed) {
      await maybeNotifyInboxThreadOfInvoice({
        contactThreadId,
        productName: product.name,
        amountLkr: priceLkr,
        dueDate: invoiceDueDate,
        emailed: true,
      });
    }

    await supabase
      .from('forge_product_purchases')
      .update({ status: 'active' })
      .eq('id', purchaseId);

    revalidateCommerce();

    return {
      success: true as const,
      purchaseId,
      invoiceId,
      contactThreadId,
      emailWarning,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create purchase';
    return { success: false as const, error: message };
  }
}

async function createForgeProductInvoiceForPurchase(
  purchaseId: string,
  options?: { skipRevalidate?: boolean; amountLkr?: number; dueDate?: string },
) {
  try {
    await assertForgeOperator();
    const supabase = createSupabaseServiceClient();

    const { data: purchaseRow, error: purchaseError } = await supabase
      .from('forge_product_purchases')
      .select('*, forge_product_catalog(billing_model, name, code)')
      .eq('id', purchaseId)
      .maybeSingle();

    if (purchaseError) throw new Error(purchaseError.message);
    if (!purchaseRow) throw new Error('Purchase not found.');

    const purchase = mapPurchase(purchaseRow as Record<string, unknown>);
    const productNested = (purchaseRow as Record<string, unknown>).forge_product_catalog as
      | Record<string, unknown>
      | null;
    const billingModel = String(productNested?.billing_model ?? 'one_time') as ForgeBillingModel;

    const dueDate = options?.dueDate ?? dueDateInDays(14);
    const invoiceMonth =
      billingModel === 'monthly' ? invoiceMonthForDate() : null;
    const amountLkr = options?.amountLkr ?? purchase.priceLkr;

    const { data: invoiceRow, error: invoiceError } = await supabase
      .from('forge_product_invoices')
      .insert({
        purchase_id: purchaseId,
        invoice_month: invoiceMonth,
        due_date: dueDate,
        amount_lkr: amountLkr,
        status: 'draft',
      })
      .select('id')
      .single();

    if (invoiceError || !invoiceRow?.id) {
      throw new Error(invoiceError?.message ?? 'Could not create invoice.');
    }

    if (!options?.skipRevalidate) revalidateCommerce();

    return {
      success: true as const,
      invoiceId: String(invoiceRow.id),
      dueDate,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create invoice';
    return { success: false as const, error: message };
  }
}

export async function fetchForgeProductInvoices() {
  try {
    await assertForgeOperator();
    assertServiceRoleConfigured();
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from('forge_product_invoices')
      .select(
        '*, forge_product_purchases(buyer_name, buyer_email, contact_thread_id, forge_product_catalog(name))',
      )
      .order('due_date', { ascending: false })
      .limit(100);

    if (error) throw new Error(error.message);

    return {
      success: true as const,
      invoices: (data ?? []).map((row) => mapInvoice(row as Record<string, unknown>)),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load invoices';
    return { success: false as const, error: message, invoices: [] };
  }
}

export async function sendForgeProductInvoice(
  invoiceId: string,
  options?: { skipRevalidate?: boolean; skipThreadNotify?: boolean },
) {
  try {
    await assertForgeOperator();
    assertServiceRoleConfigured();
    const supabase = createSupabaseServiceClient();

    const { data: row, error } = await supabase
      .from('forge_product_invoices')
      .select(
        '*, forge_product_purchases(buyer_name, buyer_email, contact_thread_id, forge_product_catalog(name, code))',
      )
      .eq('id', invoiceId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!row) throw new Error('Invoice not found.');

    const invoice = mapInvoice(row as Record<string, unknown>);
    const nested = (row as Record<string, unknown>).forge_product_purchases as
      | Record<string, unknown>
      | null;
    const productNested = nested?.forge_product_catalog as Record<string, unknown> | null;

    const emailResult = await sendForgeProductInvoiceEmail({
      invoice,
      product: {
        name: String(productNested?.name ?? 'Pearzen product'),
        code: String(productNested?.code ?? ''),
      },
    });

    if (!emailResult.ok) {
      return {
        success: false as const,
        error: emailResult.error ?? 'Email failed.',
        emailed: false,
      };
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('forge_product_invoices')
      .update({
        status: emailResult.emailed ? 'sent' : 'unpaid',
        sent_at: emailResult.emailed ? now : null,
        resend_message_id: emailResult.resendMessageId ?? null,
      })
      .eq('id', invoiceId);

    if (updateError) throw new Error(updateError.message);

    if (
      !options?.skipThreadNotify &&
      emailResult.emailed &&
      nested?.contact_thread_id
    ) {
      await maybeNotifyInboxThreadOfInvoice({
        contactThreadId: String(nested.contact_thread_id),
        productName: String(productNested?.name ?? 'Pearzen product'),
        amountLkr: invoice.amountLkr,
        dueDate: invoice.dueDate,
        emailed: true,
      });
    }

    if (!options?.skipRevalidate) revalidateCommerce();

    return {
      success: true as const,
      emailed: emailResult.emailed,
      warning: emailResult.emailed
        ? undefined
        : 'RESEND_API_KEY not configured — invoice marked unpaid without email.',
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to send invoice';
    return { success: false as const, error: message, emailed: false };
  }
}

export async function markForgeProductInvoicePaid(invoiceId: string) {
  try {
    await assertForgeOperator();
    assertServiceRoleConfigured();
    const supabase = createSupabaseServiceClient();
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('forge_product_invoices')
      .update({ status: 'paid', paid_at: now })
      .eq('id', invoiceId);

    if (error) throw new Error(error.message);

    await supabase
      .from('forge_project_milestones')
      .update({ status: 'paid', paid_at: now })
      .eq('invoice_id', invoiceId);

    await recordPartnerPayoutForForgeProductInvoice(invoiceId);
    revalidateCommerce();
    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to mark paid';
    return { success: false as const, error: message };
  }
}

export async function generateForgeProductInvoice(purchaseId: string) {
  return createForgeProductInvoiceForPurchase(purchaseId);
}

export async function fetchForgeProjectMilestones(purchaseId: string) {
  try {
    await assertForgeOperator();
    assertServiceRoleConfigured();
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from('forge_project_milestones')
      .select('*')
      .eq('purchase_id', purchaseId)
      .order('sort_order', { ascending: true });

    if (error) throw new Error(error.message);

    return {
      success: true as const,
      milestones: (data ?? []).map((row) => mapMilestone(row as Record<string, unknown>)),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load milestones';
    return { success: false as const, error: message, milestones: [] };
  }
}

export async function addForgeProjectMilestone(input: {
  purchaseId: string;
  title: string;
  amountLkr: number;
  dueDate?: string | null;
  description?: string | null;
}) {
  try {
    await assertForgeOperator();
    assertServiceRoleConfigured();
    const supabase = createSupabaseServiceClient();
    const title = input.title.trim();
    if (!title) throw new Error('Milestone title is required.');
    if (!Number.isFinite(input.amountLkr) || input.amountLkr < 0) {
      throw new Error('Amount must be zero or greater.');
    }

    const { count, error: countError } = await supabase
      .from('forge_project_milestones')
      .select('id', { count: 'exact', head: true })
      .eq('purchase_id', input.purchaseId);

    if (countError) throw new Error(countError.message);

    const { data, error } = await supabase
      .from('forge_project_milestones')
      .insert({
        purchase_id: input.purchaseId,
        title,
        description: input.description?.trim() || null,
        amount_lkr: input.amountLkr,
        due_date: input.dueDate?.trim() || null,
        sort_order: count ?? 0,
      })
      .select('id')
      .single();

    if (error || !data?.id) throw new Error(error?.message ?? 'Could not add milestone.');

    revalidateCommerce();
    return { success: true as const, milestoneId: String(data.id) };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to add milestone';
    return { success: false as const, error: message };
  }
}

export async function invoiceForgeProjectMilestone(
  milestoneId: string,
  sendInvoice = true,
) {
  try {
    await assertForgeOperator();
    assertServiceRoleConfigured();
    const supabase = createSupabaseServiceClient();
    const now = new Date().toISOString();

    const { data: milestoneRow, error: milestoneError } = await supabase
      .from('forge_project_milestones')
      .select('*, forge_product_purchases(*)')
      .eq('id', milestoneId)
      .maybeSingle();

    if (milestoneError) throw new Error(milestoneError.message);
    if (!milestoneRow) throw new Error('Milestone not found.');

    const milestone = mapMilestone(milestoneRow as Record<string, unknown>);
    if (milestone.status !== 'pending') {
      throw new Error('Only pending milestones can be invoiced.');
    }

    const invoiceResult = await createForgeProductInvoiceForPurchase(milestone.purchaseId, {
      skipRevalidate: true,
      amountLkr: milestone.amountLkr,
      dueDate: milestone.dueDate ?? dueDateInDays(14),
    });

    if (!invoiceResult.success || !invoiceResult.invoiceId) {
      throw new Error(invoiceResult.error ?? 'Could not create milestone invoice.');
    }

    let emailWarning: string | undefined;
    if (sendInvoice) {
      const sendResult = await sendForgeProductInvoice(invoiceResult.invoiceId, {
        skipRevalidate: true,
        skipThreadNotify: false,
      });
      if (!sendResult.success) {
        emailWarning = sendResult.error ?? 'Invoice created but email failed.';
      } else if (!sendResult.emailed) {
        emailWarning = 'Invoice created. Configure RESEND_API_KEY to auto-send email.';
      }
    }

    const { error: updateError } = await supabase
      .from('forge_project_milestones')
      .update({
        status: 'invoiced',
        invoice_id: invoiceResult.invoiceId,
        invoiced_at: now,
      })
      .eq('id', milestoneId);

    if (updateError) throw new Error(updateError.message);

    revalidateCommerce();
    return {
      success: true as const,
      invoiceId: invoiceResult.invoiceId,
      emailWarning,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to invoice milestone';
    return { success: false as const, error: message };
  }
}
