'use server';

import { createSupabaseServerClient } from '../../../../../packages/supabase/server';

export type AttendanceStreamRow = {
  id: string;
  empNumber: string;
  guardName: string | null;
  actionType: string;
  deviceTime: string;
  syncType: string | null;
  status: string | null;
  latitude: number | null;
  longitude: number | null;
};

export async function getAttendanceStream(limit = 50): Promise<AttendanceStreamRow[]> {
  const supabase = await createSupabaseServerClient();

  const { data: logs, error } = await supabase
    .from('attendance_logs')
    .select('id, emp_number, action_type, device_time, sync_type, status, latitude, longitude')
    .order('device_time', { ascending: false })
    .limit(limit);

  if (error || !logs?.length) return [];

  const empNumbers = [...new Set(logs.map((l) => l.emp_number))];
  const { data: employees } = await supabase
    .from('employees')
    .select('emp_number, full_name')
    .in('emp_number', empNumbers);

  const nameByEpf = new Map(
    (employees ?? []).map((e) => [e.emp_number, e.full_name as string]),
  );

  return logs.map((log) => ({
    id: log.id,
    empNumber: log.emp_number,
    guardName: nameByEpf.get(log.emp_number) ?? null,
    actionType: log.action_type,
    deviceTime: log.device_time,
    syncType: log.sync_type,
    status: log.status ?? null,
    latitude: log.latitude,
    longitude: log.longitude,
  }));
}
