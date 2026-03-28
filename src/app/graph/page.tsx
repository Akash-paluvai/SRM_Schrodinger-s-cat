'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import GlassPanel from '@/components/GlassPanel';
import { SectionLabel, StatusBadge } from '@/components/ui';

interface GraphNode {
  id: string;
  label: string;
  type: string;
  risk: string;
  x: number;
  y: number;
}

interface GraphEdge {
  from: string;
  to: string;
  risk: string;
  flow: number;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  summary: { totalNodes: number; totalEdges: number; highRiskPaths: number; avgFlow: number };
}

export default function GraphPage() {
  const [data, setData] = useState<GraphData | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  useEffect(() => {
    fetch('/api/graph').then((r) => r.json()).then(setData);
  }, []);

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-14 pb-14">
        <div className="text-text-muted text-sm font-mono animate-pulse">Loading graph...</div>
      </div>
    );
  }

  const nodeColor = (risk: string) => {
    if (risk === 'high') return '#EF4444';
    if (risk === 'medium') return '#F59E0B';
    return '#3B82F6';
  };

  const nodeGlow = (risk: string) => {
    if (risk === 'high') return 'rgba(239,68,68,0.4)';
    if (risk === 'medium') return 'rgba(245,158,11,0.3)';
    return 'rgba(59,130,246,0.3)';
  };

  const typeIcon = (type: string) => {
    if (type === 'port') return '🚢';
    if (type === 'supplier') return '🏭';
    return '📦';
  };

  const edgeColor = (risk: string) => {
    if (risk === 'high') return '#EF4444';
    if (risk === 'medium') return '#F59E0B';
    return '#3B82F6';
  };

  return (
    <main className="min-h-screen pt-16 pb-16 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <SectionLabel>Digital Twin</SectionLabel>
          <h1 className="font-heading text-3xl font-bold">Supply Chain Graph</h1>
          <p className="text-text-secondary text-sm mt-1">Network topology with risk-weighted edges</p>
        </div>

        {/* Summary Bar */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="grid grid-cols-4 gap-3 mb-6">
            <GlassPanel className="p-3 text-center">
              <div className="text-[9px] uppercase tracking-widest text-text-muted">Nodes</div>
              <div className="font-heading text-lg font-bold text-neon-cyan">{data.summary.totalNodes}</div>
            </GlassPanel>
            <GlassPanel className="p-3 text-center">
              <div className="text-[9px] uppercase tracking-widest text-text-muted">Edges</div>
              <div className="font-heading text-lg font-bold text-neon-blue">{data.summary.totalEdges}</div>
            </GlassPanel>
            <GlassPanel className="p-3 text-center">
              <div className="text-[9px] uppercase tracking-widest text-text-muted">High Risk</div>
              <div className="font-heading text-lg font-bold text-risk-high">{data.summary.highRiskPaths}</div>
            </GlassPanel>
            <GlassPanel className="p-3 text-center">
              <div className="text-[9px] uppercase tracking-widest text-text-muted">Avg Flow</div>
              <div className="font-heading text-lg font-bold text-text-primary">{data.summary.avgFlow} TEU</div>
            </GlassPanel>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Graph Visualization */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-3"
          >
            <GlassPanel className="p-0 overflow-hidden">
              <div className="relative w-full" style={{ paddingBottom: '60%' }}>
                <svg className="absolute inset-0 w-full h-full">
                  {/* Edges */}
                  {data.edges.map((edge, i) => {
                    const fromNode = data.nodes.find((n) => n.id === edge.from);
                    const toNode = data.nodes.find((n) => n.id === edge.to);
                    if (!fromNode || !toNode) return null;
                    return (
                      <g key={i}>
                        <line
                          x1={`${fromNode.x}%`}
                          y1={`${fromNode.y}%`}
                          x2={`${toNode.x}%`}
                          y2={`${toNode.y}%`}
                          stroke={edgeColor(edge.risk)}
                          strokeWidth="1.5"
                          opacity="0.35"
                          strokeDasharray={edge.risk === 'high' ? '4 4' : 'none'}
                        />
                        {/* Flow label */}
                        <text
                          x={`${(fromNode.x + toNode.x) / 2}%`}
                          y={`${(fromNode.y + toNode.y) / 2 - 2}%`}
                          fill="#475569"
                          fontSize="8"
                          textAnchor="middle"
                          fontFamily="monospace"
                        >
                          {edge.flow} TEU
                        </text>
                      </g>
                    );
                  })}

                  {/* Nodes */}
                  {data.nodes.map((node) => (
                    <g
                      key={node.id}
                      className="cursor-pointer"
                      onClick={() => setSelectedNode(node)}
                    >
                      {/* Glow */}
                      <circle
                        cx={`${node.x}%`}
                        cy={`${node.y}%`}
                        r="12"
                        fill={nodeGlow(node.risk)}
                        opacity="0.3"
                      >
                        <animate attributeName="r" values="12;16;12" dur="3s" repeatCount="indefinite" />
                      </circle>
                      {/* Node */}
                      <circle
                        cx={`${node.x}%`}
                        cy={`${node.y}%`}
                        r="6"
                        fill={nodeColor(node.risk)}
                        stroke="#0B0F1A"
                        strokeWidth="2"
                      />
                      {/* Label */}
                      <text
                        x={`${node.x}%`}
                        y={`${node.y + 5}%`}
                        fill="#94A3B8"
                        fontSize="8"
                        textAnchor="middle"
                        fontFamily="Inter, sans-serif"
                      >
                        {node.label}
                      </text>
                    </g>
                  ))}
                </svg>
              </div>
            </GlassPanel>
          </motion.div>

          {/* Node Detail / Legend */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-4"
          >
            {selectedNode ? (
              <GlassPanel className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xl">{typeIcon(selectedNode.type)}</span>
                  <button onClick={() => setSelectedNode(null)} className="text-text-muted hover:text-text-primary text-sm cursor-pointer">✕</button>
                </div>
                <h3 className="font-heading font-bold text-sm mb-1">{selectedNode.label}</h3>
                <div className="flex items-center gap-2 mb-3">
                  <StatusBadge level={selectedNode.risk as 'low' | 'medium' | 'high'} />
                  <span className="text-[10px] text-text-muted capitalize">{selectedNode.type}</span>
                </div>
                <div className="text-[10px] uppercase tracking-widest text-text-muted mb-2">Connected Routes</div>
                <div className="space-y-1.5">
                  {data.edges
                    .filter((e) => e.from === selectedNode.id || e.to === selectedNode.id)
                    .map((e, i) => {
                      const other = e.from === selectedNode.id ? e.to : e.from;
                      const otherNode = data.nodes.find((n) => n.id === other);
                      return (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-text-secondary">→ {otherNode?.label}</span>
                          <span className="font-mono text-text-muted">{e.flow} TEU</span>
                        </div>
                      );
                    })}
                </div>
              </GlassPanel>
            ) : (
              <GlassPanel className="p-5">
                <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-3">Legend</div>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-risk-high" />
                    <span className="text-xs text-text-secondary">High Risk</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-risk-medium" />
                    <span className="text-xs text-text-secondary">Medium Risk</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-neon-blue" />
                    <span className="text-xs text-text-secondary">Normal</span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-white/5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">🚢</span>
                      <span className="text-xs text-text-secondary">Port</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-sm">🏭</span>
                      <span className="text-xs text-text-secondary">Supplier</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-sm">📦</span>
                      <span className="text-xs text-text-secondary">Warehouse</span>
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-text-muted mt-4">Click a node to see details</p>
              </GlassPanel>
            )}

            {/* Node List */}
            <GlassPanel className="p-4">
              <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-2">All Nodes</div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {data.nodes.map((node) => (
                  <button
                    key={node.id}
                    onClick={() => setSelectedNode(node)}
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-left transition-all cursor-pointer ${
                      selectedNode?.id === node.id ? 'bg-neon-blue/5' : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    <span className="text-[11px] text-text-secondary">{typeIcon(node.type)} {node.label}</span>
                    <div className={`w-1.5 h-1.5 rounded-full`} style={{ background: nodeColor(node.risk) }} />
                  </button>
                ))}
              </div>
            </GlassPanel>
          </motion.div>
        </div>
      </div>
    </main>
  );
}
