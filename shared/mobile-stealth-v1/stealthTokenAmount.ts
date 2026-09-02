/** Pierron devnet mint — `artifacts/devnet-genesis-tokenomics.json` + on-chain constraint. */
export const PIERRON_STEALTH_TOKEN_DECIMALS = 6;

/**
 * Pole „Ilość tokenów” w UI = całe tokeny (np. 333333), nie jednostki łańcucha.
 * On-chain / SPL używa base units (333333 → 333333000000 przy 6 miejscach).
 */
export function parseHumanTokenAmountToBaseUnits(
  input: string,
  decimals: number = PIERRON_STEALTH_TOKEN_DECIMALS
): bigint {
  const trimmed = input.trim().replace(/,/g, '.');
  if (!trimmed) {
    throw new Error('Wpisz kwotę tokenów.');
  }
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Nieprawidłowa kwota: ${input}`);
  }
  const [wholePart, fracPart = ''] = trimmed.split('.');
  if (fracPart.length > decimals) {
    throw new Error(
      `Zbyt wiele miejsc po przecinku (mint ma ${decimals} — max ${decimals} cyfr po kropce).`
    );
  }
  const scale = 10n ** BigInt(decimals);
  const whole = BigInt(wholePart || '0');
  const fracPadded = fracPart.padEnd(decimals, '0');
  const frac = fracPadded.length > 0 ? BigInt(fracPadded) : 0n;
  return whole * scale + frac;
}

/** Wyświetlanie salda / claim (base units → tokeny jak w portfelu). */
export function formatBaseUnitsAsHumanTokens(
  baseUnits: bigint,
  decimals: number = PIERRON_STEALTH_TOKEN_DECIMALS
): string {
  if (baseUnits < 0n) {
    throw new Error('formatBaseUnitsAsHumanTokens: negative amount');
  }
  const scale = 10n ** BigInt(decimals);
  const whole = baseUnits / scale;
  const frac = baseUnits % scale;
  if (frac === 0n) {
    return whole.toString();
  }
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole}.${fracStr}`;
}

export function describeOnChainAmountVersusHumanInput(params: {
  baseUnits: bigint;
  humanInput?: string;
}): string {
  const human = formatBaseUnitsAsHumanTokens(params.baseUnits);
  const lines = [
    `Na łańcuchu: ${params.baseUnits.toString()} jednostek bazowych = ${human} tokenów (mint ma ${PIERRON_STEALTH_TOKEN_DECIMALS} miejsc po przecinku).`,
  ];
  if (params.humanInput?.trim()) {
    const expected = parseHumanTokenAmountToBaseUnits(params.humanInput);
    if (expected !== params.baseUnits) {
      lines.push(
        `Uwaga: wpisane „${params.humanInput.trim()}” przy obecnym kodzie wysłało/odebrało ${human} tokenów, nie ${params.humanInput.trim()} całych tokenów — od nowego buildu pole „Ilość tokenów” mnoży przez 10^${PIERRON_STEALTH_TOKEN_DECIMALS}.`
      );
    }
  }
  return lines.join('\n');
}
