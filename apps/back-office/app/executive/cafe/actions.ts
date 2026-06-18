'use server';

import { unstable_noStore as noStore } from 'next/cache';
import { createSupabaseServerClient } from '../../../../../packages/supabase/server';
import { createSupabaseServiceClient } from '../../../../../packages/supabase/service';
import {
  fetchWithRosterCompanyFallback,
  resolveCompanyIdForSession,
  rosterCompanyId,
} from '../../../lib/company-context-server';
import { currentPeriodMonth, normalizePeriodMonth } from './period-month';
import { auditStaffAction } from '../../../lib/staff-audit';
import { calcLoggedWastageCostLkr, calcPayrollCostLkr } from './cafe-cost-utils';
import { reconcilePrepWithMenu } from './prep-menu-sync';
import { syncMenuRecipeCosts } from './cafe-menu-sync';
import { loadCafeOpenHours } from '../../../lib/cafe-front-checkin';
import { DEFAULT_CAFE_OPEN_HOURS } from '../../../../../packages/cafe-open-hours';

export type CafeBranch = {
  id: string;
  name: string;
};

export type CafeStaffMember = {
  id: string;
  name: string;
  role: string;
  dailyRate: number;
  daysWorked: number;
  deductionsMTD: number;
};

export type CafeStaffDayLog = {
  id: string;
  workDate: string;
  worked: boolean;
  otHours: number;
  otLkr: number;
  editedAt?: string;
  editedByName?: string;
  editedByEmail?: string;
  prevWorked?: boolean;
  prevOtHours?: number;
  prevOtLkr?: number;
};

export type CafeLaborRosterMember = CafeStaffMember & {
  otTotalLkr: number;
};

export type CafeLaborRosterPayload = {
  periodMonth: string;
  staff: CafeLaborRosterMember[];
  error?: string;
};

export type CafeTask = {
  id: string;
  name: string;
  freq: 'DAILY' | 'WEEKLY';
  assignedTo: string;
  dueTime?: string;
  status: 'COMPLETE' | 'PENDING' | 'OVERDUE';
  proofUploadedAt?: string;
  purgeDate?: string;
};

export type CafeDailyStockItem = {
  id: string;
  name: string;
  unit: string;
  openingStock: number;
  closingStock: number;
  posSold: number;
  loggedWastage: number;
  assignedTo: string;
};

export type CafeBulkStockItem = {
  id: string;
  name: string;
  unit: string;
  theoreticalStock: number;
  physicalCount: number;
  periodDays: number;
  assignedTo: string;
};

export type CafeVoid = {
  id: string;
  time: string;
  item: string;
  amount: number;
  voidedBy: string;
  reason: string;
  flagged: boolean;
};

export type CafeRecipeLine = {
  ingredientId: string;
  quantity: number;
};

export type CafeIngredientSupplier = {
  name: string;
  address: string;
  phone: string;
};

export type CafeIngredientUnit = 'ml' | 'gm';
export type CafeFulfillmentMode = 'bought' | 'delivered';

export type CafeIngredientStockLot = {
  id: string;
  quantity: number;
  expiresOn: string;
  receivedAt?: string;
  usePriority?: number;
};

export type CafeIngredient = {
  id: string;
  name: string;
  brand?: string;
  unit: CafeIngredientUnit;
  purchaseAmount: number;
  packagePrice: number;
  unitPrice: number;
  prevUnitPrice?: number;
  fulfillmentMode: CafeFulfillmentMode;
  currentStock: number;
  minimumStock: number;
  rollingAvg14dUsage: number;
  stockLots?: CafeIngredientStockLot[];
  supplier: CafeIngredientSupplier;
};

const DEFAULT_INGREDIENT_SUPPLIER: CafeIngredientSupplier = {
  name: 'Unassigned',
  address: '',
  phone: '',
};

export type CafeMenuItem = {
  id: string;
  name: string;
  category: string;
  recipeCost: number;
  targetMargin: number;
  hasImage: boolean;
  recipe?: CafeRecipeLine[];
  availableToSell: number;
  minReadyStock: number;
  rollingAvg14d: number;
};

export type CafePrepItem = {
  id: string;
  menuItemId: string;
  name: string;
  unit: string;
  currentStock: number;
  rollingAvg14d: number;
  shelfLifeDays: number;
};

export type CafeDisplayItem = {
  id: string;
  menuItemId: string;
  name: string;
  currentWhole: number;
  currentSlices: number;
  slicesPerWhole: number;
  rollingAvg14d: number;
  shelfLifeDays: number;
};

export type CafeDashboardPayload = {
  staff: CafeStaffMember[];
  tasks: CafeTask[];
  listA: CafeDailyStockItem[];
  listB: CafeBulkStockItem[];
  voids: CafeVoid[];
  menuItems: CafeMenuItem[];
  menuCategories: string[];
  ingredients: CafeIngredient[];
  prepItems: CafePrepItem[];
  displayItems: CafeDisplayItem[];
  globalOverhead: number;
  cafeLogoUrl: string | null;
  cafeCoverUrl: string | null;
  cafeCoverTextColor: string;
  cafeCoverTintStrength: number;
  customerMenuUrl: string | null;
  showItemImages?: boolean;
  cafeOpenStart?: string;
  cafeOpenEnd?: string;
  locationId?: string;
  locationName?: string;
  mtdWastageCostLkr?: number;
  error?: string;
};

type SnapshotExtras = {
  ingredients?: CafeIngredient[];
  menuItems?: CafeMenuItem[];
  menuCategories?: string[];
  globalOverhead?: number;
  cafeLogoUrl?: string | null;
  cafeCoverUrl?: string | null;
  cafeCoverTextColor?: string;
  cafeCoverTintStrength?: number;
  customerMenuUrl?: string | null;
  showItemImages?: boolean;
};

const DEFAULT_CATEGORIES = [
  'Hot Beverages',
  'Cold Beverages',
  'Pastries & Bakery',
  'Mains & Sandwiches',
  'Desserts',
];

function parseSnapshotPayload(payload: unknown): SnapshotExtras {
  if (!payload || typeof payload !== 'object') return {};
  const row = payload as SnapshotExtras & CafeDashboardPayload;
  return {
    ingredients: row.ingredients ?? [],
    menuItems: row.menuItems ?? [],
    menuCategories: row.menuCategories?.length ? row.menuCategories : DEFAULT_CATEGORIES,
    globalOverhead: row.globalOverhead ?? 20,
    cafeLogoUrl: row.cafeLogoUrl ?? null,
    cafeCoverUrl: row.cafeCoverUrl ?? null,
    cafeCoverTextColor: row.cafeCoverTextColor ?? '#ffffff',
    cafeCoverTintStrength: row.cafeCoverTintStrength ?? 100,
    customerMenuUrl: row.customerMenuUrl ?? 'https://tasha.lk',
    showItemImages: row.showItemImages !== false,
  };
}

/** Ensure every recipe line has a matching ledger row (repairs split saves). */
function repairRecipeIngredientLedger(
  ingredients: CafeIngredient[],
  menuItems: CafeMenuItem[],
): CafeIngredient[] {
  const byId = new Map(ingredients.map((ing) => [ing.id, ing]));
  const orphanedIds = new Set<string>();

  for (const item of menuItems) {
    for (const line of item.recipe ?? []) {
      if (line.ingredientId && !byId.has(line.ingredientId)) {
        orphanedIds.add(line.ingredientId);
      }
    }
  }

  if (!orphanedIds.size) return ingredients;

  const recovered: CafeIngredient[] = [...orphanedIds].map((id) => ({
    id,
    name: 'Recovered ingredient',
    supplier: DEFAULT_INGREDIENT_SUPPLIER,
    unit: 'gm',
    purchaseAmount: 1000,
    packagePrice: 0,
    unitPrice: 0,
    fulfillmentMode: 'bought',
    currentStock: 0,
    minimumStock: 0,
    rollingAvg14dUsage: 0,
    stockLots: [],
  }));

  return [...ingredients, ...recovered];
}

