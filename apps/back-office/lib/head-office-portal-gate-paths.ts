export type PortalAccessGate =
  | "ok"
  | "revoked"
  | "not_provisioned"
  | "setup_sign_in"
  | "verify_pin"
  | "set_pin"
  | "setup_2fa"
  | "verify_2fa"
  | "setup_unlock_code"
  | "change_password";

export const HEAD_OFFICE_PASSWORD_CHANGE_PATH = "/account/change-password";

export function isHeadOfficePasswordChangePath(pathname: string): boolean {
  return (
    pathname === HEAD_OFFICE_PASSWORD_CHANGE_PATH ||
    pathname.startsWith(`${HEAD_OFFICE_PASSWORD_CHANGE_PATH}/`)
  );
}

export function headOfficePortalGateRedirectPath(
  gate: PortalAccessGate,
): string | null {
  switch (gate) {
    case "ok":
    case "revoked":
    case "not_provisioned":
      return null;
    case "setup_sign_in":
      return null;
    case "verify_pin":
      return "/login/verify-pin";
    case "set_pin":
      return "/login/set-pin";
    case "setup_2fa":
      return "/login/setup-2fa";
    case "verify_2fa":
      return "/login/verify-2fa";
    case "setup_unlock_code":
      return "/login/set-unlock-code";
    case "change_password":
      return HEAD_OFFICE_PASSWORD_CHANGE_PATH;
  }
}

const EXECUTIVE_GATE_ERRORS: Partial<Record<PortalAccessGate, string>> = {
  setup_2fa:
    'Enroll two-factor authentication before using the executive vault.',
  verify_2fa: 'Verify your authenticator code to unlock the executive vault.',
  verify_pin: 'Enter your portal unlock PIN to continue.',
  setup_unlock_code: 'Set your 6-digit portal unlock code to continue.',
  set_pin: 'Complete portal password setup before using the executive vault.',
  change_password:
    'Your portal password has expired. Choose a new password to continue.',
};

export function executivePortalGateError(gate: PortalAccessGate): string {
  return (
    EXECUTIVE_GATE_ERRORS[gate] ??
    'Complete portal security setup before using the executive vault.'
  );
}
