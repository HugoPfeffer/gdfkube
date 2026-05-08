import { Schema, model } from 'mongoose';

const GroupSchema = new Schema(
  {
    _id: { type: String },
    name: { type: String, required: true },
    fullName: String,
    repo: String,
    clusters: Schema.Types.Mixed,
    users: { type: [String], default: [] },
    forms: { type: [String], default: [] },
  },
  {
    _id: false,
    versionKey: false,
    timestamps: false,
  },
);

export const GroupModel = model('Group', GroupSchema);
