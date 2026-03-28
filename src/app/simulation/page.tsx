'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import GlassPanel from '@/components/GlassPanel';
import { SectionLabel } from '@/components/ui';
import { useAppStore } from '@/lib/store';

/* ── Lazy-load the map (no SSR) ── */
const SimulationMap = dynamic(() => import('@/components/SimulationMap'), { ssr: false });

/* ═══════════════════════════════════════
   TYPES
   ═══════════════════════════════════════ */
interface AgentResult {
  agent: string;
  risk_score: number;
  confidence: number;
  reason: string;
}

interface PipelineData {
  step1_risk_assessment: {
    agents: AgentResult[];
    final_risk: number;
    risk_level: string;
    intelligence_state: {
      total_risk: number;
      volatility: number;
      trend: number;
      dominant_risk: string;
    };
  };
  step2_simulation: {
    expected_delay: number;
    p95_delay: number;
    probability_severe: number;
    worst_case_delay: number;
    disruption_frequency: Record<string, number>;
    sensitivity: Record<string, number>;
    scenario_delays?: number[];
    scenarios?: { scenario: string; delay: number; probability: number }[];
  };
  step3_game_theory: {
    payoff_matrix?: number[][];
    strategies?: string[];
    nash_equilibrium?: string;
    robust_route?: string;
    dominant_strategy?: string;
    expected_values?: Record<string, number>;
  };
  step4_decision: {
    best_route: string[];
    strategy: string;
    reasoning: string;
    qubo_result?: {
      optimal_route: string;
      qubo_energy: number;
      route_energies: { route: string; energy: number }[];
    };
  };
  step5_economic: {
    recommended_route?: { adjusted_cost: number; route: string[] };
    roi_estimate?: number;
    cost_breakdown?: Record<string, number>;
  };
  meta: { source: string; destination: string };
  db_insights: { type: string; data: Record<string, unknown> };
}

/* ═══════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════ */
const AGENT_META: Record<string, { icon: string; color: string }> = {
  weather:  { icon: '🌩️', color: '#60A5FA' },
  news:     { icon: '📰', color: '#F87171' },
  traffic:  { icon: '🚢', color: '#FBBF24' },
  supplier: { icon: '🏭', color: '#A78BFA' },
  demand:   { icon: '📈', color: '#34D399' },
};

function riskColor(s: number) {
  if (s >= 70) return '#EF4444';
  if (s >= 40) return '#F59E0B';
  return '#22C55E';
}

/* ── Geo lookup (same as SimulationMap) ── */
const GEO: Record<string, [number, number]> = {
  'mumbai':           [18.96, 72.82],
  'rotterdam':        [51.92, 4.48],
  'dubai':            [25.2,  55.27],
  'singapore':        [1.35,  103.82],
  'shanghai':         [31.23, 121.47],
  'los angeles':      [34.05, -118.24],
  'suez canal':       [30.5,  32.35],
  'cape of good hope':[-34.36, 18.47],
  'hamburg':          [53.55, 9.99],
  'tokyo':            [35.68, 139.69],
  'hong kong':        [22.32, 114.17],
  'buenos aires':     [-34.6, -58.38],
};
function geo(name: string): [number, number] {
  return GEO[name.toLowerCase()] ?? [20, 55];
}

