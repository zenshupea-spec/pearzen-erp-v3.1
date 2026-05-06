"use server";

import { createSupabaseServerClient } from "../../../../packages/supabase/server";

async function getAuthorizedFmContext(supabase) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Unauthorized");
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("role, company_id")
    .eq("email", user.email)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  if (!profile || profile.role !== "FM") {
    throw new Error("Forbidden");
  }

  return { companyId: profile.company_id ?? null };
}

function calculateHours(checkInIso, checkOutIso) {
  if (!checkInIso || !checkOutIso) return 0;

  const checkIn = new Date(checkInIso);
  const checkOut = new Date(checkOutIso);
  const durationMs = checkOut.getTime() - checkIn.getTime();

  if (!Number.isFinite(durationMs) || durationMs <= 0) return 0;
  return Number((durationMs / (1000 * 60 * 60)).toFixed(2));
}

export async function processPayrollForPeriod(startDateIso, endDateIso) {
  if (!startDateIso || !endDateIso) {
    throw new Error("Payroll period start and end are required.");
  }

  const supabase = await createSupabaseServerClient();
  const { companyId } = await getAuthorizedFmContext(supabase);

  let query = supabase
    .from("attendance_logs")
    .select(
      `
      id,
      check_in_time,
      check_out_time,
      employees (
        full_name,
        hourly_rate
      )
    `
    )
    .gte("check_in_time", startDateIso)
    .lte("check_in_time", endDateIso)
    .order("check_in_time", { ascending: true });

  if (companyId) {
    query = query.eq("company_id", companyId);
  }

  const { data, error } = await query;

  // Handle early phase environments where payroll tables/columns are incomplete.
  if (error && (error.code === "42P01" || error.code === "42703")) {
    return [];
  }

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => {
    const hours = calculateHours(row.check_in_time, row.check_out_time);
    const hourlyRate = Number(row.employees?.hourly_rate ?? 0);
    const pay = Number((hours * hourlyRate).toFixed(2));

    return {
      id: row.id,
      name: row.employees?.full_name ?? "Unknown Employee",
      date: row.check_in_time
        ? new Date(row.check_in_time).toLocaleDateString()
        : "N/A",
      hours,
      pay,
    };
  });
}
