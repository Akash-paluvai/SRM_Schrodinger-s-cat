'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import GlassPanel from '@/components/GlassPanel';
import { SectionLabel, StatusBadge } from '@/components/ui';
import { useAppStore } from '@/lib/store';
import type { SCNodeData, SCEdgeData } from '@/components/GraphEngine';

const GraphEngine = dynamic(() => import('@/components/GraphEngine'), { ssr: false });

/* ═══════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════ */
interface GraphData {
  nodes: Array<{
    id: string; label: string; type: string; risk: number; demand: number;
    load: number; capacity: number; role: string; factorType?: string;
    severity?: number; impactedNodes?: string[]; impactedEdges?: number[];
  }>;
  edges: Array<{
    source: string; target: string; transportMode: string;
    distance: number; time: number; cost: number; risk: number;
    capacity: number; flow: number;
  }>;
  summary: { totalNodes: number; totalEdges: number; highRiskPaths: number; avgFlow: number; factorNodes: number };
  intelligence: {
    bottleneck: { nodeId: string; label: string; ratio: number };
    criticalPath: { nodes: string[]; totalRisk: number };
    highestRiskRoute: { from: string; to: string; risk: number };
    demandHotspot: { nodeId: string; label: string; demand: number };
  };
}

type DetailType = 'node' | 'edge' | 'none';

/* ═══════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════ */
const riskColor = (r: number) => r >= 60 ? 'text-red-400' : r >= 30 ? 'text-amber-400' : 'text-emerald-400';

const typeLabels: Record<string, string> = {
  supply: 'Supply / Manufacturing',
  transit: 'Transit Hub',
  storage: 'Storage / Distribution',
  demand: 'Demand / Market',
  factor: 'Risk Factor',
};

const modeIcons: Record<string, string> = { road: '🛣️', sea: '🚢', air: '✈️' };

const DEMO_SCENARIOS: Record<string, { name: string; desc: string; icon: string; short: string }> = {
  '1': { name: 'India Distribution', desc: 'China → Singapore / Dubai → Mumbai / Delhi → Bengaluru / Hyderabad', icon: '🇮🇳', short: 'India Distribution' },
  '2': { name: 'Global Pharma', desc: 'Switzerland / Ireland → Frankfurt / Rotterdam → New York / São Paulo / Tokyo', icon: '💊', short: 'Global Pharma' },
  '3': { name: 'EV Battery Chain', desc: 'Australia / Chile → Shanghai → CATL / Busan → Tesla / BMW / BYD', icon: '🔋', short: 'EV Battery' },
};

/* ═══════════════════════════════════════════════════════
   HYDRATION-SAFE LOADING SKELETON (identical server+client)
   ═══════════════════════════════════════════════════════ */