/* ── Build map props from pipeline data ── */
function buildMapProps(data: PipelineData, shipment: ReturnType<typeof useAppStore.getState>['shipment']) {
  const src  = shipment?.source      || data.meta.source;
  const dst  = shipment?.destination || data.meta.destination;
  const rawStops: string[] = (shipment?.stops ?? []).map((s) => (typeof s === 'string' ? s : s.location));

  const [srcLat, srcLng] = geo(src);
  const [dstLat, dstLng] = geo(dst);

  const stops = rawStops.map((n) => {
    const [lat, lng] = geo(n);
    return { lat, lng, name: n };
  });

  /* risk zones from agent scores */
  const agents = data.step1_risk_assessment.agents;
  const zoneSeeds: [string, number][] = [
    ['Suez Canal',          agents.find(a => a.agent === 'traffic')?.risk_score  ?? 50],
    ['Dubai',               agents.find(a => a.agent === 'supplier')?.risk_score ?? 40],
    ['Singapore',           agents.find(a => a.agent === 'weather')?.risk_score  ?? 35],
    ['Mumbai',              agents.find(a => a.agent === 'news')?.risk_score      ?? 30],
    ['Cape of Good Hope',   agents.find(a => a.agent === 'demand')?.risk_score   ?? 25],
  ];
  const riskZones = zoneSeeds.map(([name, risk]) => {
    const [lat, lng] = geo(name);
    return { lat, lng, radius: 2 + risk / 25, risk, label: name };
  });

  /* synthetic routes */
  const midLat = (srcLat + dstLat) / 2;
  const midLng = (srcLng + dstLng) / 2;
  const routes = [
    {
      label: 'Normal Route',
      type: 'normal',
      coords: [[srcLat, srcLng], [midLat + 3, midLng], [dstLat, dstLng]] as [number,number][],
      riskScore: data.step1_risk_assessment.final_risk,
    },
    {
      label: 'Storm Diversion',
      type: 'storm',
      coords: [[srcLat, srcLng], [midLat - 5, midLng + 8], [dstLat, dstLng]] as [number,number][],
      riskScore: 55,
    },
    {
      label: 'Conflict-Free',
      type: 'conflict',
      coords: [[srcLat, srcLng], [midLat + 6, midLng - 5], [dstLat, dstLng]] as [number,number][],
      riskScore: 75,
    },
    {
      label: 'Optimal (QUBO)',
      type: 'optimal',
      coords: [[srcLat, srcLng], [midLat + 1, midLng + 2], [dstLat, dstLng]] as [number,number][],
      riskScore: 28,
    },
  ];

  return {
    source:      { lat: srcLat, lng: srcLng, name: src },
    destination: { lat: dstLat, lng: dstLng, name: dst },
    stops,
    riskZones,
    routes,
    activeType: 'optimal',
  };
}

