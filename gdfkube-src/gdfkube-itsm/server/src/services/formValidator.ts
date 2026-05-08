import type { FormDefLike, ValidationResult, ValidationError } from './types.js';

function parseOptions(raw: string): string[] {
  if (raw.includes(';')) {
    return raw.split(';').map((segment) => {
      const pipe = segment.indexOf('|');
      return (pipe >= 0 ? segment.slice(0, pipe) : segment).trim();
    });
  }
  return raw.split(',').map((v) => v.trim());
}

export function validateAgainstFormDef(
  form: FormDefLike,
  body: Record<string, unknown>,
): ValidationResult {
  const errors: ValidationError[] = [];
  const vars: Record<string, unknown> = {};
  const meta: Record<string, unknown> = {};

  for (const field of form.fields) {
    const val = body[field.key];
    const missing = val === undefined || val === null || val === '';

    if (field.required && missing) {
      errors.push({ key: field.key, code: 'required' });
      continue;
    }

    if (missing) continue;

    if (field.validation) {
      const re = new RegExp(field.validation);
      if (!re.test(String(val))) {
        errors.push({ key: field.key, code: 'pattern' });
        continue;
      }
    }

    if (field.type === 'number') {
      const num = Number(val);
      if (
        (field.min !== undefined && num < field.min) ||
        (field.max !== undefined && num > field.max)
      ) {
        errors.push({ key: field.key, code: 'range' });
        continue;
      }
    }

    if (field.type === 'select' && field.options) {
      const allowed = parseOptions(field.options);
      if (!allowed.includes(String(val))) {
        errors.push({ key: field.key, code: 'enum' });
        continue;
      }
    }

    if (field.bucket === 'vars') {
      vars[field.key] = val;
    } else {
      meta[field.key] = val;
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, vars, meta };
}
