import type { SelectOption } from '../types';

/**
 * Parse a select-field options string into a list of SelectOption objects.
 *
 * Grammar:
 *   - Top-level separator is `;` if any `;` is present, otherwise `,`.
 *     This lets a description contain a comma without ambiguity.
 *   - Each option uses `|` to separate up to 4 fields:
 *       value | label | description | dotColor
 *     The last three are optional. If only `value` is given, `label` defaults to `value`.
 *   - Whitespace around delimiters is trimmed.
 *   - Empty input (after trim) returns `[]`.
 */
export function parseSelectOptions(input: string): SelectOption[] {
  if (!input || !input.trim()) return [];

  const sep = input.includes(';') ? ';' : ',';
  const chunks = input
    .split(sep)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return chunks.map((chunk) => {
    const parts = chunk.split('|').map((p) => p.trim());
    const [value, label, description, dotColor] = parts;
    const opt: SelectOption = {
      value,
      label: label && label.length > 0 ? label : value,
    };
    if (description) opt.description = description;
    if (dotColor) opt.dotColor = dotColor;
    return opt;
  });
}
