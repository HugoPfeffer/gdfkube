import { Schema, model, type Document } from 'mongoose';

export interface IGiteaSettings extends Document {
  _id: string;
  endpoint: string;
  owner: string;
  token: string;
  updatedAt?: Date;
  updatedBy?: string;
}

const giteaSettingsSchema = new Schema<IGiteaSettings>(
  {
    _id: { type: String, default: 'gitea' },
    endpoint: { type: String, required: true, match: /^https?:\/\/.+$/ },
    owner: { type: String, required: true, match: /^[a-zA-Z0-9_-]+$/ },
    token: { type: String, required: true },
    updatedAt: { type: Date },
    updatedBy: { type: String },
  },
  {
    _id: false,
    versionKey: false,
    collection: 'gitea_settings',
  },
);

export const GiteaSettings = model<IGiteaSettings>(
  'GiteaSettings',
  giteaSettingsSchema,
);