/** Merge snapshot BOM + ingredients so menu saves never zero recipe costs. */
function prepareMenuItemsForPersist(
  menuItems: CafeMenuItem[],
  ingredients: CafeIngredient[],
  snapshot: SnapshotExtras,
): CafeMenuItem[] {
  const snapshotIngredients = snapshot.ingredients ?? [];
  const ingredientsForSync = ingredients.length ? ingredients : snapshotIngredients;
  const snapById = new Map((snapshot.menuItems ?? []).map((item) => [item.id, item]));

  const merged = menuItems.map((item) => {
    const snap = snapById.get(item.id);
    return {
      ...item,
      recipe: item.recipe?.length ? item.recipe : (snap?.recipe ?? []),
      targetMargin: item.targetMargin ?? snap?.targetMargin ?? 65,
    };
  });

  return syncMenuRecipeCosts(merged, ingredientsForSync).map((item) => {
    const snap = snapById.get(item.id);
    if (item.recipeCost <= 0 && snap && snap.recipeCost > 0) {
      return { ...item, recipeCost: snap.recipeCost };
    }
    return item;
  });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthDateRange(periodMonth: string): { start: string; end: string } {
  const normalized = normalizePeriodMonth(periodMonth);
  const [year, month] = normalized.split('-').map(Number);
  const end = new Date(year, month, 0);
  return {
    start: `${year}-${String(month).padStart(2, '0')}-01`,
    end: `${year}-${String(month).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`,
  };
}

function mapDayLogRow(row: {
  id: string;
  work_date: string;
  worked: boolean;
  ot_hours: number;
  ot_lkr: number;
  edited_at: string | null;
  edited_by_name: string | null;
  edited_by_email: string | null;
  prev_worked: boolean | null;
  prev_ot_hours: number | null;
  prev_ot_lkr: number | null;
}): CafeStaffDayLog {
  return {
    id: row.id,
    workDate: row.work_date,
    worked: Boolean(row.worked),
    otHours: Number(row.ot_hours) || 0,
    otLkr: Number(row.ot_lkr) || 0,
    editedAt: row.edited_at ?? undefined,
    editedByName: row.edited_by_name ?? undefined,
    editedByEmail: row.edited_by_email ?? undefined,
    prevWorked: row.prev_worked ?? undefined,
    prevOtHours: row.prev_ot_hours != null ? Number(row.prev_ot_hours) : undefined,
    prevOtLkr: row.prev_ot_lkr != null ? Number(row.prev_ot_lkr) : undefined,
  };
}

async function syncStaffPeriodFromDayLogs(
  companyId: string,
  employeeId: string,
  periodMonth: string,
) {
  const supabase = createSupabaseServiceClient();
  const { start, end } = monthDateRange(periodMonth);

  const { data: logs } = await supabase
    .from('cafe_staff_day_logs')
    .select('worked, ot_lkr')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)
    .gte('work_date', start)
    .lte('work_date', end);

  const daysWorked = (logs ?? []).filter((l) => l.worked).length;

  const { data: period } = await supabase
    .from('cafe_staff_periods')
    .select('daily_rate_lkr, deductions_mtd_lkr, role_label')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)
    .eq('period_month', normalizePeriodMonth(periodMonth))
    .maybeSingle();

  const { data: emp } = await supabase
    .from('employees')
    .select('base_salary, rank')
    .eq('id', employeeId)
    .maybeSingle();

  const basic = Number(emp?.base_salary) || 45_000;
  const dailyRate = period
    ? Number(period.daily_rate_lkr) || Math.round(basic / 26)
    : Math.round(basic / 26);

  await supabase.from('cafe_staff_periods').upsert(
    {
      company_id: companyId,
      employee_id: employeeId,
      period_month: normalizePeriodMonth(periodMonth),
      daily_rate_lkr: dailyRate,
      days_worked: daysWorked,
      deductions_mtd_lkr: Number(period?.deductions_mtd_lkr) || 0,
      role_label: period?.role_label || emp?.rank || 'Café Staff',
    },
    { onConflict: 'employee_id,period_month' },
  );
}

function defaultDashboard(): CafeDashboardPayload {
  return {
    staff: [],
    tasks: [],
    listA: [],
    listB: [],
    voids: [],
    menuItems: [],
    menuCategories: DEFAULT_CATEGORIES,
    ingredients: [],
    prepItems: [],
    displayItems: [],
    globalOverhead: 20,
    cafeLogoUrl: null,
    cafeCoverUrl: null,
    cafeCoverTextColor: '#ffffff',
    cafeCoverTintStrength: 100,
    customerMenuUrl: 'https://tasha.lk',
    showItemImages: true,
    cafeOpenStart: DEFAULT_CAFE_OPEN_HOURS.openStart,
    cafeOpenEnd: DEFAULT_CAFE_OPEN_HOURS.openEnd,
  };
}

async function resolveCompanyId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const sessionCompanyId = await resolveCompanyIdForSession(supabase);
  return rosterCompanyId(sessionCompanyId);
}

async function fetchCafeEmployees(companyId: string | null) {
  const supabase = createSupabaseServiceClient();
  let query = supabase
    .from('employees')
    .select('id, emp_number, full_name, rank, base_salary')
    .eq('group', 'CAFE')
    .ilike('status', 'active')
    .order('full_name', { ascending: true });
  if (companyId) query = query.eq('company_id', companyId);
  const { data, error } = await query;
  if (error) return [];
  return data ?? [];
}

function staffFromEmployees(
  employees: Awaited<ReturnType<typeof fetchCafeEmployees>>,
  periods: Array<{
    employee_id: string;
    daily_rate_lkr: number;
    days_worked: number;
    deductions_mtd_lkr: number;
    role_label: string;
  }>,
): CafeStaffMember[] {
  const periodByEmp = new Map(periods.map((p) => [p.employee_id, p]));
  return employees.map((emp) => {
    const period = periodByEmp.get(emp.id);
    const basic = Number(emp.base_salary) || 45_000;
    const dailyRate = period
      ? Number(period.daily_rate_lkr) || Math.round(basic / 26)
      : Math.round(basic / 26);
    return {
      id: emp.id,
      name: emp.full_name ?? '',
      role: period?.role_label || emp.rank || 'Café Staff',
      dailyRate,
      daysWorked: period?.days_worked ?? 0,
      deductionsMTD: Number(period?.deductions_mtd_lkr) || 0,
    };
  });
}

type CafeLocationRow = {
  id: string;
  name: string;
  logo_url: string | null;
  global_overhead_pct: number;
};

async function listCafeLocationsForCompany(companyId: string): Promise<CafeLocationRow[]> {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from('cafe_locations')
    .select('id, name, logo_url, global_overhead_pct')
    .eq('company_id', companyId)
    .order('name');

  return (data ?? []) as CafeLocationRow[];
}

