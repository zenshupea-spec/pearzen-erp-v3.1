#!/usr/bin/env node
/**
 * Upsert one tasha.lk café menu item (normalized table + dashboard snapshot + image).
 *
 * Usage:
 *   node scripts/upsert-tasha-menu-item.mjs \
 *     --name ESPRESSO \
 *     --category "Hot Beverages" \
 *     --price 100 \
 *     --image audit-evidence/cvs/tasha-menu-images/espresso.png \
 *     --recipe "ESPRESSO SHOT:1"
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID, createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';
const BRANDING_BUCKET = 'company-branding';

function loadEnv() {
  for (const file of ['apps/back-office/.env.local', '.env']) {
    try {
      const text = readFileSync(join(root, file), 'utf8');
      for (const line of text.split('\n')) {
        const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
      }
      return;
    } catch {
      /* next */
    }
  }
}

function parseArgs(argv) {
  const out = { recipe: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--name') out.name = argv[++i];
    else if (arg === '--category') out.category = argv[++i];
    else if (arg === '--price') out.price = Number(argv[++i]);
    else if (arg === '--image') out.image = argv[++i];
    else if (arg === '--recipe') {
      const raw = argv[++i] ?? '';
      out.recipe = raw.split(',').map((part) => {
        const [ingredient, qtyRaw] = part.split(':');
        return {
          ingredient: ingredient.trim(),
          quantity: Number(qtyRaw ?? 1),
        };
      });
    }
  }
  if (!out.name || !out.category || !Number.isFinite(out.price)) {
    console.error(
      'Required: --name --category "Hot Beverages" --price 100 [--image path] [--recipe "ING:qty"]',
    );
    process.exit(1);
  }
  return out;
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function ingredientIdForName(name) {
  const hash = createHash('sha1').update(name.trim().toUpperCase()).digest('hex').slice(0, 12);
  return `ing-${hash}`;
}

function calcRecipeCost(recipe, ingredients) {
  return Math.round(
    recipe.reduce((sum, line) => {
      const ing = ingredients.find((i) => i.id === line.ingredientId);
      if (!ing) return sum;
      return sum + ing.unitPrice * line.quantity;
    }, 0),
  );
}

function calcBaseCost(recipeCost, overheadPct) {
  return Math.round(recipeCost * (1 + overheadPct / 100));
}

function calcSellingPrice(baseCost, margin) {
  if (margin >= 99) return baseCost * 10;
  return Math.round(baseCost / (1 - margin / 100));
}

/** Solve total recipeCost so public RPC price matches target (margin fixed at 65%). */
function recipeCostForTargetPrice(targetPrice, overheadPct, margin = 65) {
  for (let cost = 1; cost <= 5000; cost++) {
    const base = calcBaseCost(cost, overheadPct);
    if (calcSellingPrice(base, margin) === targetPrice) return cost;
  }
  return Math.max(1, Math.round((targetPrice * (1 - margin / 100)) / (1 + overheadPct / 100)));
}

function ingredientUnitPriceForRecipeCost(recipeLines, targetRecipeCost) {
  if (!recipeLines.length) return 0;
  const totalQty = recipeLines.reduce((s, l) => s + l.quantity, 0) || 1;
  return Math.max(1, Math.round(targetRecipeCost / totalQty));
}

function defaultIngredient(name) {
  return {
    id: ingredientIdForName(name),
    name: name.trim().toUpperCase(),
    brand: '',
    unit: 'gm',
    purchaseAmount: 1,
    packagePrice: 0,
    unitPrice: 0,
    fulfillmentMode: 'bought',
    currentStock: 500,
    minimumStock: 0,
    rollingAvg14dUsage: 0,
    stockLots: [],
    supplier: { name: 'Café Tasha', address: '', phone: '' },
  };
}

function normalizeMenuItem(raw) {
  return {
    id: raw.id,
    name: raw.name,
    category: raw.category,
    recipeCost: raw.recipeCost ?? 0,
    targetMargin: raw.targetMargin ?? 65,
    hasImage: Boolean(raw.hasImage),
    recipe: raw.recipe ?? [],
    availableToSell: raw.availableToSell ?? 0,
    minReadyStock: raw.minReadyStock ?? 0,
    rollingAvg14d: raw.rollingAvg14d ?? 0,
  };
}

async function uploadMenuImage(admin, supabaseUrl, companyId, localPath, slug) {
  if (!localPath || !existsSync(localPath)) return null;
  const bytes = readFileSync(localPath);
  const storagePath = `${companyId}/cafe-menu/${slug}.png`;
  const { error } = await admin.storage.from(BRANDING_BUCKET).upload(storagePath, bytes, {
    contentType: 'image/png',
    upsert: true,
  });
  if (error) throw new Error(`image upload: ${error.message}`);
  return `${supabaseUrl}/storage/v1/object/public/${BRANDING_BUCKET}/${storagePath}`;
}

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('Missing Supabase env');
    process.exit(1);
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: location, error: locErr } = await admin
    .from('cafe_locations')
    .select('id, global_overhead_pct')
    .eq('company_id', COMPANY_ID)
    .order('name')
    .limit(1)
    .maybeSingle();
  if (locErr || !location) throw new Error(locErr?.message ?? 'No cafe location');

  const overheadPct = Number(location.global_overhead_pct ?? 20);
  const targetMargin = 65;
  const targetRecipeCost = recipeCostForTargetPrice(args.price, overheadPct, targetMargin);

  const { data: snapRow, error: snapErr } = await admin
    .from('cafe_dashboard_snapshots')
    .select('payload')
    .eq('company_id', COMPANY_ID)
    .eq('cafe_location_id', location.id)
    .maybeSingle();
  if (snapErr) throw new Error(snapErr.message);

  const payload =
    snapRow?.payload && typeof snapRow.payload === 'object' && !Array.isArray(snapRow.payload)
      ? { ...snapRow.payload }
      : {};

  const ingredients = Array.isArray(payload.ingredients) ? [...payload.ingredients] : [];
  const menuItems = Array.isArray(payload.menuItems)
    ? payload.menuItems.map((m) => normalizeMenuItem(m))
    : [];
  const menuCategories = Array.isArray(payload.menuCategories)
    ? payload.menuCategories
    : [
        'Hot Beverages',
        'Cold Beverages',
        'Pastries & Bakery',
        'Mains & Sandwiches',
        'Desserts',
      ];

  const recipeLines = [];
  for (const line of args.recipe) {
    const ingName = line.ingredient.trim().toUpperCase();
    let ing = ingredients.find((i) => String(i.name ?? '').trim().toUpperCase() === ingName);
    if (!ing) {
      ing = defaultIngredient(ingName);
      ingredients.push(ing);
    }
    const unitPrice = ingredientUnitPriceForRecipeCost([line], targetRecipeCost);
    ing.unitPrice = unitPrice;
    ing.packagePrice = unitPrice * (ing.purchaseAmount || 1);
    recipeLines.push({ ingredientId: ing.id, quantity: line.quantity });
  }

  const computedRecipeCost =
    recipeLines.length > 0 ? calcRecipeCost(recipeLines, ingredients) : targetRecipeCost;
  // PDF menu price is authoritative — use solved cost for RPC even when qty > 1.
  const recipeCost = targetRecipeCost;
  const baseCost = calcBaseCost(recipeCost, overheadPct);
  const sellingPrice = calcSellingPrice(baseCost, targetMargin);
  if (computedRecipeCost !== recipeCost) {
    console.log(
      `  note: ledger recipe cost LKR ${computedRecipeCost} → menu cost LKR ${recipeCost} for target price`,
    );
  }

  const itemName = args.name.trim().toUpperCase();
  const slug = slugify(itemName);
  let menuItem = menuItems.find((m) => m.name.trim().toUpperCase() === itemName);
  if (!menuItem) {
    menuItem = normalizeMenuItem({
      id: randomUUID(),
      name: itemName,
      category: args.category,
      recipeCost,
      targetMargin,
      hasImage: Boolean(args.image),
      recipe: recipeLines,
    });
    menuItems.push(menuItem);
  } else {
    menuItem.category = args.category;
    menuItem.recipeCost = recipeCost;
    menuItem.targetMargin = targetMargin;
    menuItem.recipe = recipeLines;
    if (args.image) menuItem.hasImage = true;
  }

  const imagePath = args.image
    ? args.image.startsWith('/')
      ? args.image
      : join(root, args.image)
    : null;
  const imageUrl = await uploadMenuImage(admin, url, COMPANY_ID, imagePath, slug);

  const { data: catRow } = await admin
    .from('cafe_menu_categories')
    .select('id')
    .eq('company_id', COMPANY_ID)
    .eq('name', args.category)
    .maybeSingle();
  if (!catRow?.id) throw new Error(`Category not found: ${args.category}`);

  const dbRow = {
    company_id: COMPANY_ID,
    category_id: catRow.id,
    name: itemName,
    recipe_cost_lkr: recipeCost,
    target_margin_pct: targetMargin,
    image_url: imageUrl,
    pos_synced_at: new Date().toISOString(),
  };

  const { data: existingDb } = await admin
    .from('cafe_menu_items')
    .select('id')
    .eq('company_id', COMPANY_ID)
    .ilike('name', itemName)
    .maybeSingle();

  if (existingDb?.id) {
    menuItem.id = existingDb.id;
    const idx = menuItems.findIndex((m) => m.id === existingDb.id);
    if (idx >= 0) menuItems[idx] = menuItem;
    const { error: updErr } = await admin.from('cafe_menu_items').update(dbRow).eq('id', existingDb.id);
    if (updErr) throw new Error(updErr.message);
  } else {
    const { error: insErr } = await admin.from('cafe_menu_items').insert({ id: menuItem.id, ...dbRow });
    if (insErr) throw new Error(insErr.message);
  }

  const nextPayload = {
    ...payload,
    ingredients,
    menuItems,
    menuCategories,
    showItemImages: payload.showItemImages !== false,
    customerMenuUrl: payload.customerMenuUrl ?? 'https://tasha.lk',
    globalOverhead: payload.globalOverhead ?? overheadPct,
  };

  const { error: snapUpdErr } = await admin.from('cafe_dashboard_snapshots').upsert(
    {
      company_id: COMPANY_ID,
      cafe_location_id: location.id,
      payload: nextPayload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'company_id,cafe_location_id' },
  );
  if (snapUpdErr) throw new Error(snapUpdErr.message);

  const { data: rpcRow } = await admin.rpc('get_cafe_public_menu', { p_company_id: COMPANY_ID });
  const live = (rpcRow ?? []).find(
    (r) => String(r.item_name).trim().toUpperCase() === itemName,
  );

  console.log(`✓ ${itemName}`);
  console.log(`  category: ${args.category}`);
  console.log(`  recipe cost: LKR ${recipeCost} → sell: LKR ${sellingPrice} (target ${args.price})`);
  console.log(`  rpc price: LKR ${live?.selling_price_lkr ?? '?'}`);
  console.log(`  image: ${imageUrl ?? '(none)'}`);
  console.log(`  item id: ${menuItem.id}`);

  if (live && Number(live.selling_price_lkr) !== args.price) {
    console.warn(
      `  ⚠ RPC price ${live.selling_price_lkr} != target ${args.price} — adjust ingredient cost`,
    );
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
