'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import GlassPanel from '@/components/GlassPanel';
import { StatusBadge, SectionLabel } from '@/components/ui';

/* ═══════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════ */
interface AgentResult {
  agent: string;
  risk_score: number;
  reason: string;
  confidence: number;
  timestamp: string;
}

interface IntelligenceData {
  _id: string;
  orderId: string | null;
  sourceLocation: string;
  destinationLocation: string;
  shipmentType: string | null;
  customShipmentType: string | null;
  transportMode: string | null;
  status: string;
  agentData: Record<string, AgentResult>;
  insights: {
    type: string;
    data: {
      summary?: string;
      riskScore?: number;
      costAnalysis?: { baseCost: number; riskMultiplier: number; estimatedTotal: number };
      delays?: { baseHours: number; adjustedHours: number; riskImpact: number };
      routeDecision?: string;
      recommendations?: string[];
      agentBreakdown?: { agent: string; risk_score: number; confidence: number; reason: string }[];
    };
  };
  systemState: Record<string, string>;
  trackingHistory: { location: string; timestamp: string; status: string; notes: string }[];
  currentLocation: { lat: number; lng: number } | null;
}

/* ═══════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════ */
const riskColor = (score: number) => {
  if (score >= 70) return 'text-risk-high';
  if (score >= 40) return 'text-risk-medium';
  return 'text-risk-low';
};

const riskLevel = (score: number) => {
  if (score >= 70) return 'CRITICAL';
  if (score >= 40) return 'ELEVATED';
  return 'NORMAL';
};

const agentIcon: Record<string, string> = {
  weather: '🌦️',
  traffic: '🚦',
  demand: '📈',
  news: '📰',
  supplier: '🏭',
  risk: '⚠️',
};

const inputClass =
  'w-full px-4 py-3 rounded-lg border border-white/[0.06] bg-white/[0.02] text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-neon-blue/30 focus:bg-neon-blue/[0.02] transition-colors';

