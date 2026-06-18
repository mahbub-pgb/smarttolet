'use strict';

/**
 * Haversine distance in metres between two {lat, lng} points. Used as a local
 * fallback and for sorting Google Places results by proximity.
 */
function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/** Rough walking/driving estimate; replaced by Google Distance Matrix when keyed. */
function estimateTravelMinutes(meters, kmh = 25) {
  return Math.max(1, Math.round((meters / 1000 / kmh) * 60));
}

module.exports = { haversineMeters, formatDistance, estimateTravelMinutes };
