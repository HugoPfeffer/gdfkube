import { describe, expect, it } from 'vitest';
import { SLUG_REGEX, slugify } from '../slug';

describe('slugify', () => {
  const cases: [string, string][] = [
    ['Min. da fazenda', 'min-da-fazenda'],
    ['Educação', 'educacao'],
    ['Sec. Educ.', 'sec-educ'],
    ['  -- Cultura --  ', 'cultura'],
    ['__under_scored__', 'under-scored'],
    ['', ''],
    ['...', ''],
  ];

  it.each(cases)('slugify(%j) → %j', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('is idempotent: slugify(slugify(x)) === slugify(x)', () => {
    for (const [input] of cases) {
      const once = slugify(input);
      expect(slugify(once)).toBe(once);
    }
  });

  it('every non-empty result passes SLUG_REGEX', () => {
    for (const [input] of cases) {
      const result = slugify(input);
      if (result !== '') {
        expect(SLUG_REGEX.test(result)).toBe(true);
      }
    }
  });
});
