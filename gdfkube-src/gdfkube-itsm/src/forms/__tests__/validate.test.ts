import { describe, expect, it } from 'vitest';
import { validateField } from '../validate';
import type { Field } from '../../types';

const textField = (overrides: Partial<Field> = {}): Field => ({
  key: 'name',
  label: 'Name',
  type: 'text',
  bucket: 'meta',
  ...overrides,
});

const numberField = (overrides: Partial<Field> = {}): Field => ({
  key: 'count',
  label: 'Count',
  type: 'number',
  bucket: 'vars',
  ...overrides,
});

describe('validateField', () => {
  it('returns "Required" for required field with empty string', () => {
    expect(validateField(textField({ required: true }), '')).toBe('Required');
  });

  it('returns "Required" for required field with null/undefined', () => {
    expect(validateField(textField({ required: true }), null)).toBe('Required');
    expect(validateField(textField({ required: true }), undefined)).toBe('Required');
  });

  it('returns null for non-required field with empty value', () => {
    expect(validateField(textField(), '')).toBeNull();
    expect(validateField(textField(), null)).toBeNull();
    expect(validateField(textField(), undefined)).toBeNull();
  });

  it('returns null for required field with a non-empty value', () => {
    expect(validateField(textField({ required: true }), 'hugo')).toBeNull();
  });

  it('returns "Invalid format" when value does not match regex validation', () => {
    expect(
      validateField(textField({ validation: '^[a-z]+$' }), 'Hugo123'),
    ).toBe('Invalid format');
  });

  it('returns null when value matches regex validation', () => {
    expect(validateField(textField({ validation: '^[a-z]+$' }), 'hugo')).toBeNull();
  });

  it('skips regex validation when value is empty and not required', () => {
    expect(validateField(textField({ validation: '^[a-z]+$' }), '')).toBeNull();
  });

  it('returns null when validation is not a full anchored pattern', () => {
    // strings without leading ^ and trailing $ are treated as opaque (not a regex)
    expect(validateField(textField({ validation: 'abc' }), 'xyz')).toBeNull();
  });

  it('returns "Must be ≥ {min}" for number below min', () => {
    expect(validateField(numberField({ min: 5 }), 4)).toBe('Must be ≥ 5');
  });

  it('returns null for number at min boundary', () => {
    expect(validateField(numberField({ min: 5 }), 5)).toBeNull();
  });

  it('returns "Must be ≤ {max}" for number above max', () => {
    expect(validateField(numberField({ max: 10 }), 11)).toBe('Must be ≤ 10');
  });

  it('returns null for number at max boundary', () => {
    expect(validateField(numberField({ max: 10 }), 10)).toBeNull();
  });

  it('coerces numeric strings before min/max comparison', () => {
    expect(validateField(numberField({ min: 5 }), '4')).toBe('Must be ≥ 5');
    expect(validateField(numberField({ max: 10 }), '11')).toBe('Must be ≤ 10');
  });

  it('treats null/undefined number values as empty (no min/max error unless required)', () => {
    expect(validateField(numberField({ min: 5 }), null)).toBeNull();
    expect(validateField(numberField({ min: 5 }), undefined)).toBeNull();
    expect(validateField(numberField({ required: true, min: 5 }), null)).toBe(
      'Required',
    );
  });
});
