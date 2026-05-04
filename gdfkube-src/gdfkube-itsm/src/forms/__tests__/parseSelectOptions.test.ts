import { describe, expect, it } from 'vitest';
import { parseSelectOptions } from '../parseSelectOptions';

describe('parseSelectOptions', () => {
  it('returns [] for empty input', () => {
    expect(parseSelectOptions('')).toEqual([]);
    expect(parseSelectOptions('   ')).toEqual([]);
  });

  it('parses pipe-grammar with all 4 fields (value | label | description | dotColor)', () => {
    const input =
      'prod | Production | Live customer traffic | red, stg | Staging | Pre-prod env | amber';
    expect(parseSelectOptions(input)).toEqual([
      {
        value: 'prod',
        label: 'Production',
        description: 'Live customer traffic',
        dotColor: 'red',
      },
      {
        value: 'stg',
        label: 'Staging',
        description: 'Pre-prod env',
        dotColor: 'amber',
      },
    ]);
  });

  it('uses ; separator when description contains a comma', () => {
    const input =
      'prod | Production | Live, customer-facing traffic | red; stg | Staging | Pre-prod, mirror | amber';
    expect(parseSelectOptions(input)).toEqual([
      {
        value: 'prod',
        label: 'Production',
        description: 'Live, customer-facing traffic',
        dotColor: 'red',
      },
      {
        value: 'stg',
        label: 'Staging',
        description: 'Pre-prod, mirror',
        dotColor: 'amber',
      },
    ]);
  });

  it('falls back to comma split for plain lists', () => {
    expect(parseSelectOptions('a, b, c')).toEqual([
      { value: 'a', label: 'a' },
      { value: 'b', label: 'b' },
      { value: 'c', label: 'c' },
    ]);
  });

  it('defaults label = value when only value is provided', () => {
    expect(parseSelectOptions('solo')).toEqual([{ value: 'solo', label: 'solo' }]);
  });

  it('trims whitespace around delimiters and fields', () => {
    expect(parseSelectOptions('  one  ,  two | Two  ')).toEqual([
      { value: 'one', label: 'one' },
      { value: 'two', label: 'Two' },
    ]);
  });

  it('omits empty trailing optional fields', () => {
    expect(parseSelectOptions('v | L')).toEqual([{ value: 'v', label: 'L' }]);
    expect(parseSelectOptions('v | L | desc')).toEqual([
      { value: 'v', label: 'L', description: 'desc' },
    ]);
  });
});
