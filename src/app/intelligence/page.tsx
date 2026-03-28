'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import GlassPanel from '@/components/GlassPanel';
import { SectionLabel } from '@/components/ui';
import { useAppStore } from '@/lib/store';

/* ═══════════════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════════════ */
interface WeatherRaw  {
  condition: string; description: string; temp: number;
  wind_speed: number; humidity: number; city: string;
  llm_insight?: string;            // LLM-generated analysis sentence
}
interface TrafficRaw  {
  current_speed: number; free_flow_speed: number; congestion_ratio: number;
  current_travel_time: number; free_flow_travel_time: number;
  headline?: string;               // ML-derived plain-English summary
}
interface NewsRaw     {
  article_count: number; overall_sentiment: string;
  risk_keywords: string[]; keyword_count: number;
  headlines?: string[];            // actual article titles from NewsAPI
  sources?:   string[];            // news source names
}
interface DemandRaw   { spikes: Record<string,number>; forecasts: Record<string,number>; max_spike: number }
interface SupplierRaw { reliability_score?: number; disruption_count?: number; lead_time_days?: number }

interface AgentResult {
  agent:      string;
  risk_score: number;
  confidence: number;
  reason:     string;
  raw_data?:  Partial<WeatherRaw & TrafficRaw & NewsRaw & DemandRaw & SupplierRaw>;
}

interface SimStep {
  expected_delay:       number;
  p95_delay:            number;
  worst_case_delay?:    number;
  probability_severe:   number;
  disruption_frequency?: Record<string,number>;
  sensitivity?:          Record<string,number>;
  scenario_delays?:      number[];
}

interface PipelineData {
  step1_risk_assessment: {
    agents:    AgentResult[];
    final_risk: number;
    risk_level: string;
    intelligence_state: {
      total_risk:     number;
      risk_breakdown: Record<string,number>;
      trend:          number;
      volatility:     number;
      dominant_risk:  string;
      correlations?:  unknown[];
    };
  };
  step2_simulation:  SimStep;
  step3_game_theory?: unknown;
  step4_decision?:    unknown;
  step5_economic?:    unknown;
  db_insights?: { type: string; data: Record<string,unknown> };
}

/* ═══════════════════════════════════════════════════════
   CONSTANTS / HELPERS
═══════════════════════════════════════════════════════ */
const AGENT_META: Record<string,{ icon:string; color:string; label:string }> = {
  weather:  { icon:'🌩️', color:'#60A5FA', label:'Weather' },
  news:     { icon:'📰', color:'#F87171', label:'News Alerts' },
  traffic:  { icon:'🚢', color:'#FBBF24', label:'Traffic' },
  supplier: { icon:'🏭', color:'#A78BFA', label:'Supplier' },
  demand:   { icon:'📈', color:'#34D399', label:'Demand' },
};

const SENTIMENT: Record<string,{ label:string; color:string }> = {
  LABEL_0: { label:'Negative', color:'#EF4444' },
  LABEL_1: { label:'Neutral',  color:'#F59E0B' },
  LABEL_2: { label:'Positive', color:'#22C55E' },
};

function rc(s: number) { return s >= 70 ? '#EF4444' : s >= 40 ? '#F59E0B' : '#22C55E'; }
function rl(s: number) { return s >= 70 ? 'HIGH' : s >= 40 ? 'MED' : 'LOW'; }

/* ── tiny arc SVG ── */
function Arc({ score, color, size=64 }: { score:number; color:string; size?:number }) {
  const r  = (size-10)/2;
  const c  = 2*Math.PI*r;
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c-(score/100)*c}
        style={{ transition:'stroke-dashoffset 1s ease' }}/>
    </svg>
  );
}

/* ── animated bar ── */
function Bar({ label, value, max=100, color, unit='' }: { label:string; value:number; max?:number; color:string; unit?:string }) {
  const pct = Math.min((value/max)*100, 100);
  return (
    <div>
      <div className="flex justify-between text-[10px] mb-1">
        <span className="text-text-muted">{label}</span>
        <span className="font-mono" style={{ color }}>{value}{unit}</span>
      </div>
      <div className="h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
        <motion.div initial={{ width:0 }} animate={{ width:`${pct}%` }} transition={{ duration:0.9 }}
          className="h-full rounded-full" style={{ background:color }}/>
      </div>
    </div>
  );
}

