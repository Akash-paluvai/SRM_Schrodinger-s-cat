'use client';

import { useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/* ═══════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════ */
interface Waypoint { lat: number; lng: number; name: string }
interface Segment { from: string; to: string; coords: [number, number][] }
interface RouteOption {
  id: string; label: string; type: string;
  waypoints: Waypoint[]; distance: string; time: string;
  cost: string; riskScore: number; riskLevel: string;
  reasoning: string; segments: Segment[];
}
interface RiskZone {
  lat: number; lng: number; radius: number;
  risk: string; label: string; cause: string;
}

interface LeafletMapProps {
  source: Waypoint;
  destination: Waypoint;
  stops: Waypoint[];
  currentRoute: RouteOption | null;
  allRoutes: { fastest: RouteOption; cheapest: RouteOption; safest: RouteOption };
  activeRouteType: 'fastest' | 'cheapest' | 'safest';
  riskZones: RiskZone[];
  onZoneClick: (zone: RiskZone) => void;
}

/* ── Route colors ── */
const ROUTE_COLORS: Record<string, string> = {
  fastest: '#00F0FF',
  cheapest: '#22C55E',
  safest: '#A78BFA',
};

/* ── Custom markers ── */
function createIcon(color: string, size: number = 14) {
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};box-shadow:0 0 10px ${color},0 0 20px ${color}40;border:2px solid rgba(255,255,255,0.3);"></div>`,
  });
}

function createPulseIcon(color: string) {
  return L.divIcon({
    className: '',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    html: `
      <div style="position:relative;width:20px;height:20px;">
        <div style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:0.3;animation:pulse-ring 2s ease-out infinite;"></div>
        <div style="position:absolute;top:5px;left:5px;width:10px;height:10px;border-radius:50%;background:${color};box-shadow:0 0 8px ${color};border:2px solid rgba(255,255,255,0.4);"></div>
      </div>
      <style>@keyframes pulse-ring{0%{transform:scale(1);opacity:0.3}100%{transform:scale(2.5);opacity:0}}</style>
    `,
  });
}

function createLabelIcon(name: string, color: string) {
  return L.divIcon({
    className: '',
    iconSize: [100, 30],
    iconAnchor: [50, -8],
    html: `<div style="text-align:center;font-size:10px;font-weight:600;color:${color};text-shadow:0 0 6px rgba(0,0,0,0.8),0 1px 3px rgba(0,0,0,0.9);white-space:nowrap;letter-spacing:0.05em;">${name}</div>`,
  });
}

/* ── Curved line generator ── */
function getCurvedPoints(from: [number, number], to: [number, number], offset: number = 0): L.LatLng[] {
  const points: L.LatLng[] = [];
  const [lat1, lng1] = from;
  const [lat2, lng2] = to;

  // Handle lng wrapping for cross-Pacific routes
  let adjustedLng2 = lng2;
  if (Math.abs(lng2 - lng1) > 180) {
    adjustedLng2 = lng2 > lng1 ? lng2 - 360 : lng2 + 360;
  }

  const midLat = (lat1 + lat2) / 2;
  const midLng = (lng1 + adjustedLng2) / 2;
  const dist = Math.sqrt((lat2 - lat1) ** 2 + (adjustedLng2 - lng1) ** 2);
  const curvature = dist * 0.15 + offset * 3;

  // Perpendicular offset direction
  const dx = adjustedLng2 - lng1;
  const dy = lat2 - lat1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const controlLat = midLat + (-dx / len) * curvature;
  const controlLng = midLng + (dy / len) * curvature;

  const steps = 50;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lat = (1 - t) * (1 - t) * lat1 + 2 * (1 - t) * t * controlLat + t * t * lat2;
    const lng = (1 - t) * (1 - t) * lng1 + 2 * (1 - t) * t * controlLng + t * t * lng2;
    points.push(L.latLng(lat, lng));
  }
  return points;
}