async function ensureCafeLocation(companyId: string): Promise<CafeLocationRow> {
  const locations = await listCafeLocationsForCompany(companyId);
  if (locations[0]) return locations[0];

  const supabase = createSupabaseServiceClient();
  const { data: created, error } = await supabase
    .from('cafe_locations')
    .insert({ company_id: companyId, name: 'Café Tasha' })
    .select('id, name, logo_url, global_overhead_pct')
    .single();

  if (error) throw new Error(error.message);
  return created as CafeLocationRow;
}

async function resolveCafeLocation(
  companyId: string,
  locationId?: string | null,
): Promise<CafeLocationRow> {
  const locations = await listCafeLocationsForCompany(companyId);
  if (!locations.length) return ensureCafeLocation(companyId);

  if (locationId) {
    const match = locations.find((row) => row.id === locationId);
    if (match) return match;
  }

  return locations[0];
}

/** List café branches for the active company (MD branch selector). */
export async function listCafeBranches(): Promise<{ branches: CafeBranch[]; error?: string }> {
  noStore();
  const companyId = await resolveCompanyId();
  if (!companyId) return { branches: [], error: 'No company context' };

  try {
    const locations = await listCafeLocationsForCompany(companyId);
    return { branches: locations.map((row) => ({ id: row.id, name: row.name })) };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list café branches';
    return { branches: [], error: message };
  }
}

async function loadSnapshotExtras(
  companyId: string,
  locationId: string,
): Promise<SnapshotExtras> {
  const supabase = createSupabaseServiceClient();
  const scoped = await supabase
    .from('cafe_dashboard_snapshots')
    .select('payload')
    .eq('company_id', companyId)
    .eq('cafe_location_id', locationId)
    .maybeSingle();

  if (!scoped.error && scoped.data?.payload) {
    return parseSnapshotPayload(scoped.data.payload);
  }

  const company = await supabase
    .from('cafe_dashboard_snapshots')
    .select('payload')
    .eq('company_id', companyId)
    .maybeSingle();

  if (company.data?.payload) {
    return parseSnapshotPayload(company.data.payload);
  }

  return {};
}

async function loadTasks(
  companyId: string,
  locationId: string,
  date: string,
): Promise<CafeTask[]> {
  const supabase = createSupabaseServiceClient();
  const { data: templates } = await supabase
    .from('cafe_task_templates')
    .select('id, name, freq, assigned_name, due_time')
    .eq('company_id', companyId)
    .eq('cafe_location_id', locationId)
    .eq('active', true)
    .order('name');

  if (!templates?.length) return [];

  const templateIds = templates.map((t) => t.id);
  const { data: completions } = await supabase
    .from('cafe_task_completions')
    .select('template_id, status, proof_uploaded_at, purge_after')
    .in('template_id', templateIds)
    .eq('completion_date', date);

  const completionByTemplate = new Map(
    (completions ?? []).map((c) => [c.template_id, c]),
  );

  return templates.map((t) => {
    const completion = completionByTemplate.get(t.id);
    const dueTimeRaw = t.due_time as string | null | undefined;
    return {
      id: t.id,
      name: t.name,
      freq: t.freq as CafeTask['freq'],
      assignedTo: t.assigned_name ?? '',
      dueTime: dueTimeRaw ? dueTimeRaw.slice(0, 5) : undefined,
      status: (completion?.status as CafeTask['status']) ?? 'PENDING',
      proofUploadedAt: completion?.proof_uploaded_at ?? undefined,
      purgeDate: completion?.purge_after ?? undefined,
    };
  });
}

async function loadStockLists(
  companyId: string,
  locationId: string,
  date: string,
): Promise<{ listA: CafeDailyStockItem[]; listB: CafeBulkStockItem[] }> {
  const supabase = createSupabaseServiceClient();
  const { data: items } = await supabase
    .from('cafe_stock_items')
    .select('id, list_type, name, unit, assigned_name, bulk_period_days')
    .eq('company_id', companyId)
    .eq('cafe_location_id', locationId)
    .order('name');

  if (!items?.length) return { listA: [], listB: [] };

  const itemIds = items.map((i) => i.id);
  const { data: counts } = await supabase
    .from('cafe_stock_counts')
    .select(
      'stock_item_id, opening_stock, closing_stock, pos_sold, logged_wastage, theoretical_stock, physical_count',
    )
    .in('stock_item_id', itemIds)
    .eq('count_date', date);

  const countByItem = new Map((counts ?? []).map((c) => [c.stock_item_id, c]));

  const listA: CafeDailyStockItem[] = [];
  const listB: CafeBulkStockItem[] = [];

  for (const item of items) {
    const count = countByItem.get(item.id);
    if (item.list_type === 'DAILY') {
      listA.push({
        id: item.id,
        name: item.name,
        unit: item.unit,
        openingStock: Number(count?.opening_stock) || 0,
        closingStock: Number(count?.closing_stock) || 0,
        posSold: Number(count?.pos_sold) || 0,
        loggedWastage: Number(count?.logged_wastage) || 0,
        assignedTo: item.assigned_name ?? '',
      });
    } else {
      listB.push({
        id: item.id,
        name: item.name,
        unit: item.unit,
        theoreticalStock: Number(count?.theoretical_stock) || 0,
        physicalCount: Number(count?.physical_count) || 0,
        periodDays: item.bulk_period_days ?? 3,
        assignedTo: item.assigned_name ?? '',
      });
    }
  }

  return { listA, listB };
}

async function loadMtdWastageCostLkr(
  companyId: string,
  locationId: string,
  ingredients: CafeIngredient[],
): Promise<number> {
  const supabase = createSupabaseServiceClient();
  const periodMonth = currentPeriodMonth();
  const { start, end } = monthDateRange(periodMonth);

  const { data: items } = await supabase
    .from('cafe_stock_items')
    .select('id, name, unit')
    .eq('company_id', companyId)
    .eq('cafe_location_id', locationId)
    .eq('list_type', 'DAILY');

  if (!items?.length) return 0;

  const itemIds = items.map((item) => item.id);
  const { data: counts } = await supabase
    .from('cafe_stock_counts')
    .select('stock_item_id, logged_wastage')
    .in('stock_item_id', itemIds)
    .gte('count_date', start)
    .lte('count_date', end);

  const wastageByItem = new Map<string, number>();
  for (const row of counts ?? []) {
    const prev = wastageByItem.get(row.stock_item_id) ?? 0;
    wastageByItem.set(row.stock_item_id, prev + (Number(row.logged_wastage) || 0));
  }

  const listA: CafeDailyStockItem[] = items.map((item) => ({
    id: item.id,
    name: item.name,
    unit: item.unit,
    openingStock: 0,
    closingStock: 0,
    posSold: 0,
    loggedWastage: wastageByItem.get(item.id) ?? 0,
    assignedTo: '',
  }));

  return calcLoggedWastageCostLkr(listA, ingredients);
}

async function loadVoids(companyId: string, locationId: string): Promise<CafeVoid[]> {
  const supabase = createSupabaseServiceClient();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from('cafe_pos_voids')
    .select('id, voided_at, item_description, amount_lkr, voided_by_name, reason, flagged')
    .eq('company_id', companyId)
    .eq('cafe_location_id', locationId)
    .gte('voided_at', startOfDay.toISOString())
    .order('voided_at', { ascending: false });

  return (data ?? []).map((v) => {
    const voidedAt = new Date(v.voided_at);
    const time = `${String(voidedAt.getHours()).padStart(2, '0')}:${String(voidedAt.getMinutes()).padStart(2, '0')}`;
    return {
      id: v.id,
      time,
      item: v.item_description,
      amount: Number(v.amount_lkr) || 0,
      voidedBy: v.voided_by_name ?? '',
      reason: v.reason ?? '',
      flagged: Boolean(v.flagged),
    };
  });
}

