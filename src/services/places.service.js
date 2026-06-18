'use strict';

const settingsService = require('./settings.service');
const { redis } = require('../config/redis');
const { haversineMeters, formatDistance, estimateTravelMinutes } = require('../utils/geo');
const logger = require('../config/logger');

// Maps our categories to Google Places "type" values.
const PLACE_TYPES = {
  schools: 'school',
  colleges: 'school',
  universities: 'university',
  hospitals: 'hospital',
  clinics: 'doctor',
  mosques: 'mosque',
  markets: 'supermarket',
  bus_stands: 'bus_station',
  railway_stations: 'train_station',
};

const CACHE_TTL = 24 * 60 * 60; // nearby places are stable; cache for a day

/**
 * Smart "what's nearby" feature. Uses Google Places Nearby Search when a maps
 * key is configured; results are cached in Redis keyed by rounded coordinates.
 * Distances/ETA are computed locally with the haversine helper.
 */
class PlacesService {
  async nearby(lat, lng, categories = Object.keys(PLACE_TYPES)) {
    const { googleMapsApiKey } = await settingsService.get();
    const origin = { lat: Number(lat), lng: Number(lng) };
    const cacheKey = `places:${lat.toFixed(3)}:${lng.toFixed(3)}:${categories.join(',')}`;

    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) return JSON.parse(cached);

    if (!googleMapsApiKey) {
      logger.warn('Google Maps API key not configured; returning empty nearby result');
      return categories.reduce((acc, c) => ({ ...acc, [c]: [] }), {});
    }

    const result = {};
    await Promise.all(
      categories.map(async (cat) => {
        const type = PLACE_TYPES[cat];
        if (!type) {
          result[cat] = [];
          return;
        }
        result[cat] = await this.fetchCategory(origin, type, googleMapsApiKey);
      }),
    );

    await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL).catch(() => {});
    return result;
  }

  async fetchCategory(origin, type, apiKey, radius = 3000) {
    const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
    url.searchParams.set('location', `${origin.lat},${origin.lng}`);
    url.searchParams.set('radius', radius);
    url.searchParams.set('type', type);
    url.searchParams.set('key', apiKey);

    const res = await fetch(url);
    const data = await res.json();
    if (!data.results) return [];

    return data.results
      .slice(0, 5)
      .map((p) => {
        const loc = p.geometry?.location;
        const meters = loc ? haversineMeters(origin, { lat: loc.lat, lng: loc.lng }) : null;
        return {
          name: p.name,
          address: p.vicinity,
          rating: p.rating,
          location: loc,
          distanceMeters: meters,
          distanceText: meters != null ? formatDistance(meters) : null, // e.g. "500m"
          travelTimeText: meters != null ? `${estimateTravelMinutes(meters)} min` : null,
        };
      })
      .sort((a, b) => (a.distanceMeters || 0) - (b.distanceMeters || 0));
  }
}

module.exports = new PlacesService();
