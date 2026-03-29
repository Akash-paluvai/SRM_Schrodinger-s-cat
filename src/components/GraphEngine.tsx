'use client';

import { memo, useCallback, useMemo, useEffect, useState, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
  MarkerType,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';

/* ═══════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════ */
export interface SCNodeData {
  label: string;
  nodeType: 'supply' | 'transit' | 'storage' | 'demand' | 'factor';
  risk: number;
  demand: number;
  load: number;
  capacity: number;
  role: string;
  factorType?: string;
  severity?: number;
  impactedNodes?: string[];
  impactedEdges?: number[];
  showRisk?: boolean;
  showDemand?: boolean;
  isBottleneck?: boolean;
  isCriticalPath?: boolean;
  isRippleAffected?: boolean;
  criticalPathMode?: boolean;
  heatmapMode?: boolean;
  timeOffset?: number;
  [key: string]: unknown;
}

export interface SCEdgeData {
  transportMode: 'road' | 'sea' | 'air';
  distance: number;
  time: number;
  cost: number;
  risk: number;
  capacity: number;
  flow: number;
  showRisk?: boolean;
  isCriticalPath?: boolean;
  isRippleAffected?: boolean;
  criticalPathMode?: boolean;
  [key: string]: unknown;
}

/* ═══════════════════════════════════════════════════════
   RANK MAP — structured LR pipeline
   ═══════════════════════════════════════════════════════ */
const TYPE_RANK: Record<string, number> = {
  supply: 0,
  transit: 1,
  storage: 2,
  demand: 3,
  factor: 4,
};

/* ═══════════════════════════════════════════════════════
   THEME
   ═══════════════════════════════════════════════════════ */
const THEME = {
  supply:  { bg: '#0D1B2A', border: '#3B82F6', glow: 'rgba(59,130,246,0.4)',  icon: '🏭', label: 'SUPPLIER' },
  transit: { bg: '#0A2529', border: '#00F0FF', glow: 'rgba(0,240,255,0.4)',   icon: '🚢', label: 'TRANSIT' },
  storage: { bg: '#1A1808', border: '#F59E0B', glow: 'rgba(245,158,11,0.4)',  icon: '📦', label: 'STORAGE' },
  demand:  { bg: '#081A10', border: '#10B981', glow: 'rgba(16,185,129,0.4)',  icon: '🏙️', label: 'MARKET' },
  factor:  { bg: '#2A0A0A', border: '#EF4444', glow: 'rgba(239,68,68,0.5)',   icon: '⚠️', label: 'FACTOR' },
} as const;

const FACTOR_ICONS: Record<string, string> = {
  weather: '🌪️', conflict: '⚔️', demand: '📈', traffic: '🚦', economic: '💹',
};

/* ═══════════════════════════════════════════════════════
   APPLY TIMELINE OFFSET — simulate time progression
   ═══════════════════════════════════════════════════════ */
function applyTimeOffset(val: number, offset: number, volatility: number = 0.15): number {
  const drift = 1 + (offset / 48) * volatility * (Math.sin(val * 0.1 + offset) > 0 ? 1 : -1);
  return Math.max(0, Math.round(val * drift));
}

/* ═══════════════════════════════════════════════════════
   CUSTOM NODE — FACTOR (pulsing red, larger)
   ═══════════════════════════════════════════════════════ */
const FactorNodeComponent = memo(function FactorNode({ data }: NodeProps) {
  const d = data as unknown as SCNodeData;
  const icon = FACTOR_ICONS[d.factorType || ''] || THEME.factor.icon;
  const dimmed = d.criticalPathMode && !d.isCriticalPath;

  return (
    <div className="relative" style={{ width: 72, height: 72, opacity: dimmed ? 0.15 : 1, transition: 'opacity 0.5s' }}>
      <Handle type="target" position={Position.Left} style={{ background: '#EF4444', width: 6, height: 6, border: 'none' }} />

      {/* Outer pulse ring */}
      <div className="absolute inset-[-8px] rounded-full" style={{
        background: 'radial-gradient(circle, rgba(239,68,68,0.15) 0%, transparent 70%)',
        animation: 'pulse-factor 2s ease-in-out infinite',
      }} />

      {/* Inner ripple ring when affected */}
      {d.isRippleAffected && (
        <div className="absolute inset-[-16px] rounded-full" style={{
          border: '2px solid rgba(239,68,68,0.4)',
          animation: 'ripple-ring 1.5s ease-out infinite',
        }} />
      )}

      <div className="w-full h-full rounded-2xl flex flex-col items-center justify-center gap-0.5" style={{
        background: 'radial-gradient(circle, rgba(239,68,68,0.2) 0%, rgba(239,68,68,0.04) 100%)',
        border: '2px solid rgba(239,68,68,0.5)',
        boxShadow: `0 0 24px rgba(239,68,68,0.35), inset 0 0 12px rgba(239,68,68,0.08)`,
      }}>
        <span className="text-2xl">{icon}</span>
        <span className="text-[7px] font-mono text-red-300 font-bold uppercase tracking-wider">FACTOR</span>
      </div>

      {/* Name label */}
      <div className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-bold text-red-400 text-center font-mono" style={{ top: 78 }}>
        {d.label}
      </div>

      {/* Severity badge */}
      {d.severity != null && (
        <div className="absolute -top-3 -right-3 min-w-[22px] h-[22px] px-1 rounded-full bg-red-600 text-[9px] text-white font-bold flex items-center justify-center shadow-[0_0_10px_rgba(239,68,68,0.6)]">
          {d.severity}
        </div>
      )}

      <Handle type="source" position={Position.Right} style={{ background: '#EF4444', width: 6, height: 6, border: 'none' }} />
    </div>
  );
});

/* ═══════════════════════════════════════════════════════
   CUSTOM NODE — STANDARD (supply/transit/storage/demand)
   Shows: name, type label, load%, risk%, throughput
   ═══════════════════════════════════════════════════════ */
const StandardNodeComponent = memo(function StandardNode({ data }: NodeProps) {
  const d = data as unknown as SCNodeData;
  const t = THEME[d.nodeType] || THEME.supply;
  const ratio = d.capacity > 0 ? d.load / d.capacity : 0;
  const riskPct = Math.min(d.risk, 100);
  const size = 72;
  const dimmed = d.criticalPathMode && !d.isCriticalPath;

  const borderColor = d.isRippleAffected
    ? '#EF4444'
    : d.isBottleneck
    ? '#F59E0B'
    : d.isCriticalPath
    ? '#00F0FF'
    : t.border;

  const glowSize = d.isCriticalPath ? 20 : d.isBottleneck ? 18 : 12;
  const glowColor = d.isRippleAffected
    ? 'rgba(239,68,68,0.5)'
    : d.isBottleneck
    ? 'rgba(245,158,11,0.5)'
    : t.glow;

  return (
    <div className="relative group" style={{ width: size, height: size + 10, opacity: dimmed ? 0.12 : 1, transition: 'opacity 0.5s' }}>
      <Handle type="target" position={Position.Left} style={{ background: borderColor, width: 7, height: 7, border: 'none', left: -3 }} />

      {/* Ripple ring */}
      {d.isRippleAffected && (
        <div className="absolute inset-[-10px] rounded-2xl" style={{
          border: '2px solid rgba(239,68,68,0.3)',
          animation: 'ripple-ring 1.5s ease-out infinite',
        }} />
      )}

      {/* Main card */}
      <div className="w-full rounded-xl overflow-hidden" style={{
        height: size,
        background: t.bg,
        border: `1.5px solid ${borderColor}`,
        boxShadow: `0 0 ${glowSize}px ${glowColor}`,
        transition: 'all 0.4s ease',
      }}>
        {/* Top bar — type label */}
        <div className="flex items-center justify-between px-2 pt-1.5">
          <span className="text-[6px] font-mono font-bold uppercase tracking-[0.15em]" style={{ color: borderColor }}>{t.label}</span>
          <span className="text-sm">{t.icon}</span>
        </div>

        {/* Risk + Load bars */}
        <div className="px-2 mt-1 space-y-0.5">
          {/* Risk bar */}
          <div className="flex items-center gap-1">
            <span className="text-[6px] font-mono text-slate-500 w-4">RSK</span>
            <div className="flex-1 h-[4px] bg-white/5 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{
                width: `${riskPct}%`,
                background: riskPct >= 60 ? '#EF4444' : riskPct >= 30 ? '#F59E0B' : '#10B981',
              }} />
            </div>
            <span className="text-[7px] font-mono font-bold" style={{
              color: riskPct >= 60 ? '#EF4444' : riskPct >= 30 ? '#F59E0B' : '#10B981',
            }}>{riskPct}</span>
          </div>
          {/* Load bar */}
          <div className="flex items-center gap-1">
            <span className="text-[6px] font-mono text-slate-500 w-4">LOD</span>
            <div className="flex-1 h-[4px] bg-white/5 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{
                width: `${Math.min(ratio * 100, 100)}%`,
                background: ratio > 0.8 ? '#EF4444' : ratio > 0.5 ? '#F59E0B' : '#3B82F6',
              }} />
            </div>
            <span className="text-[7px] font-mono font-bold text-slate-400">{Math.round(ratio * 100)}%</span>
          </div>
        </div>

        {/* Throughput */}
        <div className="px-2 mt-1">
          <span className="text-[7px] font-mono text-slate-500">{d.load.toLocaleString()} TEU</span>
        </div>
      </div>

      {/* Name label below */}
      <div className="text-[8px] font-mono text-slate-400 text-center mt-1 truncate w-full font-semibold">
        {d.label}
      </div>

      {/* Bottleneck badge */}
      {d.isBottleneck && (
        <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-amber-500 text-[7px] text-white font-bold flex items-center justify-center shadow-[0_0_8px_rgba(245,158,11,0.6)]" title="Bottleneck">⚡</div>
      )}

      <Handle type="source" position={Position.Right} style={{ background: borderColor, width: 7, height: 7, border: 'none', right: -3 }} />
    </div>
  );
});