function LoadingSkeleton() {
  return (
    <div className="min-h-screen flex items-center justify-center pt-14 pb-14">
      <div className="flex flex-col items-center gap-3">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-2 border-neon-cyan/20 border-t-neon-cyan animate-spin" />
          <div className="absolute inset-2 rounded-full border-2 border-neon-blue/20 border-b-neon-blue animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
        </div>
        <div className="text-text-muted text-sm font-mono">Initializing Graph Engine...</div>
        <div className="text-[10px] text-text-muted/50 font-mono">Loading network topology</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════ */
export default function GraphPage() {
  /* Hydration guard — render NOTHING dynamic until mounted */
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  /* Read shipment from zustand store */
  const shipment = useAppStore((s) => s.shipment);

  const [data, setData] = useState<GraphData | null>(null);

  // Demo mode
  const [isDemo, setIsDemo] = useState(false);
  const [demoId, setDemoId] = useState('1');

  // Controls
  const [showRisk, setShowRisk] = useState(true);
  const [showDemand, setShowDemand] = useState(false);
  const [showBottlenecks, setShowBottlenecks] = useState(true);
  const [showFactors, setShowFactors] = useState(true);
  const [criticalPathMode, setCriticalPathMode] = useState(false);
  const [heatmapMode, setHeatmapMode] = useState(false);

  // Timeline
  const [timeOffset, setTimeOffset] = useState(0);

  // Ripple effect
  const [rippleSourceId, setRippleSourceId] = useState<string | null>(null);

  // Detail panel
  const [detailType, setDetailType] = useState<DetailType>('none');
  const [selectedNode, setSelectedNode] = useState<SCNodeData | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<SCEdgeData | null>(null);

  // Highlighted node from insights
  const [highlightNodeId, setHighlightNodeId] = useState<string | null>(null);

  /* ── Fetch graph data — demo or dynamic based on shipment input ── */
  useEffect(() => {
    if (!mounted) return;

    // Reset panels on mode switch
    setDetailType('none');
    setSelectedNode(null);
    setSelectedEdge(null);
    setRippleSourceId(null);
    setTimeOffset(0);

    const params = new URLSearchParams();

    if (isDemo) {
      params.set('demo', 'true');
      params.set('demoId', demoId);
    } else if (shipment) {
      params.set('source', shipment.source);
      params.set('destination', shipment.destination);
      if (shipment.stops.length > 0) {
        params.set('stops', shipment.stops.map(s => s.location).filter(Boolean).join(','));
      }
      params.set('mode', shipment.transportMode || 'sea');
      params.set('riskTolerance', shipment.riskTolerance || 'medium');
    }

    fetch(`/api/graph?${params.toString()}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {
        fetch('/api/graph').then(r => r.json()).then(setData);
      });
  }, [mounted, shipment, isDemo, demoId]);

  const handleNodeClick = useCallback((node: SCNodeData) => {
    setSelectedNode(node);
    setSelectedEdge(null);
    setDetailType('node');
    if (node.nodeType === 'factor') {
      setRippleSourceId((prev) => prev === (node as unknown as { id?: string }).id ? null : (node as unknown as { id?: string }).id || null);
    } else {
      setRippleSourceId(null);
    }
  }, []);

  const handleEdgeClick = useCallback((edge: SCEdgeData) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
    setDetailType('edge');
    setRippleSourceId(null);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailType('none');
    setSelectedNode(null);
    setSelectedEdge(null);
    setRippleSourceId(null);
  }, []);

  const highlightInsight = useCallback((nodeId: string) => {
    setHighlightNodeId(nodeId);
    setTimeout(() => setHighlightNodeId(null), 3000);
  }, []);

  /* Hydration-safe: show identical skeleton on server + pre-mount client */
  if (!mounted || !data) {
    return <LoadingSkeleton />;
  }

  const intel = data.intelligence;
  const timeLabel = timeOffset === 0 ? 'NOW' : `+${timeOffset}h`;

  return (
    <main className="min-h-screen pt-16 pb-16 px-4">
      <div className="max-w-[1440px] mx-auto">

        {/* ── Header ── */}
        <div className="mb-4">
          <SectionLabel>Digital Twin</SectionLabel>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-heading text-3xl font-bold bg-gradient-to-r from-white via-cyan-200 to-blue-400 bg-clip-text text-transparent">
                Supply Chain Network
              </h1>
              <p className="text-text-secondary text-sm mt-0.5">Real-time flow visualization with AI-driven risk intelligence</p>
              {shipment && !isDemo && (
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-neon-cyan/10 border border-neon-cyan/20 text-neon-cyan">
                    📦 {shipment.source} → {shipment.stops.filter(s => s.location).map(s => s.location).join(' → ')}{shipment.stops.filter(s => s.location).length > 0 ? ' → ' : ''}{shipment.destination}
                  </span>
                  <span className="text-[8px] font-mono text-text-muted">via {shipment.transportMode}</span>
                </div>
              )}
              {!shipment && !isDemo && (
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-text-muted">
                    Simulated Data — submit a shipment on Home to see your route
                  </span>
                </div>
              )}
              {isDemo && (
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/25 text-purple-400">
                    🎯 {DEMO_SCENARIOS[demoId].name}
                  </span>
                  <span className="text-[8px] font-mono text-text-muted">{DEMO_SCENARIOS[demoId].desc}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              {/* Demo toggle */}
              <button
                onClick={() => setIsDemo(!isDemo)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer transition-all duration-300 ${
                  isDemo
                    ? 'border-purple-500/40 bg-purple-500/15 text-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.25)]'
                    : 'border-white/10 bg-white/[0.03] text-text-muted hover:border-purple-500/20 hover:text-purple-300'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full transition-colors ${isDemo ? 'bg-purple-400' : 'bg-slate-600'}`} />
                Demo
              </button>

              {rippleSourceId && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-red-500/30 bg-red-500/10"
                >
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-[10px] font-mono text-red-400 font-bold">RIPPLE ACTIVE</span>
                </motion.div>
              )}
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full animate-pulse ${isDemo ? 'bg-purple-400' : 'bg-emerald-400'}`} />
                <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">{isDemo ? 'Demo Mode' : 'Live Engine'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Demo Scenario Selector ── */}
        <AnimatePresence>
          {isDemo && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="mb-3 overflow-hidden"
            >
              <div className="flex items-center gap-2">
                <span className="text-[8px] uppercase tracking-widest text-text-muted font-semibold whitespace-nowrap">Scenario:</span>
                {Object.entries(DEMO_SCENARIOS).map(([id, s]) => (
                  <button
                    key={id}
                    onClick={() => setDemoId(id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-mono cursor-pointer transition-all ${
                      demoId === id
                        ? 'border-purple-500/40 bg-purple-500/15 text-purple-300 shadow-[0_0_8px_rgba(168,85,247,0.2)]'
                        : 'border-white/8 bg-white/[0.02] text-text-muted hover:border-purple-500/20 hover:text-purple-300/70'
                    }`}
                  >
                    <span>{s.icon}</span>
                    <span className="font-semibold">{s.short}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Summary Bar ── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="grid grid-cols-6 gap-2.5 mb-4">
            {[
              { label: 'Nodes', value: data.summary.totalNodes, color: 'text-neon-cyan' },
              { label: 'Edges', value: data.summary.totalEdges, color: 'text-neon-blue' },
              { label: 'High Risk', value: data.summary.highRiskPaths, color: 'text-red-400' },
              { label: 'Factors', value: data.summary.factorNodes, color: 'text-amber-400' },
              { label: 'Avg Flow', value: `${data.summary.avgFlow.toLocaleString()}`, color: 'text-text-primary', suffix: ' TEU' },
              { label: 'Timeline', value: timeLabel, color: timeOffset > 0 ? 'text-purple-400' : 'text-text-muted' },
            ].map((m) => (
              <GlassPanel key={m.label} className="p-2.5 text-center !p-2.5">
                <div className="text-[8px] uppercase tracking-[0.15em] text-text-muted font-semibold">{m.label}</div>
                <div className={`font-heading text-lg font-bold ${m.color}`}>{m.value}{m.suffix || ''}</div>
              </GlassPanel>
            ))}
          </div>
        </motion.div>

        {/* ── Main Grid: Graph + Sidebar ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">

          {/* ════════ LEFT: Graph Canvas ════════ */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <GlassPanel className="p-0 overflow-hidden !p-0" style={{ height: 580 }}>
              {/* Pipeline labels */}
              <div className="absolute top-2 left-0 right-0 flex justify-around pointer-events-none z-10 px-8">
                {['SUPPLIERS', 'TRANSIT HUBS', 'STORAGE', 'MARKETS', 'FACTORS'].map((l, i) => (
                  <span key={l} className="text-[8px] font-mono font-bold uppercase tracking-[0.2em] px-2 py-0.5 rounded-full" style={{
                    color: ['#3B82F6', '#00F0FF', '#F59E0B', '#10B981', '#EF4444'][i],
                    background: `${['rgba(59,130,246,0.08)', 'rgba(0,240,255,0.08)', 'rgba(245,158,11,0.08)', 'rgba(16,185,129,0.08)', 'rgba(239,68,68,0.08)'][i]}`,
                    border: `1px solid ${['rgba(59,130,246,0.15)', 'rgba(0,240,255,0.15)', 'rgba(245,158,11,0.15)', 'rgba(16,185,129,0.15)', 'rgba(239,68,68,0.15)'][i]}`,
                  }}>
                    {l}
                  </span>
                ))}
              </div>

              <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-text-muted font-mono text-sm">Loading...</div>}>
                <GraphEngine
                  rawNodes={data.nodes}
                  rawEdges={data.edges}
                  showRisk={showRisk}
                  showDemand={showDemand}
                  showBottlenecks={showBottlenecks}
                  showFactors={showFactors}
                  criticalPathMode={criticalPathMode}
                  heatmapMode={heatmapMode}
                  criticalPathNodes={intel.criticalPath.nodes}
                  bottleneckNodeId={intel.bottleneck.nodeId}
                  rippleSourceId={rippleSourceId}
                  timeOffset={timeOffset}
                  onNodeClick={handleNodeClick}
                  onEdgeClick={handleEdgeClick}
                  highlightNodeId={highlightNodeId}
                />
              </Suspense>
            </GlassPanel>

            {/* ── Timeline Slider ── */}
            <GlassPanel className="mt-3 !py-3 !px-5">
              <div className="flex items-center gap-4">
                <div className="text-[9px] uppercase tracking-widest text-text-muted font-semibold whitespace-nowrap">
                  ⏱ Timeline Simulation
                </div>
                <div className="flex-1 relative">
                  <input
                    type="range"
                    min={0}
                    max={48}
                    step={4}
                    value={timeOffset}
                    onChange={(e) => setTimeOffset(Number(e.target.value))}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, #00F0FF ${(timeOffset / 48) * 100}%, rgba(255,255,255,0.06) ${(timeOffset / 48) * 100}%)`,
                    }}
                  />
                  <div className="flex justify-between mt-1">
                    {['NOW', '+8h', '+16h', '+24h', '+32h', '+40h', '+48h'].map((l, i) => (
                      <span key={l} className={`text-[7px] font-mono ${timeOffset >= i * 8 ? 'text-neon-cyan' : 'text-text-muted/40'}`}>{l}</span>
                    ))}
                  </div>
                </div>
                <div className={`text-sm font-mono font-bold min-w-[48px] text-right ${timeOffset > 0 ? 'text-purple-400' : 'text-text-muted'}`}>
                  {timeLabel}
                </div>
              </div>
            </GlassPanel>
          </motion.div>

          {/* ════════ RIGHT: Sidebar ════════ */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-3 max-h-[720px] overflow-y-auto pr-1"
            style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.05) transparent' }}
          >

            {/* ── Control Panel ── */}
            <GlassPanel className="!p-3">
              <div className="text-[9px] uppercase tracking-[0.15em] text-text-muted font-semibold mb-2.5">Controls</div>
              <div className="space-y-1.5">
                {[
                  { label: 'Show Risk', state: showRisk, setter: setShowRisk, color: '#EF4444' },
                  { label: 'Show Demand', state: showDemand, setter: setShowDemand, color: '#10B981' },
                  { label: 'Bottlenecks', state: showBottlenecks, setter: setShowBottlenecks, color: '#F59E0B' },
                  { label: 'Factor Nodes', state: showFactors, setter: setShowFactors, color: '#EF4444' },
                  { label: 'Critical Path', state: criticalPathMode, setter: setCriticalPathMode, color: '#00F0FF' },
                  { label: 'Risk Heatmap', state: heatmapMode, setter: setHeatmapMode, color: '#8B5CF6' },
                ].map((c) => (
                  <button
                    key={c.label}
                    onClick={() => c.setter(!c.state)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer ${
                      c.state ? 'border-white/10 bg-white/[0.03]' : 'border-white/[0.03] bg-transparent opacity-40'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: c.color, opacity: c.state ? 1 : 0.3 }} />
                      <span className="text-[10px] text-text-secondary">{c.label}</span>
                    </div>
                    <div className={`w-6 h-3.5 rounded-full transition-all ${c.state ? '' : 'bg-white/5'}`} style={{ background: c.state ? `${c.color}30` : undefined }}>
                      <div className={`w-2.5 h-2.5 rounded-full transition-all mt-[2px] ${c.state ? 'ml-3' : 'ml-[2px]'}`}
                        style={{ background: c.state ? c.color : '#475569' }} />
                    </div>
                  </button>
                ))}
              </div>
            </GlassPanel>

            {/* ── Detail Panel ── */}
            <AnimatePresence mode="wait">
              {detailType === 'node' && selectedNode && (
                <motion.div key="node-detail" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                  <GlassPanel className="!p-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[9px] uppercase tracking-[0.15em] text-text-muted font-semibold">
                        {selectedNode.nodeType === 'factor' ? '⚠️ Factor' : '📍 Node'} Detail
                      </div>
                      <button onClick={closeDetail} className="text-text-muted hover:text-text-primary text-xs cursor-pointer transition-colors">✕</button>
                    </div>
                    <div className="text-sm font-bold text-text-primary mb-1">{selectedNode.label}</div>
                    <div className="flex items-center gap-2 mb-2.5">
                      <StatusBadge level={selectedNode.risk >= 60 ? 'high' : selectedNode.risk >= 30 ? 'medium' : 'low'} />
                      <span className="text-[9px] text-text-muted">{typeLabels[selectedNode.nodeType]}</span>
                    </div>

                    <div className="space-y-1">
                      {selectedNode.nodeType !== 'factor' ? (
                        <>
                          <DetailRow label="Risk" value={`${selectedNode.risk}`} color={riskColor(selectedNode.risk)} />
                          <DetailRow label="Demand" value={`${selectedNode.demand}`} color="text-emerald-400" />
                          <DetailRow label="Load" value={`${selectedNode.load.toLocaleString()} TEU`} />
                          <DetailRow label="Capacity" value={`${selectedNode.capacity.toLocaleString()} TEU`} />
                          <DetailRow
                            label="Utilization"
                            value={`${selectedNode.capacity > 0 ? Math.round(selectedNode.load / selectedNode.capacity * 100) : 0}%`}
                            color={selectedNode.capacity > 0 && selectedNode.load / selectedNode.capacity > 0.8 ? 'text-red-400' : 'text-emerald-400'}
                          />
                          <DetailRow label="Role" value={selectedNode.role} small />
                        </>
                      ) : (
                        <>
                          <DetailRow label="Severity" value={`${selectedNode.severity}/100`} color="text-red-400" />
                          <DetailRow label="Type" value={selectedNode.factorType || '—'} color="text-amber-400" />
                          {selectedNode.impactedNodes && selectedNode.impactedNodes.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-white/5">
                              <div className="text-[8px] uppercase tracking-widest text-text-muted mb-1">Impacted Nodes</div>
                              {selectedNode.impactedNodes.map((id) => {
                                const n = data.nodes.find(x => x.id === id);
                                return <div key={id} className="text-[10px] text-red-400 font-mono">→ {n?.label || id}</div>;
                              })}
                            </div>
                          )}
                          <div className="mt-2 p-2 rounded-lg border border-red-500/15 bg-red-500/5">
                            <div className="text-[8px] text-red-300 font-mono">
                              💡 Click this factor node again to toggle ripple effect
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </GlassPanel>
                </motion.div>
              )}

              {detailType === 'edge' && selectedEdge && (
                <motion.div key="edge-detail" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                  <GlassPanel className="!p-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[9px] uppercase tracking-[0.15em] text-text-muted font-semibold">🔗 Route Detail</div>
                      <button onClick={closeDetail} className="text-text-muted hover:text-text-primary text-xs cursor-pointer">✕</button>
                    </div>
                    <div className="space-y-1">
                      <DetailRow label="Mode" value={`${modeIcons[selectedEdge.transportMode]} ${selectedEdge.transportMode}`} />
                      <DetailRow label="Distance" value={`${selectedEdge.distance.toLocaleString()} km`} />
                      <DetailRow label="Time" value={`${selectedEdge.time}h`} />
                      <DetailRow label="Cost" value={`$${selectedEdge.cost.toLocaleString()}`} color="text-neon-cyan" />
                      <DetailRow label="Risk" value={`${selectedEdge.risk}%`} color={riskColor(selectedEdge.risk)} />
                      <DetailRow label="Flow" value={`${selectedEdge.flow.toLocaleString()} / ${selectedEdge.capacity.toLocaleString()} TEU`} />
                    </div>
                  </GlassPanel>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Intelligence Panel ── */}
            <GlassPanel className="!p-3.5">
              <div className="flex items-center justify-between mb-2.5">
                <div className="text-[9px] uppercase tracking-[0.15em] text-text-muted font-semibold">Graph Intelligence</div>
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[7px] font-mono text-text-muted">AI</span>
                </div>
              </div>

              <div className="space-y-2">
                {/* Bottleneck */}
                <button
                  onClick={() => highlightInsight(intel.bottleneck.nodeId)}
                  className="w-full text-left p-2 rounded-lg border border-amber-500/15 bg-amber-500/5 hover:bg-amber-500/10 transition-colors cursor-pointer"
                >
                  <div className="text-[8px] uppercase tracking-widest text-amber-400 font-semibold mb-0.5">⚡ Bottleneck</div>
                  <div className="text-xs text-text-primary font-bold">{intel.bottleneck.label}</div>
                  <div className="text-[9px] text-text-muted">Load ratio: <span className="text-amber-400 font-mono font-bold">{(intel.bottleneck.ratio * 100).toFixed(0)}%</span></div>
                </button>

                {/* Critical Path */}
                <button
                  onClick={() => setCriticalPathMode(!criticalPathMode)}
                  className={`w-full text-left p-2 rounded-lg border transition-colors cursor-pointer ${criticalPathMode ? 'border-cyan-400/30 bg-cyan-400/10' : 'border-cyan-500/15 bg-cyan-500/5 hover:bg-cyan-500/10'}`}
                >
                  <div className="text-[8px] uppercase tracking-widest text-neon-cyan font-semibold mb-0.5">
                    🔗 Critical Path {criticalPathMode && <span className="text-[7px] text-neon-cyan/50 ml-1">(ACTIVE)</span>}
                  </div>
                  <div className="text-[9px] text-text-secondary leading-relaxed">
                    {intel.criticalPath.nodes.map(id => data.nodes.find(n => n.id === id)?.label || id).join(' → ')}
                  </div>
                  <div className="text-[9px] text-text-muted mt-0.5">Risk: <span className="text-red-400 font-mono font-bold">{intel.criticalPath.totalRisk}</span></div>
                </button>

                {/* Highest Risk */}
                <div className="p-2 rounded-lg border border-red-500/15 bg-red-500/5">
                  <div className="text-[8px] uppercase tracking-widest text-red-400 font-semibold mb-0.5">🔥 Highest Risk Route</div>
                  <div className="text-xs text-text-primary">{intel.highestRiskRoute.from} → {intel.highestRiskRoute.to}</div>
                  <div className="text-[9px] text-text-muted">Risk: <span className="text-red-400 font-mono font-bold">{intel.highestRiskRoute.risk}%</span></div>
                </div>

                {/* Demand Hotspot */}
                <button
                  onClick={() => highlightInsight(intel.demandHotspot.nodeId)}
                  className="w-full text-left p-2 rounded-lg border border-emerald-500/15 bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors cursor-pointer"
                >
                  <div className="text-[8px] uppercase tracking-widest text-emerald-400 font-semibold mb-0.5">📈 Demand Hotspot</div>
                  <div className="text-xs text-text-primary font-bold">{intel.demandHotspot.label}</div>
                  <div className="text-[9px] text-text-muted">Index: <span className="text-emerald-400 font-mono font-bold">{intel.demandHotspot.demand}/100</span></div>
                </button>
              </div>
            </GlassPanel>

            {/* ── Legend ── */}
            <GlassPanel className="!p-3">
              <div className="text-[9px] uppercase tracking-[0.15em] text-text-muted font-semibold mb-2">Legend</div>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { color: '#3B82F6', label: '🏭 Supplier' },
                  { color: '#00F0FF', label: '🚢 Transit' },
                  { color: '#F59E0B', label: '📦 Storage' },
                  { color: '#10B981', label: '🏙️ Market' },
                  { color: '#EF4444', label: '⚠️ Factor' },
                ].map((l) => (
                  <div key={l.label} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded" style={{ background: `${l.color}40`, border: `1px solid ${l.color}50` }} />
                    <span className="text-[9px] text-text-secondary">{l.label}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t border-white/5 grid grid-cols-3 gap-1">
                <div className="flex items-center gap-1"><div className="w-4 h-0 border-t border-slate-500" /><span className="text-[8px] text-text-muted">Road</span></div>
                <div className="flex items-center gap-1"><div className="w-4 h-0 border-t border-dashed border-slate-500" /><span className="text-[8px] text-text-muted">Sea</span></div>
                <div className="flex items-center gap-1"><div className="w-4 h-0 border-t border-dotted border-slate-500" /><span className="text-[8px] text-text-muted">Air</span></div>
              </div>
            </GlassPanel>
          </motion.div>
        </div>
      </div>
    </main>
  );
}

/* ═══════════════════════════════════════════════════════
   DETAIL ROW COMPONENT
   ═══════════════════════════════════════════════════════ */
function DetailRow({ label, value, color, small }: { label: string; value: string; color?: string; small?: boolean }) {
  return (
    <div className="flex justify-between items-center text-xs">
      <span className="text-text-muted text-[10px]">{label}</span>
      <span className={`font-mono ${small ? 'text-[9px] text-text-secondary' : `text-[11px] font-bold ${color || 'text-text-primary'}`}`}>{value}</span>
    </div>
  );
}
