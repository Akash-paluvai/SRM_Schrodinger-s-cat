'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import GlassPanel from '@/components/GlassPanel';
import { MetricCard, SectionLabel } from '@/components/ui';
import { useAppStore } from '@/lib/store';

const disruptions = [
  { id: 'war', label: 'War / Conflict', icon: '⚔️', desc: 'Geopolitical conflict disrupting major trade corridors' },
  { id: 'storm', label: 'Storm / Typhoon', icon: '🌊', desc: 'Severe weather event impacting shipping lanes' },
  { id: 'port-block', label: 'Port Blockage', icon: '🚢', desc: 'Port congestion or closure halting operations' },
];

interface SimResult {
  disruption: string;
  delay: string;
  costIncrease: string;
  suggestedRoute: string;
  confidence: number;
  reasoning: string;
  affectedRoutes: number;
  affectedShipments: number;
}

export default function SimulationPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<SimResult | null>(null);
  const [savedToDb, setSavedToDb] = useState(false);

  const setSimulationResult = useAppStore((s) => s.setSimulationResult);
  const shipmentDbId        = useAppStore((s) => s.shipmentDbId);

  const runSimulation = async () => {
    if (!selected) return;
    setLoading(true);
    setResult(null);
    setSavedToDb(false);

    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disruption: selected }),
      });
      const data = await res.json();
      setResult(data);
      setSimulationResult(data);

      /* ── Persist simulation result to DB if we have a shipment ID ── */
      if (shipmentDbId) {
        fetch(`/api/shipments/${shipmentDbId}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'simulation_result',
            data: {
              disruption:        selected,
              delay:             data.delay,
              costIncrease:      data.costIncrease,
              suggestedRoute:    data.suggestedRoute,
              confidence:        data.confidence,
              reasoning:         data.reasoning,
              affectedRoutes:    data.affectedRoutes,
              affectedShipments: data.affectedShipments,
              simulatedAt:       new Date().toISOString(),
            },
          }),
        })
          .then((r) => { if (r.ok) setSavedToDb(true); })
          .catch(() => {}); // non-blocking
      }
    } catch (e) {
      console.error('Simulation failed:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen pt-16 pb-16 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <SectionLabel>Simulation Engine</SectionLabel>
          <h1 className="font-heading text-3xl font-bold">What-If Analysis</h1>
          <p className="text-text-secondary text-sm mt-1">Model disruption scenarios and see cascading impacts</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Controls */}
          <div className="space-y-4">
            <GlassPanel className="p-5">
              <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-4">Select Disruption</div>
              <div className="space-y-2">
                {disruptions.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setSelected(d.id)}
                    className={`w-full p-4 rounded-lg border text-left transition-all cursor-pointer ${
                      selected === d.id
                        ? 'border-neon-blue/30 bg-neon-blue/5'
                        : 'border-white/5 bg-white/[0.02] hover:border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{d.icon}</span>
                      <div>
                        <div className="text-sm font-semibold text-text-primary">{d.label}</div>
                        <div className="text-xs text-text-muted mt-0.5">{d.desc}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </GlassPanel>

            <button
              onClick={runSimulation}
              disabled={!selected || loading}
              className={`w-full py-3.5 rounded-xl font-heading text-sm font-semibold tracking-wider uppercase transition-all cursor-pointer ${
                selected && !loading
                  ? 'bg-neon-blue/10 border border-neon-blue/30 text-neon-blue hover:bg-neon-blue/20 hover:shadow-[0_0_30px_rgba(59,130,246,0.15)]'
                  : 'bg-white/[0.02] border border-white/5 text-text-muted cursor-not-allowed'
              }`}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3 h-3 border border-neon-blue/40 border-t-neon-blue rounded-full animate-spin" />
                  Processing...
                </span>
              ) : (
                'Run Simulation'
              )}
            </button>
          </div>

          {/* Right: Output */}
          <div>
            <AnimatePresence mode="wait">
              {result ? (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <MetricCard label="Delay Impact" value={result.delay} color="text-risk-medium" />
                    <MetricCard label="Cost Increase" value={result.costIncrease} color="text-risk-high" />
                    <MetricCard label="Routes Affected" value={String(result.affectedRoutes)} color="text-neon-blue" />
                    <MetricCard label="Shipments" value={String(result.affectedShipments)} color="text-neon-cyan" />
                  </div>

                  <GlassPanel className="p-5">
                    <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-2">AI Recommended Action</div>
                    <p className="text-sm text-neon-blue leading-relaxed">{result.suggestedRoute}</p>
                  </GlassPanel>

                  <GlassPanel className="p-5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold">AI Reasoning</div>
                      <span className="text-[10px] font-mono text-risk-low">{result.confidence}% confidence</span>
                    </div>
                    <p className="text-xs text-text-secondary leading-relaxed">{result.reasoning}</p>
                  </GlassPanel>

                  {savedToDb && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-risk-low/20 bg-risk-low/5">
                      <span className="w-1.5 h-1.5 rounded-full bg-risk-low" />
                      <span className="text-[10px] text-risk-low font-mono">Simulation result saved to database</span>
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="h-full flex items-center justify-center min-h-[400px]"
                >
                  <div className="text-center">
                    <div className="text-4xl mb-3 opacity-30">🧪</div>
                    <p className="text-sm text-text-muted">Select a disruption and run the simulation</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </main>
  );
}