async function loadPrepAndDisplay(
  companyId: string,
  menuItemIds: string[],
): Promise<{
  prepItems: CafePrepItem[];
  displayItems: CafeDisplayItem[];
}> {
  if (!menuItemIds.length) return { prepItems: [], displayItems: [] };

  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from('cafe_prep_items')
    .select(
      'id, menu_item_id, name, unit, item_kind, slices_per_whole, shelf_life_days, rolling_avg_14d, current_stock, current_whole, current_slices',
    )
    .eq('company_id', companyId)
    .in('menu_item_id', menuItemIds)
    .order('name');

  const prepItems: CafePrepItem[] = [];
  const displayItems: CafeDisplayItem[] = [];

  for (const row of data ?? []) {
    if (!row.menu_item_id) continue;

    if (row.item_kind === 'DISPLAY') {
      displayItems.push({
        id: row.id,
        menuItemId: row.menu_item_id,
        name: row.name,
        currentWhole: Number(row.current_whole) || 0,
        currentSlices: Number(row.current_slices) || 0,
        slicesPerWhole: row.slices_per_whole ?? 10,
        rollingAvg14d: Number(row.rolling_avg_14d) || 0,
        shelfLifeDays: row.shelf_life_days ?? 3,
      });
    } else {
      prepItems.push({
        id: row.id,
        menuItemId: row.menu_item_id,
        name: row.name,
        unit: row.unit,
        currentStock: Number(row.current_stock) || 0,
        rollingAvg14d: Number(row.rolling_avg_14d) || 0,
        shelfLifeDays: row.shelf_life_days ?? 1,
      });
    }
  }

  return { prepItems, displayItems };
}

async function loadMenu(
  companyId: string,
  snapshotMenu: CafeMenuItem[],
): Promise<{ menuItems: CafeMenuItem[]; menuCategories: string[] }> {
  const supabase = createSupabaseServiceClient();
  const { data: categories } = await supabase
    .from('cafe_menu_categories')
    .select('id, name, sort_order')
    .eq('company_id', companyId)
    .order('sort_order')
    .order('name');

  const { data: items } = await supabase
    .from('cafe_menu_items')
    .select('id, name, category_id, recipe_cost_lkr, target_margin_pct, image_url')
    .eq('company_id', companyId)
    .order('name');

  const categoryById = new Map((categories ?? []).map((c) => [c.id, c.name]));
  const snapshotById = new Map(snapshotMenu.map((m) => [m.id, m]));

  const menuCategories =
    categories?.map((c) => c.name) ??
    (snapshotMenu.length ? [...new Set(snapshotMenu.map((m) => m.category))] : DEFAULT_CATEGORIES);

  const menuItems: CafeMenuItem[] = (items ?? []).map((item) => {
    const snap = snapshotById.get(item.id);
    return {
      id: item.id,
      name: item.name,
      category: categoryById.get(item.category_id) ?? snap?.category ?? 'Uncategorized',
      recipeCost: Number(item.recipe_cost_lkr) || snap?.recipeCost || 0,
      targetMargin: Number(item.target_margin_pct) || snap?.targetMargin || 65,
      hasImage: Boolean(item.image_url) || Boolean(snap?.hasImage),
      recipe: snap?.recipe ?? [],
      availableToSell: snap?.availableToSell ?? 0,
      minReadyStock: snap?.minReadyStock ?? 0,
      rollingAvg14d: snap?.rollingAvg14d ?? 0,
    };
  });

  // Menu items only in snapshot (not yet synced to normalized table)
  for (const snap of snapshotMenu) {
    if (!menuItems.some((m) => m.id === snap.id)) {
      menuItems.push(snap);
    }
  }

  return { menuItems, menuCategories };
}

