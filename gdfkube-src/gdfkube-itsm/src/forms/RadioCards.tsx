// RadioCards — display variant for select fields with displayAs:"radio-cards".
//
// Renders a row of clickable cards. Each card shows a label, optional
// description, and optional colored dot. The dotColor may be a CSS color
// token or a hex value — both render via the same inline `background` style.
// Cards are activated via Enter / Space (button semantics).

import type { CSSProperties, KeyboardEvent } from 'react';
import type { Field, SelectOption } from '../types';
import { parseSelectOptions } from './parseSelectOptions';

interface RadioCardsProps {
  field: Field;
  value: string;
  onChange: (next: string) => void;
}

function dotStyle(color: string): CSSProperties {
  return { background: color };
}

export function RadioCards({ field, value, onChange }: RadioCardsProps) {
  const options: SelectOption[] = parseSelectOptions(field.options ?? '');

  return (
    <div className="radio-group" role="radiogroup" aria-label={field.label}>
      {options.map((opt) => {
        const selected = opt.value === value;
        const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onChange(opt.value);
          }
        };
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={'radio-card' + (selected ? ' selected' : '')}
            onClick={() => onChange(opt.value)}
            onKeyDown={onKeyDown}
          >
            <div className="rc-title">
              {opt.dotColor && (
                <span
                  className="dot"
                  aria-hidden="true"
                  style={dotStyle(opt.dotColor)}
                />
              )}
              <span>{opt.label}</span>
            </div>
            {opt.description && (
              <div className="rc-sub">{opt.description}</div>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default RadioCards;
