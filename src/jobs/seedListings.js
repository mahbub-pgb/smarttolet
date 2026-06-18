'use strict';

/**
 * Dev seeder: inserts N random APPROVED listings so the browse/pagination UI
 * has data to work with. Run with: npm run seed:listings  (or `node ... 250`).
 *
 * Uses insertMany for speed and pre-builds the slug the same way the model's
 * pre-save hook does (slugify(title) + '-' + last 6 chars of the id).
 */
const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../config/db');
const { User, Listing } = require('../models');
const {
  LISTING_TYPES, LISTING_STATUS, FURNISHED_STATUS, ROLES, ACCOUNT_STATUS,
} = require('../constants');
const { coordsFor } = require('./bdCoords');
const logger = require('../config/logger');

const COUNT = Number(process.argv[2]) || 1000;

// A small slice of the Bangladesh location hierarchy.
const PLACES = [
  { division: 'Dhaka', district: 'Dhaka', areas: ['Dhanmondi', 'Gulshan', 'Banani', 'Mirpur', 'Uttara', 'Mohammadpur', 'Bashundhara', 'Badda'] },
  { division: 'Dhaka', district: 'Gazipur', areas: ['Tongi', 'Board Bazar', 'Joydebpur'] },
  { division: 'Dhaka', district: 'Narayanganj', areas: ['Fatullah', 'Siddhirganj'] },
  { division: 'Chattogram', district: 'Chattogram', areas: ['Agrabad', 'Khulshi', 'Nasirabad', 'Halishahar'] },
  { division: 'Chattogram', district: "Cox's Bazar", areas: ['Kolatoli', 'Jhilongja'] },
  { division: 'Khulna', district: 'Khulna', areas: ['Sonadanga', 'Khalishpur'] },
  { division: 'Rajshahi', district: 'Rajshahi', areas: ['Boalia', 'Motihar'] },
  { division: 'Sylhet', district: 'Sylhet', areas: ['Zindabazar', 'Amberkhana'] },
];

const ADJECTIVES = ['Cozy', 'Spacious', 'Modern', 'Affordable', 'Luxury', 'Bright', 'Quiet', 'Family-friendly'];
const FURNISHED = Object.values(FURNISHED_STATUS);

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function slugify(title) {
  return String(title)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9ঀ-৿]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'listing';
}

async function getOwnerId() {
  // Reuse any existing user; otherwise create a throwaway seed landlord.
  let owner = await User.findOne();
  if (!owner) {
    owner = await User.create({
      fullName: 'Seed Landlord',
      mobile: '+8801900000000',
      role: ROLES.USER,
      isPhoneVerified: true,
      status: ACCOUNT_STATUS.ACTIVE,
    });
  }
  return owner._id;
}

// Assign a slug that is unique within `used`, mutating that set.
function uniqueSlug(base, used) {
  let slug = base;
  let n = 1;
  while (used.has(slug)) {
    n += 1;
    slug = `${base}-${n}`;
  }
  used.add(slug);
  return slug;
}

function makeListing(ownerId, i, used) {
  const _id = new mongoose.Types.ObjectId();
  const place = rand(PLACES);
  const area = rand(place.areas);
  const type = rand(LISTING_TYPES);
  const bedrooms = randInt(1, 5);
  const title = `${rand(ADJECTIVES)} ${bedrooms} bedroom ${type.replace(/_/g, ' ')} in ${area}`;
  const now = Date.now();
  return {
    _id,
    owner: ownerId,
    type,
    title,
    slug: uniqueSlug(slugify(title), used),
    description: `A ${rand(ADJECTIVES).toLowerCase()} ${type.replace(/_/g, ' ')} located in ${area}, ${place.district}. Well-connected, ready to move in. Listing reference ${i + 1}.`,
    monthlyRent: randInt(5, 80) * 1000,
    advanceAmount: randInt(0, 3) * 10000,
    details: {
      bedrooms,
      bathrooms: randInt(1, 4),
      areaSqft: randInt(400, 2500),
      furnishedStatus: rand(FURNISHED),
    },
    location: { division: place.division, district: place.district, area },
    geo: { type: 'Point', coordinates: coordsFor({ area, district: place.district }) },
    images: [],
    status: LISTING_STATUS.APPROVED,
    isFeatured: Math.random() < 0.05,
    reviewedAt: new Date(),
    expiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000),
    createdAt: new Date(now - randInt(0, 60) * 24 * 60 * 60 * 1000),
  };
}

async function seed() {
  await connectDB();
  const ownerId = await getOwnerId();
  // Seed the used-slug set with slugs already in the DB to avoid collisions.
  const existing = await Listing.find({}, 'slug').lean();
  const used = new Set(existing.map((l) => l.slug).filter(Boolean));
  const docs = Array.from({ length: COUNT }, (_, i) => makeListing(ownerId, i, used));

  // Insert in batches to keep memory/load reasonable.
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < docs.length; i += BATCH) {
    const batch = docs.slice(i, i + BATCH);
    await Listing.insertMany(batch, { ordered: false });
    inserted += batch.length;
    logger.info(`Inserted ${inserted}/${COUNT}`);
  }

  const total = await Listing.countDocuments({ status: LISTING_STATUS.APPROVED });
  logger.info(`Done. Approved listings now in DB: ${total}`);
}

seed()
  .catch((err) => logger.error(err.stack || err.message))
  .finally(async () => {
    await disconnectDB();
    await mongoose.disconnect();
    process.exit(0);
  });