/** Load café dashboard from normalized tables + snapshot extras (ingredients, recipes). */
export async function getCafeDashboard(
  locationIdInput?: string | null,
): Promise<CafeDashboardPayload> {
  noStore();
  const companyId = await resolveCompanyId();
  if (!companyId) return { ...defaultDashboard(), error: 'No company context' };

  const supabase = createSupabaseServiceClient();

  try {
    const location = await resolveCafeLocation(companyId, locationIdInput);
    const periodMonth = currentPeriodMonth();
    const today = todayIso();

    const employees = await fetchWithRosterCompanyFallback(fetchCafeEmployees, companyId);

    const { data: periods } = await supabase
      .from('cafe_staff_periods')
      .select('employee_id, daily_rate_lkr, days_worked, deductions_mtd_lkr, role_label')
      .eq('company_id', companyId)
      .eq('period_month', periodMonth);

    const staff = staffFromEmployees(employees, periods ?? []);
    const extras = await loadSnapshotExtras(companyId, location.id);
    const openHours = await loadCafeOpenHours(supabase, companyId);

    const [tasks, stock, voids, menu] = await Promise.all([
      loadTasks(companyId, location.id, today),
      loadStockLists(companyId, location.id, today),
      loadVoids(companyId, location.id),
      loadMenu(companyId, extras.menuItems ?? []),
    ]);

    const prepDisplay = await loadPrepAndDisplay(
      companyId,
      menu.menuItems.map((item) => item.id),
    );
    const linkedPrep = reconcilePrepWithMenu(
      menu.menuItems,
      prepDisplay.prepItems,
      prepDisplay.displayItems,
    );
    const ingredients = repairRecipeIngredientLedger(
      extras.ingredients ?? [],
      menu.menuItems,
    );
    const mtdWastageCostLkr = await loadMtdWastageCostLkr(
      companyId,
      location.id,
      ingredients,
    );

    return {
      staff,
      tasks,
      listA: stock.listA,
      listB: stock.listB,
      voids,
      menuItems: menu.menuItems,
      menuCategories: extras.menuCategories?.length
        ? extras.menuCategories
        : menu.menuCategories,
      ingredients,
      prepItems: linkedPrep.prepItems,
      displayItems: linkedPrep.displayItems,
      globalOverhead: Number(location.global_overhead_pct) || extras.globalOverhead || 20,
      cafeLogoUrl: location.logo_url ?? extras.cafeLogoUrl ?? null,
      cafeCoverUrl: extras.cafeCoverUrl ?? null,
      cafeCoverTextColor: extras.cafeCoverTextColor ?? '#ffffff',
      cafeCoverTintStrength: extras.cafeCoverTintStrength ?? 100,
      customerMenuUrl: extras.customerMenuUrl ?? 'https://tasha.lk',
      showItemImages: extras.showItemImages !== false,
      cafeOpenStart: openHours.openStart,
      cafeOpenEnd: openHours.openEnd,
      locationId: location.id,
      locationName: location.name,
      mtdWastageCostLkr,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load café dashboard';
    console.error('❌ SUPABASE ERROR (getCafeDashboard):', message);
    return { ...defaultDashboard(), error: message };
  }
}

async function persistStaffPeriods(companyId: string, staff: CafeStaffMember[]) {
  const supabase = createSupabaseServiceClient();
  const periodMonth = currentPeriodMonth();

  if (!staff.length) return;

  const rows = staff.map((member) => ({
    company_id: companyId,
    employee_id: member.id,
    period_month: periodMonth,
    daily_rate_lkr: member.dailyRate,
    days_worked: member.daysWorked,
    deductions_mtd_lkr: member.deductionsMTD,
    role_label: member.role,
  }));

  const { error } = await supabase.from('cafe_staff_periods').upsert(rows, {
    onConflict: 'employee_id,period_month',
  });
  if (error) throw new Error(error.message);
}

async function persistTasks(companyId: string, locationId: string, tasks: CafeTask[]) {
  const supabase = createSupabaseServiceClient();
  const today = todayIso();

  const existing = await supabase
    .from('cafe_task_templates')
    .select('id')
    .eq('company_id', companyId)
    .eq('cafe_location_id', locationId);

  const existingIds = new Set((existing.data ?? []).map((t) => t.id));
  const incomingIds = new Set(tasks.map((t) => t.id));

  for (const task of tasks) {
    const isUuid = /^[0-9a-f-]{36}$/i.test(task.id);
    if (isUuid && existingIds.has(task.id)) {
      await supabase
        .from('cafe_task_templates')
        .update({
          name: task.name,
          freq: task.freq,
          assigned_name: task.assignedTo,
          due_time: task.dueTime ? `${task.dueTime}:00` : null,
          active: true,
        })
        .eq('id', task.id);
    } else if (!isUuid || !existingIds.has(task.id)) {
      const { data: inserted } = await supabase
        .from('cafe_task_templates')
        .insert({
          company_id: companyId,
          cafe_location_id: locationId,
          name: task.name,
          freq: task.freq,
          assigned_name: task.assignedTo,
          due_time: task.dueTime ? `${task.dueTime}:00` : null,
        })
        .select('id')
        .single();
      if (inserted) task.id = inserted.id;
    }

    await supabase.from('cafe_task_completions').upsert(
      {
        template_id: task.id,
        completion_date: today,
        status: task.status,
        proof_uploaded_at: task.proofUploadedAt ?? null,
        purge_after: task.purgeDate ?? null,
      },
      { onConflict: 'template_id,completion_date' },
    );
  }

  const toDeactivate = [...existingIds].filter((id) => !incomingIds.has(id));
  if (toDeactivate.length) {
    await supabase
      .from('cafe_task_templates')
      .update({ active: false })
      .in('id', toDeactivate);
  }
}

async function persistStock(
  companyId: string,
  locationId: string,
  listA: CafeDailyStockItem[],
  listB: CafeBulkStockItem[],
) {
  const supabase = createSupabaseServiceClient();
  const today = todayIso();

  const { data: existing } = await supabase
    .from('cafe_stock_items')
    .select('id')
    .eq('company_id', companyId)
    .eq('cafe_location_id', locationId);

  const existingIds = new Set((existing ?? []).map((i) => i.id));
  const incomingIds = new Set([...listA, ...listB].map((i) => i.id));

  async function upsertItem(
    item: CafeDailyStockItem | CafeBulkStockItem,
    listType: 'DAILY' | 'BULK',
    bulkPeriodDays?: number,
  ) {
    let itemId = item.id;
    const isUuid = /^[0-9a-f-]{36}$/i.test(itemId);

    if (isUuid && existingIds.has(itemId)) {
      await supabase
        .from('cafe_stock_items')
        .update({
          name: item.name,
          unit: item.unit,
          assigned_name: item.assignedTo,
          bulk_period_days: bulkPeriodDays ?? null,
        })
        .eq('id', itemId);
    } else {
      const { data: inserted } = await supabase
        .from('cafe_stock_items')
        .insert({
          company_id: companyId,
          cafe_location_id: locationId,
          list_type: listType,
          name: item.name,
          unit: item.unit,
          assigned_name: item.assignedTo,
          bulk_period_days: bulkPeriodDays ?? null,
        })
        .select('id')
        .single();
      if (inserted) itemId = inserted.id;
    }

    if (listType === 'DAILY') {
      const daily = item as CafeDailyStockItem;
      await supabase.from('cafe_stock_counts').upsert(
        {
          stock_item_id: itemId,
          count_date: today,
          opening_stock: daily.openingStock,
          closing_stock: daily.closingStock,
          pos_sold: daily.posSold,
          logged_wastage: daily.loggedWastage,
        },
        { onConflict: 'stock_item_id,count_date' },
      );
    } else {
      const bulk = item as CafeBulkStockItem;
      await supabase.from('cafe_stock_counts').upsert(
        {
          stock_item_id: itemId,
          count_date: today,
          theoretical_stock: bulk.theoreticalStock,
          physical_count: bulk.physicalCount,
        },
        { onConflict: 'stock_item_id,count_date' },
      );
    }
  }

  for (const item of listA) await upsertItem(item, 'DAILY');
  for (const item of listB) await upsertItem(item, 'BULK', item.periodDays);

  const toRemove = [...existingIds].filter((id) => !incomingIds.has(id));
  if (toRemove.length) {
    await supabase.from('cafe_stock_items').delete().in('id', toRemove);
  }
}

async function persistVoids(companyId: string, locationId: string, voids: CafeVoid[]) {
  const supabase = createSupabaseServiceClient();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data: existing } = await supabase
    .from('cafe_pos_voids')
    .select('id')
    .eq('company_id', companyId)
    .eq('cafe_location_id', locationId)
    .gte('voided_at', startOfDay.toISOString());

  const existingIds = new Set((existing ?? []).map((v) => v.id));
  const incomingIds = new Set(voids.map((v) => v.id));

  for (const v of voids) {
    const isUuid = /^[0-9a-f-]{36}$/i.test(v.id);
    const [hours, minutes] = v.time.split(':').map(Number);
    const voidedAt = new Date();
    voidedAt.setHours(hours || 0, minutes || 0, 0, 0);

    if (isUuid && existingIds.has(v.id)) {
      await supabase
        .from('cafe_pos_voids')
        .update({
          item_description: v.item,
          amount_lkr: v.amount,
          voided_by_name: v.voidedBy,
          reason: v.reason,
          flagged: v.flagged,
        })
        .eq('id', v.id);
    } else {
      await supabase.from('cafe_pos_voids').insert({
        company_id: companyId,
        cafe_location_id: locationId,
        voided_at: voidedAt.toISOString(),
        item_description: v.item,
        amount_lkr: v.amount,
        voided_by_name: v.voidedBy,
        reason: v.reason,
        flagged: v.flagged,
      });
    }
  }

  const toRemove = [...existingIds].filter((id) => !incomingIds.has(id));
  if (toRemove.length) {
    await supabase.from('cafe_pos_voids').delete().in('id', toRemove);
  }
}

