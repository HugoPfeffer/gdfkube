export interface ValidationError {
  key: string;
  code: 'required' | 'pattern' | 'range' | 'enum';
}

export type ValidationResult =
  | { ok: true; vars: Record<string, unknown>; meta: Record<string, unknown> }
  | { ok: false; errors: ValidationError[] };

export interface FormField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox';
  bucket: 'meta' | 'vars';
  required?: boolean;
  validation?: string;
  min?: number;
  max?: number;
  options?: string;
}

export interface FormDefLike {
  fields: FormField[];
}
