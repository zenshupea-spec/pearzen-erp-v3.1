import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

type AttendanceBody = {
  actionType?: "CHECK_IN" | "CHECK_OUT";
  deviceTime?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as AttendanceBody;
  const actionType = body.actionType;
  const deviceTime = body.deviceTime;

  if (actionType !== "CHECK_IN" && actionType !== "CHECK_OUT") {
    return NextResponse.json(
      { error: "INVALID_ACTION_TYPE" },
      { status: 400 }
    );
  }

  if (!deviceTime) {
    return NextResponse.json(
      { error: "DEVICE_TIME_REQUIRED" },
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY_MISSING" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { error } = await supabase.from("attendance_logs").insert({
    emp_number: "G1234", // TODO: wire from authenticated session context
    action_type: actionType,
    device_time: deviceTime,
  });

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "ATTENDANCE_INSERT_FAILED" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

