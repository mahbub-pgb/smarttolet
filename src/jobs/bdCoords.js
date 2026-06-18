'use strict';

/**
 * Approximate coordinates for the demo areas/districts used by the listings
 * seeder, so seeded listings can be placed on the map. [lat, lng].
 */
const AREA_COORDS = {
  Dhanmondi: [23.746, 90.3742],
  Gulshan: [23.7925, 90.4078],
  Banani: [23.7937, 90.4066],
  Mirpur: [23.8223, 90.3654],
  Uttara: [23.8759, 90.3795],
  Mohammadpur: [23.7657, 90.3588],
  Bashundhara: [23.8197, 90.431],
  Badda: [23.7806, 90.4267],
  Tongi: [23.8919, 90.403],
  'Board Bazar': [23.93, 90.4],
  Joydebpur: [23.9999, 90.4203],
  Fatullah: [23.63, 90.49],
  Siddhirganj: [23.68, 90.52],
  Agrabad: [22.326, 91.809],
  Khulshi: [22.36, 91.81],
  Nasirabad: [22.37, 91.82],
  Halishahar: [22.33, 91.79],
  Kolatoli: [21.427, 92.0058],
  Jhilongja: [21.45, 92.01],
  Sonadanga: [22.81, 89.54],
  Khalishpur: [22.84, 89.55],
  Boalia: [24.3636, 88.6],
  Motihar: [24.35, 88.63],
  Zindabazar: [24.8949, 91.8687],
  Amberkhana: [24.91, 91.87],
};

const DISTRICT_COORDS = {
  Dhaka: [23.8103, 90.4125],
  Gazipur: [23.9999, 90.4203],
  Narayanganj: [23.6238, 90.5],
  Chattogram: [22.3569, 91.7832],
  "Cox's Bazar": [21.4272, 92.0058],
  Khulna: [22.8456, 89.5403],
  Rajshahi: [24.3745, 88.6042],
  Sylhet: [24.8949, 91.8687],
};

const jitter = (amount = 0.012) => (Math.random() - 0.5) * 2 * amount;

/** Resolve [lng, lat] for a location, with a little random spread. */
function coordsFor({ area, district } = {}) {
  const base = AREA_COORDS[area] || DISTRICT_COORDS[district] || DISTRICT_COORDS.Dhaka;
  const lat = base[0] + jitter();
  const lng = base[1] + jitter();
  return [lng, lat]; // GeoJSON order
}

module.exports = { AREA_COORDS, DISTRICT_COORDS, coordsFor };
