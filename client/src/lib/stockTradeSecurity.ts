export function assertFreshQuote(expiresAt: number | undefined, now = Date.now()) {
  if (!expiresAt || now >= expiresAt) {
    throw new Error("Quote expired. Fetch a fresh quote before continuing.");
  }
}

export function exactApproval(allowanceTarget: string | undefined, sellAmount: string) {
  if (!allowanceTarget || !/^\d+$/.test(sellAmount) || BigInt(sellAmount) <= 0n) {
    throw new Error("The reviewed approval is invalid.");
  }
  return { spender: allowanceTarget, amount: BigInt(sellAmount) };
}