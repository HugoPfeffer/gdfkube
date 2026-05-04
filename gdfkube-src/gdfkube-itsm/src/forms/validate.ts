import type { Field } from '../types';

const isEmpty = (value: unknown): boolean =>
  value === null || value === undefined || value === '';

/**
 * Validate a single form field's value against its definition.
 *
 * Returns `null` when the value is valid, or a short error message string.
 *
 * Rules:
 *   - required + empty (null/undefined/'') -> "Required"
 *   - text fields with a `validation` string anchored as `^...$` -> "Invalid format" if no match
 *   - number fields with min/max -> "Must be ≥ {min}" / "Must be ≤ {max}"
 *   - empty (non-required) values skip regex/min/max checks
 *   - checkbox/select have no inline validators here
 */
export function validateField(field: Field, value: unknown): string | null {
  if (isEmpty(value)) {
    return field.required ? 'Required' : null;
  }

  if (
    (field.type === 'text' || field.type === 'textarea') &&
    field.validation &&
    field.validation.startsWith('^') &&
    field.validation.endsWith('$')
  ) {
    const re = new RegExp(field.validation);
    if (!re.test(String(value))) return 'Invalid format';
  }

  if (field.type === 'number') {
    const n = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(n)) {
      if (typeof field.min === 'number' && n < field.min) {
        return `Must be ≥ ${field.min}`;
      }
      if (typeof field.max === 'number' && n > field.max) {
        return `Must be ≤ ${field.max}`;
      }
    }
  }

  return null;
}
