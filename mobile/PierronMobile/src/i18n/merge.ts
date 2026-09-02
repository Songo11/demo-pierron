export function deepMergeTranslations<T extends Record<string, unknown>>(
  base: T,
  patch: Record<string, unknown>
): T {
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(patch)) {
    const patchVal = patch[key];
    const baseVal = base[key];
    if (
      patchVal &&
      typeof patchVal === 'object' &&
      !Array.isArray(patchVal) &&
      baseVal &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal)
    ) {
      out[key] = deepMergeTranslations(
        baseVal as Record<string, unknown>,
        patchVal as Record<string, unknown>
      );
    } else if (patchVal !== undefined) {
      out[key] = patchVal;
    }
  }
  return out as T;
}
