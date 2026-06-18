import { NextRequest, NextResponse } from "next/server";

import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "../../../../../../packages/supabase/server";
import { resolveGuardSession } from "../../../../lib/guard-auth";

type AttendanceBody = {
  actionType?: "CHECK_IN" | "CHECK_OUT";
  deviceTime?: string;
  latitude?: number;
  longitude?: number;
  sync_type?: string;
  photo_url?: string | null;
  status?: string | null;
};

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as AttendanceBody;
  const actionType = body.actionType;
  const deviceTime = body.deviceTime;

  if (actionType !== "CHECK_IN" && actionType !== "CHECK_OUT") {
    return NextResponse.json({ error: "INVALID_ACTION_TYPE" }, { status: 400 });
  }

  if (!deviceTime) {
    return NextResponse.json({ error: "DEVICE_TIME_REQUIRED" }, { status: 400 });
  }

  const service = createSupabaseServiceClient();
  const { rosterKey, employee } = await resolveGuardSession(
    service,
    session.user.email,
  );

  if (!rosterKey) {
    return NextResponse.json({ error: "GUARD_NOT_FOUND" }, { status: 403 });
  }

  const { error } = await service.from("attendance_logs").insert({
    emp_number: rosterKey,
    action_type: actionType,
    device_time: deviceTime,
    latitude: body.latitude ?? null,
    longitude: body.longitude ?? null,
    sync_type: body.sync_type ?? "API_PING",
    photo_url: body.photo_url ?? null,
    status: body.status ?? "PENDING",
    company_id: employee?.company_id ?? null,
  });

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "ATTENDANCE_INSERT_FAILED" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
