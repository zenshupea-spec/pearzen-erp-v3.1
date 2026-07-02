/**
 * Seed Café Backoffice + Café Front Office on the live tenant:
 * - assign café staff to active geofenced site
 * - refresh café portal auth (EPF login)
 * - today's shift check-in (order queue access)
 * - prep items + snapshot ingredients
 * - order queue across PLACED → PREPARING
 *
 * Run: npm run seed:cafe
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLASSIC_VENTURE_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';
const SEED_SYNC = 'SEED_CAFE_OPS';

function loadEnv() {
  for (const file of ['.env.seed.tmp', 'apps/back-office/.env.local', '.env']) {
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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing Supabase env — run: npm run wire:backend');
  process.exit(1);
}

const companyId = process.env.SEED_COMPANY_ID ?? CLASSIC_VENTURE_COMPANY_ID;
const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function resolveCafeSite() {
  const { data: sites, error } = await admin
    .from('site_profiles')
    .select('id, site_name, latitude, longitude, geofence_radius, site_status')
    .eq('company_id', companyId);

  if (error) throw new Error(`site_profiles: ${error.message}`);

  const activeCafe =
    (sites ?? []).find(
      (s) =>
        String(s.site_status ?? '').toUpperCase() === 'ACTIVE' &&
        /tasha|cafe|café/i.test(String(s.site_name)),
    ) ??
    (sites ?? []).find((s) => String(s.site_status ?? '').toUpperCase() === 'ACTIVE');

  if (!activeCafe?.latitude || !activeCafe?.longitude) {
    throw new Error('No active café site with GPS coordinates found.');
  }

  return activeCafe;
}

async function resolveCafeLocation() {
  const { data, error } = await admin
    .from('cafe_locations')
    .select('id, name')
    .eq('company_id', companyId)
    .order('name')
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`cafe_locations: ${error.message}`);
  if (!data) throw new Error('No cafe_locations row for company.');
  return data;
}

async function assignCafeStaffSite(siteName) {
  const { data: staff, error } = await admin
    .from('employees')
    .select('id, full_name, emp_number, epf_no, epf_num, site, group, status')
    .eq('company_id', companyId)
    .eq('group', 'CAFE')
    .eq('status', 'ACTIVE');

  if (error) throw new Error(`café employees: ${error.message}`);
  if (!staff?.length) {
    console.log('  · no CAFE group employees — skip site assign');
    return null;
  }

  let updated = 0;
  for (const row of staff) {
    if (String(row.site ?? '').trim() === siteName) continue;
    const { error: updErr } = await admin
      .from('employees')
      .update({ site: siteName })
      .eq('id', row.id);
    if (updErr) {
      console.warn(`  ⚠ site assign ${row.full_name}: ${updErr.message}`);
      continue;
    }
    console.log(`  ✓ ${row.full_name} (${row.emp_number ?? row.epf_no}) → ${siteName}`);
    updated += 1;
  }
  return staff[0];
}

function cafeFrontAuthEmail(epf) {
  const domain = process.env.CAFE_FRONT_AUTH_EMAIL_DOMAIN?.trim() || 'pearzen.cafe';
  return `${String(epf).trim().toLowerCase()}@${domain}`;
}

async function provisionCafePortalAuth(employee) {
  const epf = String(employee.emp_number ?? employee.epf_no ?? employee.epf_num ?? '').trim();
  if (!epf) throw new Error('Café employee has no EPF/emp_number');

  const email = cafeFrontAuthEmail(epf);
  const otp = generateOtp();

  const { data: userList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = (userList?.users ?? []).find(
    (u) => String(u.email ?? '').toLowerCase() === email,
  );

  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password: otp,
      email_confirm: true,
      user_metadata: {
        role: 'CAFE_STAFF',
        employee_id: employee.id,
        full_name: employee.full_name,
      },
    });
    if (error) throw new Error(`café auth update: ${error.message}`);
  } else {
    const { error } = await admin.auth.admin.createUser({
      email,
      password: otp,
      email_confirm: true,
      user_metadata: {
        role: 'CAFE_STAFF',
        employee_id: employee.id,
        full_name: employee.full_name,
      },
    });
    if (error) throw new Error(`café auth create: ${error.message}`);
  }

  const { error: dbError } = await admin.from('cafe_portal_auth').upsert(
    {
      epf_number: epf,
      current_otp: otp,
      needs_pin_setup: true,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'epf_number' },
  );
  if (dbError) throw new Error(`café portal auth: ${dbError.message}`);

  console.log(`  ✓ café portal ${epf} — OTP/password: ${otp}`);
  return otp;
}

async function seedCafeCheckin(employee, site) {
  const today = todayIso();
  const lat = Number(site.latitude);
  const lng = Number(site.longitude);

  await admin.from('cafe_staff_checkins').upsert(
    {
      company_id: companyId,
      employee_id: employee.id,
      checkin_date: today,
      shift_type: 'MORNING',
      latitude: lat,
      longitude: lng,
      selfie_url: null,
      checked_in_at: new Date().toISOString(),
      checked_out_at: null,
    },
    { onConflict: 'employee_id,checkin_date,shift_type' },
  );

  await admin.from('rostered_shifts').upsert(
    {
      company_id: companyId,
      sector_id: site.id,
      guard_id: employee.id,
      shift_date: today,
      shift_type: 'MORNING',
    },
    { onConflict: 'guard_id,shift_date' },
  );

  console.log(`  ✓ check-in + roster (${today}) at ${site.site_name}`);
}

async function seedPrepItems(locationId) {
  const { data: menu, error } = await admin
    .from('cafe_menu_items')
    .select('id, name')
    .eq('company_id', companyId)
    .order('name')
    .limit(6);

  if (error) throw new Error(`cafe_menu_items: ${error.message}`);
  if (!menu?.length) {
    console.log('  · no menu items — skip prep seed');
    return 0;
  }

  const { count } = await admin
    .from('cafe_prep_items')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId);

  if ((count ?? 0) > 0) {
    console.log(`  · prep items already exist (${count})`);
    return count;
  }

  const rows = menu.slice(0, 4).map((item, index) => ({
    company_id: companyId,
    menu_item_id: item.id,
    name: item.name,
    unit: index === 0 ? 'portions' : 'units',
    item_kind: index === 1 ? 'DISPLAY' : 'PREP',
    current_stock: 12 - index,
    current_whole: index === 1 ? 2 : null,
    current_slices: index === 1 ? 8 : null,
    slices_per_whole: index === 1 ? 10 : null,
    rolling_avg_14d: 6 + index,
    shelf_life_days: index === 1 ? 3 : 1,
  }));

  const { error: insErr } = await admin.from('cafe_prep_items').insert(rows);
  if (insErr) throw new Error(`cafe_prep_items: ${insErr.message}`);

  console.log(`  ✓ prep/display items: ${rows.length}`);
  return rows.length;
}

async function enrichSnapshotIngredients(locationId) {
  const { data: snap, error } = await admin
    .from('cafe_dashboard_snapshots')
    .select('payload, cafe_location_id')
    .eq('company_id', companyId)
    .eq('cafe_location_id', locationId)
    .maybeSingle();

  if (error) throw new Error(`cafe_dashboard_snapshots: ${error.message}`);

  const payload =
    snap?.payload && typeof snap.payload === 'object' && !Array.isArray(snap.payload)
      ? { ...snap.payload }
      : {};
  const ingredients = Array.isArray(payload.ingredients) ? payload.ingredients : [];

  if (ingredients.length >= 3) {
    console.log(`  · snapshot ingredients OK (${ingredients.length})`);
    return ingredients.length;
  }

  const seeded = [
    {
      id: 'seed-ing-espresso',
      name: 'Espresso beans',
      supplier: 'Lanka Coffee Traders',
      unit: 'kg',
      unitCostLkr: 4200,
      currentStock: 8,
      reorderLevel: 2,
      wastagePct: 3,
    },
    {
      id: 'seed-ing-milk',
      name: 'Fresh milk',
      supplier: 'Highland Dairy',
      unit: 'L',
      unitCostLkr: 380,
      currentStock: 24,
      reorderLevel: 8,
      wastagePct: 5,
    },
    {
      id: 'seed-ing-croissant',
      name: 'Butter croissant dough',
      supplier: 'BakeHouse Colombo',
      unit: 'tray',
      unitCostLkr: 1650,
      currentStock: 6,
      reorderLevel: 2,
      wastagePct: 4,
    },
  ];

  const nextPayload = {
    ...payload,
    ingredients: [...ingredients, ...seeded].slice(0, 12),
    menuCategories: payload.menuCategories ?? ['Coffee', 'Pastry', 'Meals'],
    globalOverhead: payload.globalOverhead ?? 20,
    customerMenuUrl: payload.customerMenuUrl ?? 'https://tasha.lk',
    showItemImages: payload.showItemImages !== false,
  };

  const { error: upsErr } = await admin.from('cafe_dashboard_snapshots').upsert(
    {
      company_id: companyId,
      cafe_location_id: locationId,
      payload: nextPayload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'company_id,cafe_location_id' },
  );

  if (upsErr) throw new Error(`snapshot upsert: ${upsErr.message}`);
  console.log(`  ✓ snapshot ingredients → ${nextPayload.ingredients.length} items`);
  return nextPayload.ingredients.length;
}

async function seedOrderQueue(employee) {
  const { data: menu } = await admin
    .from('cafe_menu_items')
    .select('id, name, recipe_cost_lkr, target_margin_pct')
    .eq('company_id', companyId)
    .order('name')
    .limit(1);

  const menuItem = menu?.[0];
  const itemLine = menuItem
    ? {
        menuItemId: menuItem.id,
        name: menuItem.name,
        qty: 1,
        unitPriceLkr: Math.round(
          Number(menuItem.recipe_cost_lkr || 50) *
            (1 + Number(menuItem.target_margin_pct || 65) / 100),
        ),
      }
    : { name: 'Cappuccino', qty: 1, unitPriceLkr: 450 };

  const total = itemLine.unitPriceLkr * itemLine.qty;
  const now = new Date();
  const placedAt = now.toISOString();

  await admin
    .from('cafe_customer_orders')
    .delete()
    .eq('company_id', companyId)
    .like('customer_name', `${SEED_SYNC}%`);

  const { data: maxQueue } = await admin
    .from('cafe_customer_orders')
    .select('queue_number')
    .eq('company_id', companyId)
    .gte('placed_at', `${todayIso()}T00:00:00`)
    .order('queue_number', { ascending: false })
    .limit(1);

  let queue = Number(maxQueue?.[0]?.queue_number ?? 0);

  const specs = [
    { status: 'PLACED', label: 'awaiting payment' },
    { status: 'PAYMENT_RECEIVED', label: 'paid — ready to prep' },
    { status: 'PREPARING', label: 'in kitchen' },
  ];

  const rows = specs.map((spec, index) => {
    queue += 1;
    const row = {
      company_id: companyId,
      queue_number: queue,
      fulfillment_type: index === 2 ? 'takeout' : 'dine-in',
      customer_name: `${SEED_SYNC} ${spec.label}`,
      customer_phone: '+9477123456',
      items: [itemLine],
      total_lkr: total,
      status: spec.status,
      placed_at: placedAt,
      payment_method: 'card_online',
      payment_status: spec.status === 'PLACED' ? 'pending' : 'paid',
    };
    if (spec.status !== 'PLACED') {
      row.payment_received_at = placedAt;
    }
    if (spec.status === 'PREPARING') {
      row.accepted_by_employee_id = employee.id;
      row.accepted_at = placedAt;
    }
    return row;
  });

  const { error } = await admin.from('cafe_customer_orders').insert(rows);
  if (error) throw new Error(`cafe_customer_orders: ${error.message}`);

  console.log(`  ✓ order queue: ${rows.map((r) => r.status).join(', ')}`);
  return rows.length;
}

console.log('\nCafé operational seed');
console.log(`  Company: ${companyId}`);
console.log(`  Supabase: ${url}\n`);

console.log('1/6 Resolve café site + location…');
const site = await resolveCafeSite();
const location = await resolveCafeLocation();
console.log(`   → ${site.site_name} / ${location.name}\n`);

console.log('2/6 Assign café staff to active site…');
const cafeEmployee = await assignCafeStaffSite(site.site_name);
console.log('');

if (!cafeEmployee) {
  console.error('❌ No active CAFE employee — add one in HR first.');
  process.exit(1);
}

console.log('3/6 Café portal auth…');
await provisionCafePortalAuth(cafeEmployee);
console.log('');

console.log('4/6 Shift check-in (Front Office order access)…');
await seedCafeCheckin(cafeEmployee, site);
console.log('');

console.log('5/6 Executive café — prep + ingredients…');
await seedPrepItems(location.id);
await enrichSnapshotIngredients(location.id);
console.log('');

console.log('6/6 Front Office order queue…');
await seedOrderQueue(cafeEmployee);
console.log('');

console.log('✓ Café operational seed complete.');
console.log('  Executive Café → /executive/cafe');
console.log('  Café Front → /login/cafe-front (EPF + OTP above, then set PIN)');
console.log('  Orders queue → check-in required for live accept flow\n');
