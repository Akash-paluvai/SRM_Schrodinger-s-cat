import { NextRequest, NextResponse } from 'next/server';

/* ── Geocoding dictionary (mock) ── */
const LOCATIONS: Record<string, [number, number]> = {
  'mumbai': [19.076, 72.8777],
  'delhi': [28.7041, 77.1025],
  'chennai': [13.0827, 80.2707],
  'kolkata': [22.5726, 88.3639],
  'bangalore': [12.9716, 77.5946],
  'shanghai': [31.2304, 121.4737],
  'beijing': [39.9042, 116.4074],
  'shenzhen': [22.5431, 114.0579],
  'hong kong': [22.3193, 114.1694],
  'tokyo': [35.6762, 139.6503],
  'osaka': [34.6937, 135.5023],
  'singapore': [1.3521, 103.8198],
  'dubai': [25.2048, 55.2708],
  'jeddah': [21.4858, 39.1925],
  'istanbul': [41.0082, 28.9784],
  'rotterdam': [51.9244, 4.4777],
  'hamburg': [53.5511, 9.9937],
  'antwerp': [51.2194, 4.4025],
  'london': [51.5074, -0.1278],
  'new york': [40.7128, -74.006],
  'los angeles': [33.9425, -118.408],
  'san francisco': [37.7749, -122.4194],
  'seattle': [47.6062, -122.3321],
  'vancouver': [49.2827, -123.1207],
  'dallas': [32.7767, -96.797],
  'chicago': [41.8781, -87.6298],
  'miami': [25.7617, -80.1918],
  'santos': [-23.9608, -46.3331],
  'buenos aires': [-34.6037, -58.3816],
  'cape town': [-33.9249, 18.4241],
  'nairobi': [-1.2921, 36.8219],
  'sydney': [-33.8688, 151.2093],
  'melbourne': [-37.8136, 144.9631],
  'busan': [35.1796, 129.0756],
};

function geocode(name: string): [number, number] {
  const key = name.toLowerCase().replace(/[,\s]+.*$/, '').trim();
  return LOCATIONS[key] || [20 + Math.random() * 40, 40 + Math.random() * 80];
}

/* ── Risk zones (realistic global) ── */
const GLOBAL_RISK_ZONES = [
  { lat: 22.0, lng: 115.0, radius: 400, risk: 'HIGH', label: 'South China Sea — Typhoon Zone', cause: 'Cyclonic activity' },
  { lat: 15.5, lng: 43.0, radius: 300, risk: 'HIGH', label: 'Red Sea — Conflict Zone', cause: 'Armed conflict / shipping attacks' },
  { lat: -24.0, lng: -46.0, radius: 200, risk: 'MEDIUM', label: 'Santos Port — Congestion', cause: 'Port congestion' },
  { lat: 49.0, lng: -123.5, radius: 150, risk: 'MEDIUM', label: 'Vancouver — Congestion', cause: 'Port delays' },
  { lat: 30.0, lng: 32.5, radius: 250, risk: 'MEDIUM', label: 'Suez Canal — Bottleneck', cause: 'Passage delays' },
  { lat: 10.0, lng: -80.0, radius: 200, risk: 'LOW', label: 'Panama Canal — Drought Risk', cause: 'Water level restrictions' },
  { lat: 55.0, lng: 20.0, radius: 350, risk: 'HIGH', label: 'Baltic Sea — Conflict Zone', cause: 'Geopolitical tensions' },
  { lat: -5.0, lng: 40.0, radius: 180, risk: 'MEDIUM', label: 'East Africa — Piracy Risk', cause: 'Maritime piracy' },
];

