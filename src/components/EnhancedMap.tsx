'use client';

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

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

interface EnhancedMapProps {
  source: Waypoint;
  destination: Waypoint;
  stops: Waypoint[];
  currentRoute: RouteOption | null;
  allRoutes: { fastest: RouteOption; cheapest: RouteOption; safest: RouteOption };
  activeRouteType: 'fastest' | 'cheapest' | 'safest';
  riskZones: RiskZone[];
  onZoneClick: (zone: RiskZone) => void;
}

/* ── Constants ── */
const ROUTE_COLORS: Record<string, string> = {
  fastest: '#00F0FF',
  cheapest: '#22C55E',
  safest: '#A78BFA',
};

const MODE_DASH: Record<string, number[]> = {
  road: [],        // solid
  sea: [8, 4],     // dashed
  air: [2, 6],     // dotted
};

/* ═══════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════ */
export default function EnhancedMap({
  source, destination, stops, currentRoute, allRoutes,
  activeRouteType, riskZones, onZoneClick,
}: EnhancedMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const popupsRef = useRef<mapboxgl.Popup[]>([]);
  const animFrameRef = useRef<number | null>(null);

  /* ── Initialize map ONCE ── */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // STEP 2: Set token from env.
    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    
    // Prevent the Next.js red error screen by safely stopping here if there's no real token
    if (!token || token.includes('dummy')) {
      if (containerRef.current) {
        containerRef.current.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;width:100%;background:rgba(11,15,26,0.9);color:#ff4444;font-family:sans-serif;font-size:20px;font-weight:600;text-align:center;padding:20px;line-height:1.5;">Map is disabled.<br/>Create a free account at mapbox.com<br/>Paste your token into .env.local</div>';
      }
      return;
    }

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [60, 20],
      zoom: 3,
      minZoom: 2,
      maxZoom: 14,
      attributionControl: false,
      projection: 'mercator',
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');

    map.on('load', () => {
      mapRef.current = map;
      // Trigger layer update after map loads
      map.fire('sourcedata');
    });

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      markersRef.current.forEach((m) => m.remove());
      popupsRef.current.forEach((p) => p.remove());
      map.remove();
      mapRef.current = null;
    };
  }, []);

  /* ── Update layers whenever data changes ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) {
      // If style isn't ready yet, listen for it
      const onLoad = () => updateLayers();
      mapRef.current?.on('load', onLoad);
      return () => { mapRef.current?.off('load', onLoad); };
    }
    updateLayers();

    function updateLayers() {
      const map = mapRef.current;
      if (!map) return;

      // ── Clean previous ──
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      popupsRef.current.forEach((p) => p.remove());
      popupsRef.current = [];
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

      // Remove old sources/layers
      const layerIds = ['risk-zones-fill', 'risk-zones-outline'];
      const routeTypes: ('fastest' | 'cheapest' | 'safest')[] = ['fastest', 'cheapest', 'safest'];
      routeTypes.forEach((t) => {
        layerIds.push(`route-${t}-glow`, `route-${t}-line`);
      });
      layerIds.push('active-route-glow', 'active-route-line', 'active-route-arrows');
      layerIds.forEach((id) => {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      ['risk-zones', ...routeTypes.map((t) => `route-${t}`), 'active-route', 'active-route-arrow-source'].forEach((id) => {
        if (map.getSource(id)) map.removeSource(id);
      });

      /* ── RISK ZONES ── */
      const riskFeatures = riskZones.map((zone) => ({
        type: 'Feature' as const,
        properties: {
          risk: zone.risk,
          label: zone.label,
          cause: zone.cause,
          radius: zone.radius * 1000,
          color: zone.risk === 'HIGH' ? '#EF4444' : zone.risk === 'MEDIUM' ? '#F59E0B' : '#3B82F6',
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [zone.lng, zone.lat],
        },
      }));

      map.addSource('risk-zones', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: riskFeatures },
      });

      map.addLayer({
        id: 'risk-zones-fill',
        type: 'circle',
        source: 'risk-zones',
        paint: {
          'circle-radius': ['/', ['get', 'radius'], 5000],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.08,
          'circle-blur': 0.6,
        },
      });

      map.addLayer({
        id: 'risk-zones-outline',
        type: 'circle',
        source: 'risk-zones',
        paint: {
          'circle-radius': ['/', ['get', 'radius'], 5000],
          'circle-color': 'transparent',
          'circle-stroke-color': ['get', 'color'],
          'circle-stroke-width': 1,
          'circle-stroke-opacity': 0.25,
        },
      });

      // Risk zone click
      map.on('click', 'risk-zones-fill', (e) => {
        if (e.features?.[0]) {
          const props = e.features[0].properties;
          if (props) {
            onZoneClick({
              lat: (e.features[0].geometry as any).coordinates[1],
              lng: (e.features[0].geometry as any).coordinates[0],
              radius: props.radius / 1000,
              risk: props.risk,
              label: props.label,
              cause: props.cause,
            });
          }
        }
      });

      map.on('mouseenter', 'risk-zones-fill', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'risk-zones-fill', () => { map.getCanvas().style.cursor = ''; });

      /* ── BACKGROUND ROUTES (faded) ── */
      routeTypes.forEach((type) => {
        if (type === activeRouteType) return;
        const route = allRoutes[type];
        if (!route?.segments) return;

        const coords: [number, number][] = [];
        route.segments.forEach((seg) => {
          seg.coords.forEach(([lat, lng]) => coords.push([lng, lat]));
        });

        if (coords.length < 2) return;

        map.addSource(`route-${type}`, {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: coords },
          },
        });

        map.addLayer({
          id: `route-${type}-line`,
          type: 'line',
          source: `route-${type}`,
          paint: {
            'line-color': ROUTE_COLORS[type],
            'line-width': 1.5,
            'line-opacity': 0.15,
            'line-dasharray': [4, 4],
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
      });

      /* ── ACTIVE ROUTE (bright) ── */
      if (currentRoute?.segments) {
        const routeColor = ROUTE_COLORS[activeRouteType];
        const allCoords: [number, number][] = [];
        currentRoute.segments.forEach((seg) => {
          seg.coords.forEach(([lat, lng]) => allCoords.push([lng, lat]));
        });

        if (allCoords.length >= 2) {
          map.addSource('active-route', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: allCoords },
            },
          });

          // Glow layer
          map.addLayer({
            id: 'active-route-glow',
            type: 'line',
            source: 'active-route',
            paint: {
              'line-color': routeColor,
              'line-width': 10,
              'line-opacity': 0.12,
              'line-blur': 4,
            },
            layout: { 'line-cap': 'round', 'line-join': 'round' },
          });

          // Main line
          const mode = currentRoute.segments[0]?.mode?.toLowerCase() || 'sea';
          const dashArr = MODE_DASH[mode] || MODE_DASH.sea;

          map.addLayer({
            id: 'active-route-line',
            type: 'line',
            source: 'active-route',
            paint: {
              'line-color': routeColor,
              'line-width': 3,
              'line-opacity': 0.9,
              ...(dashArr.length > 0 ? { 'line-dasharray': dashArr } : {}),
            },
            layout: { 'line-cap': 'round', 'line-join': 'round' },
          });

          /* ── Animated dot along route ── */
          const dotEl = document.createElement('div');
          dotEl.style.cssText = `width:12px;height:12px;border-radius:50%;background:${routeColor};box-shadow:0 0 12px ${routeColor},0 0 24px ${routeColor}40;`;
          const dotMarker = new mapboxgl.Marker({ element: dotEl })
            .setLngLat(allCoords[0])
            .addTo(map);
          markersRef.current.push(dotMarker);

          let dotIdx = 0;
          const speed = mode === 'air' ? 3 : mode === 'road' ? 2 : 1;
          function animateDot() {
            dotIdx = (dotIdx + speed) % allCoords.length;
            dotMarker.setLngLat(allCoords[dotIdx]);
            animFrameRef.current = requestAnimationFrame(animateDot);
          }
          animFrameRef.current = requestAnimationFrame(animateDot);

          /* ── Mode labels at segment midpoints ── */
          currentRoute.segments.forEach((seg) => {
            if (seg.coords.length < 2) return;
            const midIdx = Math.floor(seg.coords.length / 2);
            const [mLat, mLng] = seg.coords[midIdx];
            const modeIcon = seg.mode === 'road' ? '🛣️' : seg.mode === 'air' ? '✈️' : '🚢';

            const el = document.createElement('div');
            el.style.cssText = `font-size:10px;font-weight:600;color:${routeColor};text-shadow:0 1px 6px rgba(0,0,0,0.9);white-space:nowrap;pointer-events:none;opacity:0.7;`;
            el.textContent = `${modeIcon} ${seg.mode?.charAt(0).toUpperCase()}${seg.mode?.slice(1) || ''}`;

            const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
              .setLngLat([mLng, mLat])
              .addTo(map);
            markersRef.current.push(marker);
          });
        }
      }

      /* ── MARKERS ── */
      addPulseMarker(map, source, '#3B82F6', '📍 Source', 'SOURCE');
      stops.forEach((stop, i) => {
        addPulseMarker(map, stop, '#F59E0B', `📦 Stop ${i + 1}`, `STOP ${i + 1}`);
      });
      addPulseMarker(map, destination, '#22C55E', '🏁 Destination', 'DESTINATION');

      /* ── FIT BOUNDS ── */
      const allPts: [number, number][] = [
        [source.lng, source.lat],
        ...stops.map((s) => [s.lng, s.lat] as [number, number]),
        [destination.lng, destination.lat],
      ];
      if (allPts.length >= 2) {
        const bounds = new mapboxgl.LngLatBounds();
        allPts.forEach((p) => bounds.extend(p));
        map.fitBounds(bounds, { padding: 80, maxZoom: 8, duration: 1200 });
      }
    }

    function addPulseMarker(map: mapboxgl.Map, point: Waypoint, color: string, title: string, subtitle: string) {
      // Pulse ring
      const pulseEl = document.createElement('div');
      pulseEl.style.cssText = `position:relative;width:32px;height:32px;`;
      pulseEl.innerHTML = `
        <div style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:0.2;animation:mapbox-pulse 2s ease-out infinite;"></div>
        <div style="position:absolute;top:8px;left:8px;width:16px;height:16px;border-radius:50%;background:${color};box-shadow:0 0 12px ${color},0 0 24px ${color}40;border:2.5px solid rgba(255,255,255,0.5);"></div>
      `;

      const marker = new mapboxgl.Marker({ element: pulseEl, anchor: 'center' })
        .setLngLat([point.lng, point.lat])
        .setPopup(new mapboxgl.Popup({ offset: 20, closeButton: false, className: 'mapbox-dark-popup' })
          .setHTML(`<div style="font-size:13px;font-weight:700;margin-bottom:3px;">${title}</div><div style="font-size:12px;opacity:0.85;">${point.name}</div>`))
        .addTo(map);
      markersRef.current.push(marker);

      // Label
      const labelEl = document.createElement('div');
      labelEl.style.cssText = `text-align:center;pointer-events:none;`;
      labelEl.innerHTML = `
        <div style="font-size:11px;font-weight:700;color:${color};text-shadow:0 0 8px rgba(0,0,0,0.9),0 2px 4px rgba(0,0,0,0.9);letter-spacing:0.05em;">${point.name}</div>
        <div style="font-size:9px;color:${color};opacity:0.6;text-shadow:0 0 6px rgba(0,0,0,0.9);">${subtitle}</div>
      `;

      const labelMarker = new mapboxgl.Marker({ element: labelEl, anchor: 'top', offset: [0, 12] })
        .setLngLat([point.lng, point.lat])
        .addTo(map);
      markersRef.current.push(labelMarker);
    }
  }, [source, destination, stops, currentRoute, allRoutes, activeRouteType, riskZones, onZoneClick]);

  return (
    <>
      <style jsx global>{`
        @keyframes mapbox-pulse {
          0% { transform: scale(1); opacity: 0.2; }
          100% { transform: scale(3); opacity: 0; }
        }
        .mapbox-dark-popup .mapboxgl-popup-content {
          background: rgba(11, 15, 26, 0.96) !important;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px;
          color: #fff;
          padding: 12px 16px;
          box-shadow: 0 8px 40px rgba(0,0,0,0.6);
          backdrop-filter: blur(16px);
        }
        .mapbox-dark-popup .mapboxgl-popup-tip {
          border-top-color: rgba(11, 15, 26, 0.96) !important;
        }
        .mapboxgl-ctrl-group {
          background: rgba(11, 15, 26, 0.92) !important;
          border: 1px solid rgba(255,255,255,0.06) !important;
          backdrop-filter: blur(8px);
        }
        .mapboxgl-ctrl-group button {
          color: rgba(255,255,255,0.5) !important;
        }
        .mapboxgl-ctrl-group button:hover {
          color: #00F0FF !important;
          background: rgba(11, 15, 26, 1) !important;
        }
        .mapboxgl-ctrl-group button + button {
          border-top-color: rgba(255,255,255,0.06) !important;
        }
        .mapboxgl-ctrl-attrib { display: none !important; }
      `}</style>
      <div ref={containerRef} className="w-full h-full" />
    </>
  );
}