async function persistPrepAndDisplay(
  companyId: string,
  prepItems: CafePrepItem[],
  displayItems: CafeDisplayItem[],
  menuItemIds: string[],
) {
  const supabase = createSupabaseServiceClient();
  const linkedMenuIds = new Set(menuItemIds);

  const { data: existing } = await supabase
    .from('cafe_prep_items')
    .select('id, menu_item_id')
    .eq('company_id', companyId);

  const existingIds = new Set((existing ?? []).map((i) => i.id));
  const incomingIds = new Set([...prepItems, ...displayItems].map((i) => i.id));
  const incomingMenuIds = new Set(
    [...prepItems, ...displayItems].map((i) => i.menuItemId).filter((id) => linkedMenuIds.has(id)),
  );

  for (const item of prepItems) {
    if (!linkedMenuIds.has(item.menuItemId)) continue;

    const isUuid = /^[0-9a-f-]{36}$/i.test(item.id);
    const row = {
      company_id: companyId,
      menu_item_id: item.menuItemId,
      name: item.name,
      unit: item.unit,
      item_kind: 'PREP' as const,
      shelf_life_days: item.shelfLifeDays,
      rolling_avg_14d: item.rollingAvg14d,
      current_stock: item.currentStock,
    };

    if (isUuid && existingIds.has(item.id)) {
      await supabase.from('cafe_prep_items').update(row).eq('id', item.id);
    } else {
      await supabase.from('cafe_prep_items').insert(row);
    }
  }

  for (const item of displayItems) {
    if (!linkedMenuIds.has(item.menuItemId)) continue;

    const isUuid = /^[0-9a-f-]{36}$/i.test(item.id);
    const row = {
      company_id: companyId,
      menu_item_id: item.menuItemId,
      name: item.name,
      unit: 'slices',
      item_kind: 'DISPLAY' as const,
      slices_per_whole: item.slicesPerWhole,
      shelf_life_days: item.shelfLifeDays,
      rolling_avg_14d: item.rollingAvg14d,
      current_whole: item.currentWhole,
      current_slices: item.currentSlices,
      current_stock: item.currentSlices + item.currentWhole * item.slicesPerWhole,
    };

    if (isUuid && existingIds.has(item.id)) {
      await supabase.from('cafe_prep_items').update(row).eq('id', item.id);
    } else {
      await supabase.from('cafe_prep_items').insert(row);
    }
  }

  const toRemove = (existing ?? [])
    .filter(
      (row) =>
        !incomingIds.has(row.id) ||
        !row.menu_item_id ||
        !incomingMenuIds.has(row.menu_item_id),
    )
    .map((row) => row.id);

  if (toRemove.length) {
    await supabase.from('cafe_prep_items').delete().in('id', toRemove);
  }
}

async function persistMenu(
  companyId: string,
  menuItems: CafeMenuItem[],
  menuCategories: string[],
) {
  const supabase = createSupabaseServiceClient();

  const { data: existingCats } = await supabase
    .from('cafe_menu_categories')
    .select('id, name')
    .eq('company_id', companyId);

  const catNameToId = new Map((existingCats ?? []).map((c) => [c.name, c.id]));

  for (let i = 0; i < menuCategories.length; i++) {
    const name = menuCategories[i];
    if (!catNameToId.has(name)) {
      const { data: inserted } = await supabase
        .from('cafe_menu_categories')
        .insert({ company_id: companyId, name, sort_order: i })
        .select('id, name')
        .single();
      if (inserted) catNameToId.set(inserted.name, inserted.id);
    }
  }

  const { data: existingItems } = await supabase
    .from('cafe_menu_items')
    .select('id')
    .eq('company_id', companyId);

  const existingIds = new Set((existingItems ?? []).map((i) => i.id));
  const incomingIds = new Set(menuItems.map((m) => m.id));

  for (const item of menuItems) {
    const categoryId = catNameToId.get(item.category);
    if (!categoryId) continue;

    const isUuid = /^[0-9a-f-]{36}$/i.test(item.id);
    const row = {
      company_id: companyId,
      category_id: categoryId,
      name: item.name,
      recipe_cost_lkr: item.recipeCost,
      target_margin_pct: item.targetMargin,
      image_url: item.hasImage ? 'pending' : null,
      pos_synced_at: new Date().toISOString(),
    };

    if (isUuid && existingIds.has(item.id)) {
      await supabase.from('cafe_menu_items').update(row).eq('id', item.id);
    } else if (isUuid) {
      await supabase.from('cafe_menu_items').insert({ id: item.id, ...row });
    } else {
      await supabase.from('cafe_menu_items').insert(row);
    }
  }

  const toRemove = [...existingIds].filter((id) => !incomingIds.has(id));
  if (toRemove.length) {
    await supabase.from('cafe_menu_items').delete().in('id', toRemove);
  }
}

async function persistSnapshotExtras(
  companyId: string,
  locationId: string,
  payload: CafeDashboardPayload,
) {
  const supabase = createSupabaseServiceClient();
  const snapshotPayload: SnapshotExtras = {
    ingredients: payload.ingredients,
    menuItems: payload.menuItems,
    menuCategories: payload.menuCategories,
    globalOverhead: payload.globalOverhead,
    cafeLogoUrl: payload.cafeLogoUrl,
    cafeCoverUrl: payload.cafeCoverUrl,
    cafeCoverTextColor: payload.cafeCoverTextColor,
    cafeCoverTintStrength: payload.cafeCoverTintStrength ?? 100,
    customerMenuUrl: payload.customerMenuUrl,
    showItemImages: payload.showItemImages !== false,
  };

  const row = {
    company_id: companyId,
    payload: snapshotPayload,
    updated_at: new Date().toISOString(),
  };

  const withLocation = await supabase.from('cafe_dashboard_snapshots').upsert(
    { ...row, cafe_location_id: locationId },
    { onConflict: 'company_id,cafe_location_id' },
  );

  if (withLocation.error?.message?.includes('cafe_location_id')) {
    const legacy = await supabase.from('cafe_dashboard_snapshots').upsert(row, {
      onConflict: 'company_id',
    });
    if (legacy.error) throw new Error(legacy.error.message);
    return;
  }

  if (withLocation.error) throw new Error(withLocation.error.message);
}

