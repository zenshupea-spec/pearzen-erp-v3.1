'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChefHat,
  ChevronDown,
  ChevronUp,
  Check,
  FlaskConical,
  Globe,
  ExternalLink,
  Copy,
  Image as ImageIcon,
  Minus,
  Package,
  Palette,
  Phone,
  Plus,
  Shield,
  Satellite,
  ShoppingBag,
  Smartphone,
  Tag,
  Truck,
  Upload,
  User,
  Utensils,
  X,
} from 'lucide-react';
import { ExecutiveGlassCard } from '../../../components/executive/ExecutiveVaultShell';
import BrandWatermarkBackground from '../../../components/portal/BrandWatermarkBackground';
import {
  CUSTOMER_MENU_CLOUDFLARE_LINKS,
  CUSTOMER_MENU_SECURITY_RULES,
  CUSTOMER_MENU_VERCEL_LINKS,
  customerMenuHost,
  normalizeCustomerMenuUrl,
} from '../../../lib/customer-menu-host';
import {
  COVER_TEXT_SHADOW,
  DEFAULT_CAFE_COVER_TEXT_COLOR,
  DEFAULT_CAFE_COVER_THEME,
  deriveCategoryPalette,
  extractCoverTheme,
  type CafeCoverTheme,
} from './cafe-cover-theme';
import {
  normalizeIngredient,
  type FulfillmentMode,
  type Ingredient,
  type IngredientSupplier,
  type IngredientUnit,
} from './cafe-ingredient-utils';
import {
  calcAvailableToSell,
  calcBaseCost,
  calcMenu14dTarget,
  calcMenuRollingAvg14d,
  calcRecipeCost,
  calcSellingPrice,
  normalizeMenuItem,
  syncMenuRecipeCosts,
  type CafeMenuRecipeItem,
  type RecipeLine,
} from './cafe-menu-sync';
import { getMenuKitchenTrackKind, type KitchenTrackKind } from './prep-menu-sync';

type MenuItem = CafeMenuRecipeItem;

function KitchenTrackToggle({
  track,
  onChange,
}: {
  track: KitchenTrackKind;
  onChange: (track: KitchenTrackKind) => void;
}) {
  const options: { key: KitchenTrackKind; label: string; Icon?: typeof ChefHat }[] = [
    { key: 'none', label: 'Off' },
    { key: 'prep', label: 'Prep', Icon: ChefHat },
    { key: 'display', label: 'Display', Icon: Utensils },
  ];
  return (
    <div className="inline-flex rounded-xl border border-violet-200/80 bg-white/70 p-0.5 text-[9px] font-black uppercase tracking-wider">
      {options.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 transition-all ${
            track === key ? 'bg-violet-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {Icon ? <Icon className="h-2.5 w-2.5" /> : null}
          {label}
        </button>
      ))}
    </div>
  );
}

const DEFAULT_INGREDIENT_SUPPLIER: IngredientSupplier = { name: 'Unassigned', address: '', phone: '' };

function createQuickIngredient(draft: {
  name: string;
  brand?: string;
  unit: IngredientUnit;
  purchaseAmount: number;
  packagePrice: number;
  fulfillmentMode?: FulfillmentMode;
  supplier?: IngredientSupplier;
}): Ingredient {
  return normalizeIngredient({
    id: `IG${Date.now()}`,
    name: draft.name.trim(),
    brand: draft.brand?.trim() || undefined,
    unit: draft.unit,
    purchaseAmount: Math.max(1, draft.purchaseAmount),
    packagePrice: Math.max(0, draft.packagePrice),
    fulfillmentMode: draft.fulfillmentMode ?? 'bought',
    supplier: draft.supplier ?? DEFAULT_INGREDIENT_SUPPLIER,
  });
}

function matchIngredients(query: string, ingredients: Ingredient[]): Ingredient[] {
  const q = query.trim().toLowerCase();
  if (!q) return ingredients.slice(0, 8);
  return ingredients
    .filter(
      (ing) =>
        ing.name.toLowerCase().includes(q) ||
        (ing.brand?.toLowerCase().includes(q) ?? false),
    )
    .slice(0, 8);
}

