// Where an act is from, for the star on their world map.
// Country code (ISO 3166-1 alpha-2) → name and a point to put the star
// (the capital, or a main city), [lat, lon]. The map is public/img/world-land.svg (Natural
// Earth via world-atlas): equirectangular, 1000 wide, cropped to 75°N–58°S.

export const PLACES = {
  GB: ['United Kingdom', 51.51, -0.12], IE: ['Ireland', 53.35, -6.26], FR: ['France', 48.86, 2.35], DE: ['Germany', 52.52, 13.4],
  ES: ['Spain', 40.42, -3.7], PT: ['Portugal', 38.72, -9.14], IT: ['Italy', 41.9, 12.5], NL: ['Netherlands', 52.37, 4.9],
  BE: ['Belgium', 50.85, 4.35], CH: ['Switzerland', 46.95, 7.45], AT: ['Austria', 48.21, 16.37], PL: ['Poland', 52.23, 21.01],
  CZ: ['Czechia', 50.08, 14.44], SK: ['Slovakia', 48.15, 17.11], HU: ['Hungary', 47.5, 19.04], RO: ['Romania', 44.43, 26.1],
  BG: ['Bulgaria', 42.7, 23.32], GR: ['Greece', 37.98, 23.73], CY: ['Cyprus', 35.17, 33.36], TR: ['Türkiye', 41.01, 28.98],
  UA: ['Ukraine', 50.45, 30.52], RU: ['Russia', 55.76, 37.62], SE: ['Sweden', 59.33, 18.07], NO: ['Norway', 59.91, 10.75],
  DK: ['Denmark', 55.68, 12.57], FI: ['Finland', 60.17, 24.94], IS: ['Iceland', 64.15, -21.94], LT: ['Lithuania', 54.69, 25.28],
  LV: ['Latvia', 56.95, 24.11], EE: ['Estonia', 59.44, 24.75], RS: ['Serbia', 44.79, 20.45], HR: ['Croatia', 45.81, 15.98],
  SI: ['Slovenia', 46.06, 14.51], AL: ['Albania', 41.33, 19.82], MK: ['North Macedonia', 42.0, 21.43], BA: ['Bosnia and Herzegovina', 43.86, 18.41],
  MT: ['Malta', 35.9, 14.51], US: ['United States', 40.71, -74.0], CA: ['Canada', 43.65, -79.38], MX: ['Mexico', 19.43, -99.13],
  BR: ['Brazil', -23.55, -46.63], AR: ['Argentina', -34.6, -58.38], CO: ['Colombia', 4.71, -74.07], CL: ['Chile', -33.45, -70.67],
  PE: ['Peru', -12.05, -77.04], VE: ['Venezuela', 10.48, -66.9], JM: ['Jamaica', 18.0, -76.79], TT: ['Trinidad and Tobago', 10.65, -61.5],
  BB: ['Barbados', 13.1, -59.61], CU: ['Cuba', 23.11, -82.37], NG: ['Nigeria', 6.52, 3.38], GH: ['Ghana', 5.6, -0.19],
  KE: ['Kenya', -1.29, 36.82], ZA: ['South Africa', -26.2, 28.05], ET: ['Ethiopia', 9.03, 38.74], EG: ['Egypt', 30.04, 31.24],
  MA: ['Morocco', 33.97, -6.85], DZ: ['Algeria', 36.75, 3.06], TN: ['Tunisia', 36.81, 10.18], SN: ['Senegal', 14.72, -17.47],
  CM: ['Cameroon', 3.85, 11.5], UG: ['Uganda', 0.35, 32.58], ZW: ['Zimbabwe', -17.83, 31.05], SO: ['Somalia', 2.05, 45.32],
  SD: ['Sudan', 15.5, 32.56], IN: ['India', 19.08, 72.88], PK: ['Pakistan', 24.86, 67.0], BD: ['Bangladesh', 23.81, 90.41],
  LK: ['Sri Lanka', 6.93, 79.86], NP: ['Nepal', 27.72, 85.32], CN: ['China', 39.9, 116.4], HK: ['Hong Kong', 22.32, 114.17],
  TW: ['Taiwan', 25.03, 121.57], JP: ['Japan', 35.68, 139.69], KR: ['South Korea', 37.57, 126.98], PH: ['Philippines', 14.6, 120.98],
  VN: ['Vietnam', 21.03, 105.85], TH: ['Thailand', 13.76, 100.5], MY: ['Malaysia', 3.14, 101.69], SG: ['Singapore', 1.35, 103.82],
  ID: ['Indonesia', -6.21, 106.85], AU: ['Australia', -33.87, 151.21], NZ: ['New Zealand', -36.85, 174.76], IR: ['Iran', 35.69, 51.39],
  IQ: ['Iraq', 33.31, 44.36], IL: ['Israel', 32.09, 34.78], PS: ['Palestine', 31.9, 35.2], LB: ['Lebanon', 33.89, 35.5],
  SY: ['Syria', 33.51, 36.28], SA: ['Saudi Arabia', 24.71, 46.68], AE: ['United Arab Emirates', 25.2, 55.27], AF: ['Afghanistan', 34.56, 69.21],
  KZ: ['Kazakhstan', 51.17, 71.45],
};

// TAM, Elephant & Castle: where every star's line ends.
export const TAM = { lat: 51.495, lon: -0.1, label: 'TAM, London' };

// A point on the map as percentages of its box.
export function onMap(lat, lon) {
  const x = 500 + lon * (1000 / 360), y = 250 - lat * (1000 / 360);
  return { left: +(x / 10).toFixed(2), top: +(((y - 42) / 370) * 100).toFixed(2), x: +x.toFixed(1), y: +y.toFixed(1) };
}

export const placeOf = (code) => {
  const p = PLACES[String(code || '').toUpperCase()];
  return p ? { code: String(code).toUpperCase(), name: p[0], lat: p[1], lon: p[2] } : null;
};
