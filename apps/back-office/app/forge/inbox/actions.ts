'use server';

import { revalidatePath } from 'next/cache';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { isForgeOperatorEmail } from '../../../lib/forge-access';
import {
  getForgeContactThread,
  listForgeContactThreads,
  sendForgeContactReply,
  type ForgeContactMessage,
  type ForgeContactThread,
} from '../../../lib/forge-contact-inbox';
import { defaultBuyerNameFromThread } from '../../../lib/forge-commerce-inbox';
import {
  createForgeProductPurchase,
  fetchThreadCommerceContext,
} from '../commerce/actions';

async function requireForgeOperator(): Promise<
  { ok: true; email: string } | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email || !(await isForgeOperatorEmail(user.email))) {
    return { ok: false, error: 'You are not authorised to access the Forge contact inbox.' };
  }

  return { ok: true, email: user.email };
}

export async function fetchForgeContactThreadsAction(): Promise<
  { ok: true; threads: ForgeContactThread[] } | { ok: false; error: string }
> {
  const auth = await requireForgeOperator();
  if (!auth.ok) return auth;

  const threads = await listForgeContactThreads();
  return { ok: true, threads };
}

export async function fetchForgeContactThreadAction(threadId: string): Promise<
  | { ok: true; thread: ForgeContactThread; messages: ForgeContactMessage[] }
  | { ok: false; error: string }
> {
  const auth = await requireForgeOperator();
  if (!auth.ok) return auth;

  const data = await getForgeContactThread(threadId);
  if (!data) {
    return { ok: false, error: 'Conversation not found.' };
  }

  return { ok: true, thread: data.thread, messages: data.messages };
}

export async function fetchThreadCommerceContextAction(threadId: string) {
  const auth = await requireForgeOperator();
  if (!auth.ok) return auth;

  const result = await fetchThreadCommerceContext(threadId);
  if (!result.success) {
    return { ok: false as const, error: result.error ?? 'Failed to load commerce context' };
  }

  return {
    ok: true as const,
    suggestedProductCode: result.suggestedProductCode,
    suggestedProductId: result.suggestedProductId,
    products: result.products,
    purchases: result.purchases,
  };
}

export async function createPurchaseFromThreadAction(input: {
  threadId: string;
  productId: string;
  priceLkr?: number | null;
  sendInvoice?: boolean;
  companyId?: string | null;
}): Promise<
  | {
      ok: true;
      purchaseId: string;
      invoiceId?: string | null;
      emailWarning?: string;
    }
  | { ok: false; error: string }
> {
  const auth = await requireForgeOperator();
  if (!auth.ok) return auth;

  const threadData = await getForgeContactThread(input.threadId);
  if (!threadData) {
    return { ok: false, error: 'Conversation not found.' };
  }

  const { thread } = threadData;
  const buyerName = defaultBuyerNameFromThread({
    visitorName: thread.visitorName,
    visitorEmail: thread.visitorEmail,
  });

  const result = await createForgeProductPurchase({
    productId: input.productId,
    buyerName,
    buyerEmail: thread.visitorEmail,
    companyId: input.companyId ?? null,
    priceLkr: input.priceLkr ?? null,
    contactThreadId: thread.id,
    notes: `From inbox: ${thread.subject}`,
    sendInvoice: input.sendInvoice ?? true,
  });

  if (!result.success) {
    return { ok: false, error: result.error ?? 'Could not record purchase.' };
  }

  revalidatePath('/forge/inbox');
  revalidatePath('/forge/commerce/purchases');
  revalidatePath('/forge/commerce/invoices');

  return {
    ok: true,
    purchaseId: result.purchaseId,
    invoiceId: result.invoiceId,
    emailWarning: result.emailWarning,
  };
}

export async function sendForgeContactReplyAction(
  threadId: string,
  body: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireForgeOperator();
  if (!auth.ok) return auth;

  const result = await sendForgeContactReply({
    threadId,
    body,
    operatorEmail: auth.email,
  });

  if (!result.ok) {
    return { ok: false, error: result.error ?? 'Could not send reply.' };
  }

  revalidatePath('/forge/inbox');
  return { ok: true };
}