/* ── Generate route options ── */
function generateRoutes(
  source: [number, number],
  dest: [number, number],
  stops: [number, number][],
  sourceName: string,
  destName: string,
  stopNames: string[],
) {
  const allPoints = [source, ...stops, dest];
  const allNames = [sourceName, ...stopNames, destName];

  // Calculate base distance (rough nautical miles)
  let totalDist = 0;
  for (let i = 0; i < allPoints.length - 1; i++) {
    const [lat1, lng1] = allPoints[i];
    const [lat2, lng2] = allPoints[i + 1];
    totalDist += Math.sqrt((lat2 - lat1) ** 2 + (lng2 - lng1) ** 2) * 60;
  }

  const baseTime = totalDist / 400; // ~400 nm/day for sea
  const baseCost = totalDist * 12; // $12/nm

  // Check which risk zones the route passes through
  const routeRisks = GLOBAL_RISK_ZONES.filter((zone) => {
    return allPoints.some(([lat, lng]) => {
      const dist = Math.sqrt((zone.lat - lat) ** 2 + (zone.lng - lng) ** 2);
      return dist < zone.radius / 50;
    });
  });

  const riskScore = Math.min(100, routeRisks.reduce((acc, z) => acc + (z.risk === 'HIGH' ? 30 : z.risk === 'MEDIUM' ? 15 : 5), 10));

  return {
    fastest: {
      id: 'OPT-FAST',
      label: 'Fastest Route',
      type: 'fastest',
      waypoints: allPoints.map(([lat, lng], i) => ({ lat, lng, name: allNames[i] })),
      distance: `${Math.round(totalDist)} nm`,
      time: `${baseTime.toFixed(1)} days`,
      cost: `$${Math.round(baseCost).toLocaleString()}`,
      riskScore: Math.min(100, riskScore + 15),
      riskLevel: riskScore + 15 > 60 ? 'HIGH' : riskScore + 15 > 30 ? 'MEDIUM' : 'LOW',
      reasoning: 'Shortest path through major shipping lanes. Higher risk due to congestion zones.',
      segments: allPoints.slice(0, -1).map((p, i) => ({
        from: allNames[i],
        to: allNames[i + 1],
        coords: [p, allPoints[i + 1]],
      })),
    },
    cheapest: {
      id: 'OPT-CHEAP',
      label: 'Cheapest Route',
      type: 'cheapest',
      waypoints: allPoints.map(([lat, lng], i) => ({ lat, lng, name: allNames[i] })),
      distance: `${Math.round(totalDist * 1.15)} nm`,
      time: `${(baseTime * 1.3).toFixed(1)} days`,
      cost: `$${Math.round(baseCost * 0.75).toLocaleString()}`,
      riskScore: Math.max(5, riskScore - 10),
      riskLevel: riskScore - 10 > 60 ? 'HIGH' : riskScore - 10 > 30 ? 'MEDIUM' : 'LOW',
      reasoning: 'Avoids premium lanes and congested ports. Longer but 25% cheaper.',
      segments: allPoints.slice(0, -1).map((p, i) => ({
        from: allNames[i],
        to: allNames[i + 1],
        coords: [p, allPoints[i + 1]],
      })),
    },
    safest: {
      id: 'OPT-SAFE',
      label: 'Safest Route',
      type: 'safest',
      waypoints: allPoints.map(([lat, lng], i) => ({ lat, lng, name: allNames[i] })),
      distance: `${Math.round(totalDist * 1.25)} nm`,
      time: `${(baseTime * 1.5).toFixed(1)} days`,
      cost: `$${Math.round(baseCost * 1.1).toLocaleString()}`,
      riskScore: Math.max(5, Math.round(riskScore * 0.3)),
      riskLevel: 'LOW',
      reasoning: 'Avoids all risk zones. Reroutes around conflict areas and weather disturbances.',
      segments: allPoints.slice(0, -1).map((p, i) => ({
        from: allNames[i],
        to: allNames[i + 1],
        coords: [p, allPoints[i + 1]],
      })),
    },
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sourceName = searchParams.get('source') || 'Shanghai';
  const destName = searchParams.get('destination') || 'Los Angeles';
  const stopsParam = searchParams.get('stops') || '';
  const stopNames = stopsParam ? stopsParam.split(',').map((s) => s.trim()).filter(Boolean) : [];

  const source = geocode(sourceName);
  const dest = geocode(destName);
  const stops = stopNames.map(geocode);

  const routes = generateRoutes(source, dest, stops, sourceName, destName, stopNames);

  return NextResponse.json({
    source: { lat: source[0], lng: source[1], name: sourceName },
    destination: { lat: dest[0], lng: dest[1], name: destName },
    stops: stops.map(([lat, lng], i) => ({ lat, lng, name: stopNames[i] })),
    routes,
    riskZones: GLOBAL_RISK_ZONES,
    summary: {
      totalRoutes: 3,
      activeShipments: 12400,
      highRiskCount: GLOBAL_RISK_ZONES.filter((z) => z.risk === 'HIGH').length,
      avgDelay: '+1.2 days',
    },
  });
}
