'use client';

import { useEffect, useRef } from 'react';

/* ── Risk-to-color ── */
function riskHex(score: number): string {
  if (score >= 70) return '#EF4444';
  if (score >= 40) return '#F59E0B';
  return '#22C55E';
}

/* ── Route colour palette ── */
const ROUTE_COLORS: Record<string, string> = {
  normal:   '#00F0FF',
  storm:    '#FBBF24',
  conflict: '#EF4444',
  optimal:  '#A78BFA',
};

interface SimMapProps {
  source:      { lat: number; lng: number; name: string };
  destination: { lat: number; lng: number; name: string };
  stops?:      { lat: number; lng: number; name: string }[];
  riskZones?:  { lat: number; lng: number; radius: number; risk: number; label: string }[];
  routes?:     { label: string; type: string; coords: [number, number][]; riskScore: number }[];
  activeType?: string;
}

/* ── Geocode known cities ── */
const GEO: Record<string, [number, number]> = {
  'mumbai': [18.96, 72.82], 'rotterdam': [51.92, 4.48], 'dubai': [25.2, 55.27],
  'singapore': [1.35, 103.82], 'shanghai': [31.23, 121.47], 'los angeles': [34.05, -118.24],
  'suez canal': [30.5, 32.35], 'cape of good hope': [-34.36, 18.47], 'hamburg': [53.55, 9.99],
  'tokyo': [35.68, 139.69], 'hong kong': [22.32, 114.17], 'buenos aires': [-34.6, -58.38],
};

function geocode(name: string): [number, number] {
  return GEO[name.toLowerCase()] ?? [20, 55];
}

export default function SimulationMap({ source, destination, stops = [], riskZones = [], routes = [], activeType }: SimMapProps) {
  const mapRef    = useRef<HTMLDivElement>(null);
  const mapObj    = useRef<L.Map | null>(null);
  const layersRef = useRef<L.Layer[]>([]);

  useEffect(() => {
    if (!mapRef.current) return;
    let L: typeof import('leaflet');
    let mounted = true;

    (async () => {
      L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');

      /* ── Init map once ── */
      if (!mapObj.current && mounted) {
        mapObj.current = L.map(mapRef.current!, {
          center:       [20, 55],
          zoom:         3,
          zoomControl:  false,
          attributionControl: false,
        });

        L.tileLayer(
          'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
          { subdomains: 'abcd', maxZoom: 19 },
        ).addTo(mapObj.current);

        L.control.zoom({ position: 'bottomright' }).addTo(mapObj.current);
      }

      const map = mapObj.current!;

      /* ── Clear previous layers ── */
      layersRef.current.forEach((l) => map.removeLayer(l));
      layersRef.current = [];

      const add = (l: L.Layer) => { l.addTo(map); layersRef.current.push(l); };

      /* ── Risk zone heat circles ── */
      riskZones.forEach((z) => {
        const col = riskHex(z.risk);
        const circle = L.circle([z.lat, z.lng], {
          radius:      z.radius * 50000,
          color:       col,
          fillColor:   col,
          fillOpacity: 0.12,
          weight:      1,
          opacity:     0.5,
        }).bindTooltip(`<b>${z.label}</b><br/>Risk: ${Math.round(z.risk)}/100`, { className: 'sim-tooltip' });
        add(circle);
      });

      /* ── Route polylines ── */
      routes.forEach((route) => {
        if (!route.coords.length) return;
        const color  = ROUTE_COLORS[route.type] ?? riskHex(route.riskScore);
        const isActive = route.type === activeType;
        const poly   = L.polyline(route.coords, {
          color,
          weight:    isActive ? 3.5 : 1.5,
          opacity:   isActive ? 0.95 : 0.35,
          dashArray: isActive ? undefined : '6 4',
        }).bindTooltip(`${route.label}<br/>Risk: ${Math.round(route.riskScore)}/100`);
        add(poly);

        /* animated dot on active route */
        if (isActive && route.coords.length > 1) {
          const mid = route.coords[Math.floor(route.coords.length / 2)];
          const dot = L.circleMarker(mid, {
            radius: 5, color, fillColor: color, fillOpacity: 1, weight: 2,
          }).bindTooltip(route.label);
          add(dot);
        }
      });

      /* ── Waypoint markers ── */
      const makePulse = (lat: number, lng: number, name: string, color: string) => {
        const icon = L.divIcon({
          className: '',
          html: `
            <div style="position:relative;width:24px;height:24px;">
              <div style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:0.25;animation:ping 2s cubic-bezier(0,0,0.2,1) infinite;"></div>
              <div style="position:absolute;inset:4px;border-radius:50%;background:${color};border:2px solid white;"></div>
            </div>`,
          iconSize:   [24, 24],
          iconAnchor: [12, 12],
        });
        return L.marker([lat, lng], { icon }).bindTooltip(name, { permanent: false });
      };

      add(makePulse(source.lat, source.lng, `📍 ${source.name}`, '#00F0FF'));
      stops.forEach((s) => add(makePulse(s.lat, s.lng, `🔶 ${s.name}`, '#FBBF24')));
      add(makePulse(destination.lat, destination.lng, `🎯 ${destination.name}`, '#22C55E'));

      /* ── Fit bounds ── */
      const all: [number, number][] = [
        [source.lat, source.lng],
        [destination.lat, destination.lng],
        ...stops.map((s) => [s.lat, s.lng] as [number, number]),
        ...riskZones.map((z) => [z.lat, z.lng] as [number, number]),
      ];
      if (all.length > 1) {
        map.fitBounds(L.latLngBounds(all), { padding: [60, 60] });
      }
    })();

    return () => { mounted = false; };
  }, [source, destination, stops, riskZones, routes, activeType]);

  return (
    <div ref={mapRef} className="w-full h-full"
      style={{ background: '#0B0F1A' }}
    />
  );
}
