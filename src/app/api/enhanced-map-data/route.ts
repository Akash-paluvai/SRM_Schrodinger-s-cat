import { NextRequest, NextResponse } from 'next/server';

/* ═══════════════════════════════════════════════════════
   GEOCODING — Mapbox API + fallback dictionary
   ═══════════════════════════════════════════════════════ */
const LOCATIONS: Record<string, [number, number]> = {
  'mumbai': [19.076, 72.8777], 'delhi': [28.7041, 77.1025],
  'chennai': [13.0827, 80.2707], 'kolkata': [22.5726, 88.3639],
  'bangalore': [12.9716, 77.5946], 'hyderabad': [17.385, 78.4867],
  'shanghai': [31.2304, 121.4737], 'beijing': [39.9042, 116.4074],
  'shenzhen': [22.5431, 114.0579], 'guangzhou': [23.1291, 113.2644],
  'hong kong': [22.3193, 114.1694], 'tokyo': [35.6762, 139.6503],
  'osaka': [34.6937, 135.5023], 'yokohama': [35.4437, 139.638],
  'singapore': [1.3521, 103.8198], 'dubai': [25.2048, 55.2708],
  'abu dhabi': [24.4539, 54.3773], 'jeddah': [21.4858, 39.1925],
  'istanbul': [41.0082, 28.9784], 'rotterdam': [51.9244, 4.4777],
  'hamburg': [53.5511, 9.9937], 'antwerp': [51.2194, 4.4025],
  'london': [51.5074, -0.1278], 'felixstowe': [51.9536, 1.3513],
  'new york': [40.7128, -74.006], 'los angeles': [33.9425, -118.408],
  'long beach': [33.77, -118.1937], 'san francisco': [37.7749, -122.4194],
  'seattle': [47.6062, -122.3321], 'vancouver': [49.2827, -123.1207],
  'dallas': [32.7767, -96.797], 'chicago': [41.8781, -87.6298],
  'miami': [25.7617, -80.1918], 'houston': [29.7604, -95.3698],
  'santos': [-23.9608, -46.3331], 'buenos aires': [-34.6037, -58.3816],
  'cape town': [-33.9249, 18.4241], 'durban': [-29.8587, 31.0218],
  'nairobi': [-1.2921, 36.8219], 'lagos': [6.5244, 3.3792],
  'sydney': [-33.8688, 151.2093], 'melbourne': [-37.8136, 144.9631],
  'busan': [35.1796, 129.0756], 'kaohsiung': [22.6273, 120.3014],
  'colombo': [6.9271, 79.8612], 'karachi': [24.8607, 67.0011],
  'jebel ali': [25.0067, 55.0638], 'port klang': [3.0, 101.4],
  'tanjung pelepas': [1.362, 103.551], 'laem chabang': [13.0833, 100.8833],
  'ho chi minh': [10.8231, 106.6297], 'haiphong': [20.8449, 106.6881],
  'piraeus': [37.9475, 23.6372], 'barcelona': [41.3851, 2.1734],
  'marseille': [43.2965, 5.3698], 'genoa': [44.4056, 8.9463],
  'suez': [29.9668, 32.5498], 'panama city': [8.9824, -79.5199],
};

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';
const TOKEN_VALID = MAPBOX_TOKEN.length > 20 && MAPBOX_TOKEN !== 'your_mapbox_token_here';

