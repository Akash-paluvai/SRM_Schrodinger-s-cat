'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import GlassPanel from '@/components/GlassPanel';
import { StatusBadge, MetricCard } from '@/components/ui';

interface Route {
  id: string;
  name: string;
  origin: { lat: number; lng: number; label: string };
  destination: { lat: number; lng: number; label: string };
  risk: string;
  riskScore: number;
  delay: string;
  costImpact: string;
  cause: string;
  suggestedReroute: string;
  status: string;
  cargo: string;
  vessel: string;
}

interface MapData {
  routes: Route[];
  riskZones: { lat: number; lng: number; radius: number; risk: string; label: string }[];
  vehicles: { id: string; routeId: string; progress: number; type: string }[];
  summary: { totalRoutes: number; activeShipments: number; highRiskCount: number; avgDelay: string };
}

export default function MapPage() {
  const [data, setData] = useState<MapData | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);

  useEffect(() => {
    fetch('/api/map-data')
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-14 pb-14">
        <div className="text-text-muted text-sm font-mono animate-pulse">Loading map data...</div>
      </div>
    );
  }

  const riskColor = (risk: string) => {
    if (risk === 'HIGH') return 'text-risk-high';
    if (risk === 'MEDIUM') return 'text-risk-medium';
    return 'text-risk-low';
  };

  const riskBg = (risk: string) => {
    if (risk === 'HIGH') return 'bg-risk-high';
    if (risk === 'MEDIUM') return 'bg-risk-medium';
    return 'bg-risk-low';
  };

  return (
    <main className="min-h-screen pt-14 pb-14 relative">
      {/* Map Container */}
      <div className="w-full h-[calc(100vh-112px)] relative bg-bg-secondary overflow-hidden">
        {/* Simulated Map Background */}
        <div className="absolute inset-0">
          {/* Grid overlay */}
          <svg className="w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse">
                <path d="M 80 0 L 0 0 0 80" fill="none" stroke="rgba(59,130,246,0.08)" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        {/* Risk Zones */}
        {data.riskZones.map((zone, i) => (
          <div
            key={i}
            className={`absolute rounded-full animate-pulse ${zone.risk === 'HIGH' ? 'bg-risk-high/10 shadow-[0_0_60px_rgba(239,68,68,0.15)]' : 'bg-risk-medium/8 shadow-[0_0_40px_rgba(245,158,11,0.1)]'}`}
            style={{
              left: `${(zone.lng + 180) / 360 * 100}%`,
              top: `${(90 - zone.lat) / 180 * 100}%`,
              width: `${zone.radius / 5}px`,
              height: `${zone.radius / 5}px`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] text-text-muted font-mono">
              {zone.label}
            </div>
          </div>
        ))}

        {/* Route Lines */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {data.routes.map((route) => {
            const x1 = ((route.origin.lng + 180) / 360) * 100;
            const y1 = ((90 - route.origin.lat) / 180) * 100;
            const x2 = ((route.destination.lng + 180) / 360) * 100;
            const y2 = ((90 - route.destination.lat) / 180) * 100;
            const strokeColor = route.risk === 'HIGH' ? '#EF4444' : route.risk === 'MEDIUM' ? '#F59E0B' : '#3B82F6';
            const cx = (x1 + x2) / 2;
            const cy = Math.min(y1, y2) - 8;
            return (
              <g key={route.id}>
                <path
                  d={`M ${x1}% ${y1}% Q ${cx}% ${cy}% ${x2}% ${y2}%`}
                  stroke={strokeColor}
                  strokeWidth="1.5"
                  fill="none"
                  opacity="0.5"
                  strokeDasharray="4 4"
                  className="pointer-events-auto cursor-pointer"
                  onClick={() => setSelectedRoute(route)}
                />
                {/* Origin node */}
                <circle cx={`${x1}%`} cy={`${y1}%`} r="4" fill={strokeColor} opacity="0.8" />
                {/* Destination node */}
                <circle cx={`${x2}%`} cy={`${y2}%`} r="4" fill={strokeColor} opacity="0.8" />
              </g>
            );
          })}

          {/* Moving vehicles */}
          {data.vehicles.map((v) => {
            const route = data.routes.find((r) => r.id === v.routeId);
            if (!route) return null;
            const x1 = ((route.origin.lng + 180) / 360) * 100;
            const y1 = ((90 - route.origin.lat) / 180) * 100;
            const x2 = ((route.destination.lng + 180) / 360) * 100;
            const y2 = ((90 - route.destination.lat) / 180) * 100;
            const vx = x1 + (x2 - x1) * v.progress;
            const vy = y1 + (y2 - y1) * v.progress - Math.sin(v.progress * Math.PI) * 8;
            return (
              <g key={v.id}>
                <circle cx={`${vx}%`} cy={`${vy}%`} r="3" fill="#00F0FF" opacity="0.9">
                  <animate attributeName="r" values="3;5;3" dur="2s" repeatCount="indefinite" />
                </circle>
                <circle cx={`${vx}%`} cy={`${vy}%`} r="8" fill="#00F0FF" opacity="0.15">
                  <animate attributeName="r" values="8;14;8" dur="2s" repeatCount="indefinite" />
                </circle>
              </g>
            );
          })}
        </svg>

        {/* Route Labels */}
        {data.routes.map((route) => {
          const x = ((route.origin.lng + 180) / 360) * 100;
          const y = ((90 - route.origin.lat) / 180) * 100;
          return (
            <button
              key={route.id + '-label'}
              className="absolute text-[9px] font-mono text-text-secondary hover:text-text-primary transition-colors cursor-pointer z-10"
              style={{ left: `${x}%`, top: `${y + 3}%`, transform: 'translateX(-50%)' }}
              onClick={() => setSelectedRoute(route)}
            >
              {route.origin.label}
            </button>
          );
        })}

        {/* Summary Panel (top-left) */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="absolute top-4 left-4 z-20"
        >
          <GlassPanel className="p-4 w-56">
            <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-3">System Overview</div>
            <div className="space-y-2.5">
              <div className="flex justify-between">
                <span className="text-xs text-text-secondary">Active Routes</span>
                <span className="text-xs font-mono font-semibold text-neon-cyan">{data.summary.totalRoutes}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-text-secondary">Shipments</span>
                <span className="text-xs font-mono font-semibold text-neon-blue">{data.summary.activeShipments.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-text-secondary">High Risk</span>
                <span className="text-xs font-mono font-semibold text-risk-high">{data.summary.highRiskCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-text-secondary">Avg. Delay</span>
                <span className="text-xs font-mono font-semibold text-risk-medium">{data.summary.avgDelay}</span>
              </div>
            </div>
          </GlassPanel>
        </motion.div>

        {/* Route Detail Panel (right side) */}
        {selectedRoute && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="absolute top-4 right-4 z-20 w-80"
          >
            <GlassPanel className="p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono text-xs text-text-muted">{selectedRoute.id}</span>
                <button
                  onClick={() => setSelectedRoute(null)}
                  className="text-text-muted hover:text-text-primary text-sm cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <h3 className="font-heading font-bold text-base mb-1">{selectedRoute.name}</h3>
              <div className="flex items-center gap-2 mb-4">
                <StatusBadge level={selectedRoute.risk === 'HIGH' ? 'high' : selectedRoute.risk === 'MEDIUM' ? 'medium' : 'low'} />
                <span className="text-xs text-text-secondary">{selectedRoute.vessel}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-4">
                <MetricCard label="Risk Score" value={String(selectedRoute.riskScore)} color={riskColor(selectedRoute.risk)} />
                <MetricCard label="Delay" value={selectedRoute.delay} color="text-risk-medium" />
                <MetricCard label="Cost Impact" value={selectedRoute.costImpact} color="text-risk-high" />
                <MetricCard label="Cargo" value={selectedRoute.cargo} color="text-text-primary" />
              </div>

              <div className="mb-3">
                <div className="text-[10px] uppercase tracking-widest text-text-muted mb-1">Cause</div>
                <p className="text-xs text-text-secondary leading-relaxed">{selectedRoute.cause}</p>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-text-muted mb-1">AI Recommendation</div>
                <p className="text-xs text-neon-blue leading-relaxed">{selectedRoute.suggestedReroute}</p>
              </div>
            </GlassPanel>
          </motion.div>
        )}

        {/* Route List (bottom) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="absolute bottom-4 left-4 right-4 z-20"
        >
          <div className="flex gap-2 overflow-x-auto pb-1">
            {data.routes.map((route) => (
              <button
                key={route.id}
                onClick={() => setSelectedRoute(route)}
                className={`flex-shrink-0 glass px-4 py-2.5 flex items-center gap-3 cursor-pointer transition-all hover:border-white/15 ${
                  selectedRoute?.id === route.id ? 'border-neon-blue/30 bg-neon-blue/5' : ''
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${riskBg(route.risk)}`} />
                <div className="text-left">
                  <div className="text-xs font-medium text-text-primary">{route.name}</div>
                  <div className="text-[10px] text-text-muted font-mono">{route.status} • {route.delay}</div>
                </div>
              </button>
            ))}
          </div>
        </motion.div>
      </div>
    </main>
  );
}
