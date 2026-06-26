export type PortalAccessGate =
  | "ok"
  | "revoked"
  | "not_provisioned"
  | "verify_pin"
  | "set_pin"
  | "setup_2fa"
  | "verify_2fa"
  | "setup_unlock_code";

export function headOfficePortalGateRedirectPath(
  gate: PortalAccessGate,
): string | null {
  switch (gate) {
    case "ok":
    case "revoked":
    case "not_provisioned":
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
  }
}

const EXECUTIVE_GATE_ERRORS: Partial<Record<PortalAccessGate, string>> = {
  setup_2fa:
    'Enroll two-factor authentication before using the executive vault.',
  verify_2fa: 'Verify your authenticator code to unlock the executive vault.',
  verify_pin: 'Enter your portal unlock PIN to continue.',
  setup_unlock_code: 'Set your 6-digit portal unlock code to continue.',
  set_pin: 'Complete portal password setup before using the executive vault.',
};

export function executivePortalGateError(gate: PortalAccessGate): string {
  return (
    EXECUTIVE_GATE_ERRORS[gate] ??
    'Complete portal security setup before using the executive vault.'
  );
}