/* ═══════════════════════════════════════════════════════
   DAGRE LR LAYOUT — structured pipeline
   ═══════════════════════════════════════════════════════ */
function layoutGraph(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 160, marginx: 60, marginy: 60 });

  nodes.forEach((n) => {
    const d = n.data as unknown as SCNodeData;
    const rank = TYPE_RANK[d.nodeType] ?? 2;
    g.setNode(n.id, { width: 90, height: 100, rank });
  });
  edges.forEach((e) => {
    g.setEdge(e.source, e.target);
  });

  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - 45, y: pos.y - 50 } };
  });
}

/* ═══════════════════════════════════════════════════════
   EDGE STYLE BUILDER
   ═══════════════════════════════════════════════════════ */
function getEdgeStyle(d: SCEdgeData): React.CSSProperties {
  const riskColor = d.risk >= 60 ? '#EF4444' : d.risk >= 30 ? '#F59E0B' : 'rgba(59,130,246,0.6)';
  const flowRatio = d.capacity > 0 ? d.flow / d.capacity : 0.5;
  const width = 1.5 + Math.round(flowRatio * 3.5);
  const opacity = d.criticalPathMode ? (d.isCriticalPath ? 0.9 : 0.06) : (0.3 + flowRatio * 0.5);

  const color = d.isRippleAffected
    ? '#EF4444'
    : d.isCriticalPath
    ? '#00F0FF'
    : d.showRisk
    ? riskColor
    : `rgba(100,116,139,${0.3 + flowRatio * 0.4})`;

  const base: React.CSSProperties = {
    stroke: color,
    strokeWidth: d.isCriticalPath ? width + 1.5 : width,
    opacity,
    transition: 'all 0.5s ease',
  };

  if (d.transportMode === 'sea') {
    base.strokeDasharray = '10 5';
  }

  return base;
}