/* ── Mini bar chart for Monte Carlo distribution ── */
function MCDistribution({ delays }: { delays: number[] }) {
  if (!delays.length) return null;
  const min = Math.min(...delays);
  const max = Math.max(...delays);
  const buckets = 12;
  const size = (max - min) / buckets || 1;
  const counts = Array.from({ length: buckets }, (_, i) => {
    const lo = min + i * size;
    const hi = lo + size;
    return delays.filter(d => d >= lo && d < hi).length;
  });
  const peak = Math.max(...counts);

  return (
    <div className="flex items-end gap-[2px] h-16 w-full">
      {counts.map((c, i) => {
        const pct = peak ? (c / peak) * 100 : 0;
        const delayVal = min + i * size;
        const col = riskColor(delayVal * 4); // map delay to risk color heuristic
        return (
          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
            <div
              className="w-full rounded-sm transition-all duration-500"
              style={{ height: `${pct}%`, background: col, opacity: 0.75 }}
            />
            <div className="absolute bottom-full mb-1 text-[9px] text-white bg-black/80 px-1 rounded hidden group-hover:block whitespace-nowrap">
              ~{delayVal.toFixed(1)}d ({c})
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Game theory heatmap ── */
function PayoffHeatmap({ matrix, strategies }: { matrix: number[][]; strategies: string[] }) {
  if (!matrix.length) return null;
  const flat = matrix.flat();
  const min = Math.min(...flat);
  const max = Math.max(...flat);
  const range = max - min || 1;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10px] border-collapse">
        <thead>
          <tr>
            <th className="p-1 text-left text-text-muted font-normal">Strategy</th>
            {strategies.map((s, i) => (
              <th key={i} className="p-1 text-center text-text-muted font-normal truncate max-w-[60px]">
                {s.length > 8 ? s.slice(0, 7) + '…' : s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, ri) => (
            <tr key={ri}>
              <td className="p-1 text-text-secondary truncate max-w-[80px]">
                {strategies[ri]?.length > 10 ? strategies[ri].slice(0, 9) + '…' : strategies[ri]}
              </td>
              {row.map((val, ci) => {
                const t = (val - min) / range;
                const bg = `rgba(${Math.round(239 - t * 150)}, ${Math.round(68 + t * 120)}, ${Math.round(68 + t * 110)}, 0.7)`;
                return (
                  <td key={ci} className="p-1 text-center font-mono rounded"
                    style={{ background: bg, color: 'white' }}>
                    {val.toFixed(1)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════ */
export default function SimulationPage() {
  const [data, setData]         = useState<PipelineData | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [savedToDb, setSavedToDb] = useState(false);
  const [activeTab, setActiveTab] = useState<'monte-carlo' | 'game-theory' | 'qubo'>('monte-carlo');
  const ran = useRef(false);

  const shipment    = useAppStore((s) => s.shipment);
  const shipmentDbId = useAppStore((s) => s.shipmentDbId);

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSavedToDb(false);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source:        shipment?.source        || 'Mumbai',
          destination:   shipment?.destination   || 'Rotterdam',
          stops:         (shipment?.stops ?? []).map(s => typeof s === 'string' ? s : s.location),
          shipmentType:  shipment?.shipmentType  || 'Electronics',
          transportMode: shipment?.transportMode || 'Sea',
        }),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const json = await res.json();
      setData(json);

      if (shipmentDbId) {
        fetch(`/api/shipments/${shipmentDbId}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(json.db_insights),
        })
          .then(r => { if (r.ok) setSavedToDb(true); })
          .catch(() => {});
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to run pipeline');
    } finally {
      setLoading(false);
    }
  }, [shipment, shipmentDbId]);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    runAnalysis();
  }, [runAnalysis]);

  /* ── Derive display values ── */
  const step1  = data?.step1_risk_assessment;
  const step2  = data?.step2_simulation;
  const step3  = data?.step3_game_theory;
  const step4  = data?.step4_decision;
  const agents = step1?.agents ?? [];
  const finalRisk = step1?.final_risk ?? 0;

  /* Monte Carlo delays array */
  const mcDelays: number[] = (() => {
    if (step2?.scenario_delays?.length) return step2.scenario_delays;
    if (step2?.scenarios?.length) return step2.scenarios.map(s => s.delay);
    if (step2?.expected_delay) {
      return Array.from({ length: 40 }, (_, i) =>
        step2.expected_delay * (0.5 + Math.random() * 1.5 + i * 0.02)
      );
    }
    return [];
  })();

  /* Game theory matrix */
  const gtMatrix    = step3?.payoff_matrix    ?? [];
  const gtStrategies = step3?.strategies       ?? [];

  /* QUBO energies */
  const quboRoutes = step4?.qubo_result?.route_energies ?? [];

  /* Map props */
  const mapProps = data ? buildMapProps(data, shipment) : null;

  return (
    <main className="relative min-h-screen pt-16 overflow-hidden">

      {/* ── FULL-VIEWPORT MAP BACKGROUND ── */}
      <div className="fixed inset-0 top-16 z-0 opacity-60">
        {mapProps && (
          <SimulationMap
            source={mapProps.source}
            destination={mapProps.destination}
            stops={mapProps.stops}
            riskZones={mapProps.riskZones}
            routes={mapProps.routes}
            activeType={mapProps.activeType}
          />
        )}
        {!mapProps && (
          <div className="w-full h-full" style={{ background: '#0B0F1A' }} />
        )}
      </div>

      {/* ── GRADIENT OVERLAY for readability ── */}
      <div className="fixed inset-0 top-16 z-[1] pointer-events-none"
        style={{ background: 'linear-gradient(to right, rgba(11,15,26,0.92) 0%, rgba(11,15,26,0.55) 50%, rgba(11,15,26,0.85) 100%)' }} />

      {/* ── CONTENT LAYER ── */}
      <div className="relative z-[2] flex min-h-[calc(100vh-4rem)]">

        {/* LEFT PANEL — Agent Risk + Metrics */}
        <div className="w-72 shrink-0 p-4 space-y-3 overflow-y-auto max-h-[calc(100vh-4rem)]">

          {/* Header */}
          <div>
            <SectionLabel>Simulation Engine</SectionLabel>
            <h1 className="font-heading text-xl font-bold text-white leading-tight">
              Live Risk Simulation
            </h1>
            <p className="text-text-secondary text-[11px] mt-0.5">
              {shipment?.source || 'Mumbai'} → {shipment?.destination || 'Rotterdam'}
            </p>
          </div>

          {/* Re-run + status */}
          <div className="flex items-center gap-2">
            <button
              onClick={runAnalysis}
              disabled={loading}
              className="flex-1 py-2 rounded-lg text-[11px] font-semibold uppercase tracking-wider border border-neon-blue/30 bg-neon-blue/10 text-neon-blue hover:bg-neon-blue/20 transition-all disabled:opacity-40"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-1.5">
                  <span className="w-2.5 h-2.5 border border-neon-blue/40 border-t-neon-blue rounded-full animate-spin" />
                  Running…
                </span>
              ) : 'Re-run'}
            </button>
            {savedToDb && (
              <span className="text-[9px] text-risk-low font-mono px-2 py-1 rounded border border-risk-low/20 bg-risk-low/5">
                ✓ DB
              </span>
            )}
          </div>

          {error && (
            <div className="text-[10px] text-risk-high px-3 py-2 rounded border border-risk-high/20 bg-risk-high/5">
              {error}
            </div>
          )}

          {/* Global Risk */}
          <GlassPanel className="p-4">
            <div className="text-[9px] uppercase tracking-widest text-text-muted font-semibold mb-3">Global Risk</div>
            <div className="flex items-center gap-3">
              <div className="relative w-14 h-14">
                <svg className="rotate-[-90deg]" width="56" height="56">
                  <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
                  <circle cx="28" cy="28" r="22" fill="none"
                    stroke={riskColor(finalRisk)} strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 22}
                    strokeDashoffset={2 * Math.PI * 22 * (1 - finalRisk / 100)}
                    style={{ transition: 'stroke-dashoffset 1s ease' }} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-bold text-white">{Math.round(finalRisk)}</span>
                </div>
              </div>
              <div>
                <div className="text-sm font-bold" style={{ color: riskColor(finalRisk) }}>
                  {step1?.risk_level ?? '—'}
                </div>
                <div className="text-[10px] text-text-muted">{step1?.intelligence_state.dominant_risk ?? '…'}</div>
                <div className="text-[9px] text-text-muted mt-0.5">
                  Vol: {step1?.intelligence_state.volatility?.toFixed(1) ?? '—'}
                </div>
              </div>
            </div>
          </GlassPanel>

          {/* Agent bars */}
          <GlassPanel className="p-4">
            <div className="text-[9px] uppercase tracking-widest text-text-muted font-semibold mb-3">Agent Signals</div>
            <div className="space-y-2.5">
              {loading && !agents.length ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-6 rounded bg-white/[0.04] animate-pulse" />
                ))
              ) : agents.map((a) => {
                const meta = AGENT_META[a.agent] ?? { icon: '🤖', color: '#888' };
                return (
                  <div key={a.agent}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] text-text-secondary">{meta.icon} {a.agent}</span>
                      <span className="text-[10px] font-mono" style={{ color: riskColor(a.risk_score) }}>
                        {Math.round(a.risk_score)}
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-white/[0.06]">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${a.risk_score}%`, background: meta.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassPanel>

          {/* Simulation KPIs */}
          {step2 && (
            <GlassPanel className="p-4">
              <div className="text-[9px] uppercase tracking-widest text-text-muted font-semibold mb-3">Monte Carlo KPIs</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Exp. Delay',  value: `${step2.expected_delay?.toFixed(1) ?? '—'}d` },
                  { label: 'P95 Delay',   value: `${step2.p95_delay?.toFixed(1)       ?? '—'}d` },
                  { label: 'Worst Case',  value: `${step2.worst_case_delay?.toFixed(1) ?? '—'}d` },
                  { label: 'Prob Severe', value: `${((step2.probability_severe ?? 0) * 100).toFixed(0)}%` },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg p-2 bg-white/[0.03] border border-white/[0.04]">
                    <div className="text-[9px] text-text-muted">{label}</div>
                    <div className="text-sm font-mono text-text-primary mt-0.5">{value}</div>
                  </div>
                ))}
              </div>
            </GlassPanel>
          )}
        </div>

        {/* CENTER — empty to show map */}
        <div className="flex-1" />

        {/* RIGHT PANEL — Charts */}
        <div className="w-80 shrink-0 p-4 space-y-3 overflow-y-auto max-h-[calc(100vh-4rem)]">

          {/* Tab selector */}
          <div className="flex rounded-lg overflow-hidden border border-white/[0.06] bg-white/[0.02]">
            {(['monte-carlo', 'game-theory', 'qubo'] as const).map((tab) => (
              <button key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                  activeTab === tab ? 'bg-neon-blue/15 text-neon-blue' : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {tab === 'monte-carlo' ? 'MC' : tab === 'game-theory' ? 'GT' : 'QUBO'}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {/* Monte Carlo */}
            {activeTab === 'monte-carlo' && (
              <motion.div key="mc" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="space-y-3">
                <GlassPanel className="p-4">
                  <div className="text-[9px] uppercase tracking-widest text-text-muted font-semibold mb-3">Delay Distribution</div>
                  {loading ? (
                    <div className="h-16 rounded bg-white/[0.04] animate-pulse" />
                  ) : mcDelays.length > 0 ? (
                    <MCDistribution delays={mcDelays} />
                  ) : (
                    <div className="h-16 flex items-center justify-center text-[10px] text-text-muted">No data yet</div>
                  )}
                  <div className="flex justify-between mt-2 text-[9px] text-text-muted">
                    <span>Low delay</span>
                    <span>High delay</span>
                  </div>
                </GlassPanel>

                {/* Disruption frequency */}
                {step2?.disruption_frequency && Object.keys(step2.disruption_frequency).length > 0 && (
                  <GlassPanel className="p-4">
                    <div className="text-[9px] uppercase tracking-widest text-text-muted font-semibold mb-3">Node Disruption Freq.</div>
                    <div className="space-y-2">
                      {Object.entries(step2.disruption_frequency)
                        .sort(([, a], [, b]) => b - a)
                        .slice(0, 6)
                        .map(([node, freq]) => (
                          <div key={node}>
                            <div className="flex justify-between text-[10px] text-text-secondary mb-0.5">
                              <span className="truncate max-w-[140px]">{node}</span>
                              <span className="font-mono">{(freq * 100).toFixed(0)}%</span>
                            </div>
                            <div className="h-1 rounded-full bg-white/[0.06]">
                              <div className="h-full rounded-full transition-all duration-700"
                                style={{ width: `${Math.min(freq * 100, 100)}%`, background: riskColor(freq * 100) }} />
                            </div>
                          </div>
                        ))}
                    </div>
                  </GlassPanel>
                )}

                {/* Sensitivity */}
                {step2?.sensitivity && Object.keys(step2.sensitivity).length > 0 && (
                  <GlassPanel className="p-4">
                    <div className="text-[9px] uppercase tracking-widest text-text-muted font-semibold mb-3">Sensitivity Analysis</div>
                    <div className="space-y-2">
                      {Object.entries(step2.sensitivity)
                        .sort(([, a], [, b]) => b - a)
                        .slice(0, 5)
                        .map(([factor, val]) => (
                          <div key={factor}>
                            <div className="flex justify-between text-[10px] text-text-secondary mb-0.5">
                              <span className="capitalize truncate max-w-[140px]">{factor.replace(/_/g, ' ')}</span>
                              <span className="font-mono">{(val * 100).toFixed(0)}%</span>
                            </div>
                            <div className="h-1 rounded-full bg-white/[0.06]">
                              <div className="h-full rounded-full bg-neon-blue/70 transition-all duration-700"
                                style={{ width: `${Math.min(val * 100, 100)}%` }} />
                            </div>
                          </div>
                        ))}
                    </div>
                  </GlassPanel>
                )}
              </motion.div>
            )}

            {/* Game Theory */}
            {activeTab === 'game-theory' && (
              <motion.div key="gt" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="space-y-3">
                <GlassPanel className="p-4">
                  <div className="text-[9px] uppercase tracking-widest text-text-muted font-semibold mb-3">Payoff Matrix</div>
                  {loading ? (
                    <div className="h-32 rounded bg-white/[0.04] animate-pulse" />
                  ) : gtMatrix.length > 0 ? (
                    <PayoffHeatmap matrix={gtMatrix} strategies={gtStrategies} />
                  ) : (
                    <div className="h-20 flex items-center justify-center text-[10px] text-text-muted">Awaiting game theory data</div>
                  )}
                </GlassPanel>

                {step3 && (
                  <GlassPanel className="p-4 space-y-2">
                    <div className="text-[9px] uppercase tracking-widest text-text-muted font-semibold">Strategy Analysis</div>
                    {[
                      { label: 'Nash Equilibrium', value: step3.nash_equilibrium },
                      { label: 'Robust Route',     value: step3.robust_route },
                      { label: 'Dominant Strategy',value: step3.dominant_strategy },
                    ].filter(x => x.value).map(({ label, value }) => (
                      <div key={label} className="flex items-start justify-between gap-2">
                        <span className="text-[10px] text-text-muted shrink-0">{label}</span>
                        <span className="text-[10px] text-neon-blue text-right truncate max-w-[140px]">{value}</span>
                      </div>
                    ))}

                    {step3.expected_values && Object.keys(step3.expected_values).length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        <div className="text-[9px] text-text-muted uppercase tracking-widest">Expected Values</div>
                        {Object.entries(step3.expected_values).slice(0, 4).map(([k, v]) => (
                          <div key={k} className="flex justify-between text-[10px]">
                            <span className="text-text-secondary truncate max-w-[140px]">{k}</span>
                            <span className="font-mono" style={{ color: riskColor(100 - Number(v)) }}>{Number(v).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </GlassPanel>
                )}
              </motion.div>
            )}

            {/* QUBO */}
            {activeTab === 'qubo' && (
              <motion.div key="qubo" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="space-y-3">
                <GlassPanel className="p-4">
                  <div className="text-[9px] uppercase tracking-widest text-text-muted font-semibold mb-3">QUBO Route Energies</div>
                  {loading ? (
                    <div className="h-28 rounded bg-white/[0.04] animate-pulse" />
                  ) : quboRoutes.length > 0 ? (
                    <div className="space-y-2">
                      {quboRoutes.slice(0, 6).map((r, i) => {
                        const isOptimal = i === 0;
                        const maxE = Math.max(...quboRoutes.map(x => Math.abs(x.energy)));
                        const pct = maxE ? Math.abs(r.energy) / maxE * 100 : 0;
                        return (
                          <div key={i} className={`rounded-lg p-2.5 border ${isOptimal ? 'border-neon-purple/30 bg-neon-purple/5' : 'border-white/[0.04] bg-white/[0.02]'}`}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] text-text-secondary truncate max-w-[150px]">{r.route}</span>
                              <span className="text-[10px] font-mono text-neon-purple ml-2">{r.energy.toFixed(2)}</span>
                            </div>
                            <div className="h-1 rounded-full bg-white/[0.06]">
                              <div className="h-full rounded-full transition-all duration-700"
                                style={{ width: `${pct}%`, background: isOptimal ? '#A78BFA' : '#6B7280' }} />
                            </div>
                            {isOptimal && <div className="text-[9px] text-neon-purple mt-1">★ Optimal</div>}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="h-20 flex items-center justify-center text-[10px] text-text-muted">Awaiting QUBO data</div>
                  )}
                </GlassPanel>

                {step4 && (
                  <GlassPanel className="p-4">
                    <div className="text-[9px] uppercase tracking-widest text-text-muted font-semibold mb-2">Decision Summary</div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-text-muted">Strategy</span>
                        <span className="text-neon-blue">{step4.strategy}</span>
                      </div>
                      {step4.qubo_result?.optimal_route && (
                        <div className="flex justify-between text-[10px]">
                          <span className="text-text-muted">QUBO Route</span>
                          <span className="text-neon-purple">{step4.qubo_result.optimal_route}</span>
                        </div>
                      )}
                      {step4.qubo_result?.qubo_energy !== undefined && (
                        <div className="flex justify-between text-[10px]">
                          <span className="text-text-muted">Min Energy</span>
                          <span className="font-mono text-text-primary">{step4.qubo_result.qubo_energy.toFixed(3)}</span>
                        </div>
                      )}
                      <div className="mt-2 text-[10px] text-text-secondary leading-relaxed border-t border-white/[0.04] pt-2">
                        {step4.reasoning?.slice(0, 200)}{step4.reasoning && step4.reasoning.length > 200 ? '…' : ''}
                      </div>
                    </div>
                  </GlassPanel>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Route legend */}
          <GlassPanel className="p-3">
            <div className="text-[9px] uppercase tracking-widest text-text-muted font-semibold mb-2">Route Legend</div>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { color: '#00F0FF', label: 'Normal' },
                { color: '#FBBF24', label: 'Storm' },
                { color: '#EF4444', label: 'Conflict' },
                { color: '#A78BFA', label: 'Optimal' },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className="w-6 h-0.5 rounded-full" style={{ background: color }} />
                  <span className="text-[10px] text-text-secondary">{label}</span>
                </div>
              ))}
            </div>
          </GlassPanel>
        </div>
      </div>
    </main>
  );
}