function IngredientCombobox({
  ingredients,
  value,
  onSelect,
  inputCls,
  placeholder = 'Search ingredients…',
  autoFocus,
}: {
  ingredients: Ingredient[];
  value: string;
  onSelect: (ingredientId: string) => void;
  inputCls: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const selected = ingredients.find((i) => i.id === value);
  const [query, setQuery] = useState(selected?.name ?? '');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(selected?.name ?? '');
  }, [selected?.id, selected?.name]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const matches = useMemo(() => matchIngredients(query, ingredients), [query, ingredients]);
  const trimmed = query.trim();
  const exactMatch = trimmed
    ? ingredients.some((ing) => ing.name.toLowerCase() === trimmed.toLowerCase())
    : false;

  const pick = (ingredientId: string) => {
    const ing = ingredients.find((i) => i.id === ingredientId);
    if (ing) setQuery(ing.name);
    onSelect(ingredientId);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative min-w-[180px] flex-1">
      <input
        type="text"
        value={query}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        className={inputCls}
      />
      {open && (matches.length > 0 || (trimmed && !exactMatch)) ? (
        <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-slate-200/90 bg-white shadow-lg">
          {matches.map((ing) => (
            <button
              key={ing.id}
              type="button"
              onClick={() => pick(ing.id)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-indigo-50/80"
            >
              <span className="font-semibold text-slate-900">{ing.name}</span>
              <span className="shrink-0 font-mono text-[10px] text-slate-500">
                LKR {ing.unitPrice}/{ing.unit}
              </span>
            </button>
          ))}
          {trimmed && !exactMatch ? (
            <div className="border-t border-slate-100 px-3 py-2 text-[10px] text-slate-500">
              No exact match — use Add below to create &quot;{trimmed}&quot; in the ledger.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function RecipeIngredientAddPanel({
  ingredients,
  inputCls,
  labelCls,
  onAddExisting,
  onCreateNew,
}: {
  ingredients: Ingredient[];
  inputCls: string;
  labelCls: string;
  onAddExisting: (ingredientId: string) => void;
  onCreateNew: (ingredient: Ingredient) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState({
    unit: 'ml' as IngredientUnit,
    purchaseAmount: '1000',
    packagePrice: '',
  });
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const matches = useMemo(() => matchIngredients(query, ingredients), [query, ingredients]);
  const trimmed = query.trim();
  const exactMatch = trimmed
    ? ingredients.find((ing) => ing.name.toLowerCase() === trimmed.toLowerCase())
    : undefined;

  const reset = () => {
    setQuery('');
    setOpen(false);
    setShowCreate(false);
    setDraft({ unit: 'ml', purchaseAmount: '1000', packagePrice: '' });
  };

  const pickExisting = (ingredientId: string) => {
    onAddExisting(ingredientId);
    reset();
  };

  const saveNew = () => {
    const price = parseFloat(draft.packagePrice);
    if (!trimmed || !Number.isFinite(price) || price < 0) return;
    const created = createQuickIngredient({
      name: trimmed,
      unit: draft.unit,
      purchaseAmount: Math.max(1, parseFloat(draft.purchaseAmount) || 1000),
      packagePrice: price,
    });
    onCreateNew(created);
    reset();
  };

  return (
    <div ref={wrapRef} className="mt-3 space-y-3 rounded-xl border border-dashed border-indigo-300/70 bg-indigo-50/30 p-3">
      {!showCreate ? (
        <>
          <div className="relative">
            <input
              type="text"
              value={query}
              placeholder="Type ingredient — e.g. Milk, Flour, Cinnamon…"
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && exactMatch) {
                  e.preventDefault();
                  pickExisting(exactMatch.id);
                }
              }}
              className={inputCls}
            />
            {open ? (
              <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-slate-200/90 bg-white shadow-lg">
                {matches.length > 0 ? (
                  matches.map((ing) => (
                    <button
                      key={ing.id}
                      type="button"
                      onClick={() => pickExisting(ing.id)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-indigo-50/80"
                    >
                      <span className="font-semibold text-slate-900">{ing.name}</span>
                      <span className="shrink-0 font-mono text-[10px] text-slate-500">
                        LKR {ing.unitPrice}/{ing.unit}
                      </span>
                    </button>
                  ))
                ) : trimmed ? (
                  <div className="px-3 py-2 text-xs text-slate-500">No matches in the ledger.</div>
                ) : (
                  <div className="px-3 py-2 text-xs text-slate-500">Type to search ingredients…</div>
                )}
                {trimmed && !exactMatch ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreate(true);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 border-t border-indigo-100 px-3 py-2.5 text-left text-xs font-bold text-indigo-800 hover:bg-indigo-50/80"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add &quot;{trimmed}&quot; to ingredients ledger
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          <p className="text-[10px] text-indigo-800/70">
            Pick a suggestion to add to this recipe. New items are saved to the ingredients ledger automatically.
          </p>
        </>
      ) : (
        <div className="space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-900">
            New ingredient — {trimmed}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Unit</label>
              <select
                value={draft.unit}
                onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value as IngredientUnit }))}
                className={inputCls}
              >
                <option value="ml">ml</option>
                <option value="gm">gm</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Package Amount</label>
              <input
                type="number"
                min={1}
                step={1}
                value={draft.purchaseAmount}
                onChange={(e) => setDraft((d) => ({ ...d, purchaseAmount: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Package Price (LKR)</label>
              <input
                type="number"
                min={0}
                step={1}
                value={draft.packagePrice}
                onChange={(e) => setDraft((d) => ({ ...d, packagePrice: e.target.value }))}
                className={inputCls}
                placeholder="e.g. 450"
                autoFocus
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveNew}
              className="rounded-xl border border-emerald-300/80 bg-emerald-600 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-500"
            >
              Save &amp; Add to Recipe
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-xl border border-slate-200/80 bg-white/70 px-3 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
// Per-category palette used by both the pricing table thumbnail and customer preview
const CAT_PALETTE: Record<string, { gradFrom: string; gradTo: string; accent: string; light: string }> = {
  'Hot Beverages':      { gradFrom: '#f59e0b', gradTo: '#92400e', accent: 'text-amber-600',   light: 'bg-amber-50'   },
  'Cold Beverages':     { gradFrom: '#38bdf8', gradTo: '#0369a1', accent: 'text-sky-600',     light: 'bg-sky-50'     },
  'Pastries & Bakery':  { gradFrom: '#fb923c', gradTo: '#9a3412', accent: 'text-orange-600',  light: 'bg-orange-50'  },
  'Mains & Sandwiches': { gradFrom: '#34d399', gradTo: '#065f46', accent: 'text-emerald-600', light: 'bg-emerald-50' },
  'Desserts':           { gradFrom: '#c084fc', gradTo: '#6b21a8', accent: 'text-violet-600',  light: 'bg-violet-50'  },
};

function getCatPalette(cat: string) {
  return CAT_PALETTE[cat] ?? { gradFrom: '#94a3b8', gradTo: '#334155', accent: 'text-slate-600', light: 'bg-slate-50' };
}

function ItemThumb({ item, size }: { item: MenuItem; size: 'sm' | 'lg' }) {
  const { gradFrom, gradTo } = getCatPalette(item.category);
  const cls = size === 'sm'
    ? 'h-11 w-11 rounded-xl flex-shrink-0'
    : 'h-32 w-full rounded-2xl';
  return (
    <div
      className={`relative overflow-hidden ${cls}`}
      style={{ background: `linear-gradient(135deg, ${gradFrom}, ${gradTo})` }}
    >
      {item.hasImage ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-5 w-5 rounded-full bg-white/20" />
          <div className="absolute h-2.5 w-2.5 rounded-full bg-white/40" />
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 opacity-60">
          <Upload className="h-3.5 w-3.5 text-white" />
          <span className="text-[8px] font-black uppercase tracking-widest text-white">Upload</span>
        </div>
      )}
    </div>
  );
}
type FulfillmentChoice = 'dine-in' | 'takeout' | 'delivery';

type OrderConfirmation = {
  choice: FulfillmentChoice;
  name: string;
  phone: string;
  address?: string;
};

function useCoverTheme(coverUrl: string | null): CafeCoverTheme {
  const [theme, setTheme] = useState<CafeCoverTheme>(DEFAULT_CAFE_COVER_THEME);

  useEffect(() => {
    if (!coverUrl) {
      setTheme(DEFAULT_CAFE_COVER_THEME);
      return;
    }
    let cancelled = false;
    void extractCoverTheme(coverUrl).then((next) => {
      if (!cancelled) setTheme(next);
    });
    return () => {
      cancelled = true;
    };
  }, [coverUrl]);

  return theme;
}

function CoverBand({
  coverUrl,
  theme,
  children,
  className = '',
  imagePosition = 'center',
}: {
  coverUrl: string | null;
  theme: CafeCoverTheme;
  children: React.ReactNode;
  className?: string;
  imagePosition?: 'top' | 'center' | 'bottom';
}) {
  const objectPositionClass =
    imagePosition === 'top'
      ? 'object-top'
      : imagePosition === 'bottom'
        ? 'object-bottom'
        : 'object-center';

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverUrl}
          alt=""
          className={`absolute inset-0 h-full w-full object-cover ${objectPositionClass}`}
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, ${theme.primarySoft} 0%, #ffffff 45%, ${theme.accentSoft} 100%)`,
          }}
        />
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

function CustomerMenuPreview({
  items,
  categories,
  logoUrl,
  coverUrl,
  overheadPct,
  showItemImages = true,
  coverTextColor = DEFAULT_CAFE_COVER_TEXT_COLOR,
}: {
  items: MenuItem[];
  categories: string[];
  logoUrl: string | null;
  coverUrl: string | null;
  overheadPct: number;
  showItemImages?: boolean;
  coverTextColor?: string;
}) {
  const theme = useCoverTheme(coverUrl);
  const bandTextStyle = {
    color: coverTextColor,
    textShadow: COVER_TEXT_SHADOW,
  };
  const [cart, setCart] = useState<Record<string, number>>({});
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [modalStep, setModalStep] = useState<'choice' | 'details'>('choice');
  const [pendingChoice, setPendingChoice] = useState<FulfillmentChoice | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [orderConfirmed, setOrderConfirmed] = useState<OrderConfirmation | null>(null);

  const grouped = useMemo(() => {
    const sections = categories
      .map((cat) => ({ cat, rows: items.filter((i) => i.category === cat) }))
      .filter(({ rows }) => rows.length > 0);
    const knownCats = new Set(categories);
    const orphans = items.filter((i) => !knownCats.has(i.category));
    if (orphans.length) sections.push({ cat: 'Other', rows: orphans });
    return sections;
  }, [items, categories]);

  const priceById = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      const baseCost = calcBaseCost(item.recipeCost, overheadPct);
      map.set(item.id, calcSellingPrice(baseCost, item.targetMargin));
    }
    return map;
  }, [items, overheadPct]);

  const cartTotal = useMemo(
    () =>
      Object.entries(cart).reduce(
        (sum, [id, qty]) => sum + (priceById.get(id) ?? 0) * qty,
        0,
      ),
    [cart, priceById],
  );

  const cartCount = useMemo(
    () => Object.values(cart).reduce((sum, qty) => sum + qty, 0),
    [cart],
  );

  const adjustQty = (itemId: string, delta: number) => {
    setOrderConfirmed(null);
    setCart((prev) => {
      const next = Math.max(0, (prev[itemId] ?? 0) + delta);
      if (next === 0) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: next };
    });
  };

  const resetOrderModal = () => {
    setShowOrderModal(false);
    setModalStep('choice');
    setPendingChoice(null);
    setCustomerName('');
    setCustomerPhone('');
    setDeliveryAddress('');
  };

  const handlePlaceOrder = () => {
    if (cartCount === 0) return;
    setModalStep('choice');
    setPendingChoice(null);
    setShowOrderModal(true);
  };

  const selectFulfillment = (choice: FulfillmentChoice) => {
    setPendingChoice(choice);
    setModalStep('details');
  };

  const confirmOrderDetails = async () => {
    if (!pendingChoice) return;
    const name = customerName.trim();
    const phone = customerPhone.trim();
    const address = deliveryAddress.trim();
    if (!name || !phone) return;
    if (pendingChoice === 'delivery' && !address) return;

    const orderItems = Object.entries(cart).map(([id, qty]) => {
      const row = items.find((item) => item.id === id);
      return {
        menuItemId: id,
        name: row?.name ?? 'Item',
        qty,
        unitPriceLkr: priceById.get(id) ?? 0,
      };
    });

    try {
      const { placeCafeCustomerOrder } = await import('./actions');
      await placeCafeCustomerOrder({
        fulfillmentType: pendingChoice,
        customerName: name,
        customerPhone: phone,
        deliveryAddress: pendingChoice === 'delivery' ? address : undefined,
        items: orderItems,
        totalLkr: cartTotal,
      });
    } catch {
      /* preview still confirms locally if RPC unavailable */
    }

    setOrderConfirmed({
      choice: pendingChoice,
      name,
      phone,
      address: pendingChoice === 'delivery' ? address : undefined,
    });
    resetOrderModal();
  };

  const fulfillmentLabel = (choice: FulfillmentChoice) => {
    if (choice === 'dine-in') return 'Dine-in';
    if (choice === 'takeout') return 'Takeout';
    return 'Delivery';
  };

  const canConfirmDetails =
    customerName.trim().length > 0 &&
    customerPhone.trim().length > 0 &&
    (pendingChoice !== 'delivery' || deliveryAddress.trim().length > 0);

  return (
    <div
      className="relative flex max-h-[640px] flex-col overflow-hidden rounded-[1.75rem] border bg-[#fdfbf7] shadow-[0_28px_72px_-18px_rgba(15,23,42,0.16)]"
      style={{ borderColor: `${theme.primary}44` }}
    >
      {/* Header — cover band with centred logo */}
      <CoverBand coverUrl={coverUrl} theme={theme} imagePosition="top" className="shrink-0 border-b border-white/20">
        <div className="relative px-5 pb-5 pt-3">
          <div className="flex justify-end">
            <span
              className="flex items-center gap-1.5 rounded-full border border-white/40 bg-white/20 px-2.5 py-1 text-[9px] font-black backdrop-blur-md"
              style={bandTextStyle}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-90" />
              Open now
            </span>
          </div>
          <div className="-mt-1 flex flex-col items-center text-center">
            <div
              className="flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-full border-2 border-white/80 bg-white/95 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.35)]"
            >
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="h-full w-full object-contain p-2" />
              ) : (
                <Utensils className="h-7 w-7" style={{ color: theme.primary }} strokeWidth={1.5} />
              )}
            </div>
            <p
              className="font-university-roman mt-3 text-xl font-black leading-none tracking-[0.12em]"
              style={bandTextStyle}
            >
              Our Menu
            </p>
            {cartCount === 0 && !orderConfirmed ? (
              <p
                className="mt-1.5 text-[11px] font-black leading-snug"
                style={bandTextStyle}
              >
                Tap + beside any item, then place your order
              </p>
            ) : null}
          </div>
        </div>
      </CoverBand>

      {/* Menu body — logo watermark grid visible behind list */}
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <div
          className="relative min-h-full"
          style={{
            background: `linear-gradient(180deg, ${theme.primarySoft}88 0%, #fdfbf7 18%, #fdfbf7 100%)`,
          }}
        >
          <BrandWatermarkBackground
            logoUrl={logoUrl}
            mode="grid"
            compact
            opacity={logoUrl ? 0.26 : 0.08}
            fadeStrength="light"
            base="transparent"
          />
          {grouped.length === 0 ? (
            <p className="relative z-10 px-5 py-10 text-center text-xs text-stone-500">No menu items yet.</p>
          ) : (
            <div className="relative z-10 space-y-5 px-4 py-4 pb-6">
            {orderConfirmed ? (
              <div
                className="rounded-xl border px-4 py-3 text-center backdrop-blur-[2px]"
                style={{ borderColor: `${theme.accent}55`, backgroundColor: `${theme.accentSoft}cc` }}
              >
                <div
                  className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full text-white"
                  style={{ backgroundColor: theme.accent }}
                >
                  <Check className="h-4 w-4" strokeWidth={3} />
                </div>
                <p className="text-xs font-semibold" style={{ color: theme.accentDark }}>
                  {fulfillmentLabel(orderConfirmed.choice)} order placed for {orderConfirmed.name}
                </p>
                <p className="mt-0.5 text-[10px]" style={{ color: theme.accentDark }}>
                  LKR {cartTotal.toLocaleString()} · {cartCount} item{cartCount === 1 ? '' : 's'} · {orderConfirmed.phone}
                </p>
                {orderConfirmed.address ? (
                  <p className="mt-1 text-[10px] text-stone-600">{orderConfirmed.address}</p>
                ) : null}
              </div>
            ) : null}

            {grouped.map(({ cat, rows }, sectionIndex) => {
              const palette = deriveCategoryPalette(theme, sectionIndex);
              return (
                <section key={cat} className="space-y-0.5">
                  <div className="mb-2 flex flex-col items-center gap-1 px-1">
                    <h4
                      className="font-university-roman text-sm tracking-[0.14em]"
                      style={{ color: palette.gradTo }}
                    >
                      {cat}
                    </h4>
                    <div
                      className="h-px w-16"
                      style={{ background: `linear-gradient(90deg, transparent, ${palette.gradFrom}, transparent)` }}
                    />
                  </div>

                  <ul className="divide-y divide-stone-200/70 rounded-xl border border-stone-200/50 bg-white/45 backdrop-blur-[1px]">
                    {rows.map((item) => {
                      const price = priceById.get(item.id) ?? 0;
                      const qty = cart[item.id] ?? 0;
                      return (
                        <li
                          key={item.id}
                          className="flex items-center gap-2.5 px-3 py-2.5 transition-colors"
                          style={qty > 0 ? { backgroundColor: `${theme.primarySoft}99` } : undefined}
                        >
                          {showItemImages ? (
                            <div
                              className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg"
                              style={{ background: `linear-gradient(145deg, ${palette.gradFrom}66, ${palette.gradTo}99)` }}
                            >
                              {item.hasImage ? (
                                <div className="flex h-full items-center justify-center">
                                  <div className="h-5 w-5 rounded-md bg-white/45" />
                                </div>
                              ) : (
                                <div className="flex h-full items-center justify-center">
                                  <Tag className="h-3.5 w-3.5 text-white/75" strokeWidth={1.75} />
                                </div>
                              )}
                            </div>
                          ) : null}

                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12px] font-semibold leading-tight text-stone-800">
                              {item.name}
                            </p>
                            <p className="text-[11px] font-medium tabular-nums" style={{ color: palette.gradTo }}>
                              LKR {price.toLocaleString()}
                            </p>
                          </div>

                          <div className="flex shrink-0 items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => adjustQty(item.id, -1)}
                              disabled={qty === 0}
                              className="flex h-7 w-7 items-center justify-center rounded-full text-stone-500 transition-all hover:bg-stone-100 disabled:opacity-20"
                              aria-label={`Remove one ${item.name}`}
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="min-w-[1.25rem] text-center text-xs font-bold tabular-nums text-stone-700">
                              {qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => adjustQty(item.id, 1)}
                              className="flex h-7 w-7 items-center justify-center rounded-full text-white shadow-sm transition-all hover:opacity-90"
                              style={{ backgroundColor: theme.primary }}
                              aria-label={`Add one ${item.name}`}
                            >
                              <Plus className="h-3 w-3" strokeWidth={2.5} />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
        </div>
      </div>

      {/* Order bar with cover band */}
      <CoverBand
        coverUrl={coverUrl}
        theme={theme}
        imagePosition="bottom"
        className="relative z-10 shrink-0 border-t border-white/20"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p
              className="text-[10px] font-black uppercase tracking-[0.14em]"
              style={bandTextStyle}
            >
              Your order
            </p>
            <p
              className="mt-1 inline-flex rounded-xl border border-white/90 bg-white px-3 py-1.5 font-university-roman text-2xl font-black tabular-nums tracking-[0.06em] text-slate-900 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.35)]"
            >
              LKR {cartTotal.toLocaleString()}
            </p>
            {cartCount > 0 ? (
              <p
                className="text-[11px] font-bold"
                style={bandTextStyle}
              >
                {cartCount} item{cartCount === 1 ? '' : 's'} selected
              </p>
            ) : (
              <p
                className="text-[11px] font-bold"
                style={bandTextStyle}
              >
                Add items from the menu above
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handlePlaceOrder}
            disabled={cartCount === 0}
            className="flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider shadow-lg transition-all disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-stone-200 disabled:text-stone-400 disabled:shadow-none"
            style={
              cartCount > 0
                ? {
                    backgroundColor: '#ffffff',
                    borderColor: 'rgba(255,255,255,0.9)',
                    color: theme.primaryDark,
                    boxShadow: '0 8px 24px -8px rgba(0,0,0,0.35)',
                  }
                : undefined
            }
          >
            <ShoppingBag className="h-3.5 w-3.5" />
            Place Order
            {cartCount > 0 ? (
              <span
                className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[9px] text-white"
                style={{ backgroundColor: theme.primary }}
              >
                {cartCount}
              </span>
            ) : null}
          </button>
        </div>
      </CoverBand>

      {/* Order modal: fulfillment choice → customer details */}
      {showOrderModal ? (
        <div
          className="absolute inset-0 z-20 flex items-end justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]"
          onClick={resetOrderModal}
          role="presentation"
        >
          <div
            className="w-full max-w-[320px] overflow-hidden rounded-2xl border bg-white shadow-2xl"
            style={{ borderColor: `${theme.primary}44` }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cafe-order-modal-title"
          >
            <div
              className="relative border-b px-4 py-4"
              style={{ borderColor: `${theme.primary}22`, background: `linear-gradient(135deg, ${theme.primarySoft}, ${theme.accentSoft})` }}
            >
              <button
                type="button"
                onClick={resetOrderModal}
                className="absolute right-3 top-3 rounded-lg p-1 text-slate-400 hover:bg-white/80 hover:text-slate-700"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
              <p id="cafe-order-modal-title" className="pr-8 text-sm font-black text-slate-900">
                {modalStep === 'choice' ? 'How would you like your order?' : 'Your contact details'}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {modalStep === 'choice'
                  ? `Choose dine-in, takeout, or delivery for ${cartCount} item${cartCount === 1 ? '' : 's'}.`
                  : `We need your name and phone${pendingChoice === 'delivery' ? ', plus delivery address' : ''}.`}
              </p>
            </div>

            {modalStep === 'choice' ? (
              <div className="grid grid-cols-3 gap-2 p-4">
                {([
                  { key: 'dine-in' as const, label: 'Dine In', hint: 'Eat here', Icon: Utensils, tint: theme.primary },
                  { key: 'takeout' as const, label: 'Takeout', hint: 'Pick up', Icon: Package, tint: theme.accent },
                  { key: 'delivery' as const, label: 'Delivery', hint: 'To you', Icon: Truck, tint: theme.primaryDark },
                ]).map(({ key, label, hint, Icon, tint }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => selectFulfillment(key)}
                    className="flex flex-col items-center gap-1.5 rounded-2xl border-2 border-slate-200/80 bg-white px-2 py-3 text-center transition-all hover:shadow-md"
                    style={{ borderColor: `${tint}44` }}
                  >
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-2xl text-white"
                      style={{ background: `linear-gradient(135deg, ${tint}, ${theme.accent})` }}
                    >
                      <Icon className="h-4 w-4" strokeWidth={1.75} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wide text-slate-800">{label}</span>
                    <span className="text-[8px] leading-snug text-slate-500">{hint}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-3 p-4">
                {pendingChoice ? (
                  <p
                    className="rounded-xl px-3 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider"
                    style={{ backgroundColor: theme.primarySoft, color: theme.primaryDark }}
                  >
                    {fulfillmentLabel(pendingChoice)}
                  </p>
                ) : null}

                <label className="block">
                  <span className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    <User className="h-3 w-3" /> Your good name
                  </span>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. Sam"
                    className="w-full rounded-xl border border-slate-200/80 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2"
                    style={{ ['--tw-ring-color' as string]: `${theme.primary}55` }}
                    autoFocus
                  />
                </label>

                <label className="block">
                  <span className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    <Phone className="h-3 w-3" /> Phone number
                  </span>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="e.g. 077 123 4567"
                    className="w-full rounded-xl border border-slate-200/80 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2"
                  />
                </label>

                {pendingChoice === 'delivery' ? (
                  <label className="block">
                    <span className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                      <Truck className="h-3 w-3" /> Delivery address
                    </span>
                    <textarea
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      placeholder="Street, building, area…"
                      rows={3}
                      className="w-full resize-none rounded-xl border border-slate-200/80 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2"
                    />
                  </label>
                ) : null}

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setModalStep('choice')}
                    className="flex-1 rounded-xl border border-slate-200/80 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={confirmOrderDetails}
                    disabled={!canConfirmDetails}
                    className="flex-1 rounded-xl px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-white shadow-md transition-all disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                    style={canConfirmDetails ? { backgroundColor: theme.accent } : undefined}
                  >
                    Confirm Order
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}


export function MenuEngineeringDesk({
  items,
  setItems,
  ingredients,
  setIngredients,
  categories,
  setCategories,
  globalOverhead,
  setGlobalOverhead,
  cafeLogoUrl,
  setCafeLogoUrl,
  cafeCoverUrl,
  setCafeCoverUrl,
  cafeCoverTextColor,
  setCafeCoverTextColor,
  customerMenuUrl,
  setCustomerMenuUrl,
  prepItems = [],
  displayItems = [],
  onKitchenTrackChange,
}: {
  items: MenuItem[];
  setItems: React.Dispatch<React.SetStateAction<MenuItem[]>>;
  ingredients: Ingredient[];
  setIngredients: React.Dispatch<React.SetStateAction<Ingredient[]>>;
  categories: string[];
  setCategories: React.Dispatch<React.SetStateAction<string[]>>;
  globalOverhead: number;
  setGlobalOverhead: React.Dispatch<React.SetStateAction<number>>;
  cafeLogoUrl: string | null;
  setCafeLogoUrl: React.Dispatch<React.SetStateAction<string | null>>;
  cafeCoverUrl: string | null;
  setCafeCoverUrl: React.Dispatch<React.SetStateAction<string | null>>;
  cafeCoverTextColor: string;
  setCafeCoverTextColor: React.Dispatch<React.SetStateAction<string>>;
  customerMenuUrl: string | null;
  setCustomerMenuUrl: React.Dispatch<React.SetStateAction<string | null>>;
  prepItems?: Array<{ menuItemId: string }>;
  displayItems?: Array<{ menuItemId: string }>;
  onKitchenTrackChange?: (menuId: string, track: KitchenTrackKind) => void;
}) {
  const [activeTab,  setActiveTab] = useState<'TABLE' | 'PREVIEW'>('TABLE');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [synced,     setSynced]    = useState(false);
  const [logoDragOver, setLogoDragOver] = useState(false);
  const [coverDragOver, setCoverDragOver] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  // Tracks which row is entering a new category name
  const [newCatRow,   setNewCatRow]   = useState<string | null>(null);
  const [newCatInput, setNewCatInput] = useState('');
  const [menuUrlCopied, setMenuUrlCopied] = useState(false);
  const [showItemImages, setShowItemImages] = useState(true);

  const liveMenuUrl = normalizeCustomerMenuUrl(customerMenuUrl);
  const liveMenuHost = customerMenuHost(customerMenuUrl);

  const handleCopyMenuUrl = async () => {
    try {
      await navigator.clipboard.writeText(liveMenuUrl);
      setMenuUrlCopied(true);
      window.setTimeout(() => setMenuUrlCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  const handleLogoFile = (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => setCafeLogoUrl(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  };

  const handleLogoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setLogoDragOver(false);
    handleLogoFile(e.dataTransfer.files[0]);
  };

  const handleCoverFile = (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => setCafeCoverUrl(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  };

  const handleCoverDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setCoverDragOver(false);
    handleCoverFile(e.dataTransfer.files[0]);
  };

  const updateItem = (id: string, field: keyof MenuItem, value: string | number | boolean) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)));

  const addItem = () =>
    setItems((prev) => [
      ...prev,
      normalizeMenuItem({
        id: crypto.randomUUID(),
        name: 'New Item',
        category: categories[0] ?? 'Other',
        recipeCost: 0,
        targetMargin: 65,
        hasImage: false,
        recipe: [],
        availableToSell: 0,
        minReadyStock: 10,
        rollingAvg14d: 0,
      }),
    ]);

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const updateRecipeLine = (menuId: string, lineIndex: number, patch: Partial<RecipeLine>) => {
    setItems((prev) =>
      syncMenuRecipeCosts(
        prev.map((item) => {
          if (item.id !== menuId) return item;
          const recipe = item.recipe.map((line, idx) => (idx === lineIndex ? { ...line, ...patch } : line));
          return { ...item, recipe };
        }),
        ingredients,
      ),
    );
  };

  const addRecipeLine = (menuId: string, ingredientId?: string) => {
    if (!ingredientId) return;
    setItems((prev) =>
      syncMenuRecipeCosts(
        prev.map((item) => {
          if (item.id !== menuId) return item;
          if (item.recipe.some((line) => line.ingredientId === ingredientId)) return item;
          return { ...item, recipe: [...item.recipe, { ingredientId, quantity: 1 }] };
        }),
        ingredients,
      ),
    );
  };

  const addRecipeLineWithIngredient = (menuId: string, ingredientId: string) => {
    addRecipeLine(menuId, ingredientId);
  };

  const createIngredientAndAddToRecipe = (menuId: string, created: Ingredient) => {
    const nextIngredients = ingredients.some((i) => i.id === created.id)
      ? ingredients
      : [...ingredients, created];
    setIngredients(nextIngredients);
    setItems((prev) =>
      syncMenuRecipeCosts(
        prev.map((item) => {
          if (item.id !== menuId) return item;
          if (item.recipe.some((line) => line.ingredientId === created.id)) return item;
          return { ...item, recipe: [...item.recipe, { ingredientId: created.id, quantity: 1 }] };
        }),
        nextIngredients,
      ),
    );
  };

  const removeRecipeLine = (menuId: string, lineIndex: number) => {
    setItems((prev) =>
      syncMenuRecipeCosts(
        prev.map((item) =>
          item.id === menuId
            ? { ...item, recipe: item.recipe.filter((_, idx) => idx !== lineIndex) }
            : item,
        ),
        ingredients,
      ),
    );
  };

  const toggleExpanded = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  const handleCategoryChange = (rowId: string, value: string) => {
    if (value === '__NEW__') {
      setNewCatRow(rowId);
      setNewCatInput('');
    } else {
      updateItem(rowId, 'category', value);
    }
  };

  const commitNewCategory = (rowId: string) => {
    const name = newCatInput.trim();
    if (name) {
      setCategories((prev) => (prev.includes(name) ? prev : [...prev, name]));
      updateItem(rowId, 'category', name);
    }
    setNewCatRow(null);
    setNewCatInput('');
  };

  const handleSync = () => {
    setSynced(true);
    setTimeout(() => setSynced(false), 3000);
  };

  const inputCls = 'w-full rounded-xl border border-slate-200/80 bg-white/80 px-2.5 py-1.5 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/40 transition-all';
  const metricCellCls = 'flex flex-col items-center justify-center gap-1';
  const metricPrimaryCls = 'flex h-9 w-full items-center justify-center';
  const metricBadgeCls =
    'inline-flex h-9 min-w-[4.5rem] items-center justify-center rounded-xl border px-3 font-mono text-sm font-black tabular-nums';
  const metricMetaCls = 'flex h-5 w-full items-center justify-center gap-1.5 whitespace-nowrap text-[9px] text-slate-500';

  return (
    <ExecutiveGlassCard className="overflow-hidden">
      {/* ── Header ── */}
      <div className="border-b border-slate-200/80 bg-slate-50/80 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-rose-200/80 bg-rose-50/80">
              <Tag className="h-4 w-4 text-rose-600" />
            </div>
            <div>
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-800">
                Menu &amp; Pricing Engineering
              </h2>
              <p className="text-[10px] text-slate-500">
                Set margins, auto-calculate selling prices, and sync to the live POS &amp; online menu.
              </p>
            </div>
          </div>

          {/* Sync button */}
          <button
            type="button"
            onClick={handleSync}
            className={`flex items-center gap-2 rounded-2xl border px-5 py-2.5 text-xs font-black uppercase tracking-widest shadow-md transition-all ${
              synced
                ? 'border-emerald-300/80 bg-emerald-100/80 text-emerald-800 shadow-emerald-200/60'
                : 'border-rose-300/80 bg-rose-600 text-white shadow-rose-600/30 hover:bg-rose-500'
            }`}
          >
            <Satellite className={`h-3.5 w-3.5 ${synced ? '' : 'animate-pulse'}`} />
            {synced ? 'Synced to POS & Menu!' : 'Sync Prices to Live POS & Online Menu'}
          </button>
        </div>

        {/* Sub-tabs */}
        <div className="mt-3 flex gap-1">
          {[
            { key: 'TABLE'   as const, label: 'MD: Pricing Engine', Icon: Tag        },
            { key: 'PREVIEW' as const, label: 'Customer: Live Preview', Icon: Smartphone },
          ].map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                activeTab === key
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-white/70'
              }`}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Pricing Table ── */}
      {activeTab === 'TABLE' && (
        <>
          {/* Brand Configuration */}
          <div className="border-b border-slate-200/80 bg-white/50 px-5 py-4 space-y-4">
            <div className="flex flex-wrap items-start gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-700">Brand Configuration</p>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  Upload a logo (background watermark) and a menu cover (header &amp; footer bands). Cover colours auto-theme the customer preview to match your photo.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {cafeLogoUrl && (
                  <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cafeLogoUrl} alt="Uploaded café logo" className="h-full w-full object-contain p-1" />
                  </div>
                )}

                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => logoInputRef.current?.click()}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') logoInputRef.current?.click(); }}
                  onDragOver={(e) => { e.preventDefault(); setLogoDragOver(true); }}
                  onDragLeave={() => setLogoDragOver(false)}
                  onDrop={handleLogoDrop}
                  className={`flex cursor-pointer items-center gap-2 rounded-2xl border-2 border-dashed px-5 py-3 transition-all ${
                    logoDragOver
                      ? 'border-rose-400/80 bg-rose-50/80'
                      : 'border-slate-300/80 bg-slate-50/60 hover:border-rose-300/70 hover:bg-rose-50/40'
                  }`}
                >
                  <Upload className="h-4 w-4 text-rose-600" />
                  <span className="text-xs font-black text-slate-700">+ Upload Café Logo</span>
                </div>

                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleLogoFile(e.target.files?.[0])}
                />

                {cafeLogoUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setCafeLogoUrl(null);
                      if (logoInputRef.current) logoInputRef.current.value = '';
                    }}
                    className="rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2 text-[10px] font-bold text-slate-600 transition-all hover:border-rose-200/80 hover:text-rose-700"
                  >
                    Remove Logo
                  </button>
                )}

                {cafeCoverUrl && (
                  <div className="flex h-14 w-24 items-center justify-center overflow-hidden rounded-xl border border-emerald-200/80 bg-white shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cafeCoverUrl} alt="Uploaded menu cover" className="h-full w-full object-cover" />
                  </div>
                )}

                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => coverInputRef.current?.click()}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') coverInputRef.current?.click(); }}
                  onDragOver={(e) => { e.preventDefault(); setCoverDragOver(true); }}
                  onDragLeave={() => setCoverDragOver(false)}
                  onDrop={handleCoverDrop}
                  className={`flex cursor-pointer items-center gap-2 rounded-2xl border-2 border-dashed px-5 py-3 transition-all ${
                    coverDragOver
                      ? 'border-emerald-400/80 bg-emerald-50/80'
                      : 'border-slate-300/80 bg-slate-50/60 hover:border-emerald-300/70 hover:bg-emerald-50/40'
                  }`}
                >
                  <ImageIcon className="h-4 w-4 text-emerald-600" />
                  <span className="text-xs font-black text-slate-700">+ Upload Menu Cover</span>
                </div>

                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleCoverFile(e.target.files?.[0])}
                />

                {cafeCoverUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setCafeCoverUrl(null);
                      if (coverInputRef.current) coverInputRef.current.value = '';
                    }}
                    className="rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2 text-[10px] font-bold text-slate-600 transition-all hover:border-emerald-200/80 hover:text-emerald-700"
                  >
                    Remove Cover
                  </button>
                )}
              </div>
            </div>

            {/* BOM overhead */}
            <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-indigo-200/70 bg-indigo-50/40 px-4 py-3">
              <div className="min-w-[200px]">
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-indigo-800">
                  Global Operational Overhead (%)
                </label>
                <div className="relative max-w-[120px]">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={globalOverhead}
                    onChange={(e) => setGlobalOverhead(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                    className={`${inputCls} pr-8 text-center font-black text-indigo-900`}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-indigo-400">%</span>
                </div>
              </div>
              <div className="min-w-0 flex-1 text-[10px] leading-relaxed text-indigo-900/80">
                <strong>Strict BOM formula:</strong> Base Cost = (Sum of Raw Ingredients from Recipe) + Global Overhead&nbsp;%.
                <span className="block mt-0.5 text-indigo-700/70">
                  Example at {globalOverhead}%: LKR 100 recipe → LKR {calcBaseCost(100, globalOverhead)} base cost.
                </span>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200/80 bg-slate-50/60 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-4 py-3 w-14">Image</th>
                  <th className="px-4 py-3">Item Name</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-center">Avail. to Sell</th>
                  <th className="px-4 py-3 text-center">Base Cost (LKR)</th>
                  <th className="px-4 py-3 text-center">Target Margin (%)</th>
                  <th className="px-4 py-3 text-center bg-emerald-50/60">
                    <span className="text-emerald-700">Selling Price (LKR)</span>
                  </th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60">
                {items.map((item) => {
                  const recipeCost   = calcRecipeCost(item.recipe, ingredients);
                  const baseCost     = calcBaseCost(recipeCost, globalOverhead);
                  const sellingPrice = calcSellingPrice(baseCost, item.targetMargin);
                  const isLowMargin  = item.targetMargin < 55;
                  const isExpanded   = expandedId === item.id;
                  const availableToSell = calcAvailableToSell(item.recipe, ingredients);
                  const rollingAvg14d = calcMenuRollingAvg14d(item.recipe, ingredients);
                  const target14d = calcMenu14dTarget(item.minReadyStock, rollingAvg14d);
                  const velocityBoost = rollingAvg14d > item.minReadyStock;
                  const stockLow = velocityBoost
                    ? availableToSell < target14d
                    : availableToSell < item.minReadyStock;
                  return (
                    <React.Fragment key={item.id}>
                    <tr
                      className={`hover:bg-white/40 transition-colors group cursor-pointer ${isExpanded ? 'bg-white/50' : ''}`}
                      onClick={() => toggleExpanded(item.id)}
                    >
                      {/* Thumbnail */}
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => updateItem(item.id, 'hasImage', !item.hasImage)}
                          className="transition-transform hover:scale-105"
                          title={item.hasImage ? 'Click to remove image' : 'Click to simulate upload'}
                        >
                          <ItemThumb item={item} size="sm" />
                        </button>
                      </td>

                      {/* Name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronUp className="h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                          )}
                          <input
                            type="text"
                            value={item.name}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => updateItem(item.id, 'name', e.target.value)}
                            className={`${inputCls} font-semibold`}
                          />
                        </div>
                      </td>

                      {/* Category */}
                      <td className="px-4 py-3 min-w-[180px]" onClick={(e) => e.stopPropagation()}>
                        {newCatRow === item.id ? (
                          <input
                            type="text"
                            autoFocus
                            placeholder="New category name…"
                            value={newCatInput}
                            onChange={(e) => setNewCatInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') commitNewCategory(item.id); if (e.key === 'Escape') { setNewCatRow(null); } }}
                            onBlur={() => commitNewCategory(item.id)}
                            className={`${inputCls} border-indigo-300/80 focus:ring-indigo-400/40`}
                          />
                        ) : (
                          <select
                            value={item.category}
                            onChange={(e) => handleCategoryChange(item.id, e.target.value)}
                            className={`${inputCls} appearance-none pr-6`}
                          >
                            {categories.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                            <option value="__NEW__">+ New Category…</option>
                          </select>
                        )}
                      </td>

                      {/* Available to sell — auto-calculated from BOM + ingredient stock */}
                      <td className="px-4 py-3 align-middle text-center" onClick={(e) => e.stopPropagation()}>
                        <div className={metricCellCls}>
                          <div className={metricPrimaryCls}>
                            <span
                              className={`${metricBadgeCls} ${
                                stockLow
                                  ? 'border-rose-300/80 bg-rose-50/80 text-rose-800'
                                  : 'border-slate-200/80 bg-slate-100/80 text-slate-800'
                              }`}
                              title="Auto-calculated from recipe BOM and ingredient on-hand stock"
                            >
                              {availableToSell.toLocaleString()}
                            </span>
                          </div>
                          <div className={metricMetaCls}>
                            <span className="text-slate-400">min/day</span>
                            <input
                              type="number"
                              min={0}
                              value={item.minReadyStock}
                              onChange={(e) =>
                                updateItem(item.id, 'minReadyStock', Math.max(0, parseInt(e.target.value) || 0))
                              }
                              className="h-5 w-11 rounded-lg border border-slate-200/80 bg-white/90 px-1 text-center font-mono text-[10px] font-bold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                            />
                            <span className="text-slate-300">·</span>
                            <span className="text-slate-400">14d</span>
                            <span
                              className="font-mono text-[10px] font-bold tabular-nums text-slate-700"
                              title="14-day ready-stock target: max(MD min/day, 14d sales velocity) × 14"
                            >
                              {target14d.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex h-4 w-full items-center justify-center gap-1 text-[8px]">
                            {item.recipe.length === 0 && (
                              <span className="text-slate-400">No recipe</span>
                            )}
                            {stockLow && (
                              <span className="inline-flex items-center gap-0.5 font-black text-rose-800">
                                <AlertTriangle className="h-2.5 w-2.5" /> Below MD
                              </span>
                            )}
                            {velocityBoost && (
                              <span className="font-bold text-amber-800">
                                14d target: {target14d.toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Base Cost — auto-calculated from recipe + overhead */}
                      <td className="px-4 py-3 align-middle text-center">
                        <div className={metricCellCls}>
                          <div className={metricPrimaryCls}>
                            <span className={`${metricBadgeCls} border-slate-200/80 bg-slate-100/80 text-slate-800`}>
                              {baseCost.toLocaleString()}
                            </span>
                          </div>
                          <div className={metricMetaCls}>
                            +{globalOverhead}% overhead
                          </div>
                          <div className="h-4" />
                        </div>
                      </td>

                      {/* Target Margin */}
                      <td className="px-4 py-3 align-middle text-center" onClick={(e) => e.stopPropagation()}>
                        <div className={metricCellCls}>
                          <div className={metricPrimaryCls}>
                            <div className="relative inline-flex h-9 w-[4.5rem] items-center">
                              <input
                                type="number"
                                min={1}
                                max={98}
                                value={item.targetMargin}
                                onChange={(e) =>
                                  updateItem(
                                    item.id,
                                    'targetMargin',
                                    Math.max(1, Math.min(98, parseInt(e.target.value) || 50)),
                                  )
                                }
                                className={`h-full w-full rounded-xl border bg-white/90 px-2 pr-5 text-center font-mono text-sm font-black tabular-nums shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/40 ${
                                  isLowMargin
                                    ? 'border-amber-300/80 text-amber-800'
                                    : 'border-slate-200/80 text-slate-800'
                                }`}
                              />
                              <span className="pointer-events-none absolute right-2 text-[10px] font-mono text-slate-400">
                                %
                              </span>
                            </div>
                          </div>
                          <div className={`${metricMetaCls} ${isLowMargin ? 'font-semibold text-amber-700' : 'text-transparent'}`}>
                            {isLowMargin ? 'Low margin' : '—'}
                          </div>
                          <div className="h-4" />
                        </div>
                      </td>

                      {/* Selling Price — auto-calculated */}
                      <td className="px-4 py-3 align-middle text-center bg-emerald-50/40">
                        <div className={metricCellCls}>
                          <div className={metricPrimaryCls}>
                            <span className={`${metricBadgeCls} border-emerald-200/80 bg-emerald-50/80 text-base text-emerald-800`}>
                              {sellingPrice.toLocaleString()}
                            </span>
                          </div>
                          <div className={`${metricMetaCls} font-semibold text-emerald-600`}>
                            +{baseCost > 0 ? Math.round(sellingPrice - baseCost) : 0} profit
                          </div>
                          <div className="h-4" />
                        </div>
                      </td>

                      {/* Remove */}
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="rounded-xl border border-slate-200/80 bg-white/60 p-1.5 text-slate-400 opacity-0 transition-all group-hover:opacity-100 hover:border-rose-200/80 hover:text-rose-600"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="bg-indigo-50/25">
                        <td colSpan={8} className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                          <div className="rounded-2xl border border-indigo-200/60 bg-white/70 p-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <FlaskConical className="h-4 w-4 text-indigo-600" />
                                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-900">
                                  Recipe — {item.name}
                                </p>
                              </div>
                              <span className="text-[10px] font-bold text-indigo-700">
                                Total recipe cost: LKR {recipeCost.toLocaleString()}
                              </span>
                            </div>

                            {item.recipe.length === 0 ? (
                              <p className="mb-1 text-xs text-slate-500">
                                No ingredients yet. Search below — existing items are suggested; new ones sync to the ledger.
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {item.recipe.map((line, lineIdx) => {
                                  const ing = ingredients.find((i) => i.id === line.ingredientId);
                                  const lineCost = ing ? Math.round(ing.unitPrice * line.quantity * 100) / 100 : 0;
                                  return (
                                    <div key={`${item.id}-${lineIdx}`} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/70 bg-slate-50/60 px-3 py-2">
                                      <IngredientCombobox
                                        ingredients={ingredients}
                                        value={line.ingredientId}
                                        onSelect={(ingredientId) =>
                                          updateRecipeLine(item.id, lineIdx, { ingredientId })
                                        }
                                        inputCls={`${inputCls} min-w-[180px] flex-1`}
                                      />
                                      <div className="flex items-center gap-1.5">
                                        <input
                                          type="number"
                                          min={0}
                                          step={0.01}
                                          value={line.quantity}
                                          onChange={(e) =>
                                            updateRecipeLine(item.id, lineIdx, { quantity: Math.max(0, parseFloat(e.target.value) || 0) })
                                          }
                                          className={`${inputCls} w-20 text-center font-mono`}
                                        />
                                        <span className="text-[10px] text-slate-500">{ing?.unit ?? 'unit'}</span>
                                      </div>
                                      <span className="min-w-[100px] text-right font-mono text-sm font-black tabular-nums text-emerald-800">
                                        LKR {lineCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => removeRecipeLine(item.id, lineIdx)}
                                        className="rounded-lg border border-slate-200/80 bg-white/80 p-1.5 text-slate-400 hover:border-rose-200 hover:text-rose-600"
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {onKitchenTrackChange ? (
                              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200/70 bg-violet-50/40 px-3 py-2.5">
                                <div>
                                  <p className="text-[10px] font-black uppercase tracking-widest text-violet-900">
                                    Kitchen prep tracking
                                  </p>
                                  <p className="text-[10px] text-slate-500">
                                    Only items set to Prep or Display appear in Predictive Prep &amp; Wastage Control.
                                  </p>
                                </div>
                                <KitchenTrackToggle
                                  track={getMenuKitchenTrackKind(item.id, prepItems, displayItems)}
                                  onChange={(track) => onKitchenTrackChange(item.id, track)}
                                />
                              </div>
                            ) : null}

                            <RecipeIngredientAddPanel
                              ingredients={ingredients}
                              inputCls={inputCls}
                              labelCls="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-600"
                              onAddExisting={(ingredientId) => addRecipeLineWithIngredient(item.id, ingredientId)}
                              onCreateNew={(created) => createIngredientAndAddToRecipe(item.id, created)}
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add item row */}
          <div className="border-t border-slate-200/60 bg-slate-50/40 px-5 py-3">
            <button
              type="button"
              onClick={addItem}
              className="flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300/80 bg-white/60 px-4 py-2 text-xs font-bold text-slate-600 transition-all hover:border-emerald-300/80 hover:bg-emerald-50/60 hover:text-emerald-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Menu Item
            </button>
          </div>

          {/* Summary footer */}
          <div className="border-t border-slate-200/80 bg-slate-50/60 px-5 py-2.5">
            <div className="flex flex-wrap gap-5 text-[10px] text-slate-500">
              <span>{items.length} items · {[...new Set(items.map((i) => i.category))].length} categories</span>
              <span>Avg margin: <strong className="text-slate-700">
                {items.length ? Math.round(items.reduce((s, i) => s + i.targetMargin, 0) / items.length) : 0}%
              </strong></span>
              <span>Total menu value: <strong className="text-emerald-700">
                LKR {items.reduce((s, i) => s + calcSellingPrice(calcBaseCost(calcRecipeCost(i.recipe, ingredients), globalOverhead), i.targetMargin), 0).toLocaleString()}
              </strong> (sum of prices)</span>
            </div>
          </div>
        </>
      )}

      {/* ── Customer Menu Preview ── */}
      {activeTab === 'PREVIEW' && (
        <div className="bg-slate-100/60 p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Simulates what customers see on their phone or table display
              </p>
              <span className="mt-2 inline-flex rounded-full border border-slate-200/80 bg-white/70 px-3 py-1 text-[10px] font-bold text-slate-600">
                {items.length} items · {[...new Set(items.map((i) => i.category))].length} categories
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white/70 px-3 py-1.5 text-[10px] font-bold text-slate-700">
                <Palette className="h-3 w-3 shrink-0 text-slate-500" />
                Cover text colour
                <input
                  type="color"
                  value={cafeCoverTextColor}
                  onChange={(e) => setCafeCoverTextColor(e.target.value)}
                  className="h-7 w-9 cursor-pointer rounded-lg border border-slate-200/80 bg-white p-0.5"
                  aria-label="Cover band text colour"
                />
                <span className="font-mono text-[9px] font-black uppercase tracking-wide text-slate-500">
                  {cafeCoverTextColor}
                </span>
              </label>
              <button
                type="button"
                onClick={() => setShowItemImages((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[10px] font-bold transition-colors ${
                  showItemImages
                    ? 'border-slate-200/80 bg-white/70 text-slate-700 hover:bg-slate-50'
                    : 'border-slate-300/80 bg-slate-800 text-white hover:bg-slate-700'
                }`}
              >
                <ImageIcon className="h-3 w-3" />
                {showItemImages ? 'Hide item images' : 'Show item images'}
              </button>
              {!cafeLogoUrl ? (
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-rose-300/80 bg-rose-50/60 px-3 py-1.5 text-[10px] font-bold text-rose-800 hover:bg-rose-50"
                >
                  <Upload className="h-3 w-3" />
                  Upload logo for watermark grid
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-3 py-1 text-[10px] font-semibold text-emerald-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cafeLogoUrl} alt="" className="h-4 w-4 object-contain" />
                  Logo grid active
                </span>
              )}
              {!cafeCoverUrl ? (
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-emerald-300/80 bg-emerald-50/60 px-3 py-1.5 text-[10px] font-bold text-emerald-800 hover:bg-emerald-50"
                >
                  <ImageIcon className="h-3 w-3" />
                  Upload menu cover
                </button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,384px)_minmax(0,1fr)] lg:items-start xl:gap-8">
            <div className="mx-auto w-full max-w-sm lg:sticky lg:top-6 lg:mx-0 lg:self-start">
              <CustomerMenuPreview
                items={items}
                categories={categories}
                logoUrl={cafeLogoUrl}
                coverUrl={cafeCoverUrl}
                overheadPct={globalOverhead}
                showItemImages={showItemImages}
                coverTextColor={cafeCoverTextColor}
              />
            </div>

            <div className="min-w-0 rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm backdrop-blur-sm lg:max-h-[calc(640px+2rem)] lg:overflow-y-auto">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-200/80 bg-emerald-50/80">
                  <Globe className="h-4 w-4 text-emerald-700" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-700">
                    Live customer menu
                  </p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">
                    Public URL where guests browse and order. Change this when you move to another domain.
                  </p>
                </div>
              </div>

              <label className="mt-3 block">
                <span className="mb-1 block text-[9px] font-black uppercase tracking-widest text-slate-500">
                  Menu domain or URL
                </span>
                <input
                  type="text"
                  value={customerMenuUrl ?? ''}
                  onChange={(e) => setCustomerMenuUrl(e.target.value || null)}
                  placeholder="tasha.lk"
                  className="w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                />
              </label>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <a
                  href={liveMenuUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-800 transition-colors hover:bg-emerald-100/80"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open {liveMenuHost}
                </a>
                <button
                  type="button"
                  onClick={() => void handleCopyMenuUrl()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-600 transition-colors hover:bg-slate-50"
                >
                  <Copy className="h-3 w-3" />
                  {menuUrlCopied ? 'Copied' : 'Copy link'}
                </button>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200/70 bg-slate-50/80 p-3">
                <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-600">
                  <Shield className="h-3 w-3 text-emerald-700" />
                  Cloudflare + security setup
                </p>
                <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
                  Keep <strong className="font-bold text-slate-700">{liveMenuHost}</strong> on a{' '}
                  <strong className="font-bold text-slate-700">separate Vercel project</strong> (customer menu app).
                  Do not point it at back-office / pearzen.com — staff ERP stays auth-gated there.
                </p>
                <ol className="mt-2.5 space-y-1.5 text-[10px] leading-relaxed text-slate-600">
                  <li>
                    1.{' '}
                    <a
                      href={CUSTOMER_MENU_CLOUDFLARE_LINKS.addSite}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-emerald-800 underline decoration-emerald-300/80 underline-offset-2"
                    >
                      Add tasha.lk to Cloudflare
                    </a>{' '}
                    → change registrar nameservers to Cloudflare.
                  </li>
                  <li>
                    2.{' '}
                    <a
                      href={CUSTOMER_MENU_VERCEL_LINKS.addDomain}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-emerald-800 underline decoration-emerald-300/80 underline-offset-2"
                    >
                      Add tasha.lk in Vercel
                    </a>{' '}
                    (customer menu project) → copy the CNAME target Vercel shows.
                  </li>
                  <li>
                    3. In{' '}
                    <a
                      href={CUSTOMER_MENU_CLOUDFLARE_LINKS.dashboard}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-emerald-800 underline decoration-emerald-300/80 underline-offset-2"
                    >
                      Cloudflare DNS
                    </a>
                    : CNAME <code className="rounded bg-white px-1">@</code> and{' '}
                    <code className="rounded bg-white px-1">www</code> → Vercel CNAME, proxy ON (orange cloud).
                  </li>
                  <li>
                    4. SSL mode:{' '}
                    <a
                      href={CUSTOMER_MENU_CLOUDFLARE_LINKS.sslFullStrict}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-emerald-800 underline decoration-emerald-300/80 underline-offset-2"
                    >
                      Full (strict)
                    </a>
                    . Enable{' '}
                    <a
                      href={CUSTOMER_MENU_CLOUDFLARE_LINKS.waf}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-emerald-800 underline decoration-emerald-300/80 underline-offset-2"
                    >
                      WAF
                    </a>{' '}
                    +{' '}
                    <a
                      href={CUSTOMER_MENU_CLOUDFLARE_LINKS.rateLimiting}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-emerald-800 underline decoration-emerald-300/80 underline-offset-2"
                    >
                      rate limits
                    </a>{' '}
                    on order endpoints.
                  </li>
                </ol>
                <ul className="mt-2.5 space-y-1 border-t border-slate-200/70 pt-2.5 text-[9px] leading-relaxed text-slate-500">
                  {CUSTOMER_MENU_SECURITY_RULES.map((rule) => (
                    <li key={rule} className="flex gap-1.5">
                      <span className="text-emerald-600">•</span>
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </ExecutiveGlassCard>
  );
}
