'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { ROLES, ACCOUNT_STATUS, GENDER } = require('../constants');

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    fullName: { type: String, trim: true, maxlength: 120 },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true,
      unique: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email'],
    },
    mobile: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      // E.164-ish for Bangladesh: +8801XXXXXXXXX
      match: [/^\+8801[3-9]\d{8}$/, 'Invalid Bangladesh mobile number'],
    },
    // Optional: account is created right after OTP; password set during profile step.
    // No minlength here: validation runs on the plaintext (before the pre-save
    // hash hook), so a hash-length minimum would always fail. Plaintext strength
    // rules (min 8, upper/lower/number) are enforced in auth.validation.js.
    password: { type: String, select: false },

    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.USER,
      index: true,
    },

    profileImage: { type: String },
    // Cloudinary public id for the current avatar, kept so the previous image
    // can be deleted when a new one is uploaded. Stripped from JSON responses.
    profileImagePublicId: { type: String },
    dateOfBirth: { type: Date },
    gender: { type: String, enum: Object.values(GENDER) },
    occupation: { type: String, trim: true },
    nationalId: { type: String, trim: true }, // optional
    address: { type: String, trim: true },

    // GeoJSON point enables $near queries. coordinates = [lng, lat].
    // No default on `type`: without it Mongoose would materialize a half-formed
    // { type: 'Point' } with no coordinates, which the 2dsphere index rejects
    // ("Point must be an array or object"). It's set together with coordinates.
    location: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number], default: undefined },
    },

    preferences: {
      preferredDivision: { type: String, trim: true },
      preferredDistrict: { type: String, trim: true },
      preferredArea: { type: String, trim: true },
    },

    isPhoneVerified: { type: Boolean, default: false },
    isEmailVerified: { type: Boolean, default: false },
    isLandlordVerified: { type: Boolean, default: false },

    status: {
      type: String,
      enum: Object.values(ACCOUNT_STATUS),
      default: ACCOUNT_STATUS.ACTIVE,
      index: true,
    },
    lastLoginAt: { type: Date },

    // Bumped on logout / forced revoke to invalidate older refresh tokens.
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);

userSchema.index({ location: '2dsphere' });
userSchema.index({ createdAt: -1 });

// Virtual convenience: latitude/longitude pass-through.
userSchema.virtual('latitude').get(function () {
  return this.location?.coordinates?.[1];
});
userSchema.virtual('longitude').get(function () {
  return this.location?.coordinates?.[0];
});

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, config.bcryptRounds);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  if (!this.password) return Promise.resolve(false);
  return bcrypt.compare(candidate, this.password);
};

// Never leak sensitive fields.
userSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    delete ret.password;
    delete ret.tokenVersion;
    delete ret.profileImagePublicId;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
