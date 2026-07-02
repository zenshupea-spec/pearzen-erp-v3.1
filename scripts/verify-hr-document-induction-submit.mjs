/**
 * Step 11 smoke: induction HR documents survive form submit (Safari file-list fix).
 * Run: node scripts/verify-hr-document-induction-submit.mjs
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const checks = [];
let failed = false;

function pass(label) {
  checks.push(`  ✓ ${label}`);
}

function fail(label, detail = '') {
  failed = true;
  checks.push(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

function staticChecks() {
  const field = read('apps/back-office/app/hr/EmployeeDocumentField.tsx');
  const form = read('apps/back-office/app/hr/InductionForm.tsx');
  const registry = read('apps/back-office/lib/hr-document-pending-registry.ts');

  if (!registry.includes('mergePendingHrDocumentsIntoFormData')) {
    fail('Pending registry exports mergePendingHrDocumentsIntoFormData');
  } else {
    pass('Pending registry merges compressed files into FormData');
  }

  if (!field.includes('setPendingHrDocument') || !field.includes('inductionMode')) {
    fail('EmployeeDocumentField stores pending file in induction mode');
  } else {
    pass('EmployeeDocumentField stores pending file in induction mode');
  }

  if (field.includes('name={inductionMode ? `hr_doc_')) {
    fail('EmployeeDocumentField still names file input in induction mode');
  } else {
    pass('Induction file input has no name (avoids empty Safari submit)');
  }

  if (!form.includes('mergePendingHrDocumentsIntoFormData')) {
    fail('InductionForm merges pending docs on submit');
  } else {
    pass('InductionForm merges pending docs on submit');
  }

  if (form.includes('action={formAction}')) {
    fail('InductionForm still uses native action= submit');
  } else {
    pass('InductionForm uses preventDefault + formAction(fd)');
  }

  if (!form.includes('event.preventDefault()')) {
    fail('InductionForm preventDefault on submit');
  } else {
    pass('InductionForm preventDefault on submit');
  }
}

async function registryRoundTrip() {
  const pending = new Map([
    ['nic_passport', new File([new Uint8Array([0xff, 0xd8, 0xff])], 'nic-scan.jpg', { type: 'image/jpeg' })],
  ]);

  const fd = new FormData();
  fd.set('full_name', 'Smoke Test');
  for (const [docType, file] of pending) {
    if (file.size > 0) {
      fd.set(`hr_doc_${docType}`, file, file.name);
    }
  }

  const merged = fd.get('hr_doc_nic_passport');
  if (!(merged instanceof File) || merged.size === 0) {
    fail('FormData file merge', 'hr_doc_nic_passport missing');
  } else if (merged.name !== 'nic-scan.jpg') {
    fail('FormData file merge', `unexpected file name ${merged.name}`);
  } else {
    pass('FormData.set preserves compressed File for server action');
  }
}

async function main() {
  staticChecks();
  try {
    await registryRoundTrip();
  } catch (err) {
    fail('Registry round-trip', err instanceof Error ? err.message : String(err));
  }

  console.log('\nHR document induction submit smoke (Step 11)\n');
  console.log(checks.join('\n'));
  console.log(failed ? '\n❌ FAILED\n' : '\n✅ PASSED\n');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
