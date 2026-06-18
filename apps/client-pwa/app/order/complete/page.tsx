import Link from 'next/link';

export default async function OrderCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string }>;
}) {
  const params = await searchParams;
  const orderId = params.order_id?.trim();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center bg-[#fdfbf7] px-6 text-center">
      <div className="w-full rounded-2xl border border-emerald-200 bg-white px-6 py-8 shadow-lg">
        <p className="text-3xl">✓</p>
        <h1 className="mt-3 text-xl font-black text-stone-900">Payment received</h1>
        <p className="mt-2 text-sm text-stone-600">
          Thank you — your card payment was successful. The café will start preparing your order.
        </p>
        {orderId ? (
          <p className="mt-3 text-xs text-stone-500">Order ref: {orderId.slice(0, 8)}…</p>
        ) : null}
        <Link
          href="/"
          className="mt-6 inline-flex rounded-full bg-emerald-700 px-6 py-3 text-xs font-bold uppercase tracking-wider text-white hover:bg-emerald-800"
        >
          Back to menu
        </Link>
      </div>
    </div>
  );
}
