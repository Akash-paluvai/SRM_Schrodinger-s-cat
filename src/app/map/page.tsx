'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import GlassPanel from '@/components/GlassPanel';
import { MetricCard, StatusBadge } from '@/components/ui';
import { useAppStore } from '@/lib/store';

/* ═══════════════════════════════════════════════════════
   DYNAMIC IMPORTS (no SSR for Leaflet)
   ═══════════════════════════════════════════════════════ */
const OldLeafletMap = dynamic(() => import('../../components/LeafletMap') as any, { ssr: false }) as any;
const EnhancedMap = dynamic(() => import('../../components/EnhancedMap') as any, { ssr: false }) as any;

/* ═══════════════════════════════════════════════════════
   TYPES (Enhanced)
   ═══════════════════════════════════════════════════════ */
interface Waypoint { lat: number; lng: number; name: string }
interface RouteSegment {
  from: string; to: string; mode: string;
  coords: [number, number][]; distance: number; duration: number;
}
interface EnhancedRouteOption {
  id: string; label: string; type: string;
  waypoints: Waypoint[]; segments: RouteSegment[];
  distance: string; distanceKm: number;
  time: string; timeHours: number;
  cost: string; costValue: number;
  riskScore: number; riskLevel: string;
  reasoning: string; riskFactors: string[];
}
interface RiskZone {
  lat: number; lng: number; radius: number;
  risk: string; label: string; cause: string;
}
interface EnhancedMapData {
  source: Waypoint; destination: Waypoint;
  stops: Waypoint[]; transportMode: string;
  routes: { fastest: EnhancedRouteOption; cheapest: EnhancedRouteOption; safest: EnhancedRouteOption };
  riskZones: RiskZone[];
  summary: { totalRoutes: number; activeShipments: number; highRiskCount: number; avgDelay: string };
}

/* ── Old map types ── */
interface OldRouteOption {
  id: string; label: string; type: string;
  waypoints: Waypoint[]; distance: string; time: string;
  cost: string; riskScore: number; riskLevel: string;
  reasoning: string; segments: { from: string; to: string; coords: [number, number][] }[];
}
interface OldMapData {
  source: Waypoint; destination: Waypoint; stops: Waypoint[];
  routes: { fastest: OldRouteOption; cheapest: OldRouteOption; safest: OldRouteOption };
  riskZones: RiskZone[];
  summary: { totalRoutes: number; activeShipments: number; highRiskCount: number; avgDelay: string };
}

/* ═══════════════════════════════════════════════════════
   ROUTE TYPE CONFIG
   ═══════════════════════════════════════════════════════ */
const ROUTE_TYPES = [
  { key: 'fastest' as const, label: '⚡ Fastest', color: '#00F0FF' },
  { key: 'cheapest' as const, label: '💰 Cheapest', color: '#22C55E' },
  { key: 'safest' as const, label: '🛡️ Safest', color: '#A78BFA' },
];