/* ═══════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════ */
export default function IntelligencePage() {
  const [data, setData] = useState<IntelligenceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  /* ── Fetch intelligence ── */
  const fetchIntelligence = async (query: string) => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      const res = await fetch(`/api/intelligence-live?orderId=${encodeURIComponent(query.trim())}`);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        setError(errBody.error || `Not found (${res.status})`);
        setData(null);
      } else {
        setData(await res.json());
      }
    } catch {
      setError('Failed to connect to backend');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  /* ── Also try loading from URL hash on mount ── */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('orderId') || params.get('id');
    if (id) {
      setOrderId(id);
      fetchIntelligence(id);
    }
  }, []);

  const insights = data?.insights?.data || {};
  const agents = data?.agentData || {};
  const agentEntries = Object.entries(agents).filter(([, v]) => v && typeof v === 'object');

  return (
    <main className="min-h-screen pt-16 pb-16 px-6">
      <div className="max-w-6xl mx-auto">

        {/* ── Header ── */}
        <div className="mb-8">
          <SectionLabel>Intelligence Panel</SectionLabel>
          <h1 className="font-heading text-3xl font-bold">Real-Time AI Insights</h1>
          <p className="text-text-secondary text-sm mt-1">Live agent intelligence from the ChainMind AI+ decision engine</p>
        </div>

        {/* ── Search Bar ── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <GlassPanel className="p-5">
            <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-3">Lookup Shipment Intelligence</div>
            <div className="flex gap-3">
              <input
                type="text"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchIntelligence(orderId)}
                placeholder="Enter Order ID (e.g. ORD-TEST-001)"
                className={`flex-1 ${inputClass}`}
              />
              <button
                onClick={() => fetchIntelligence(orderId)}
                disabled={loading || !orderId.trim()}
                className="px-6 py-3 rounded-lg border border-neon-cyan/25 bg-neon-cyan/5 text-neon-cyan text-xs font-semibold uppercase tracking-wider cursor-pointer hover:bg-neon-cyan/12 hover:border-neon-cyan/40 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 border border-neon-cyan/40 border-t-neon-cyan rounded-full animate-spin" />
                    Fetching...
                  </span>
                ) : '🔍 Analyze'}
              </button>
            </div>
            {error && (
              <div className="mt-3 px-3 py-2 rounded-lg border border-risk-high/20 bg-risk-high/5 text-xs text-risk-high">
                {error}
              </div>
            )}
          </GlassPanel>
        </motion.div>

        {/* ── No data state ── */}
        {!data && hasSearched && !loading && !error && (
          <div className="text-center text-text-muted text-sm py-20">No intelligence data found.</div>
        )}
        {!data && !hasSearched && (
          <div className="text-center text-text-muted text-sm py-20 font-mono">
            Enter an Order ID above to load live intelligence data.
          </div>
        )}

        {/* ═══════════════ LIVE INTELLIGENCE PANELS ═══════════════ */}
        {data && (
          <div className="space-y-4">

            {/* ── Shipment Header ── */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <GlassPanel className="p-5 flex items-center justify-between flex-wrap gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-text-muted mb-1">Shipment</div>
                  <div className="font-heading text-lg font-bold text-text-primary">
                    {data.orderId || data._id.slice(-8).toUpperCase()}
                  </div>
                  <div className="text-xs text-text-secondary mt-0.5">
                    {data.sourceLocation} → {data.destinationLocation}
                  </div>
                </div>
                <div className="flex gap-4 items-center">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-text-muted">Status</div>
                    <StatusBadge level={data.status === 'completed' ? 'low' : data.status === 'failed' ? 'high' : 'medium'} />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-text-muted">Mode</div>
                    <div className="text-sm font-mono text-text-primary mt-0.5">{data.transportMode || 'Auto'}</div>
                  </div>
                </div>
              </GlassPanel>
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

              {/* ── Risk Overview (full width) ── */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="lg:col-span-3">
                <GlassPanel className="p-6 flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-text-muted mb-1">Composite Risk Index</div>
                    <div className="flex items-end gap-3">
                      <span className={`font-heading text-5xl font-bold ${riskColor(insights.riskScore ?? 0)}`}>
                        {insights.riskScore ?? '—'}
                      </span>
                      <span className="text-sm text-text-muted mb-2">/ 100</span>
                    </div>
                  </div>
                  <div className="flex gap-6">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-text-muted">Level</div>
                      <div className={`text-sm font-semibold mt-0.5 ${riskColor(insights.riskScore ?? 0)}`}>
                        {riskLevel(insights.riskScore ?? 0)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-text-muted">Cost Impact</div>
                      <div className="text-sm font-semibold text-neon-cyan mt-0.5">
                        ${insights.costAnalysis?.estimatedTotal?.toLocaleString() ?? '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-text-muted">Delay Impact</div>
                      <div className="text-sm font-semibold text-risk-medium mt-0.5">
                        +{insights.delays?.riskImpact ?? 0}h
                      </div>
                    </div>
                  </div>
                  <div className="w-full lg:w-64 h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-risk-low via-risk-medium to-risk-high rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(insights.riskScore ?? 0, 100)}%` }}
                    />
                  </div>
                </GlassPanel>
              </motion.div>

              {/* ── Agent Activity (2 cols) ── */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="lg:col-span-2">
                <GlassPanel className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold">Agent Activity</div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-risk-low animate-pulse" />
                      <span className="text-[9px] font-mono text-text-muted">{agentEntries.length} AGENTS ACTIVE</span>
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    {agentEntries.map(([name, result]) => (
                      <div key={name} className="p-3 rounded-lg border border-white/[0.04] bg-white/[0.01] hover:bg-white/[0.03] transition-colors">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{agentIcon[name] || '🤖'}</span>
                            <span className="text-xs font-semibold text-text-primary uppercase tracking-wider">{name} Agent</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`text-sm font-heading font-bold ${riskColor(result.risk_score)}`}>
                              {result.risk_score}
                            </span>
                            <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  result.risk_score >= 70 ? 'bg-risk-high' : result.risk_score >= 40 ? 'bg-risk-medium' : 'bg-risk-low'
                                }`}
                                style={{ width: `${Math.min(result.risk_score, 100)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                        <p className="text-[10px] text-text-secondary leading-relaxed line-clamp-2">{result.reason}</p>
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-[9px] font-mono text-text-muted">
                            Confidence: {(result.confidence * 100).toFixed(0)}%
                          </span>
                          <span className="text-[9px] font-mono text-text-muted">
                            {result.timestamp ? new Date(result.timestamp).toLocaleTimeString() : ''}
                          </span>
                        </div>
                      </div>
                    ))}
                    {agentEntries.length === 0 && (
                      <div className="text-xs text-text-muted text-center py-6 font-mono">
                        No agent data yet. Agents run automatically after shipment creation.
                      </div>
                    )}
                  </div>
                </GlassPanel>
              </motion.div>

              {/* ── Sidebar: Recommendations + Route Decision ── */}
              <div className="space-y-4">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                  <GlassPanel className="p-5">
                    <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-3">Route Decision</div>
                    <p className="text-xs text-text-secondary leading-relaxed">{insights.routeDecision || 'Pending agent analysis...'}</p>
                  </GlassPanel>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                  <GlassPanel className="p-5">
                    <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-3">AI Recommendations</div>
                    <div className="space-y-2">
                      {(insights.recommendations || []).map((rec, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-neon-blue mt-1.5 flex-shrink-0 shadow-[0_0_6px_rgba(59,130,246,0.5)]" />
                          <p className="text-xs text-text-secondary leading-relaxed">{rec}</p>
                        </div>
                      ))}
                      {(!insights.recommendations || insights.recommendations.length === 0) && (
                        <div className="text-xs text-text-muted font-mono">Pending...</div>
                      )}
                    </div>
                  </GlassPanel>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
                  <GlassPanel className="p-5">
                    <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-3">Cost Analysis</div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-text-muted">Base Cost</span>
                        <span className="text-text-primary font-mono">${insights.costAnalysis?.baseCost?.toLocaleString() ?? '—'}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-text-muted">Risk Multiplier</span>
                        <span className="text-risk-medium font-mono">×{insights.costAnalysis?.riskMultiplier ?? '—'}</span>
                      </div>
                      <div className="flex justify-between text-xs border-t border-white/5 pt-2">
                        <span className="text-text-muted font-semibold">Estimated Total</span>
                        <span className="text-neon-cyan font-mono font-bold">${insights.costAnalysis?.estimatedTotal?.toLocaleString() ?? '—'}</span>
                      </div>
                    </div>
                  </GlassPanel>
                </motion.div>
              </div>
            </div>

            {/* ── Summary ── */}
            {insights.summary && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                <GlassPanel className="p-4 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-text-muted">Intelligence Summary</div>
                    <div className="text-xs text-text-secondary mt-1">{insights.summary}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-risk-low animate-pulse" />
                    <span className="text-[10px] font-mono text-text-muted">LIVE</span>
                  </div>
                </GlassPanel>
              </motion.div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
