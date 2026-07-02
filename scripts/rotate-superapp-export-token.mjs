#!/usr/bin/env node
/**
 * Generate a new SUPERAPP_EXPORT_SERVICE_TOKEN for rotation (R-SUPERAPP-01).
 *
 * Run: npm run rotate:superapp-export-token
 *
 * Then in one maintenance window:
 *   1. Update Vercel → pearzen-erp-v3-1-back-office → SUPERAPP_EXPORT_SERVICE_TOKEN (production)
 *   2. Update Pears sync client Bearer token
 *   3. Redeploy back-office
 */

import { randomBytes } from 'crypto';

const token = randomBytes(32).toString('hex');

console.log(`
New platform token (Pears super-app export only):

  SUPERAPP_EXPORT_SERVICE_TOKEN=${token}

Update Vercel production env + Pears sync egress, then redeploy.
Never commit this value to git.
`);