/* ═══════════════════════════════════════════════════════
   ANIMATED FLOW PARTICLES OVERLAY
   ═══════════════════════════════════════════════════════ */
interface Particle {
  edgeIdx: number;
  progress: number;
  speed: number;
}

function FlowParticlesOverlay({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animRef = useRef<number>(0);
  const { getViewport } = useReactFlow();

  useEffect(() => {
    // Create particles for each edge
    const particles: Particle[] = [];
    edges.forEach((_, i) => {
      const count = 2 + Math.floor(Math.random() * 2);
      for (let j = 0; j < count; j++) {
        particles.push({
          edgeIdx: i,
          progress: Math.random(),
          speed: 0.002 + Math.random() * 0.003,
        });
      }
    });
    particlesRef.current = particles;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function animate() {
      if (!canvas || !ctx) return;
      const { x: vx, y: vy, zoom } = getViewport();
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of particlesRef.current) {
        const edge = edges[p.edgeIdx];
        if (!edge) continue;

        const srcNode = nodes.find(n => n.id === edge.source);
        const tgtNode = nodes.find(n => n.id === edge.target);
        if (!srcNode?.position || !tgtNode?.position) continue;

        const sx = (srcNode.position.x + 45) * zoom + vx;
        const sy = (srcNode.position.y + 40) * zoom + vy;
        const tx = (tgtNode.position.x + 45) * zoom + vx;
        const ty = (tgtNode.position.y + 40) * zoom + vy;

        const x = sx + (tx - sx) * p.progress;
        const y = sy + (ty - sy) * p.progress;

        const ed = edge.data as unknown as SCEdgeData | undefined;
        const color = ed?.isCriticalPath ? '#00F0FF' :
                      ed?.isRippleAffected ? '#EF4444' :
                      (ed?.risk ?? 0) >= 60 ? '#EF4444' :
                      (ed?.risk ?? 0) >= 30 ? '#F59E0B' : '#3B82F6';

        ctx.beginPath();
        ctx.arc(x, y, 2.5 * zoom, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.7;
        ctx.fill();

        // Glow
        ctx.beginPath();
        ctx.arc(x, y, 5 * zoom, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.15;
        ctx.fill();
        ctx.globalAlpha = 1;

        p.progress += p.speed;
        if (p.progress > 1) p.progress = 0;
      }

      animRef.current = requestAnimationFrame(animate);
    }

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [nodes, edges, getViewport]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ width: '100%', height: '100%', zIndex: 5 }}
    />
  );
}

/* ═══════════════════════════════════════════════════════
   RISK HEATMAP BACKGROUND
   ═══════════════════════════════════════════════════════ */
function RiskHeatmapOverlay({ nodes }: { nodes: Node[] }) {
  const { getViewport } = useReactFlow();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const { x: vx, y: vy, zoom } = getViewport();

    for (const node of nodes) {
      const d = node.data as unknown as SCNodeData;
      if (!node.position || d.nodeType === 'factor') continue;

      const cx = (node.position.x + 45) * zoom + vx;
      const cy = (node.position.y + 40) * zoom + vy;
      const radius = (60 + d.risk) * zoom;

      const color = d.risk >= 60
        ? `rgba(239,68,68,${0.06 + d.risk * 0.001})`
        : d.risk >= 30
        ? `rgba(245,158,11,${0.04 + d.risk * 0.0008})`
        : `rgba(16,185,129,${0.03})`;

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    }
  }, [nodes, getViewport]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ width: '100%', height: '100%', zIndex: 1 }}
    />
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════ */
export interface GraphEngineProps {
  rawNodes: Array<{
    id: string; label: string; type: string; risk: number; demand: number;
    load: number; capacity: number; role: string; factorType?: string;
    severity?: number; impactedNodes?: string[]; impactedEdges?: number[];
  }>;
  rawEdges: Array<{
    source: string; target: string; transportMode: string;
    distance: number; time: number; cost: number; risk: number;
    capacity: number; flow: number;
  }>;
  showRisk: boolean;
  showDemand: boolean;
  showBottlenecks: boolean;
  showFactors: boolean;
  criticalPathMode: boolean;
  heatmapMode: boolean;
  criticalPathNodes: string[];
  bottleneckNodeId: string;
  rippleSourceId: string | null;
  timeOffset: number;
  onNodeClick: (node: SCNodeData) => void;
  onEdgeClick: (edge: SCEdgeData) => void;
  highlightNodeId: string | null;
}

