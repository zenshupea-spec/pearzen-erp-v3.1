export function resolveUniformInstalmentAmountLkr(input: {
  savedUniform: number;
  issuedUniform: number;
  defaultInstalmentLkr: number;
  shiftCount: number;
}): {
  amountLkr: number;
  fromIssue: boolean;
  fromDefault: boolean;
} {
  const savedUniform = Math.max(0, Math.round(input.savedUniform));
  const issuedUniform = Math.max(0, Math.round(input.issuedUniform));
  const defaultInstalmentLkr = Math.max(0, Math.round(input.defaultInstalmentLkr));

  if (savedUniform > 0) {
    return { amountLkr: savedUniform, fromIssue: false, fromDefault: false };
  }
  if (issuedUniform > 0) {
    return { amountLkr: issuedUniform, fromIssue: true, fromDefault: false };
  }
  if (input.shiftCount >= 1 && defaultInstalmentLkr > 0) {
    return { amountLkr: defaultInstalmentLkr, fromIssue: false, fromDefault: true };
  }
  return { amountLkr: 0, fromIssue: false, fromDefault: false };
}
