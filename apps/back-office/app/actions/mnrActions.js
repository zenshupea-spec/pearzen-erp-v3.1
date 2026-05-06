"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "../../../../packages/supabase/server";
import { encrypt, decrypt } from "../../lib/encryption";

export async function getEmployees() {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  // Decrypt sensitive fields before sending to client
  return (data ?? []).map((emp) => ({
    ...emp,
    nic: decrypt(emp.nic),
    phone: decrypt(emp.phone),
  }));
}

export async function saveEmployee(formData) {
  const supabase = await createSupabaseServerClient();
  const id = formData.get("id");

  const employeeData = {
    full_name: formData.get("full_name"),
    role: formData.get("role"),
    nic: encrypt(formData.get("nic")),
    phone: encrypt(formData.get("phone")),
    status: "Active", // Default on creation
  };

  // Company ID is handled by Supabase Auth / RLS defaults in a proper setup,
  // or you pass it explicitly if extracting from user session.

  let error;
  if (id) {
    ({ error } = await supabase.from("employees").update(employeeData).eq("id", id));
  } else {
    ({ error } = await supabase.from("employees").insert([employeeData]));
  }

  if (error) throw new Error(error.message);
  revalidatePath("/hr/mnr");
}

export async function terminateEmployee(id, newStatus, outstandingDebt = 0) {
  const supabase = await createSupabaseServerClient();

  if (newStatus === "Resigned" && outstandingDebt > 0) {
    throw new Error(
      `Cannot process resignation. Employee has an outstanding debt of LKR ${outstandingDebt}.`
    );
  }

  const { error } = await supabase
    .from("employees")
    .update({ status: newStatus })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/hr/mnr");
}

