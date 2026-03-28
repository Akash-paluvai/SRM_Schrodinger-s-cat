'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import GlassPanel from '@/components/GlassPanel';
import { SectionLabel } from '@/components/ui';

interface Decision {
  id: string;
  action: string;
  timestamp: string;
  status: string;
  factors: Record<string, number>;
  outcome: { delayReduction: string; costReduction: string; riskReduction: string };
  reasoning: string;
  alternatives: { action: string; risk: string; delay: string; cost: string }[];
}

export default function ExplainabilityPage() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    fetch('/api/explain')
      .then((r) => r.json())
      .then((d) => setDecisions(d.decisions));
  }, []);

  if (!decisions.length) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-14 pb-14">
        <div className="text-text-muted text-sm font-mono animate-pulse">Loading decisions...</div>
      </div>
    );
  }

  const dec = decisions[active];
  const factorEntries = Object.entries(dec.factors).sort((a, b) => b[1] - a[1]);
  const factorColors: Record<string, string> = {
    weather: 'bg-neon-blue',
    geopolitics: 'bg-risk-high',
    congestion: 'bg-risk-medium',
    demand: 'bg-neon-purple',
  };

  return (
    <main className="min-h-screen pt-16 pb-16 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <SectionLabel>Explainability</SectionLabel>
          <h1 className="font-heading text-3xl font-bold">Decision Transparency</h1>
          <p className="text-text-secondary text-sm mt-1">Understand why the AI made each decision</p>
        </div>

        {/* Decision Tabs */}
        <div className="flex gap-2 mb-6">
          {decisions.map((d, i) => (
            <button
              key={d.id}
              onClick={() => setActive(i)}
              className={`px-4 py-2 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                i === active
                  ? 'border-neon-blue/30 bg-neon-blue/8 text-neon-blue'
                  : 'border-white/5 text-text-muted hover:text-text-secondary'
              }`}
            >
              {d.id}
            </button>
          ))}
        </div>

        <motion.div
          key={dec.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Decision Header */}
          <GlassPanel className="p-6">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-text-muted mb-1">Decision</div>
                <h2 className="font-heading text-xl font-bold text-text-primary">{dec.action}</h2>
              </div>
              <span className="px-3 py-1 rounded-full bg-risk-low/10 text-risk-low text-[10px] font-bold tracking-wider uppercase">{dec.status}</span>
            </div>
            <div className="text-xs text-text-muted font-mono">
              {new Date(dec.timestamp).toLocaleString()} • {dec.id}
            </div>
          </GlassPanel>

          {/* Factor Breakdown */}
          <GlassPanel className="p-6">
            <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-4">Reason Breakdown</div>
            <div className="space-y-3">
              {factorEntries.map(([key, val]) => (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-text-secondary capitalize">{key}</span>
                    <span className="text-xs font-mono text-text-primary">{val}%</span>
                  </div>
                  <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${val}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
                      className={`h-full rounded-full ${factorColors[key] || 'bg-neon-blue'}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </GlassPanel>

          {/* Outcome */}
          <div className="grid grid-cols-3 gap-3">
            <GlassPanel className="p-4 text-center">
              <div className="text-[10px] uppercase tracking-widest text-text-muted mb-1">Delay Saved</div>
              <div className="font-heading text-lg font-bold text-risk-low">{dec.outcome.delayReduction}</div>
            </GlassPanel>
            <GlassPanel className="p-4 text-center">
              <div className="text-[10px] uppercase tracking-widest text-text-muted mb-1">Cost Saved</div>
              <div className="font-heading text-lg font-bold text-risk-low">{dec.outcome.costReduction}</div>
            </GlassPanel>
            <GlassPanel className="p-4 text-center">
              <div className="text-[10px] uppercase tracking-widest text-text-muted mb-1">Risk Change</div>
              <div className="font-heading text-lg font-bold text-neon-blue">{dec.outcome.riskReduction}</div>
            </GlassPanel>
          </div>

          {/* AI Reasoning */}
          <GlassPanel className="p-5">
            <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-2">AI Reasoning</div>
            <p className="text-sm text-text-secondary leading-relaxed">{dec.reasoning}</p>
          </GlassPanel>

          {/* Alternatives */}
          <GlassPanel className="p-5">
            <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-3">Alternatives Considered</div>
            <div className="space-y-2">
              {dec.alternatives.map((alt, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-white/5 bg-white/[0.01]">
                  <div>
                    <div className="text-xs font-medium text-text-primary">{alt.action}</div>
                    <div className="text-[10px] text-text-muted mt-0.5">Risk: {alt.risk}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-risk-medium">{alt.delay}</div>
                    <div className="text-[10px] text-risk-high">{alt.cost}</div>
                  </div>
                </div>
              ))}
            </div>
          </GlassPanel>
        </motion.div>
      </div>
    </main>
  );
}
