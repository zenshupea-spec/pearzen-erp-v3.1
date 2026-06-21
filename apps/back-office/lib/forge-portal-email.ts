import { FORGE_TEMP_PASSWORD_LENGTH } from './forge-portal-auth';

export async function sendForgeTempPasswordEmail(input: {
  to: string;
  tempPassword: string;
  operatorEmail: string;
}): Promise<{ ok: boolean; emailed: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.FORGE_EMAIL_FROM?.trim() ?? 'Pearzen Forge <noreply@pearzen.tech>';

  if (!apiKey) {
    return { ok: true, emailed: false };
  }

  const body = [
    'A temporary Forge sign-in password was issued for your operator account.',
    '',
    `Operator: ${input.operatorEmail}`,
    `Temporary password (${FORGE_TEMP_PASSWORD_LENGTH} digits): ${input.tempPassword}`,
    '',
    'Sign in at your Forge login URL, then set a new permanent password when prompted.',
    'This temporary password invalidates your previous Forge login password.',
    '',
    'If you did not request this, contact the platform owner immediately.',
  ].join('\n');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: 'Pearzen Forge — temporary sign-in password',
        text: body,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return {
        ok: false,
        emailed: false,
        error: detail || `Email API returned ${response.status}.`,
      };
    }

    return { ok: true, emailed: true };
  } catch (err) {
    return {
      ok: false,
      emailed: false,
      error: err instanceof Error ? err.message : 'Email delivery failed.',
    };
  }
}

export async function sendForge2faRecoveryEmail(input: {
  to: string;
  recoveryCode: string;
  operatorEmail: string;
}): Promise<{ ok: boolean; emailed: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.FORGE_EMAIL_FROM?.trim() ?? 'Pearzen Forge <noreply@pearzen.tech>';

  if (!apiKey) {
    return { ok: true, emailed: false };
  }

  const body = [
    'Use this one-time code to reset Forge two-factor authentication.',
    '',
    `Operator: ${input.operatorEmail}`,
    `Recovery code: ${input.recoveryCode}`,
    '',
    'Enter it on the Forge 2FA recovery page to enroll a new authenticator.',
    '',
    'If you did not request this, contact the platform owner immediately.',
  ].join('\n');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: 'Pearzen Forge — 2FA recovery code',
        text: body,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return {
        ok: false,
        emailed: false,
        error: detail || `Email API returned ${response.status}.`,
      };
    }

    return { ok: true, emailed: true };
  } catch (err) {
    return {
      ok: false,
      emailed: false,
      error: err instanceof Error ? err.message : 'Email delivery failed.',
    };
  }
}
