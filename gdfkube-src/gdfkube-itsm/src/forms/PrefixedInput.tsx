// PrefixedInput — text input with optional prefix chrome.
//
// The prefix string supports `{key}` token interpolation against sibling
// field values. The prefix is rendered as visible chrome adjacent to the
// input, NOT injected into the input value.

import type { ChangeEvent } from 'react';
import type { Field } from '../types';
import { interpolateTokens } from './interpolateTokens';

interface PrefixedInputProps {
  field: Field;
  value: string;
  onChange: (next: string) => void;
  siblingValues: Record<string, string>;
  inputId: string;
  describedBy?: string;
}

export function PrefixedInput({
  field,
  value,
  onChange,
  siblingValues,
  inputId,
  describedBy,
}: PrefixedInputProps) {
  const handle = (e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value);

  if (!field.prefix) {
    return (
      <input
        id={inputId}
        type="text"
        value={value}
        onChange={handle}
        placeholder={field.placeholder}
        aria-describedby={describedBy}
      />
    );
  }

  const visible = interpolateTokens(field.prefix, siblingValues);
  return (
    <div className="input-prefix">
      <span className="pre">{visible}</span>
      <input
        id={inputId}
        type="text"
        value={value}
        onChange={handle}
        placeholder={field.placeholder}
        aria-describedby={describedBy}
      />
    </div>
  );
}

export default PrefixedInput;
