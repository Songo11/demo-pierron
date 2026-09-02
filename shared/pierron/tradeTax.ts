/** Mirrors `TAX_TOTAL_PERCENT` / `calculate_tax` in `programs/pierron/src/helpers.rs`. */
export const TAX_TOTAL_PERCENT = 1n;

export type TradeTaxBreakdown = {
  gross: bigint;
  net: bigint;
  tax: bigint;
  redistributionTax: bigint;
  remainder: bigint;
};

export function calculateTradeTax(
  gross: bigint,
  remainder = 0n
): TradeTaxBreakdown {
  const raw = gross * TAX_TOTAL_PERCENT + remainder;
  const tax = raw / 100n;
  const newRemainder = raw % 100n;
  const net = gross - tax;
  return { gross, net, tax, redistributionTax: tax, remainder: newRemainder };
}

/** Inverse of `calculateTradeTax` — Meteora sell leg moves **net** PIERRON. */
export function grossFromNet(
  net: bigint,
  remainder = 0n
): TradeTaxBreakdown {
  if (net <= 0n) {
    throw new Error("net must be positive");
  }

  // Match Rust `gross_from_net`: start at ceil(net * 100 / 99), then walk.
  // Multiple gross values can map to the same net because tax is floored; the
  // on-chain program returns this upper candidate, not the lowest candidate.
  let gross = (net * 100n + 99n) / 99n;
  if (gross < net) {
    gross = net;
  }

  for (let i = 0; i < 32; i += 1) {
    const trial = calculateTradeTax(gross, remainder);
    if (trial.net === net) {
      return trial;
    }
    if (trial.net < net) {
      gross += 1n;
    } else {
      gross -= 1n;
    }
  }

  throw new Error(`cannot reconstruct gross from net=${net}`);
}

/** User-facing sell amount (gross UI) → net base units for Meteora `inAmount`. */
export function netBaseUnitsForGrossSell(
  grossBaseUnits: bigint,
  remainder = 0n
): TradeTaxBreakdown {
  return calculateTradeTax(grossBaseUnits, remainder);
}
