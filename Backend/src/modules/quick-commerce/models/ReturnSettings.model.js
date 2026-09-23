import mongoose from 'mongoose';

const quickReturnSettingsSchema = new mongoose.Schema({
  // Fixed setting as per requirements
  returnWindowDays: { type: Number, default: 3, required: true }
}, { timestamps: true });

export const QuickReturnSettings = mongoose.model('quick_return_settings', quickReturnSettingsSchema, 'quick_return_settings');
