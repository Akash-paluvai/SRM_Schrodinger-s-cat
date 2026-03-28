'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/* ═══════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════ */
interface Waypoint { lat: number; lng: number; name: string }
interface RouteSegment {
  from: string; to: string; mode: string;
  coords: [number, number][]; distance: number; duration: number;
}
interface RouteOption {
  id: string; label: string; type: string;
  waypoints: Waypoint[]; segments: RouteSegment[];
  distance: string; time: string; cost: string;
  riskScore: number; riskLevel: string; reasoning: string;
}
interface RiskZone {
  lat: number; lng: number; radius: number;
  risk: string; label: string; cause: string;
}

export interface ShipmentMapEntry {
  id: string;
  color: string;
  source: Waypoint;
  destination: Waypoint;
  stops: Waypoint[];
  route: RouteOption | null;
  riskZones: RiskZone[];
}

interface MultiShipmentMapProps {
  shipments: ShipmentMapEntry[];
}

/* ═══════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════ */
export default function MultiShipmentMap({ shipments }: MultiShipmentMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.Layer[]>([]);

  /* ── Init Leaflet map once ── */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [20, 60],
      zoom: 3,
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      { subdomains: 'abcd', maxZoom: 19 },
    ).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  /* ── Redraw shipment layers when data changes ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || shipments.length === 0) return;

    // Clear old layers
    layersRef.current.forEach((l) => l.remove());
    layersRef.current = [];

    const allLatLngs: L.LatLng[] = [];

    shipments.forEach((entry) => {
      const { color, source, destination, stops, route, riskZones } = entry;

      // ── Draw route segments ──
      if (route?.segments) {
        route.segments.forEach((seg) => {
          if (!seg.coords || seg.coords.length < 2) return;
          const lls = seg.coords.map(([lat, lng]) => L.latLng(lat, lng));
          allLatLngs.push(...lls);
          const dashArray =
            seg.mode === 'sea' ? '10 6' : seg.mode === 'air' ? '3 8' : undefined;
          const pl = L.polyline(lls, {
            color,
            weight: 3,
            opacity: 0.85,
            dashArray,
          }).addTo(map);
          layersRef.current.push(pl);
        });
      }

      // ── Waypoint markers (source, stops, destination) ──
      const points: { wp: Waypoint; type: 'source' | 'stop' | 'dest' }[] = [
        { wp: source, type: 'source' },
        ...stops.map((s) => ({ wp: s, type: 'stop' as const })),
        { wp: destination, type: 'dest' },
      ];

      points.forEach(({ wp, type }) => {
        if (!wp?.lat || !wp?.lng) return;
        const ll = L.latLng(wp.lat, wp.lng);
        allLatLngs.push(ll);

        const size = type === 'stop' ? 10 : 14;
        const border = type === 'source' ? 3 : type === 'dest' ? 3 : 2;
        const innerColor = type === 'source' ? color : type === 'dest' ? '#ffffff' : '#111827';

        const icon = L.divIcon({
          html: `<div style="
            width:${size}px;height:${size}px;border-radius:50%;
            background:${innerColor};border:${border}px solid ${color};
            box-shadow:0 0 8px ${color}88;
          "></div>`,
          className: '',
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });

        const marker = L.marker(ll, { icon })
          .addTo(map)
          .bindTooltip(
            `<span style="color:${color};font-weight:600;">${wp.name}</span>`,
            { direction: 'top', offset: [0, -8] },
          );
        layersRef.current.push(marker);
      });

      // ── Risk zones ──
      riskZones.forEach((zone) => {
        const zoneColor =
          zone.risk === 'HIGH' ? '#EF4444' :
          zone.risk === 'MEDIUM' ? '#F59E0B' : '#22C55E';

        const circle = L.circle([zone.lat, zone.lng], {
          radius: zone.radius * 1000,
          color: zoneColor,
          fillColor: zoneColor,
          fillOpacity: 0.07,
          weight: 1,
          opacity: 0.4,
        }).addTo(map)
          .bindTooltip(
            `<b style="color:${zoneColor}">${zone.risk}</b>: ${zone.label}<br><span style="font-size:10px">${zone.cause}</span>`,
            { direction: 'top' },
          );
        layersRef.current.push(circle);
      });
    });

    // Fit bounds to all plotted points
    if (allLatLngs.length > 0) {
      map.fitBounds(L.latLngBounds(allLatLngs), { padding: [40, 40] });
    }
  }, [shipments]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', background: '#0a0e1a' }}
    />
  );
}