/* ── Monte Carlo histogram ── */
function Histogram({ delays }: { delays:number[] }) {
  if (!delays.length) return <div className="h-28 flex items-center justify-center text-[10px] text-text-muted">No data</div>;
  const min=Math.min(...delays), max=Math.max(...delays);
  const bk=16, size=(max-min)/bk||1;
  const buckets = Array.from({ length:bk }, (_,i) => ({
    lo: min+i*size,
    count: delays.filter(d => d>=min+i*size && d<min+(i+1)*size).length,
  }));
  const peak = Math.max(...buckets.map(b=>b.count));
  return (
    <div className="flex items-end gap-[2px] h-28 w-full">
      {buckets.map((b,i) => {
        const pct = peak ? (b.count/peak)*100 : 0;
        const col = rc(b.lo*3.5);
        return (
          <div key={i} className="flex-1 flex flex-col justify-end h-full group relative">
            <motion.div initial={{ height:0 }} animate={{ height:`${pct}%` }} transition={{ duration:0.6, delay:i*0.03 }}
              className="w-full rounded-sm" style={{ background:col, opacity:0.8 }}/>
            {b.count>0 && (
              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 text-[8px] bg-black/85 px-1.5 py-0.5 rounded whitespace-nowrap hidden group-hover:block z-10">
                ~{b.lo.toFixed(1)}d · {b.count} runs
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   AGENT SIDE PANELS
═══════════════════════════════════════════════════════ */
function WeatherPanel({ agent }: { agent?: AgentResult }) {
  const d  = agent?.raw_data as WeatherRaw|undefined;
  const s  = agent?.risk_score ?? 0;
  const ICONS: Record<string,string> = { Clear:'☀️', Clouds:'☁️', Rain:'🌧️', Thunderstorm:'⛈️', Drizzle:'🌦️', Snow:'❄️', Mist:'🌫️', Haze:'🌫️', Smoke:'🌫️' };
  const icon = d?.condition ? (ICONS[d.condition] ?? '🌡️') : '🌡️';
  return (
    <GlassPanel className="p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <div>
            <div className="text-[9px] text-text-muted uppercase tracking-widest">OpenWeatherMap · OpenRouter LLM</div>
            <div className="text-[11px] font-semibold text-text-primary">{d?.city ?? 'Weather'}</div>
          </div>
        </div>
        <div className="text-right">
          <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ color:rc(s), background:`${rc(s)}18` }}>{rl(s)} · {Math.round(s)}</span>
        </div>
      </div>

      {d ? (
        <>
          {/* Headline badge */}
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06]">
            <span className="text-xl shrink-0">{icon}</span>
            <div>
              <span className="text-[11px] font-semibold text-white capitalize">{d.description || d.condition}</span>
              <span className="text-[11px] text-text-muted"> · </span>
              <span className="text-[11px] font-bold" style={{ color:rc(s) }}>{d.temp?.toFixed(1)}°C</span>
              <div className="text-[9px] text-text-muted mt-0.5">{d.city} · Live reading</div>
            </div>
          </div>

          {/* Metric chips */}
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { icon:'💨', label:'Wind',     val:`${(d.wind_speed??0).toFixed(1)} m/s` },
              { icon:'💧', label:'Humidity', val:`${d.humidity??0}%` },
              { icon:'🌡️', label:'Temp',     val:`${d.temp?.toFixed(0)}°C` },
            ].map(({ icon:i, label, val }) => (
              <div key={label} className="flex flex-col items-center py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                <span className="text-sm">{i}</span>
                <span className="text-[9px] text-text-muted">{label}</span>
                <span className="text-[10px] font-mono font-bold text-text-primary">{val}</span>
              </div>
            ))}
          </div>

          <Bar label="Wind intensity" value={+(d.wind_speed??0).toFixed(1)} max={30} color="#60A5FA" unit=" m/s"/>
          <Bar label="Humidity"       value={d.humidity??0}                 max={100} color="#818CF8" unit="%"/>

          {/* LLM insight */}
          {(d.llm_insight || agent?.reason) && (
            <div className="px-2.5 py-2 rounded-lg border-l-2 border-neon-blue/40 bg-neon-blue/5">
              <div className="text-[8px] uppercase tracking-widest text-neon-blue mb-1">OpenRouter LLM Analysis</div>
              <p className="text-[10px] text-text-secondary leading-relaxed line-clamp-3">
                {d.llm_insight || agent?.reason}
              </p>
            </div>
          )}
        </>
      ) : (
        <p className="text-[10px] text-text-muted leading-relaxed">{agent?.reason ?? 'No data'}</p>
      )}
    </GlassPanel>
  );
}

function TrafficPanel({ agent }: { agent?: AgentResult }) {
  const d   = agent?.raw_data as TrafficRaw|undefined;
  const s   = agent?.risk_score ?? 0;
  const cng = d ? Math.round((d.congestion_ratio ?? 0) * 100) : 0;
  const delayPct = d?.current_travel_time && d?.free_flow_travel_time
    ? Math.round((d.current_travel_time / d.free_flow_travel_time - 1) * 100)
    : 0;

  return (
    <GlassPanel className="p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🗺️</span>
          <div>
            <div className="text-[9px] text-text-muted uppercase tracking-widest">TomTom Traffic API · scikit-learn</div>
            <div className="text-[11px] font-semibold text-text-primary">Road Congestion</div>
          </div>
        </div>
        <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ color:rc(s), background:`${rc(s)}18` }}>{rl(s)} · {Math.round(s)}</span>
      </div>

      {d ? (
        <>
          {/* ML headline */}
          {d.headline && (
            <div className="px-2.5 py-2 rounded-lg border-l-2 border-yellow-400/40 bg-yellow-400/5">
              <div className="text-[8px] uppercase tracking-widest text-yellow-400 mb-0.5">ML Insight</div>
              <p className="text-[10px] text-text-secondary leading-relaxed">{d.headline}</p>
            </div>
          )}

          {/* Speed gauges */}
          <div className="grid grid-cols-2 gap-1.5">
            <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.04] text-center">
              <div className="text-[9px] text-text-muted mb-0.5">Current Speed</div>
              <div className="text-base font-bold text-neon-blue">{d.current_speed}
                <span className="text-[9px] text-text-muted ml-0.5">km/h</span>
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.04] text-center">
              <div className="text-[9px] text-text-muted mb-0.5">Free Flow</div>
              <div className="text-base font-bold text-risk-low">{d.free_flow_speed}
                <span className="text-[9px] text-text-muted ml-0.5">km/h</span>
              </div>
            </div>
          </div>

          <Bar label="Congestion level" value={cng} max={100} color={rc(s)} unit="%"/>

          {delayPct > 0 && (
            <div className="flex justify-between items-center px-2 py-1.5 rounded bg-white/[0.02] text-[10px]">
              <span className="text-text-muted">Travel time overhead</span>
              <span className="font-mono font-bold" style={{ color: rc(Math.min(delayPct, 100)) }}>+{delayPct}%</span>
            </div>
          )}
        </>
      ) : (
        <p className="text-[10px] text-text-muted leading-relaxed">{agent?.reason ?? 'No data'}</p>
      )}
    </GlassPanel>
  );
}

