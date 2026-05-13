// Tests for RadioCards — display variant for select fields with
// displayAs:"radio-cards". The dot indicator must be rendered with an
// inline 8×8 circle so it is visible without depending on a .dot CSS
// rule (which does not exist in styles.css).

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Field } from '../../types';
import { RadioCards } from '../RadioCards';

function makeField(overrides: Partial<Field> = {}): Field {
  return {
    key: 'env',
    label: 'Environment',
    type: 'select',
    bucket: 'vars',
    displayAs: 'radio-cards',
    options:
      'dev | Development | Non-prod sandbox | #22c55e;' +
      'prod | Production | Live workloads | #ef4444',
    ...overrides,
  };
}

describe('RadioCards', () => {
  it('renders an inline-styled 8x8 circular dot for each option with a dotColor', () => {
    const { container } = render(
      <RadioCards field={makeField()} value="dev" onChange={() => {}} />,
    );

    const dots = container.querySelectorAll<HTMLSpanElement>(
      '.radio-card span[aria-hidden="true"]',
    );

    expect(dots.length).toBe(2);
    dots.forEach((dot) => {
      expect(dot.style.width).toBe('8px');
      expect(dot.style.height).toBe('8px');
      expect(dot.style.borderRadius).toBe('50%');
      expect(dot.style.display).toBe('inline-block');
      expect(dot.style.background).not.toBe('');
    });
  });
});
