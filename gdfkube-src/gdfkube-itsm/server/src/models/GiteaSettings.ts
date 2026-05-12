import { Schema, model } from 'mongoose';

const giteaSettingsSchema = new Schema(
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

export const GiteaSettings = model('GiteaSettings', giteaSettingsSchema);