/* ═══════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════ */
export default function MapPage() {
  const router = useRouter();
  const shipment = useAppStore((s) => s.shipment);

  /* ── Map mode toggle ── */
  const [mapMode, setMapMode] = useState<'enhanced' | 'old'>('enhanced');

  /* ── Enhanced map state ── */
  const [enhancedData, setEnhancedData] = useState<EnhancedMapData | null>(null);
  const [activeRoute, setActiveRoute] = useState<'fastest' | 'cheapest' | 'safest'>('fastest');
  const [showRiskZones, setShowRiskZones] = useState(true);
  const [selectedZone, setSelectedZone] = useState<RiskZone | null>(null);
  const [aiMode, setAiMode] = useState(false);

  /* ── Old map state ── */
  const [oldData, setOldData] = useState<OldMapData | null>(null);

  /* ── Fetch enhanced map data ── */
  useEffect(() => {
    const params = new URLSearchParams();
    if (shipment) {
      params.set('source', shipment.source || 'Mumbai');
      params.set('destination', shipment.destination || 'Dubai');
      params.set('mode', shipment.transportMode || 'sea');
      if (shipment.stops.length > 0) {
        params.set('stops', shipment.stops.map((s) => s.location).filter(Boolean).join(','));
      }
    }
    fetch(`/api/enhanced-map-data?${params.toString()}`)
      .then((r) => r.json())
      .then(setEnhancedData);
  }, [shipment]);

  /* ── Fetch old map data (lazy) ── */
  useEffect(() => {
    if (mapMode !== 'old' || oldData) return;
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
      .then(setOldData);
  }, [mapMode, oldData, shipment]);

  /* ── AI auto-select ── */
  useEffect(() => {
    if (aiMode && enhancedData) {
      const r = enhancedData.routes;
      if (r.safest.riskScore < 15) setActiveRoute('safest');
      else if (r.cheapest.riskScore < 35) setActiveRoute('cheapest');
      else setActiveRoute('fastest');
    }
  }, [aiMode, enhancedData]);

  const currentEnhancedRoute = enhancedData?.routes[activeRoute] || null;
  const currentOldRoute = oldData?.routes[activeRoute] || null;
  const isEnhanced = mapMode === 'enhanced';
  const data = isEnhanced ? enhancedData : oldData;

  if (!data && isEnhanced && !enhancedData) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-14 pb-14">
        <div className="text-text-muted text-sm font-mono animate-pulse">Initializing global map...</div>
      </div>
    );
  }

  return (
    <main className="min-h-screen pt-14 pb-14 relative">
      <div className="w-full h-[calc(100vh-112px)] relative overflow-hidden">

        {/* ── MAP RENDERING ── */}
        {isEnhanced && enhancedData ? (
          <EnhancedMap
            source={enhancedData.source}
            destination={enhancedData.destination}
            stops={enhancedData.stops}
            currentRoute={currentEnhancedRoute}
            allRoutes={enhancedData.routes}
            activeRouteType={activeRoute}
            riskZones={showRiskZones ? enhancedData.riskZones : []}
            onZoneClick={setSelectedZone}
          />
        ) : oldData ? (
          <OldLeafletMap
            source={oldData.source}
            destination={oldData.destination}
            stops={oldData.stops}
            currentRoute={currentOldRoute}
            allRoutes={oldData.routes}
            activeRouteType={activeRoute}
            riskZones={showRiskZones ? oldData.riskZones : []}
            onZoneClick={setSelectedZone}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-text-muted text-sm font-mono animate-pulse">Loading map...</div>
          </div>
        )}

        {/* ── MAP MODE TOGGLE (top-center) ── */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000]"
        >
          <div className="glass flex rounded-lg overflow-hidden">
            {(['enhanced', 'old'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setMapMode(mode)}
                className={`px-4 py-2 text-[10px] font-semibold uppercase tracking-wider transition-all cursor-pointer ${
                  mapMode === mode
                    ? 'bg-neon-blue/15 text-neon-blue'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {mode === 'enhanced' ? '🗺️ Enhanced Map' : '📍 Classic Map'}
              </button>
            ))}
          </div>
        </motion.div>

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
                const route = isEnhanced ? enhancedData?.routes[rt.key] : oldData?.routes[rt.key];
                if (!route) return null;
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
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: rt.color }} />
                      <span className="text-xs font-medium text-text-primary">{rt.label}</span>
                    </div>
                    <span className="text-[10px] font-mono text-text-muted">{route.time}</span>
                  </button>
                );
              })}
            </div>

            {/* Controls */}
            <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-text-muted uppercase tracking-wider">Risk Overlay</span>
                <button
                  onClick={() => setShowRiskZones(!showRiskZones)}
                  className={`w-8 h-4 rounded-full transition-all cursor-pointer ${showRiskZones ? 'bg-neon-blue/40' : 'bg-white/10'}`}
                >
                  <div className={`w-3 h-3 rounded-full bg-white transition-transform ${showRiskZones ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-text-muted uppercase tracking-wider">AI Auto-Select</span>
                <button
                  onClick={() => setAiMode(!aiMode)}
                  className={`w-8 h-4 rounded-full transition-all cursor-pointer ${aiMode ? 'bg-risk-low/40' : 'bg-white/10'}`}
                >
                  <div className={`w-3 h-3 rounded-full bg-white transition-transform ${aiMode ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>

            {aiMode && (
              <div className="mt-2 px-2 py-1.5 rounded bg-risk-low/10 border border-risk-low/20">
                <div className="text-[9px] text-risk-low font-mono">AI SELECTED: {activeRoute.toUpperCase()}</div>
              </div>
            )}

            {/* Transport mode indicator (enhanced only) */}
            {isEnhanced && enhancedData && (
              <div className="mt-3 pt-3 border-t border-white/5">
                <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">Transport Modes</div>
                <div className="flex gap-3">
                  {['🛣️ Road', '🚢 Sea', '✈️ Air'].map((m) => (
                    <span key={m} className="text-[9px] text-text-secondary">{m}</span>
                  ))}
                </div>
              </div>
            )}
          </GlassPanel>
        </motion.div>

        {/* ── ROUTE DETAIL PANEL (right side) ── */}
        {(isEnhanced ? currentEnhancedRoute : currentOldRoute) && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="absolute top-4 right-4 z-[1000] w-72"
          >
            <GlassPanel className="p-4">
              {(() => {
                const route = isEnhanced ? currentEnhancedRoute! : currentOldRoute!;
                const src = isEnhanced ? enhancedData!.source : oldData!.source;
                const dst = isEnhanced ? enhancedData!.destination : oldData!.destination;
                const stp = isEnhanced ? enhancedData!.stops : oldData!.stops;

                return (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] uppercase tracking-widest text-text-muted font-semibold">Route Summary</span>
                      <StatusBadge level={route.riskLevel === 'HIGH' ? 'high' : route.riskLevel === 'MEDIUM' ? 'medium' : 'low'} />
                    </div>

                    <div className="text-sm font-heading font-bold text-text-primary mb-1">{route.label}</div>
                    <div className="text-[10px] text-text-muted mb-3">
                      {src.name} → {stp.map((s) => s.name).join(' → ')}{stp.length > 0 ? ' → ' : ''}{dst.name}
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <MetricCard label="Distance" value={route.distance} color="text-neon-cyan" />
                      <MetricCard label="Time" value={route.time} color="text-neon-blue" />
                      <MetricCard label="Cost" value={route.cost} color="text-risk-low" />
                      <MetricCard label="Risk" value={`${route.riskScore}/100`} color={route.riskScore > 60 ? 'text-risk-high' : route.riskScore > 30 ? 'text-risk-medium' : 'text-risk-low'} />
                    </div>

                    {/* Transport breakdown (enhanced only) */}
                    {isEnhanced && currentEnhancedRoute?.segments && (
                      <div className="mb-3">
                        <div className="text-[10px] uppercase tracking-widest text-text-muted mb-2">Segments</div>
                        <div className="space-y-1">
                          {currentEnhancedRoute.segments.map((seg, i) => (
                            <div key={i} className="flex items-center justify-between text-[10px] px-2 py-1.5 rounded bg-white/[0.02] border border-white/[0.04]">
                              <div className="flex items-center gap-1.5">
                                <span>{seg.mode === 'road' ? '🛣️' : seg.mode === 'air' ? '✈️' : '🚢'}</span>
                                <span className="text-text-secondary">{seg.from} → {seg.to}</span>
                              </div>
                              <span className="text-text-muted font-mono">{Math.round(seg.distance)} km</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mb-3">
                      <div className="text-[10px] uppercase tracking-widest text-text-muted mb-1">AI Reasoning</div>
                      <p className="text-xs text-text-secondary leading-relaxed">{route.reasoning}</p>
                    </div>

                    {/* Risk factors (enhanced only) */}
                    {isEnhanced && currentEnhancedRoute?.riskFactors && currentEnhancedRoute.riskFactors.length > 0 && (
                      <div className="mb-3">
                        <div className="text-[10px] uppercase tracking-widest text-text-muted mb-1">Risk Factors</div>
                        {currentEnhancedRoute.riskFactors.map((f, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-[10px] text-risk-medium">
                            <span className="w-1 h-1 rounded-full bg-risk-medium" />
                            {f}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* System integration */}
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
                  </>
                );
              })()}
            </GlassPanel>
          </motion.div>
        )}

        {/* ── RISK ZONE POPUP ── */}
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
              <span className="text-[10px] text-text-muted">
                Mode: <span className="text-neon-blue font-mono">{isEnhanced ? 'ENHANCED' : 'CLASSIC'}</span>
              </span>
              {isEnhanced && enhancedData && (
                <span className="text-[10px] text-text-muted">
                  Transport: <span className="text-text-primary font-mono">{(enhancedData.transportMode || 'sea').toUpperCase()}</span>
                </span>
              )}
              <span className="text-[10px] text-text-muted">
                Risk Zones: <span className="text-risk-high font-mono">{(isEnhanced ? enhancedData : oldData)?.summary.highRiskCount || 0}</span>
              </span>
            </div>
            <div className="flex items-center gap-3">
              {shipment && (
                <span className="text-[10px] text-neon-cyan font-mono">
                  {shipment.source || 'Mumbai'} → {shipment.destination || 'Dubai'}
                </span>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </main>
  );
}