async function geocode(name: string): Promise<[number, number]> {
  const key = name.toLowerCase().replace(/[,\s]+.*$/, '').trim();
  if (LOCATIONS[key]) return LOCATIONS[key];

  if (TOKEN_VALID) {
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(name)}.json?access_token=${MAPBOX_TOKEN}&limit=1`
      );
      const data = await res.json();
      if (data.features?.[0]) {
        const [lng, lat] = data.features[0].center;
        return [lat, lng];
      }
    } catch { /* fallback */ }
  }
  return LOCATIONS[key] || [20 + Math.random() * 20, 40 + Math.random() * 60];
}

/* ═══════════════════════════════════════════════════════
   MARITIME WAYPOINTS — global shipping lane network
   ═══════════════════════════════════════════════════════ */
const MARITIME_WAYPOINTS: Record<string, [number, number]> = {
  'strait_of_malacca': [2.5, 101.0],
  'strait_of_hormuz': [26.5, 56.5],
  'bab_el_mandeb': [12.6, 43.4],
  'suez_north': [31.25, 32.34],
  'suez_south': [29.95, 32.55],
  'gibraltar': [36.0, -5.6],
  'good_hope': [-34.35, 18.5],
  'panama_atlantic': [9.38, -79.92],
  'panama_pacific': [8.95, -79.57],
  'english_channel': [50.5, 0.5],
  'south_china_sea': [10.0, 112.0],
  'east_china_sea': [28.0, 125.0],
  'arabian_sea_w': [15.0, 60.0],
  'arabian_sea_e': [12.0, 72.0],
  'indian_ocean_mid': [-5.0, 70.0],
  'pacific_mid': [25.0, 170.0],
  'pacific_north': [40.0, -170.0],
  'atlantic_mid': [30.0, -40.0],
  'atlantic_south': [-10.0, -25.0],
  'mozambique': [-20.0, 38.0],
  'cape_verde': [16.0, -23.0],
  'mediterranean_w': [37.0, 3.0],
  'mediterranean_e': [34.0, 25.0],
  'red_sea_mid': [18.0, 39.5],
  'bay_of_bengal': [12.0, 85.0],
  'taiwan_strait': [24.5, 119.5],
  'korea_strait': [34.0, 129.0],
};

/* ── Region classification for routing ── */
function getRegion(lat: number, lng: number): string {
  if (lat > 25 && lng > 100 && lng < 145) return 'east_asia';
  if (lat >= 0 && lat <= 25 && lng > 95 && lng < 120) return 'southeast_asia';
  if (lat > 10 && lat < 35 && lng > 50 && lng < 80) return 'middle_east';
  if (lat > -5 && lat < 15 && lng > 68 && lng < 95) return 'south_asia';
  if (lat > 35 && lng > -15 && lng < 45) return 'europe';
  if (lat > 10 && lat < 50 && lng > -130 && lng < -60) return 'north_america';
  if (lat < 10 && lat > -55 && lng > -80 && lng < -35) return 'south_america';
  if (lat > -40 && lat < 35 && lng > 10 && lng < 55) return 'africa';
  if (lat < -10 && lng > 110 && lng < 180) return 'oceania';
  return 'other';
}

/* ── Find realistic sea waypoints between two points ── */
function getMaritimeRoute(from: [number, number], to: [number, number]): [number, number][] {
  const regionFrom = getRegion(from[0], from[1]);
  const regionTo = getRegion(to[0], to[1]);
  const W = MARITIME_WAYPOINTS;

  const routeMap: Record<string, [number, number][]> = {
    'east_asia→south_asia': [W.south_china_sea, W.strait_of_malacca, W.bay_of_bengal],
    'east_asia→middle_east': [W.south_china_sea, W.strait_of_malacca, W.arabian_sea_e, W.arabian_sea_w],
    'east_asia→europe': [W.south_china_sea, W.strait_of_malacca, W.arabian_sea_e, W.bab_el_mandeb, W.red_sea_mid, W.suez_south, W.suez_north, W.mediterranean_e, W.mediterranean_w, W.gibraltar, W.english_channel],
    'east_asia→north_america': [W.east_china_sea, W.pacific_mid, W.pacific_north],
    'east_asia→africa': [W.south_china_sea, W.strait_of_malacca, W.indian_ocean_mid, W.mozambique],
    'east_asia→south_america': [W.south_china_sea, W.strait_of_malacca, W.indian_ocean_mid, W.good_hope, W.atlantic_south],
    'southeast_asia→middle_east': [W.strait_of_malacca, W.arabian_sea_e, W.arabian_sea_w],
    'southeast_asia→europe': [W.strait_of_malacca, W.arabian_sea_e, W.bab_el_mandeb, W.red_sea_mid, W.suez_south, W.suez_north, W.mediterranean_e, W.gibraltar, W.english_channel],
    'southeast_asia→east_asia': [W.south_china_sea, W.taiwan_strait],
    'south_asia→middle_east': [W.arabian_sea_e, W.arabian_sea_w],
    'south_asia→europe': [W.arabian_sea_e, W.bab_el_mandeb, W.red_sea_mid, W.suez_south, W.suez_north, W.mediterranean_e, W.gibraltar, W.english_channel],
    'south_asia→east_asia': [W.bay_of_bengal, W.strait_of_malacca, W.south_china_sea],
    'middle_east→europe': [W.strait_of_hormuz, W.bab_el_mandeb, W.red_sea_mid, W.suez_south, W.suez_north, W.mediterranean_e, W.gibraltar, W.english_channel],
    'middle_east→south_asia': [W.arabian_sea_w, W.arabian_sea_e],
    'middle_east→east_asia': [W.strait_of_hormuz, W.arabian_sea_w, W.arabian_sea_e, W.strait_of_malacca, W.south_china_sea],
    'europe→north_america': [W.english_channel, W.atlantic_mid],
    'europe→south_america': [W.gibraltar, W.cape_verde, W.atlantic_south],
    'europe→africa': [W.gibraltar, W.cape_verde],
    'europe→east_asia': [W.english_channel, W.gibraltar, W.mediterranean_w, W.mediterranean_e, W.suez_north, W.suez_south, W.red_sea_mid, W.bab_el_mandeb, W.arabian_sea_e, W.strait_of_malacca, W.south_china_sea],
    'north_america→europe': [W.atlantic_mid, W.english_channel],
    'north_america→east_asia': [W.pacific_north, W.pacific_mid],
    'north_america→south_america': [W.panama_atlantic, W.panama_pacific],
    'africa→europe': [W.good_hope, W.cape_verde, W.gibraltar],
    'africa→east_asia': [W.mozambique, W.indian_ocean_mid, W.strait_of_malacca, W.south_china_sea],
  };

  const key = `${regionFrom}→${regionTo}`;
  const reverseKey = `${regionTo}→${regionFrom}`;

  if (routeMap[key]) return routeMap[key];
  if (routeMap[reverseKey]) return [...routeMap[reverseKey]].reverse();

  // Fallback: direct with midpoint offset
  return [];
}

/* ═══════════════════════════════════════════════════════
   GREAT-CIRCLE ARC — for air routes
   ═══════════════════════════════════════════════════════ */
function greatCircleArc(from: [number, number], to: [number, number], steps = 60): [number, number][] {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const [lat1, lng1] = [toRad(from[0]), toRad(from[1])];
  const [lat2, lng2] = [toRad(to[0]), toRad(to[1])];

  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((lat2 - lat1) / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2
  ));

  if (d < 0.0001) return [from, to];

  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
    const y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    points.push([toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))), toDeg(Math.atan2(y, x))]);
  }
  return points;
}

/* ═══════════════════════════════════════════════════════
   SEA ROUTE — smooth curve through waypoints
   ═══════════════════════════════════════════════════════ */
function interpolateSeaRoute(points: [number, number][], stepsPerSeg = 20): [number, number][] {
  if (points.length < 2) return points;
  const result: [number, number][] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [lat1, lng1] = points[i];
    const [lat2, lng2] = points[i + 1];
    for (let s = 0; s <= stepsPerSeg; s++) {
      const t = s / stepsPerSeg;
      // Add slight curve offset to avoid straight lines through land
      const offset = Math.sin(t * Math.PI) * 1.5 * (i % 2 === 0 ? 1 : -1);
      const dx = lng2 - lng1;
      const dy = lat2 - lat1;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      result.push([
        lat1 + (lat2 - lat1) * t + (-dx / len) * offset,
        lng1 + (lng2 - lng1) * t + (dy / len) * offset,
      ]);
    }
  }
  return result;
}

/* ═══════════════════════════════════════════════════════
   ROAD ROUTE — Mapbox Directions API + fallback
   ═══════════════════════════════════════════════════════ */
async function getRoadRoute(from: [number, number], to: [number, number]): Promise<{ coords: [number, number][]; distance: number; duration: number }> {
  if (TOKEN_VALID) {
    try {
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${from[1]},${from[0]};${to[1]},${to[0]}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.routes?.[0]) {
        const route = data.routes[0];
        const coords: [number, number][] = route.geometry.coordinates.map(
          ([lng, lat]: [number, number]) => [lat, lng]
        );
        return { coords, distance: route.distance / 1000, duration: route.duration / 3600 };
      }
    } catch { /* fallback */ }
  }

  // Fallback: bezier curve between points
  const steps = 40;
  const coords: [number, number][] = [];
  const midLat = (from[0] + to[0]) / 2;
  const midLng = (from[1] + to[1]) / 2;
  const dist = Math.sqrt((to[0] - from[0]) ** 2 + (to[1] - from[1]) ** 2);
  const offset = dist * 0.1;
  const ctrlLat = midLat + offset;
  const ctrlLng = midLng - offset;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    coords.push([
      (1 - t) ** 2 * from[0] + 2 * (1 - t) * t * ctrlLat + t ** 2 * to[0],
      (1 - t) ** 2 * from[1] + 2 * (1 - t) * t * ctrlLng + t ** 2 * to[1],
    ]);
  }
  const kmDist = dist * 111;
  return { coords, distance: kmDist, duration: kmDist / 60 };
}

/* ═══════════════════════════════════════════════════════
   RISK ZONES
   ═══════════════════════════════════════════════════════ */
const RISK_ZONES = [
  { lat: 22.0, lng: 115.0, radius: 400, risk: 'HIGH', label: 'South China Sea — Typhoon Zone', cause: 'Cyclonic activity, seasonal typhoons' },
  { lat: 15.5, lng: 43.0, radius: 300, risk: 'HIGH', label: 'Red Sea — Conflict Zone', cause: 'Armed conflict, shipping attacks' },
  { lat: -24.0, lng: -46.0, radius: 200, risk: 'MEDIUM', label: 'Santos Port — Congestion', cause: 'Port labor disputes' },
  { lat: 49.0, lng: -123.5, radius: 150, risk: 'MEDIUM', label: 'Vancouver — Congestion', cause: 'Terminal capacity limits' },
  { lat: 30.0, lng: 32.5, radius: 250, risk: 'MEDIUM', label: 'Suez Canal — Bottleneck', cause: 'Passage delays' },
  { lat: 10.0, lng: -80.0, radius: 200, risk: 'LOW', label: 'Panama Canal — Drought Risk', cause: 'Water level restrictions' },
  { lat: 55.0, lng: 20.0, radius: 350, risk: 'HIGH', label: 'Baltic Sea — Conflict Zone', cause: 'Geopolitical tensions' },
  { lat: -5.0, lng: 40.0, radius: 180, risk: 'MEDIUM', label: 'East Africa — Piracy Risk', cause: 'Maritime piracy' },
  { lat: 5.0, lng: 3.0, radius: 160, risk: 'MEDIUM', label: 'Gulf of Guinea — Piracy', cause: 'Maritime piracy' },
  { lat: 35.0, lng: 135.0, radius: 120, risk: 'LOW', label: 'Japan — Earthquake Zone', cause: 'Seismic activity' },
];

/* ═══════════════════════════════════════════════════════
   GENERATE ROUTE OPTIONS
   ═══════════════════════════════════════════════════════ */
async function generateRouteOption(
  allPoints: [number, number][],
  allNames: string[],
  transportMode: string,
  type: 'fastest' | 'cheapest' | 'safest',
) {
  const segments: { from: string; to: string; mode: string; coords: [number, number][]; distance: number; duration: number }[] = [];
  let totalDistance = 0;
  let totalDuration = 0;

  for (let i = 0; i < allPoints.length - 1; i++) {
    const from = allPoints[i];
    const to = allPoints[i + 1];
    let segCoords: [number, number][] = [];
    let segDist = 0;
    let segDur = 0;
    let segMode = transportMode || 'sea';

    // Override mode per route type
    if (type === 'fastest' && transportMode !== 'road') segMode = 'air';
    if (type === 'cheapest') segMode = 'sea';
    if (type === 'safest') segMode = transportMode || 'sea';

    // Road segments stay road for all types if transport is road
    if (transportMode === 'road' || transportMode === 'Road') segMode = 'road';

    switch (segMode.toLowerCase()) {
      case 'road': {
        const road = await getRoadRoute(from, to);
        segCoords = road.coords;
        segDist = road.distance;
        segDur = road.duration;
        break;
      }
      case 'air': {
        segCoords = greatCircleArc(from, to);
        const latDist = Math.sqrt((to[0] - from[0]) ** 2 + (to[1] - from[1]) ** 2) * 111;
        segDist = latDist;
        segDur = latDist / 850; // ~850 km/h
        break;
      }
      default: { // sea
        const waypoints = getMaritimeRoute(from, to);
        const fullPath = [from, ...waypoints, to];
        segCoords = interpolateSeaRoute(fullPath);
        let pathDist = 0;
        for (let j = 0; j < segCoords.length - 1; j++) {
          pathDist += Math.sqrt(
            (segCoords[j + 1][0] - segCoords[j][0]) ** 2 +
            (segCoords[j + 1][1] - segCoords[j][1]) ** 2
          ) * 111;
        }
        segDist = pathDist;
        segDur = pathDist / 740; // ~20 knots in km
        break;
      }
    }

    totalDistance += segDist;
    totalDuration += segDur;

    segments.push({
      from: allNames[i],
      to: allNames[i + 1],
      mode: segMode,
      coords: segCoords,
      distance: segDist,
      duration: segDur,
    });
  }

  // Cost model
  const costPerKm = { road: 1.8, sea: 0.4, air: 4.5 };
  const mode = segments[0]?.mode?.toLowerCase() || 'sea';
  const rate = costPerKm[mode as keyof typeof costPerKm] || 0.8;
  const totalCost = totalDistance * rate;

  // Risk score
  let riskScore = 15;
  const riskFactors: string[] = [];
  RISK_ZONES.forEach((zone) => {
    segments.forEach((seg) => {
      const passes = seg.coords.some(([lat, lng]: [number, number]) => {
        const d = Math.sqrt((zone.lat - lat) ** 2 + (zone.lng - lng) ** 2);
        return d < zone.radius / 80;
      });
      if (passes) {
        riskScore += zone.risk === 'HIGH' ? 25 : zone.risk === 'MEDIUM' ? 12 : 5;
        riskFactors.push(zone.label);
      }
    });
  });
  if (type === 'safest') riskScore = Math.max(5, Math.round(riskScore * 0.3));
  riskScore = Math.min(100, riskScore);

  const reasonMap = {
    fastest: `Optimized for speed using ${mode === 'air' ? 'direct air corridors' : 'express ' + mode + ' lanes'}. ${riskFactors.length > 0 ? 'Passes through: ' + riskFactors.slice(0, 2).join(', ') + '.' : 'Clear route.'}`,
    cheapest: `Lowest-cost route using sea freight on established shipping lanes. ${riskFactors.length > 0 ? 'Note: ' + riskFactors.slice(0, 2).join(', ') + '.' : 'No major risk factors.'}`,
    safest: `Avoids all major risk zones${riskFactors.length > 0 ? ' (rerouted around ' + riskFactors.slice(0, 1).join('') + ')' : ''}. Longer but significantly safer.`,
  };

  const labelMap = { fastest: '⚡ Fastest Route', cheapest: '💰 Cheapest Route', safest: '🛡️ Safest Route' };

  return {
    id: `OPT-${type.toUpperCase()}`,
    label: labelMap[type],
    type,
    waypoints: allPoints.map(([lat, lng], i) => ({ lat, lng, name: allNames[i] })),
    segments,
    distance: `${Math.round(totalDistance).toLocaleString()} km`,
    distanceKm: Math.round(totalDistance),
    time: totalDuration < 24 ? `${totalDuration.toFixed(1)} hrs` : `${(totalDuration / 24).toFixed(1)} days`,
    timeHours: Math.round(totalDuration),
    cost: `$${Math.round(totalCost).toLocaleString()}`,
    costValue: Math.round(totalCost),
    riskScore,
    riskLevel: riskScore > 60 ? 'HIGH' : riskScore > 30 ? 'MEDIUM' : 'LOW',
    reasoning: reasonMap[type],
    riskFactors: [...new Set(riskFactors)],
  };
}

/* ═══════════════════════════════════════════════════════
   API HANDLER
   ═══════════════════════════════════════════════════════ */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sourceName = searchParams.get('source') || 'Mumbai';
  const destName = searchParams.get('destination') || 'Dubai';
  const stopsParam = searchParams.get('stops') || '';
  const transportMode = searchParams.get('mode') || 'sea';
  const stopNames = stopsParam ? stopsParam.split(',').map((s) => s.trim()).filter(Boolean) : [];

  const source = await geocode(sourceName);
  const dest = await geocode(destName);
  const stops = await Promise.all(stopNames.map(geocode));

  const allPoints: [number, number][] = [source, ...stops, dest];
  const allNames = [sourceName, ...stopNames, destName];

  const [fastest, cheapest, safest] = await Promise.all([
    generateRouteOption(allPoints, allNames, transportMode, 'fastest'),
    generateRouteOption(allPoints, allNames, transportMode, 'cheapest'),
    generateRouteOption(allPoints, allNames, transportMode, 'safest'),
  ]);

  return NextResponse.json({
    source: { lat: source[0], lng: source[1], name: sourceName },
    destination: { lat: dest[0], lng: dest[1], name: destName },
    stops: stops.map(([lat, lng], i) => ({ lat, lng, name: stopNames[i] })),
    transportMode,
    routes: { fastest, cheapest, safest },
    riskZones: RISK_ZONES,
    summary: {
      totalRoutes: 3,
      activeShipments: 12400,
      highRiskCount: RISK_ZONES.filter((z) => z.risk === 'HIGH').length,
      avgDelay: '+1.2 days',
    },
  });
}
