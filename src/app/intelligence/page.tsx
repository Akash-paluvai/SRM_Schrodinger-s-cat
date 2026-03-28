'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import GlassPanel from '@/components/GlassPanel';
import { StatusBadge, SectionLabel } from '@/components/ui';

interface IntelData {
  riskOverview: { score: number; level: string; trend: string; change: string };
  newsAlerts: { id: number; severity: string; title: string; body: string; time: string; source: string }[];
  weatherAlerts: { region: string; condition: string; severity: string; windSpeed: string; wavHeight: string }[];
  demandSignals: { product: string; change: string; trend: string; region: string }[];
}

export default function IntelligencePage() {
  const [data, setData] = useState<IntelData | null>(null);

  useEffect(() => {
    fetch('/api/intelligence').then((r) => r.json()).then(setData);
  }, []);

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-14 pb-14">
        <div className="text-text-muted text-sm font-mono animate-pulse">Loading intelligence...</div>
      </div>
    );
  }

  const severityColor = (s: string) => {
    if (s === 'critical') return 'border-risk-high/20 bg-risk-high/5';
    if (s === 'warning') return 'border-risk-medium/20 bg-risk-medium/5';
    return 'border-neon-blue/10 bg-neon-blue/5';
  };

  const dotColor = (s: string) => {
    if (s === 'critical') return 'bg-risk-high shadow-[0_0_6px_rgba(239,68,68,0.5)]';
    if (s === 'warning') return 'bg-risk-medium shadow-[0_0_6px_rgba(245,158,11,0.5)]';
    return 'bg-neon-blue shadow-[0_0_6px_rgba(59,130,246,0.5)]';
  };

  return (
    <main className="min-h-screen pt-16 pb-16 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <SectionLabel>Intelligence Panel</SectionLabel>
          <h1 className="font-heading text-3xl font-bold">Real-Time AI Insights</h1>
          <p className="text-text-secondary text-sm mt-1">Continuous monitoring of 10,000+ global signals</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Risk Overview — Full Width */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-3"
          >
            <GlassPanel className="p-6 flex items-center justify-between flex-wrap gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-text-muted mb-1">Global Risk Index</div>
                <div className="flex items-end gap-3">
                  <span className="font-heading text-5xl font-bold text-risk-medium">{data.riskOverview.score}</span>
                  <span className="text-sm text-text-muted mb-2">/ 100</span>
                </div>
              </div>
              <div className="flex gap-6">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-text-muted">Level</div>
                  <div className="text-sm font-semibold text-risk-medium mt-0.5">{data.riskOverview.level}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-text-muted">Trend</div>
                  <div className="text-sm font-semibold text-risk-high mt-0.5">↑ {data.riskOverview.trend}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-text-muted">24h Change</div>
                  <div className="text-sm font-semibold text-text-secondary mt-0.5">{data.riskOverview.change}</div>
                </div>
              </div>
              <div className="w-full lg:w-auto">
                <div className="w-full lg:w-64 h-2 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-risk-low via-risk-medium to-risk-high rounded-full" style={{ width: `${data.riskOverview.score}%` }} />
                </div>
              </div>
            </GlassPanel>
          </motion.div>

          {/* News Alerts */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-2"
          >
            <GlassPanel className="p-5">
              <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-4">News Alerts</div>
              <div className="space-y-3">
                {data.newsAlerts.map((alert) => (
                  <div key={alert.id} className={`rounded-lg border p-3 ${severityColor(alert.severity)}`}>
                    <div className="flex items-start gap-2.5">
                      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${dotColor(alert.severity)}`} />
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-semibold text-text-primary">{alert.title}</span>
                          <span className="text-[9px] font-mono text-text-muted">{alert.source}</span>
                        </div>
                        <p className="text-xs text-text-secondary leading-relaxed">{alert.body}</p>
                        <span className="text-[10px] text-text-muted mt-1 inline-block">{alert.time}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </GlassPanel>
          </motion.div>

          {/* Sidebar: Weather + Demand */}
          <div className="space-y-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <GlassPanel className="p-5">
                <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-4">Weather Alerts</div>
                <div className="space-y-3">
                  {data.weatherAlerts.map((w) => (
                    <div key={w.region} className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-medium text-text-primary">{w.region}</div>
                        <div className="text-[10px] text-text-muted">{w.condition} • {w.windSpeed}</div>
                      </div>
                      <StatusBadge level={w.severity === 'critical' ? 'high' : w.severity === 'warning' ? 'medium' : 'low'} />
                    </div>
                  ))}
                </div>
              </GlassPanel>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <GlassPanel className="p-5">
                <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-4">Demand Signals</div>
                <div className="space-y-3">
                  {data.demandSignals.map((d) => (
                    <div key={d.product} className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-medium text-text-primary">{d.product}</div>
                        <div className="text-[10px] text-text-muted">{d.region}</div>
                      </div>
                      <span className={`text-xs font-mono font-semibold ${d.trend === 'up' ? 'text-risk-low' : d.trend === 'down' ? 'text-risk-high' : 'text-text-muted'}`}>
                        {d.change}
                      </span>
                    </div>
                  ))}
                </div>
              </GlassPanel>
            </motion.div>
          </div>
        </div>
      </div>
    </main>
  );
}
