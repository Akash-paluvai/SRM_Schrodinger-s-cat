'use client';

import { memo, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import GlassPanel from '@/components/GlassPanel';
import { MetricCard, SectionLabel, StatusBadge } from '@/components/ui';
import { useAppStore } from '@/lib/store';

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
interface MapApiData {
  source: Waypoint; destination: Waypoint;
  stops: Waypoint[];
  routes: { fastest: RouteOption; cheapest: RouteOption; safest: RouteOption };
  riskZones: RiskZone[];
  summary: { totalRoutes: number; activeShipments: number; highRiskCount: number; avgDelay: string };
}

/* ═══════════════════════════════════════════════════════
   LEAFLET MAP COMPONENT (dynamic - no SSR)
   ═══════════════════════════════════════════════════════ */
const LeafletMap = dynamic(() => import('@/components/LeafletMap'), { ssr: false });

/* ═══════════════════════════════════════════════════════
   ROUTE TYPE CONFIG
   ═══════════════════════════════════════════════════════ */
const ROUTE_TYPES = [
  { key: 'fastest', label: '⚡ Fastest', color: '#00F0FF' },
  { key: 'cheapest', label: '💰 Cheapest', color: '#22C55E' },
  { key: 'safest', label: '🛡️ Safest', color: '#A78BFA' },
] as const;

/* ═══════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════ */
export default function MapPage() {
  const router = useRouter();
  const shipment = useAppStore((s) => s.shipment);
  const [data, setData] = useState<MapApiData | null>(null);
  const [activeRoute, setActiveRoute] = useState<'fastest' | 'cheapest' | 'safest'>('fastest');
  const [showRiskZones, setShowRiskZones] = useState(true);
  const [selectedZone, setSelectedZone] = useState<RiskZone | null>(null);
  const [aiMode, setAiMode] = useState(false);

  /* ── Fetch map data (integrated with /home shipment) ── */
  useEffect(() => {
    const params = new URLSearchParams();
    if (shipment) {
      params.set('source', shipment.source || 'Shanghai');
      params.set('destination', shipment.destination || 'Los Angeles');
      if (shipment.stops.length > 0) {
        params.set('stops', shipment.stops.map((s) => s.location).filter(Boolean).join(','));
      }
    }
    fetch(`/api/map-data?${params.toString()}`)
      .then((r) => r.json())
      .then(setData);
  }, [shipment]);

  /* ── AI auto-select ── */
  useEffect(() => {
    if (aiMode && data) {
      const routes = data.routes;
      let best: 'fastest' | 'cheapest' | 'safest' = 'fastest';
      if (routes.safest.riskScore < 20) best = 'safest';
      else if (routes.cheapest.riskScore < 40) best = 'cheapest';
      setActiveRoute(best);
    }
  }, [aiMode, data]);

  const currentRoute = data?.routes[activeRoute] || null;

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-14 pb-14">
        <div className="text-text-muted text-sm font-mono animate-pulse">Initializing global map...</div>
      </div>
    );
  }

  return (
    <main className="min-h-screen pt-14 pb-14 relative">
      <div className="w-full h-[calc(100vh-112px)] relative overflow-hidden">

        {/* ── LEAFLET MAP ── */}
        <LeafletMap
          source={data.source}
          destination={data.destination}
          stops={data.stops}
          currentRoute={currentRoute}
          allRoutes={data.routes}
          activeRouteType={activeRoute}
          riskZones={showRiskZones ? data.riskZones : []}
          onZoneClick={setSelectedZone}
        />

        {/* ── ROUTE SELECTOR (top-left) ── */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="absolute top-4 left-4 z-[1000]"
        >
          <GlassPanel className="p-4 w-64">
            <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-3">Route Options</div>
            <div className="space-y-1.5">
              {ROUTE_TYPES.map((rt) => {
                const route = data.routes[rt.key];
                return (
                  <button
                    key={rt.key}
                    onClick={() => { setActiveRoute(rt.key); setAiMode(false); }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-all cursor-pointer border ${
                      activeRoute === rt.key
                        ? 'border-neon-blue/30 bg-neon-blue/8'
                        : 'border-white/5 bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: rt.color }} />
                      <span className="text-xs font-medium text-text-primary">{rt.label}</span>
                    </div>
                    <span className="text-[10px] font-mono text-text-muted">{route.time}</span>
                  </button>
                );
              })}
            </div>

            {/* Controls */}
            <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-[10px] text-text-muted uppercase tracking-wider">Risk Overlay</span>
                <button
                  onClick={() => setShowRiskZones(!showRiskZones)}
                  className={`w-8 h-4 rounded-full transition-all ${showRiskZones ? 'bg-neon-blue/40' : 'bg-white/10'}`}
                >
                  <div className={`w-3 h-3 rounded-full bg-white transition-transform ${showRiskZones ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                </button>
              </label>
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-[10px] text-text-muted uppercase tracking-wider">AI Auto-Select</span>
                <button
                  onClick={() => setAiMode(!aiMode)}
                  className={`w-8 h-4 rounded-full transition-all ${aiMode ? 'bg-risk-low/40' : 'bg-white/10'}`}
                >
                  <div className={`w-3 h-3 rounded-full bg-white transition-transform ${aiMode ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                </button>
              </label>
            </div>

            {aiMode && (
              <div className="mt-2 px-2 py-1.5 rounded bg-risk-low/10 border border-risk-low/20">
                <div className="text-[9px] text-risk-low font-mono">AI SELECTED: {activeRoute.toUpperCase()}</div>
              </div>
            )}
          </GlassPanel>
        </motion.div>

        {/* ── ROUTE DETAIL PANEL (right side) ── */}
        {currentRoute && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="absolute top-4 right-4 z-[1000] w-72"
          >
            <GlassPanel className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] uppercase tracking-widest text-text-muted font-semibold">Route Summary</span>
                <StatusBadge level={currentRoute.riskLevel === 'HIGH' ? 'high' : currentRoute.riskLevel === 'MEDIUM' ? 'medium' : 'low'} />
              </div>

              <div className="text-sm font-heading font-bold text-text-primary mb-1">{currentRoute.label}</div>
              <div className="text-[10px] text-text-muted mb-3">
                {data.source.name} → {data.stops.map((s) => s.name).join(' → ')}{data.stops.length > 0 ? ' → ' : ''}{data.destination.name}
              </div>

              <div className="grid grid-cols-2 gap-2 mb-3">
                <MetricCard label="Distance" value={currentRoute.distance} color="text-neon-cyan" />
                <MetricCard label="Time" value={currentRoute.time} color="text-neon-blue" />
                <MetricCard label="Cost" value={currentRoute.cost} color="text-risk-low" />
                <MetricCard label="Risk" value={`${currentRoute.riskScore}/100`} color={currentRoute.riskScore > 60 ? 'text-risk-high' : currentRoute.riskScore > 30 ? 'text-risk-medium' : 'text-risk-low'} />
              </div>

              <div className="mb-3">
                <div className="text-[10px] uppercase tracking-widest text-text-muted mb-1">AI Reasoning</div>
                <p className="text-xs text-text-secondary leading-relaxed">{currentRoute.reasoning}</p>
              </div>

              {/* Segments */}
              <div className="mb-3">
                <div className="text-[10px] uppercase tracking-widest text-text-muted mb-2">Route Segments</div>
                <div className="space-y-1">
                  {currentRoute.segments.map((seg, i) => (
                    <div key={i} className="flex items-center gap-2 text-[10px]">
                      <div className="w-1 h-1 rounded-full bg-neon-cyan" />
                      <span className="text-text-secondary">{seg.from} → {seg.to}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* System integration buttons */}
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { label: 'Intelligence', route: '/intelligence' },
                  { label: 'Simulation', route: '/simulation' },
                  { label: 'Explain', route: '/explainability' },
                  { label: 'Graph', route: '/graph' },
                ].map((btn) => (
                  <button
                    key={btn.route}
                    onClick={() => router.push(btn.route)}
                    className="px-2 py-1.5 rounded-lg border border-white/5 bg-white/[0.02] text-[10px] text-text-muted hover:text-neon-blue hover:border-neon-blue/20 transition-all cursor-pointer text-center"
                  >
                    {btn.label} →
                  </button>
                ))}
              </div>
            </GlassPanel>
          </motion.div>
        )}

        {/* ── RISK ZONE DETAIL (bottom-right popup) ── */}
        <AnimatePresence>
          {selectedZone && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute bottom-20 right-4 z-[1000] w-64"
            >
              <GlassPanel className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <StatusBadge level={selectedZone.risk === 'HIGH' ? 'high' : selectedZone.risk === 'MEDIUM' ? 'medium' : 'low'} />
                  <button onClick={() => setSelectedZone(null)} className="text-text-muted hover:text-text-primary text-xs cursor-pointer">✕</button>
                </div>
                <div className="text-xs font-medium text-text-primary mb-1">{selectedZone.label}</div>
                <div className="text-[10px] text-text-secondary">{selectedZone.cause}</div>
              </GlassPanel>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── BOTTOM STATUS BAR ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="absolute bottom-4 left-4 right-4 z-[1000]"
        >
          <div className="flex items-center justify-between glass px-4 py-2.5 rounded-xl">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-risk-low animate-pulse" />
                <span className="text-[10px] font-mono text-text-muted">LIVE</span>
              </div>
              <span className="text-[10px] text-text-muted">Routes: <span className="text-text-primary font-mono">{data.summary.totalRoutes}</span></span>
              <span className="text-[10px] text-text-muted">Shipments: <span className="text-text-primary font-mono">{data.summary.activeShipments.toLocaleString()}</span></span>
              <span className="text-[10px] text-text-muted">High Risk: <span className="text-risk-high font-mono">{data.summary.highRiskCount}</span></span>
            </div>
            <div className="flex items-center gap-3">
              {shipment && (
                <span className="text-[10px] text-neon-cyan font-mono">
                  {shipment.source || 'Shanghai'} → {shipment.destination || 'Los Angeles'}
                </span>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </main>
  );
}