const nodeTypes = {
  factor: FactorNodeComponent,
  supply: StandardNodeComponent,
  transit: StandardNodeComponent,
  storage: StandardNodeComponent,
  demand: StandardNodeComponent,
};

function GraphEngineInner({
  rawNodes, rawEdges, showRisk, showDemand, showBottlenecks, showFactors,
  criticalPathMode, heatmapMode, criticalPathNodes, bottleneckNodeId,
  rippleSourceId, timeOffset, onNodeClick, onEdgeClick, highlightNodeId,
}: GraphEngineProps) {

  // Compute ripple-affected nodes/edges
  const rippleAffected = useMemo(() => {
    if (!rippleSourceId) return { nodes: new Set<string>(), edges: new Set<number>() };
    const factorNode = rawNodes.find(n => n.id === rippleSourceId);
    if (!factorNode) return { nodes: new Set<string>(), edges: new Set<number>() };
    return {
      nodes: new Set(factorNode.impactedNodes || []),
      edges: new Set(factorNode.impactedEdges || []),
    };
  }, [rippleSourceId, rawNodes]);

  const { nodes, edges } = useMemo(() => {
    const filteredRawNodes = showFactors ? rawNodes : rawNodes.filter(n => n.type !== 'factor');

    const rfNodes: Node[] = filteredRawNodes.map((n) => {
      const load = timeOffset > 0 ? applyTimeOffset(n.load, timeOffset, 0.2) : n.load;
      const risk = timeOffset > 0 ? Math.min(100, applyTimeOffset(n.risk, timeOffset, 0.25)) : n.risk;

      return {
        id: n.id,
        type: n.type === 'factor' ? 'factor' : n.type,
        data: {
          ...n,
          load,
          risk,
          nodeType: n.type,
          showRisk,
          showDemand,
          isBottleneck: showBottlenecks && n.id === bottleneckNodeId,
          isCriticalPath: criticalPathNodes.includes(n.id),
          isRippleAffected: rippleAffected.nodes.has(n.id),
          criticalPathMode,
          heatmapMode,
          timeOffset,
        } as SCNodeData,
        position: { x: 0, y: 0 },
        className: highlightNodeId === n.id ? 'ring-2 ring-neon-cyan rounded-xl' : '',
      };
    });

    const rfEdges: Edge[] = rawEdges
      .filter((e) => {
        const srcExists = filteredRawNodes.some(n => n.id === e.source);
        const tgtExists = filteredRawNodes.some(n => n.id === e.target);
        return srcExists && tgtExists;
      })
      .map((e, i) => {
        const risk = timeOffset > 0 ? Math.min(100, applyTimeOffset(e.risk, timeOffset, 0.3)) : e.risk;
        const flow = timeOffset > 0 ? applyTimeOffset(e.flow, timeOffset, 0.15) : e.flow;

        const isCrit = criticalPathNodes.includes(e.source) && criticalPathNodes.includes(e.target);
        const isRipple = rippleAffected.edges.has(i);

        const d: SCEdgeData = {
          ...e,
          risk,
          flow,
          transportMode: e.transportMode as 'road' | 'sea' | 'air',
          showRisk,
          isCriticalPath: isCrit,
          isRippleAffected: isRipple,
          criticalPathMode,
        };

        return {
          id: `e-${i}`,
          source: e.source,
          target: e.target,
          type: e.transportMode === 'air' ? 'default' : 'straight',
          animated: isCrit || isRipple || risk >= 60,
          style: getEdgeStyle(d),
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: isRipple ? '#EF4444' : isCrit ? '#00F0FF' : d.showRisk && risk >= 60 ? '#EF4444' : '#475569',
            width: 16, height: 16,
          },
          data: d,
          label: showRisk ? `${risk}%` : `${flow.toLocaleString()} TEU`,
          labelStyle: { fill: isRipple ? '#EF4444' : isCrit ? '#00F0FF' : '#64748B', fontSize: 9, fontFamily: 'monospace', fontWeight: isCrit ? 700 : 400 },
          labelBgStyle: { fill: 'rgba(11,15,26,0.85)', fillOpacity: 0.85 },
          labelBgPadding: [5, 3] as [number, number],
        };
      });

    const laid = layoutGraph(rfNodes, rfEdges);
    return { nodes: laid, edges: rfEdges };
  }, [rawNodes, rawEdges, showRisk, showDemand, showBottlenecks, showFactors,
      criticalPathMode, heatmapMode, criticalPathNodes, bottleneckNodeId,
      rippleSourceId, rippleAffected, timeOffset, highlightNodeId]);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    onNodeClick(node.data as unknown as SCNodeData);
  }, [onNodeClick]);

  const handleEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    onEdgeClick(edge.data as unknown as SCEdgeData);
  }, [onEdgeClick]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.2}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: 'straight' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(255,255,255,0.02)" />
        <Controls showInteractive={false} />
      </ReactFlow>

      {/* Flow particles */}
      <FlowParticlesOverlay nodes={nodes} edges={edges} />

      {/* Risk heatmap */}
      {heatmapMode && <RiskHeatmapOverlay nodes={nodes} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   WRAPPER WITH PROVIDER + STYLES
   ═══════════════════════════════════════════════════════ */
function GraphEngine(props: GraphEngineProps) {
  return (
    <div style={{ width: '100%', height: '100%', minHeight: 500 }}>
      <style>{`
        @keyframes pulse-factor {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.06); opacity: 0.8; }
        }
        @keyframes ripple-ring {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        .react-flow__node { cursor: pointer !important; }
        .react-flow__edge { cursor: pointer !important; }
        .react-flow__attribution { display: none !important; }
        .react-flow__controls { background: rgba(11,15,26,0.9) !important; border: 1px solid rgba(255,255,255,0.06) !important; border-radius: 10px !important; backdrop-filter: blur(12px) !important; }
        .react-flow__controls-button { background: transparent !important; border-bottom: 1px solid rgba(255,255,255,0.04) !important; color: #64748B !important; }
        .react-flow__controls-button:hover { background: rgba(0,240,255,0.05) !important; }
        .react-flow__controls-button svg { fill: #64748B !important; }
      `}</style>
      <ReactFlowProvider>
        <GraphEngineInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}

export default memo(GraphEngine);
