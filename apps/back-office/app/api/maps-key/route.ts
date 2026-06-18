import { NextResponse } from 'next/server';

/** Exposes the Maps JS API key to the browser when configured server-side. */
export function GET() {
  const key =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    '';

  if (!key) {
    return NextResponse.json({ key: null }, { status: 404 });
  }

  return NextResponse.json({ key });
}