async function persistLocationSettings(
  locationId: string,
  globalOverhead: number,
  cafeLogoUrl: string | null,
) {
  const supabase = createSupabaseServiceClient();
  await supabase
    .from('cafe_locations')
    .update({
      global_overhead_pct: globalOverhead,
      logo_url: cafeLogoUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', locationId);
}

/** Persist full café dashboard state to normalized tables + snapshot. */
export async function saveCafeDashboard(
  payload: CafeDashboardPayload,
  locationIdInput?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  noStore();
  const companyId = await resolveCompanyId();
  if (!companyId) return { ok: false, error: 'No company context' };

  try {
    const location = await resolveCafeLocation(companyId, locationIdInput ?? payload.locationId);
    const snapshot = await loadSnapshotExtras(companyId, location.id);
    const ingredients = repairRecipeIngredientLedger(
      payload.ingredients,
      payload.menuItems,
    );
    const menuItemIds = payload.menuItems.map((item) => item.id);
    const syncedMenuItems = prepareMenuItemsForPersist(
      payload.menuItems,
      ingredients,
      snapshot,
    );
    const linkedPrep = reconcilePrepWithMenu(
      syncedMenuItems,
      payload.prepItems,
      payload.displayItems,
    );

    await Promise.all([
      persistStaffPeriods(companyId, payload.staff),
      persistTasks(companyId, location.id, payload.tasks),
      persistStock(companyId, location.id, payload.listA, payload.listB),
      persistVoids(companyId, location.id, payload.voids),
      persistMenu(companyId, syncedMenuItems, payload.menuCategories),
      persistLocationSettings(location.id, payload.globalOverhead, payload.cafeLogoUrl),
      persistSnapshotExtras(companyId, location.id, {
        ...payload,
        ingredients,
        menuItems: syncedMenuItems,
      }),
    ]);
    await persistPrepAndDisplay(
      companyId,
      linkedPrep.prepItems,
      linkedPrep.displayItems,
      menuItemIds,
    );

    const supabase = await createSupabaseServerClient();
    await auditStaffAction({
      supabase,
      portal: 'cafe',
      action: 'Save Café Dashboard',
      targetEntity: `${payload.staff.length} staff · ${payload.menuItems.length} menu items`,
    });

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save café dashboard';
    console.error('❌ SUPABASE ERROR (saveCafeDashboard):', message);
    return { ok: false, error: message };
  }
}

/** Load labor roster for a payroll month (defaults to current month). */
export async function getCafeLaborRoster(
  periodMonthInput?: string,
): Promise<CafeLaborRosterPayload> {
  noStore();
  const companyId = await resolveCompanyId();
  const periodMonth = normalizePeriodMonth(periodMonthInput);
  if (!companyId) {
    return { periodMonth, staff: [], error: 'No company context' };
  }

  const supabase = createSupabaseServiceClient();
  const { start, end } = monthDateRange(periodMonth);

  try {
    const employees = await fetchWithRosterCompanyFallback(fetchCafeEmployees, companyId);

    const { data: periods } = await supabase
      .from('cafe_staff_periods')
      .select('employee_id, daily_rate_lkr, days_worked, deductions_mtd_lkr, role_label')
      .eq('company_id', companyId)
      .eq('period_month', periodMonth);

    const { data: dayLogs } = await supabase
      .from('cafe_staff_day_logs')
      .select('employee_id, worked, ot_lkr')
      .eq('company_id', companyId)
      .gte('work_date', start)
      .lte('work_date', end);

    const logsByEmployee = new Map<string, Array<{ worked: boolean; ot_lkr: number }>>();
    for (const log of dayLogs ?? []) {
      const list = logsByEmployee.get(log.employee_id) ?? [];
      list.push({ worked: Boolean(log.worked), ot_lkr: Number(log.ot_lkr) || 0 });
      logsByEmployee.set(log.employee_id, list);
    }

    const baseStaff = staffFromEmployees(employees, periods ?? []);
    const staff: CafeLaborRosterMember[] = baseStaff.map((member) => {
      const logs = logsByEmployee.get(member.id) ?? [];
      const daysFromLogs = logs.filter((l) => l.worked).length;
      const otTotalLkr = logs.reduce((sum, l) => sum + l.ot_lkr, 0);
      return {
        ...member,
        daysWorked: logs.length > 0 ? daysFromLogs : member.daysWorked,
        otTotalLkr,
      };
    });

    return { periodMonth, staff };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load labor roster';
    console.error('❌ SUPABASE ERROR (getCafeLaborRoster):', message);
    return { periodMonth, staff: [], error: message };
  }
}

/** Load per-day attendance + OT for one staff member in a month. */
export async function getCafeStaffDayLogs(
  employeeId: string,
  periodMonthInput?: string,
): Promise<{ logs: CafeStaffDayLog[]; error?: string }> {
  noStore();
  const companyId = await resolveCompanyId();
  if (!companyId) return { logs: [], error: 'No company context' };

  const supabase = createSupabaseServiceClient();
  const periodMonth = normalizePeriodMonth(periodMonthInput);
  const { start, end } = monthDateRange(periodMonth);

  try {
    const { data, error } = await supabase
      .from('cafe_staff_day_logs')
      .select(
        'id, work_date, worked, ot_hours, ot_lkr, edited_at, edited_by_name, edited_by_email, prev_worked, prev_ot_hours, prev_ot_lkr',
      )
      .eq('company_id', companyId)
      .eq('employee_id', employeeId)
      .gte('work_date', start)
      .lte('work_date', end)
      .order('work_date', { ascending: true });

    if (error) throw new Error(error.message);
    return { logs: (data ?? []).map(mapDayLogRow) };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load day logs';
    console.error('❌ SUPABASE ERROR (getCafeStaffDayLogs):', message);
    return { logs: [], error: message };
  }
}

/** Update a single day log; records editor + previous values when manually changed. */
export async function updateCafeStaffDayLog(input: {
  employeeId: string;
  workDate: string;
  worked: boolean;
  otHours: number;
  otLkr: number;
  periodMonth?: string;
  editorName: string;
  editorEmail: string;
}): Promise<{ ok: boolean; log?: CafeStaffDayLog; error?: string }> {
  noStore();
  const companyId = await resolveCompanyId();
  if (!companyId) return { ok: false, error: 'No company context' };

  const supabase = createSupabaseServiceClient();
  const periodMonth = normalizePeriodMonth(input.periodMonth);
  const otHours = Math.max(0, input.otHours);
  const otLkr = Math.max(0, input.otLkr);

  try {
    const { data: existing } = await supabase
      .from('cafe_staff_day_logs')
      .select(
        'id, work_date, worked, ot_hours, ot_lkr, edited_at, edited_by_name, edited_by_email, prev_worked, prev_ot_hours, prev_ot_lkr',
      )
      .eq('company_id', companyId)
      .eq('employee_id', input.employeeId)
      .eq('work_date', input.workDate)
      .maybeSingle();

    const isManualEdit =
      existing &&
      (existing.worked !== input.worked ||
        Number(existing.ot_hours) !== otHours ||
        Number(existing.ot_lkr) !== otLkr);

    const row = {
      company_id: companyId,
      employee_id: input.employeeId,
      work_date: input.workDate,
      worked: input.worked,
      ot_hours: otHours,
      ot_lkr: otLkr,
      updated_at: new Date().toISOString(),
      ...(isManualEdit
        ? {
            edited_at: new Date().toISOString(),
            edited_by_name: input.editorName,
            edited_by_email: input.editorEmail,
            prev_worked: existing.worked,
            prev_ot_hours: Number(existing.ot_hours) || 0,
            prev_ot_lkr: Number(existing.ot_lkr) || 0,
          }
        : {}),
    };

    const { data, error } = await supabase
      .from('cafe_staff_day_logs')
      .upsert(row, { onConflict: 'employee_id,work_date' })
      .select(
        'id, work_date, worked, ot_hours, ot_lkr, edited_at, edited_by_name, edited_by_email, prev_worked, prev_ot_hours, prev_ot_lkr',
      )
      .single();

    if (error) throw new Error(error.message);

    await syncStaffPeriodFromDayLogs(companyId, input.employeeId, periodMonth);

    const authSupabase = await createSupabaseServerClient();
    await auditStaffAction({
      supabase: authSupabase,
      portal: 'cafe',
      action: 'Update Staff Day Log',
      targetEntity: `${input.employeeId} · ${input.workDate}`,
      actorName: input.editorName,
      details: {
        worked: input.worked,
        otHours,
        otLkr,
      },
    });

    return { ok: true, log: mapDayLogRow(data) };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update day log';
    console.error('❌ SUPABASE ERROR (updateCafeStaffDayLog):', message);
    return { ok: false, error: message };
  }
}

/** Issue a disciplinary fine — updates staff deductions and persists. */
export async function issueCafeFine(input: {
  staffId: string;
  amount: number;
  reason: string;
}): Promise<{ ok: boolean; staff?: CafeStaffMember[]; error?: string }> {
  const dashboard = await getCafeDashboard();
  const staff = dashboard.staff.map((member) =>
    member.id === input.staffId
      ? { ...member, deductionsMTD: member.deductionsMTD + input.amount }
      : member,
  );
  const next = { ...dashboard, staff };
  const result = await saveCafeDashboard(next);
  return { ...result, staff };
}

export type CafeCustomerRow = {
  id: string;
  customerName: string;
  customerPhone: string;
  totalSpentLkr: number;
  orderCount: number;
  discountPct: number;
  lastOrderAt: string | null;
};

function mapCafeCustomerRow(row: Record<string, unknown>): CafeCustomerRow {
  return {
    id: String(row.id),
    customerName: String(row.customer_name ?? ''),
    customerPhone: String(row.phone_normalized ?? ''),
    totalSpentLkr: Number(row.total_spent_lkr) || 0,
    orderCount: Number(row.order_count) || 0,
    discountPct: Number(row.discount_pct) || 0,
    lastOrderAt: row.last_order_at ? String(row.last_order_at) : null,
  };
}

/** Phone lookup for customer menu checkout (auto-fill name + loyalty discount). */
export async function lookupCafeCustomerByPhone(phone: string): Promise<{
  customerName: string;
  discountPct: number;
  totalSpentLkr: number;
  orderCount: number;
} | null> {
  noStore();
  const companyId = await resolveCompanyId();
  if (!companyId) return null;

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.rpc('lookup_cafe_customer_by_phone', {
    p_company_id: companyId,
    p_phone: phone,
  });

  if (error || !data?.length) return null;

  const row = data[0] as Record<string, unknown>;
  return {
    customerName: String(row.customer_name ?? ''),
    discountPct: Number(row.discount_pct) || 0,
    totalSpentLkr: Number(row.total_spent_lkr) || 0,
    orderCount: Number(row.order_count) || 0,
  };
}

export async function getCafeCustomers(): Promise<{
  customers: CafeCustomerRow[];
  error?: string;
}> {
  noStore();
  const companyId = await resolveCompanyId();
  if (!companyId) return { customers: [], error: 'No company context' };

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('cafe_customers')
    .select(
      'id, customer_name, phone_normalized, total_spent_lkr, order_count, discount_pct, last_order_at',
    )
    .eq('company_id', companyId)
    .order('total_spent_lkr', { ascending: false });

  if (error) return { customers: [], error: error.message };
  return { customers: (data ?? []).map((row) => mapCafeCustomerRow(row as Record<string, unknown>)) };
}

export async function updateCafeCustomerDiscount(input: {
  customerId: string;
  discountPct: number;
}): Promise<{ ok: boolean; error?: string }> {
  noStore();
  const companyId = await resolveCompanyId();
  if (!companyId) return { ok: false, error: 'No company context' };

  const discountPct = Math.min(100, Math.max(0, input.discountPct));
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase
    .from('cafe_customers')
    .update({ discount_pct: discountPct, updated_at: new Date().toISOString() })
    .eq('id', input.customerId)
    .eq('company_id', companyId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type CafeBranchGlance = {
  id: string;
  name: string;
  mtdSales: number;
  staffCount: number;
  laborCostMtd: number;
  wastageMtd: number;
  expiringSoon: number;
  lowStock: number;
  overdueTasks: number;
  flaggedVoids: number;
};

export type CafePortfolioGlance = {
  branches: CafeBranchGlance[];
  totals: {
    mtdSales: number;
    laborCostMtd: number;
    wastageMtd: number;
    stockAlerts: number;
    complianceAlerts: number;
    staffCount: number;
  };
  error?: string;
};

function countExpiringSoon(ingredients: CafeIngredient[], withinDays = 3): number {
  const today = todayIso();
  let count = 0;
  for (const ing of ingredients) {
    for (const lot of ing.stockLots ?? []) {
      if (lot.quantity <= 0) continue;
      const expiry = lot.expiresOn;
      if (!expiry) continue;
      const daysLeft = Math.round(
        (new Date(`${expiry}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) /
          86_400_000,
      );
      if (daysLeft >= 0 && daysLeft <= withinDays) count += 1;
    }
  }
  return count;
}

function countLowStock(ingredients: CafeIngredient[]): number {
  return ingredients.filter((ing) => ing.minimumStock > 0 && ing.currentStock < ing.minimumStock)
    .length;
}

/** Portfolio-wide café ops metrics for the Executive Vault finance view. */
export async function fetchCafePortfolioGlance(): Promise<CafePortfolioGlance> {
  noStore();
  const emptyTotals = {
    mtdSales: 0,
    laborCostMtd: 0,
    wastageMtd: 0,
    stockAlerts: 0,
    complianceAlerts: 0,
    staffCount: 0,
  };

  try {
    const { branches, error: branchError } = await listCafeBranches();
    if (!branches.length) {
      return { branches: [], totals: emptyTotals, error: branchError };
    }

    const companyId = await resolveCompanyId();
    if (!companyId) return { branches: [], totals: emptyTotals, error: 'No company context' };

    const supabase = createSupabaseServiceClient();
    const { data: snapRows } = await supabase
      .from('cafe_dashboard_snapshots')
      .select('cafe_location_id, payload')
      .eq('company_id', companyId);

    const salesByLocation = new Map<string, number>();
    for (const row of snapRows ?? []) {
      const payload = row.payload as Record<string, unknown> | null;
      const mtd = Number(payload?.mtdSales ?? payload?.mtd_sales ?? payload?.posTotal ?? 0);
      const locId = String(row.cafe_location_id ?? '');
      salesByLocation.set(locId, (salesByLocation.get(locId) ?? 0) + (Number.isFinite(mtd) ? mtd : 0));
    }

    const branchGlances = await Promise.all(
      branches.map(async (branch) => {
        const dashboard = await getCafeDashboard(branch.id);
        const laborCostMtd = calcPayrollCostLkr(dashboard.staff);
        const expiringSoon = countExpiringSoon(dashboard.ingredients);
        const lowStock = countLowStock(dashboard.ingredients);
        const overdueTasks = dashboard.tasks.filter((t) => t.status === 'OVERDUE').length;
        const flaggedVoids = dashboard.voids.filter((v) => v.flagged).length;
        const mtdSales = salesByLocation.get(branch.id) ?? 0;

        return {
          id: branch.id,
          name: branch.name,
          mtdSales,
          staffCount: dashboard.staff.length,
          laborCostMtd,
          wastageMtd: dashboard.mtdWastageCostLkr ?? 0,
          expiringSoon,
          lowStock,
          overdueTasks,
          flaggedVoids,
        };
      }),
    );

    const totals = branchGlances.reduce(
      (acc, b) => ({
        mtdSales: acc.mtdSales + b.mtdSales,
        laborCostMtd: acc.laborCostMtd + b.laborCostMtd,
        wastageMtd: acc.wastageMtd + b.wastageMtd,
        stockAlerts: acc.stockAlerts + b.expiringSoon + b.lowStock,
        complianceAlerts: acc.complianceAlerts + b.overdueTasks + b.flaggedVoids,
        staffCount: acc.staffCount + b.staffCount,
      }),
      emptyTotals,
    );

    return { branches: branchGlances, totals };
  } catch (err) {
    return {
      branches: [],
      totals: emptyTotals,
      error: err instanceof Error ? err.message : 'Failed to load café portfolio',
    };
  }
}

/** Customer menu checkout → café front office order queue. */
export async function placeCafeCustomerOrder(input: {
  fulfillmentType: 'dine-in' | 'takeout' | 'delivery';
  customerName: string;
  customerPhone: string;
  deliveryAddress?: string;
  items: Array<{ menuItemId?: string; name: string; qty: number; unitPriceLkr: number }>;
  totalLkr: number;
  paymentMethod?: 'card_online' | 'cash_at_counter';
}): Promise<{ ok: boolean; orderId?: string; error?: string }> {
  noStore();
  const companyId = await resolveCompanyId();
  if (!companyId) return { ok: false, error: 'No company context' };

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.rpc('place_cafe_customer_order', {
    p_company_id: companyId,
    p_fulfillment_type: input.fulfillmentType,
    p_customer_name: input.customerName,
    p_customer_phone: input.customerPhone,
    p_delivery_address: input.deliveryAddress ?? '',
    p_items: input.items,
    p_total_lkr: input.totalLkr,
    p_payment_method: input.paymentMethod ?? 'card_online',
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, orderId: data as string };
}
