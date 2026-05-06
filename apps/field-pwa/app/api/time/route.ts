import { NextResponse } from "next/server";

// Ensure this route is never cached by Vercel/Next.js
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    serverTime: Date.now(),
    status: "success",
  });
}