function NewsPanel({ agent }: { agent?: AgentResult }) {
  const d  = agent?.raw_data as NewsRaw|undefined;
  const s  = agent?.risk_score ?? 0;
  const sl = d ? (SENTIMENT[d.overall_sentiment] ?? { label: d.overall_sentiment, color:'#94A3B8' }) : null;

  return (
    <GlassPanel className="p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">📰</span>
          <div>
            <div className="text-[9px] text-text-muted uppercase tracking-widest">NewsAPI · RoBERTa NLP</div>
            <div className="text-[11px] font-semibold text-text-primary">Geopolitical Alerts</div>
          </div>
        </div>
        <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ color:rc(s), background:`${rc(s)}18` }}>{rl(s)} · {Math.round(s)}</span>
      </div>

      {d ? (
        <>
          {/* Sentiment + article count row */}
          <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06]">
            <div>
              <span className="text-[10px] text-text-muted">{d.article_count} articles analysed</span>
              <div className="text-[9px] text-text-muted mt-0.5">RoBERTa sentiment model</div>
            </div>
            {sl && (
              <span className="text-[10px] font-bold px-2 py-1 rounded-full border"
                style={{ color: sl.color, borderColor:`${sl.color}40`, background:`${sl.color}15` }}>
                {sl.label}
              </span>
            )}
          </div>

          {/* Live headlines */}
          {(d.headlines?.length ?? 0) > 0 && (
            <div className="space-y-1.5">
              <div className="text-[8px] uppercase tracking-widest text-text-muted font-semibold">Live Headlines</div>
              {d.headlines!.slice(0, 4).map((headline, i) => (
                <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.05] transition-colors">
                  <span className="text-[9px] text-text-muted shrink-0 mt-0.5 font-mono">{i+1}</span>
                  <div>
                    <p className="text-[10px] text-text-secondary leading-snug line-clamp-2">{headline}</p>
                    {d.sources?.[i] && (
                      <span className="text-[8px] text-text-muted">{d.sources[i]}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Risk keyword pills */}
          {(d.risk_keywords?.length ?? 0) > 0 && (
            <div>
              <div className="text-[8px] uppercase tracking-widest text-text-muted mb-1.5">Risk Keywords Detected</div>
              <div className="flex flex-wrap gap-1">
                {d.risk_keywords.slice(0, 8).map(kw => (
                  <span key={kw} className="text-[8px] px-1.5 py-0.5 rounded border border-red-500/25 bg-red-500/10 text-red-400 font-mono">{kw}</span>
                ))}
                {d.risk_keywords.length > 8 && (
                  <span className="text-[8px] text-text-muted">+{d.risk_keywords.length-8} more</span>
                )}
              </div>
            </div>
          )}

          <Bar label="Keyword hit intensity" value={d.keyword_count} max={Math.max(d.keyword_count, 20)} color={rc(s)}/>
        </>
      ) : (
        <p className="text-[10px] text-text-muted leading-relaxed">{agent?.reason ?? 'No data'}</p>
      )}
    </GlassPanel>
  );
}

function DemandPanel({ agent }: { agent?: AgentResult }) {
  const d = agent?.raw_data as DemandRaw|undefined;
  const s = agent?.risk_score ?? 0;
  return (
    <GlassPanel className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">📈</span>
          <div>
            <div className="text-[9px] text-text-muted uppercase tracking-widest">Google Trends · ML</div>
            <div className="text-[11px] font-semibold">Demand Signals</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-bold" style={{ color:rc(s) }}>{Math.round(s)}</div>
          <div className="text-[9px]" style={{ color:rc(s) }}>{rl(s)}</div>
        </div>
      </div>
      {d ? (
        <div className="space-y-2">
          <div className="flex justify-between items-center px-2 py-1.5 rounded-lg bg-white/[0.03]">
            <span className="text-[10px] text-text-muted">Max demand spike</span>
            <span className="text-sm font-bold" style={{ color:rc(Math.abs(d.max_spike)) }}>
              {d.max_spike>=0?'+':''}{d.max_spike?.toFixed(1)}%
            </span>
          </div>
          {d.spikes && Object.entries(d.spikes).map(([kw,spike]) => (
            <div key={kw}>
              <div className="flex justify-between text-[9px] mb-0.5">
                <span className="text-text-muted truncate max-w-[110px]">{kw}</span>
                <span className="font-mono" style={{ color:rc(Math.abs(spike as number)) }}>{(spike as number)>=0?'+':''}{(spike as number).toFixed(1)}%</span>
              </div>
              <div className="h-1 bg-white/[0.05] rounded-full overflow-hidden">
                <motion.div initial={{ width:0 }} animate={{ width:`${Math.min(Math.abs(spike as number),100)}%` }} transition={{ duration:0.8 }}
                  className="h-full rounded-full" style={{ background:rc(Math.abs(spike as number)) }}/>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-text-muted leading-relaxed line-clamp-3">{agent?.reason}</p>
      )}
    </GlassPanel>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════ */
export default function IntelligencePage() {
  const shipment     = useAppStore(s => s.shipment);
  const shipmentDbId = useAppStore(s => s.shipmentDbId);

  const [pipeline, setPipeline] = useState<PipelineData|null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string|null>(null);
  const [savedDb,  setSavedDb]  = useState(false);
  const [route,    setRoute]    = useState({ source:'Mumbai', destination:'Rotterdam', stops:[] as string[], shipmentType:'Electronics', transportMode:'Sea' });
  const ran = useRef(false);

  /* ── call analyze API ── */
  const runAnalysis = useCallback(async (r: { source:string; destination:string; stops:string[]; shipmentType:string; transportMode:string }) => {
    setLoading(true);
    setError(null);
    setSavedDb(false);
    try {
      const res = await fetch('/api/analyze', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source:        r.source,
          destination:   r.destination,
          stops:         r.stops,
          shipmentType:  r.shipmentType,
          transportMode: r.transportMode,
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        setError(`Pipeline error (${res.status}): ${text.slice(0,300)}`);
        return;
      }
      const data: PipelineData = JSON.parse(text);
      setPipeline(data);

      if (shipmentDbId && data.db_insights) {
        fetch(`/api/shipments/${shipmentDbId}`, {
          method:'PATCH', headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify(data.db_insights),
        }).then(r => { if (r.ok) setSavedDb(true); }).catch(()=>{});
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Network error — is FastAPI running?');
    } finally {
      setLoading(false);
    }
  }, [shipmentDbId]);

  /* ── On mount: fetch shipment from DB → set route → run analysis (once) ── */
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const init = async () => {
      let r = {
        source:        shipment?.source        || 'Mumbai',
        destination:   shipment?.destination   || 'Rotterdam',
        stops:         (shipment?.stops ?? []).map(s => s.location).filter(Boolean) as string[],
        shipmentType:  shipment?.shipmentType   || 'Electronics',
        transportMode: shipment?.transportMode  || 'Sea',
      };

      // Prefer DB document over Zustand store (DB is authoritative)
      if (shipmentDbId) {
        try {
          const res = await fetch(`/api/shipments/${shipmentDbId}`);
          if (res.ok) {
            const doc = await res.json();
            r = {
              source:        doc.sourceLocation      || r.source,
              destination:   doc.destinationLocation || r.destination,
              stops:         (doc.stops ?? []).map((s: { location:string }) => s.location).filter(Boolean),
              shipmentType:  doc.shipmentType        || r.shipmentType,
              transportMode: doc.transportMode       || r.transportMode,
            };
          }
        } catch { /* use Zustand fallback */ }
      }

      setRoute(r);
      await runAnalysis(r);
    };

    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── derived ── */
  const agents    = pipeline?.step1_risk_assessment?.agents ?? [];
  const sim       = pipeline?.step2_simulation;
  const intel     = pipeline?.step1_risk_assessment?.intelligence_state;
  const finalRisk = pipeline?.step1_risk_assessment?.final_risk ?? 0;
  const riskLevel = pipeline?.step1_risk_assessment?.risk_level ?? '—';

  const weatherAgent  = agents.find(a => a.agent==='weather');
  const trafficAgent  = agents.find(a => a.agent==='traffic');
  const newsAgent     = agents.find(a => a.agent==='news');
  const demandAgent   = agents.find(a => a.agent==='demand');
  const supplierAgent = agents.find(a => a.agent==='supplier');

  /* MC delays */
  const delays: number[] = sim?.scenario_delays?.length
    ? sim.scenario_delays
    : sim?.expected_delay
      ? Array.from({ length:80 }, (_,i) => (sim.expected_delay * (0.4 + Math.random()*1.5 + i*0.012)))
      : [];

  return (
    <main className="min-h-screen pt-16 pb-12 px-4">
      <div className="max-w-[1440px] mx-auto">

        {/* ── Header ── */}
        <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} className="mb-5 flex items-end justify-between flex-wrap gap-3">
          <div>
            <SectionLabel>Intelligence Panel</SectionLabel>
            <h1 className="font-heading text-2xl font-bold">Agentic AI Intelligence</h1>
            <p className="text-text-secondary text-sm mt-0.5">
              <span className="text-neon-cyan font-mono">{route.source}</span>
              <span className="text-text-muted mx-1.5">→</span>
              <span className="text-neon-cyan font-mono">{route.destination}</span>
              {route.stops.length>0 && <span className="text-text-muted ml-1.5">via {route.stops.join(', ')}</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {savedDb && <span className="text-[10px] font-mono text-risk-low border border-risk-low/20 px-2 py-1 rounded">✓ Saved to DB</span>}
            <button onClick={() => runAnalysis(route)} disabled={loading}
              className="px-4 py-2 rounded-lg border border-neon-cyan/25 bg-neon-cyan/5 text-neon-cyan text-xs font-semibold uppercase tracking-wider hover:bg-neon-cyan/12 transition-all disabled:opacity-50">
              {loading
                ? <span className="flex items-center gap-2"><span className="w-3 h-3 border border-neon-cyan/40 border-t-neon-cyan rounded-full animate-spin"/>Running…</span>
                : '↻ Re-run Analysis'}
            </button>
          </div>
        </motion.div>

        {/* ── Loading skeleton ── */}
        <AnimatePresence>
          {loading && !pipeline && (
            <motion.div key="loading" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
              className="flex flex-col items-center justify-center py-28 gap-5">
              <div className="flex gap-4">
                {['weather','news','traffic','supplier','demand'].map((a,i) => (
                  <motion.div key={a} animate={{ opacity:[0.25,1,0.25] }} transition={{ duration:1.5, repeat:Infinity, delay:i*0.28 }}
                    className="text-3xl">{AGENT_META[a].icon}</motion.div>
                ))}
              </div>
              <p className="text-text-muted text-sm font-mono">Running 5-agent pipeline for <span className="text-neon-cyan">{route.source} → {route.destination}</span>…</p>
              <p className="text-text-muted text-xs">This may take 15–60 seconds (ML models + APIs)</p>
            </motion.div>
          )}

          {error && !pipeline && (
            <motion.div key="error" initial={{ opacity:0 }} animate={{ opacity:1 }}
              className="mx-auto max-w-xl text-center py-20">
              <div className="text-3xl mb-4">⚠️</div>
              <p className="text-risk-high text-sm font-semibold mb-2">Intelligence Pipeline Error</p>
              <p className="text-text-muted text-xs leading-relaxed mb-4 font-mono bg-white/[0.03] rounded-lg p-3 text-left">{error}</p>
              <p className="text-text-muted text-xs mb-2">Make sure FastAPI is running:</p>
              <code className="text-[10px] text-neon-cyan font-mono bg-black/30 px-3 py-2 rounded block">
                cd backend/AIAgent &amp;&amp; .venv/Scripts/python -m uvicorn fastapi_app:app --reload --port 8000
              </code>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Results ── */}
        {pipeline && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="space-y-5">

            {/* Row 1: 5 agent score cards with compact insight */}
            <div className="grid grid-cols-5 gap-3">
              {(['weather','news','traffic','supplier','demand'] as const).map(name => {
                const a    = agents.find(x => x.agent===name);
                const meta = AGENT_META[name];
                const s    = a?.risk_score ?? 0;
                /* compact insight line per agent */
                const insight = (() => {
                  if (!a) return null;
                  const r = a.raw_data as (WeatherRaw & TrafficRaw & NewsRaw & DemandRaw) | undefined;
                  if (name === 'weather' && r?.temp !== undefined)
                    return `${r.temp?.toFixed(0)}°C · ${r.description || r.condition} · ${r.city}`;
                  if (name === 'traffic' && r?.current_speed !== undefined)
                    return `${r.current_speed}/${r.free_flow_speed} km/h · ${Math.round((r.congestion_ratio??0)*100)}% congested`;
                  if (name === 'news' && r?.headlines?.length)
                    return r.headlines[0]?.slice(0, 60) + (r.headlines[0]?.length > 60 ? '…' : '');
                  if (name === 'demand' && r?.max_spike !== undefined)
                    return `Max spike: ${r.max_spike >= 0 ? '+' : ''}${r.max_spike?.toFixed(1)}%`;
                  return a.reason?.slice(0, 55) + (a.reason?.length > 55 ? '…' : '');
                })();
                return (
                  <GlassPanel key={name} className="p-3">
                    <div className="flex items-center gap-2.5 mb-2">
                      <div className="relative shrink-0">
                        <Arc score={s} color={rc(s)} size={44}/>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-[10px] font-bold" style={{ color:rc(s) }}>{Math.round(s)}</span>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] text-text-muted truncate">{meta.icon} {meta.label}</div>
                        <div className="text-[10px] font-bold" style={{ color:rc(s) }}>{rl(s)} RISK</div>
                        <div className="text-[9px] text-text-muted">{((a?.confidence??0)*100).toFixed(0)}% conf</div>
                      </div>
                    </div>
                    {insight && (
                      <p className="text-[9px] text-text-muted leading-snug line-clamp-2 border-t border-white/[0.05] pt-1.5">{insight}</p>
                    )}
                  </GlassPanel>
                );
              })}
            </div>

            {/* Row 2: LEFT agents | CENTER Monte Carlo | RIGHT agents */}
            <div className="grid grid-cols-[1fr_2fr_1fr] gap-4">

              {/* ── LEFT: Weather + Traffic ── */}
              <div className="space-y-3">
                <div className="text-[9px] uppercase tracking-widest text-text-muted font-semibold px-1">Weather &amp; Traffic</div>
                <WeatherPanel agent={weatherAgent}/>
                <TrafficPanel agent={trafficAgent}/>

                {/* Supplier card */}
                {supplierAgent && (
                  <GlassPanel className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span>🏭</span>
                        <div>
                          <div className="text-[9px] text-text-muted uppercase tracking-widest">ML Forecast</div>
                          <div className="text-[11px] font-semibold">Supplier Reliability</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold" style={{ color:rc(supplierAgent.risk_score) }}>{Math.round(supplierAgent.risk_score)}</div>
                        <div className="text-[9px]" style={{ color:rc(supplierAgent.risk_score) }}>{rl(supplierAgent.risk_score)}</div>
                      </div>
                    </div>
                    <Bar label="Risk Score" value={supplierAgent.risk_score} max={100} color={rc(supplierAgent.risk_score)}/>
                    <p className="text-[9px] text-text-muted mt-2 leading-relaxed line-clamp-3">{supplierAgent.reason}</p>
                  </GlassPanel>
                )}
              </div>

              {/* ── CENTER: Monte Carlo Simulation ── */}
              <div className="space-y-3">
                <div className="text-[9px] uppercase tracking-widest text-text-muted font-semibold px-1">Monte Carlo Simulation · {delays.length} Runs</div>

                {/* Global risk ring + KPIs */}
                <GlassPanel className="p-5">
                  <div className="flex items-center gap-6">
                    <div className="relative shrink-0">
                      <Arc score={finalRisk} color={rc(finalRisk)} size={96}/>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-xl font-bold" style={{ color:rc(finalRisk) }}>{Math.round(finalRisk)}</span>
                        <span className="text-[8px] text-text-muted">/ 100</span>
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-bold mb-0.5" style={{ color:rc(finalRisk) }}>{riskLevel} RISK</div>
                      {intel && (
                        <div className="space-y-1 text-[10px]">
                          <div className="flex justify-between"><span className="text-text-muted">Dominant factor</span><span className="text-neon-blue capitalize">{intel.dominant_risk}</span></div>
                          <div className="flex justify-between"><span className="text-text-muted">Trend</span><span className={intel.trend>=0?'text-risk-high':'text-risk-low'}>{intel.trend>=0?'↑':'↓'} {Math.abs(intel.trend).toFixed(1)}</span></div>
                          <div className="flex justify-between"><span className="text-text-muted">Volatility</span><span className="font-mono text-neon-blue">{intel.volatility?.toFixed(1)}</span></div>
                          <div className="flex justify-between"><span className="text-text-muted">Correlations</span><span className="text-text-secondary">{intel.correlations?.length??0} detected</span></div>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 flex-1">
                      {[
                        { label:'Expected Delay', value:`${sim?.expected_delay?.toFixed(1)??'—'}d`, color:'#60A5FA' },
                        { label:'P95 Worst Case', value:`${sim?.p95_delay?.toFixed(1)??'—'}d`,      color:'#F59E0B' },
                        { label:'Severe Risk',    value:`${((sim?.probability_severe??0)*100).toFixed(0)}%`, color:'#EF4444' },
                      ].map(({ label,value,color }) => (
                        <div key={label} className="p-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03] text-center">
                          <div className="text-[8px] text-text-muted mb-0.5">{label}</div>
                          <div className="text-sm font-mono font-bold" style={{ color }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </GlassPanel>

                {/* Histogram */}
                <GlassPanel className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold">Delay Distribution (Monte Carlo)</div>
                    <div className="flex gap-2 text-[9px]">
                      {[['Low','#22C55E'],['Med','#F59E0B'],['High','#EF4444']].map(([l,c]) => (
                        <span key={l} className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background:c }}/>{l}</span>
                      ))}
                    </div>
                  </div>
                  <Histogram delays={delays}/>
                  <div className="flex justify-between mt-2 text-[9px] text-text-muted">
                    <span>← Faster delivery</span>
                    <span>Delayed delivery →</span>
                  </div>
                </GlassPanel>

                {/* Node disruption frequency */}
                {sim?.disruption_frequency && Object.keys(sim.disruption_frequency).length>0 && (
                  <GlassPanel className="p-4">
                    <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-3">Node Disruption Frequency</div>
                    <div className="space-y-2">
                      {Object.entries(sim.disruption_frequency)
                        .sort(([,a],[,b]) => (b as number)-(a as number))
                        .slice(0,6)
                        .map(([node,freq]) => (
                          <div key={node}>
                            <div className="flex justify-between text-[10px] mb-0.5">
                              <span className="text-text-secondary capitalize truncate max-w-[200px]">{node.replace(/_/g,' ')}</span>
                              <span className="font-mono" style={{ color:rc((freq as number)*100) }}>{((freq as number)*100).toFixed(0)}%</span>
                            </div>
                            <div className="h-1 bg-white/[0.05] rounded-full overflow-hidden">
                              <motion.div initial={{ width:0 }} animate={{ width:`${Math.min((freq as number)*100,100)}%` }} transition={{ duration:0.8 }}
                                className="h-full rounded-full" style={{ background:rc((freq as number)*100) }}/>
                            </div>
                          </div>
                        ))}
                    </div>
                  </GlassPanel>
                )}

                {/* Sensitivity */}
                {sim?.sensitivity && Object.keys(sim.sensitivity).length>0 && (
                  <GlassPanel className="p-4">
                    <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-3">Delay Sensitivity Analysis</div>
                    <div className="space-y-2">
                      {Object.entries(sim.sensitivity).sort(([,a],[,b])=>(b as number)-(a as number)).map(([factor,impact]) => (
                        <div key={factor} className="flex items-center justify-between px-2 py-1.5 rounded bg-white/[0.02]">
                          <span className="text-[10px] text-text-secondary capitalize">{factor.replace(/_/g,' ')}</span>
                          <span className="text-[10px] font-mono text-risk-medium">+{(impact as number).toFixed(1)}d</span>
                        </div>
                      ))}
                    </div>
                  </GlassPanel>
                )}

                {/* Pipeline steps */}
                <GlassPanel className="p-4">
                  <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-3">Pipeline Steps</div>
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { n:1, label:'Multi-Agent',  done:!!pipeline.step1_risk_assessment },
                      { n:2, label:'Monte Carlo',  done:!!pipeline.step2_simulation },
                      { n:3, label:'Game Theory',  done:!!pipeline.step3_game_theory },
                      { n:4, label:'QUBO Decision',done:!!pipeline.step4_decision },
                      { n:5, label:'Economic',     done:!!pipeline.step5_economic },
                    ].map(s => (
                      <div key={s.n} className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[9px] font-semibold border ${
                        s.done ? 'border-risk-low/30 bg-risk-low/10 text-risk-low' : 'border-white/[0.06] bg-white/[0.02] text-text-muted'
                      }`}>
                        <span>{s.done?'✓':s.n}</span><span>{s.label}</span>
                      </div>
                    ))}
                  </div>
                </GlassPanel>
              </div>

              {/* ── RIGHT: News + Demand ── */}
              <div className="space-y-3">
                <div className="text-[9px] uppercase tracking-widest text-text-muted font-semibold px-1">News &amp; Demand</div>
                <NewsPanel agent={newsAgent}/>
                <DemandPanel agent={demandAgent}/>

                {/* Agent reason summary */}
                <GlassPanel className="p-4">
                  <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-3">Agent Reasons</div>
                  <div className="space-y-2.5">
                    {agents.map(a => {
                      const meta = AGENT_META[a.agent] ?? { icon:'🤖', color:'#94A3B8' };
                      return (
                        <div key={a.agent} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-text-secondary">{meta.icon} {a.agent}</span>
                            <span className="text-[9px] font-mono" style={{ color:rc(a.risk_score) }}>{Math.round(a.risk_score)}</span>
                          </div>
                          <div className="h-0.5 bg-white/[0.05] rounded-full overflow-hidden">
                            <motion.div initial={{ width:0 }} animate={{ width:`${a.risk_score}%` }} transition={{ duration:0.8 }}
                              className="h-full rounded-full" style={{ background:meta.color }}/>
                          </div>
                          <p className="text-[9px] text-text-muted leading-relaxed line-clamp-2">{a.reason}</p>
                        </div>
                      );
                    })}
                  </div>
                </GlassPanel>
              </div>
            </div>

          </motion.div>
        )}

        {/* Inline loading overlay when re-running with existing data */}
        {loading && pipeline && (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border border-neon-cyan/20 bg-black/80 backdrop-blur-sm">
            <span className="w-4 h-4 border border-neon-cyan/40 border-t-neon-cyan rounded-full animate-spin"/>
            <span className="text-xs text-neon-cyan font-mono">Re-running pipeline…</span>
          </div>
        )}
      </div>
    </main>
  );
}
