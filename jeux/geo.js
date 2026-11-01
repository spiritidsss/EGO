'use strict';
// Outils géographiques : distances en mètres, caps, points aléatoires dans un cercle.
const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

function dist(a, b) {
  if (!a || !b) return Infinity;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Cap de a vers b en degrés (0 = nord, 90 = est).
function bearing(a, b) {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

// Point à `m` mètres de p dans la direction `brg` (degrés).
function offset(p, m, brg) {
  const d = m / R;
  const b = rad(brg);
  const lat1 = rad(p.lat);
  const lng1 = rad(p.lng);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lng2 = lng1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: deg(lat2), lng: deg(lng2) };
}

// Déplace p vers cible d'au plus `m` mètres.
function toward(p, cible, m) {
  const d = dist(p, cible);
  if (d <= m) return { lat: cible.lat, lng: cible.lng };
  return offset(p, m, bearing(p, cible));
}

// Point uniforme dans un disque (centre, rayon r), entre rMin et r du centre.
function randomIn(centre, r, rMin = 0, rnd = Math.random) {
  const u = rnd();
  const d = Math.sqrt(rMin * rMin + u * (r * r - rMin * rMin));
  return offset(centre, d, rnd() * 360);
}

module.exports = { dist, bearing, offset, toward, randomIn };