/* ═══════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════ */
export default function LeafletMap({
  source, destination, stops, currentRoute, allRoutes,
  activeRouteType, riskZones, onZoneClick,
}: LeafletMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);

  /* ── Initialize map ── */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [20, 40],
      zoom: 3,
      minZoom: 2,
      maxZoom: 10,
      zoomControl: false,
      attributionControl: false,
    });

    // Dark tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    // Zoom control (bottom-right)
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    mapRef.current = map;
    layersRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  /* ── Update map layers whenever data changes ── */
  useEffect(() => {
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!map || !layers) return;

    layers.clearLayers();

    const allWaypoints: Waypoint[] = [source, ...stops, destination];

    /* ── Risk zones ── */
    riskZones.forEach((zone) => {
      const fillColor = zone.risk === 'HIGH' ? '#EF4444' : zone.risk === 'MEDIUM' ? '#F59E0B' : '#3B82F6';
      const circle = L.circle([zone.lat, zone.lng], {
        radius: zone.radius * 1000,
        color: fillColor,
        fillColor,
        fillOpacity: 0.12,
        weight: 1,
        opacity: 0.4,
        dashArray: '4 4',
      });
      circle.on('click', () => onZoneClick(zone));
      circle.bindTooltip(
        `<div style="font-size:10px;font-weight:600;color:${fillColor}">${zone.risk} RISK</div><div style="font-size:11px;color:#fff">${zone.label}</div>`,
        { direction: 'top', className: 'risk-tooltip' }
      );
      layers.addLayer(circle);
    });

    /* ── Background routes (faded) ── */
    const routeTypes: ('fastest' | 'cheapest' | 'safest')[] = ['fastest', 'cheapest', 'safest'];
    routeTypes.forEach((type) => {
      if (type === activeRouteType) return;
      const route = allRoutes[type];
      if (!route) return;
      const wp = route.waypoints;
      for (let i = 0; i < wp.length - 1; i++) {
        const offset = type === 'cheapest' ? 2 : type === 'safest' ? -2 : 0;
        const curved = getCurvedPoints([wp[i].lat, wp[i].lng], [wp[i + 1].lat, wp[i + 1].lng], offset);
        L.polyline(curved, {
          color: ROUTE_COLORS[type],
          weight: 1.5,
          opacity: 0.2,
          dashArray: '6 6',
        }).addTo(layers);
      }
    });

    /* ── Active route (bright) ── */
    if (currentRoute) {
      const wp = currentRoute.waypoints;
      const routeColor = ROUTE_COLORS[activeRouteType];

      for (let i = 0; i < wp.length - 1; i++) {
        const curved = getCurvedPoints([wp[i].lat, wp[i].lng], [wp[i + 1].lat, wp[i + 1].lng], 0);

        // Glow line (wider, faded)
        L.polyline(curved, {
          color: routeColor,
          weight: 8,
          opacity: 0.15,
          lineCap: 'round',
        }).addTo(layers);

        // Main line
        L.polyline(curved, {
          color: routeColor,
          weight: 2.5,
          opacity: 0.9,
          lineCap: 'round',
        }).addTo(layers);

        // Animated dot along route
        const animDot = L.marker(curved[0], { icon: createIcon(routeColor, 8) });
        layers.addLayer(animDot);

        let dotIdx = 0;
        const animInterval = setInterval(() => {
          dotIdx = (dotIdx + 1) % curved.length;
          animDot.setLatLng(curved[dotIdx]);
        }, 80);

        // Clean up interval when layers change
        layers.on('remove', () => clearInterval(animInterval));
      }
    }

    /* ── Markers ── */
    // Source marker (blue + pulse)
    const srcPulse = L.marker([source.lat, source.lng], { icon: createPulseIcon('#3B82F6') });
    const srcLabel = L.marker([source.lat, source.lng], { icon: createLabelIcon(source.name, '#3B82F6'), interactive: false });
    srcPulse.bindPopup(`<div style="font-size:12px;font-weight:600;color:#0B0F1A">📍 Source</div><div style="font-size:11px;color:#333">${source.name}</div>`);
    layers.addLayer(srcPulse);
    layers.addLayer(srcLabel);

    // Stop markers (yellow + pulse)
    stops.forEach((stop, i) => {
      const stopPulse = L.marker([stop.lat, stop.lng], { icon: createPulseIcon('#F59E0B') });
      const stopLabel = L.marker([stop.lat, stop.lng], { icon: createLabelIcon(stop.name, '#F59E0B'), interactive: false });
      stopPulse.bindPopup(`<div style="font-size:12px;font-weight:600;color:#0B0F1A">📦 Stop ${i + 1}</div><div style="font-size:11px;color:#333">${stop.name}</div>`);
      layers.addLayer(stopPulse);
      layers.addLayer(stopLabel);
    });

    // Destination marker (green + pulse)
    const dstPulse = L.marker([destination.lat, destination.lng], { icon: createPulseIcon('#22C55E') });
    const dstLabel = L.marker([destination.lat, destination.lng], { icon: createLabelIcon(destination.name, '#22C55E'), interactive: false });
    dstPulse.bindPopup(`<div style="font-size:12px;font-weight:600;color:#0B0F1A">🏁 Destination</div><div style="font-size:11px;color:#333">${destination.name}</div>`);
    layers.addLayer(dstPulse);
    layers.addLayer(dstLabel);

    /* ── Fit bounds ── */
    if (allWaypoints.length >= 2) {
      const bounds = L.latLngBounds(allWaypoints.map((w) => [w.lat, w.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 6 });
    }
  }, [source, destination, stops, currentRoute, allRoutes, activeRouteType, riskZones, onZoneClick]);

  return (
    <>
      <style jsx global>{`
        .risk-tooltip {
          background: rgba(11, 15, 26, 0.95) !important;
          border: 1px solid rgba(255,255,255,0.08) !important;
          border-radius: 8px !important;
          padding: 6px 10px !important;
          box-shadow: 0 4px 20px rgba(0,0,0,0.5) !important;
        }
        .risk-tooltip::before {
          border-top-color: rgba(11, 15, 26, 0.95) !important;
        }
        .leaflet-popup-content-wrapper {
          background: rgba(11, 15, 26, 0.95) !important;
          border: 1px solid rgba(255,255,255,0.08) !important;
          border-radius: 10px !important;
          color: #fff !important;
          box-shadow: 0 4px 30px rgba(0,0,0,0.5) !important;
        }
        .leaflet-popup-content-wrapper div {
          color: #fff !important;
        }
        .leaflet-popup-tip {
          background: rgba(11, 15, 26, 0.95) !important;
        }
        .leaflet-popup-close-button {
          color: rgba(255,255,255,0.5) !important;
        }
        .leaflet-control-zoom a {
          background: rgba(11, 15, 26, 0.9) !important;
          color: rgba(255,255,255,0.6) !important;
          border-color: rgba(255,255,255,0.08) !important;
        }
        .leaflet-control-zoom a:hover {
          background: rgba(11, 15, 26, 1) !important;
          color: #00F0FF !important;
        }
      `}</style>
      <div ref={containerRef} className="w-full h-full" />
    </>
  );
}
