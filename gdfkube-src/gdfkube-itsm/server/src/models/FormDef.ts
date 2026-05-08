import { Schema, model } from 'mongoose';

const TypedFieldSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: {
      type: String,
      required: true,
      enum: ['text', 'textarea', 'number', 'select', 'checkbox'],
    },
    bucket: { type: String, required: true, enum: ['meta', 'vars'] },
    required: Boolean,
    help: String,
    prefix: String,
    placeholder: String,
    validation: String,
    min: Number,
    max: Number,
    options: String,
    displayAs: { type: String, enum: ['dropdown', 'radio-cards'] },
    id: Number,
  },
  { _id: false },
);

const TemplateFileSchema = new Schema(
  {
    name: { type: String, required: true },
    content: { type: String, required: true },
    language: String,
  },
  { _id: false },
);

const FormDefSchema = new Schema(
  {
    _id: { type: String },
    name: { type: String, required: true },
    topic: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: ['active', 'disabled'],
      default: 'active',
    },
    fields: { type: [TypedFieldSchema], default: [] },
    templates: { type: [TemplateFileSchema], default: [] },
    description: String,
    lastEdited: String,
    submissions: Number,
    fieldCount: Number,
    updated: String,
  },
  {
    _id: false,
    versionKey: false,
    timestamps: false,
  },
);

export const FormDefModel = model('FormDef', FormDefSchema);
