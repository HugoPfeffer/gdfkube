/**
 * Replace `{key}` placeholders in `input` with values from `values`.
 *
 * - Single regex pass — substituted values are NOT re-scanned for tokens.
 * - Missing keys are left as the literal `{key}` (no replacement).
 * - Numeric values are coerced to strings via String().
 */
export function interpolateTokens(
  input: string,
  values: Record<string, string | number>,
): string {
  return input.replace(/\{([^{}]+)\}/g, (match, key: string) => {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      return String(values[key]);
    }
    return match;
  });
}
