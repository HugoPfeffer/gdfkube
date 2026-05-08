import { Schema, model } from 'mongoose';

const UserSchema = new Schema(
  {
    _id: { type: String },
    name: { type: String, required: true },
    email: { type: String, required: true },
    role: {
      type: String,
      required: true,
      enum: ['operator', 'admin', 'approver', 'service'],
    },
    fullName: String,
    group: String,
    status: { type: String, enum: ['active', 'disabled'] },
    username: String,
    mfa: String,
    active: Boolean,
    last: String,
  },
  {
    _id: false,
    versionKey: false,
    timestamps: false,
  },
);

export const UserModel = model('User', UserSchema);
