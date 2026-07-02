import { NextResponse } from 'next/server';

import { processFleetTelematicsPing } from '../../../executive/fleet/fleet-telematics-ingest';
import {
  readFleetTelematicsWebhookSecret,
  validateFleetTelematicsCompanyId,
  verifyFleetTelematicsWebhookSecret,
} from '../../../../lib/fleet-telematics-webhook';

type TelematicsPayload = {
  tag_id?: string;
  tagId?: string;
  latitude?: number;
  longitude?: number;
  speed_kmh?: number;
  speedKmh?: number;
  recorded_at?: string;
  recordedAt?: string;
  location_label?: string;
  locationLabel?: string;
  company_id?: string;
  companyId?: string;
};

function unauthorized() {
  return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
}

/** Tracker webhook — POST GPS pings by registered tag_id + company_id. */
export async function POST(request: Request) {
  const expectedSecret = process.env.FLEET_TELEMATICS_WEBHOOK_SECRET?.trim();
  if (!expectedSecret) {
    return NextResponse.json(
      { success: false, error: 'Fleet telematics webhook is not configured.' },
      { status: 503 },
    );
  }

  const provided = readFleetTelematicsWebhookSecret(request);
  if (!verifyFleetTelematicsWebhookSecret(provided, expectedSecret)) return unauthorized();

  let body: TelematicsPayload;
  try {
    body = (await request.json()) as TelematicsPayload;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const companyCheck = validateFleetTelematicsCompanyId(body.company_id ?? body.companyId);
  if (!companyCheck.ok) {
    return NextResponse.json({ success: false, error: companyCheck.error }, { status: 400 });
  }

  const tagId = body.tag_id ?? body.tagId;
  const result = await processFleetTelematicsPing({
    tagId: tagId ?? '',
    latitude: Number(body.latitude),
    longitude: Number(body.longitude),
    speedKmh: Number(body.speed_kmh ?? body.speedKmh ?? 0),
    recordedAt: body.recorded_at ?? body.recordedAt,
    locationLabel: body.location_label ?? body.locationLabel,
    companyId: companyCheck.companyId,
  });

  if (!result.success) {
    const status = result.error.includes('No active fleet asset') ? 404 : 400;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result);
}
