import { NextRequest, NextResponse } from 'next/server';
import { API_BASE } from '@/lib/api';

/* ═══════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════ */
interface SCNode {
  id: string;
  label: string;
  type: 'supply' | 'transit' | 'storage' | 'demand' | 'factor';
  risk: number;
  demand: number;
  load: number;
  capacity: number;
  role: string;
  factorType?: string;
  severity?: number;
  impactedNodes?: string[];
  impactedEdges?: number[];
}

interface SCEdge {
  source: string;
  target: string;
  transportMode: 'road' | 'sea' | 'air';
  distance: number;
  time: number;
  cost: number;
  risk: number;
  capacity: number;
  flow: number;
}

interface GraphIntelligence {
  bottleneck: { nodeId: string; label: string; ratio: number };
  criticalPath: { nodes: string[]; totalRisk: number };
  highestRiskRoute: { from: string; to: string; risk: number };
  demandHotspot: { nodeId: string; label: string; demand: number };
}

/* ═══════════════════════════════════════════════════════
   DETERMINISTIC HASH — avoids Math.random in API
   ═══════════════════════════════════════════════════════ */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function seededRange(seed: string, min: number, max: number): number {
  return min + (hashStr(seed) % (max - min + 1));
}

/* ═══════════════════════════════════════════════════════
   MODE SPEED/COST FACTORS
   ═══════════════════════════════════════════════════════ */
const MODE_CONFIG: Record<string, { speed: number; costMul: number; baseRisk: number; edgeType: 'road' | 'sea' | 'air' }> = {
  road:  { speed: 60, costMul: 2.5, baseRisk: 20, edgeType: 'road' },
  sea:   { speed: 25, costMul: 1.2, baseRisk: 30, edgeType: 'sea' },
  air:   { speed: 800, costMul: 8, baseRisk: 10, edgeType: 'air' },
  rail:  { speed: 80, costMul: 1.8, baseRisk: 15, edgeType: 'road' },
  'multi-modal': { speed: 40, costMul: 2, baseRisk: 25, edgeType: 'sea' },
};

/* ═══════════════════════════════════════════════════════
   CITY METADATA — for deterministic fallback
   ═══════════════════════════════════════════════════════ */
const CITY_META: Record<string, { demand: number; isPort: boolean; isAirport: boolean }> = {
  mumbai:    { demand: 78, isPort: true, isAirport: true },
  delhi:     { demand: 82, isPort: false, isAirport: true },
  chennai:   { demand: 65, isPort: true, isAirport: true },
  shanghai:  { demand: 90, isPort: true, isAirport: true },
  dubai:     { demand: 75, isPort: true, isAirport: true },
  rotterdam: { demand: 70, isPort: true, isAirport: false },
  singapore: { demand: 85, isPort: true, isAirport: true },
  london:    { demand: 88, isPort: false, isAirport: true },
  'new york': { demand: 92, isPort: true, isAirport: true },
  'los angeles': { demand: 80, isPort: true, isAirport: true },
  tokyo:     { demand: 87, isPort: true, isAirport: true },
  frankfurt: { demand: 68, isPort: false, isAirport: true },
};

function getCityMeta(name: string) {
  const key = name.toLowerCase().trim();
  return CITY_META[key] || { demand: seededRange(key, 40, 80), isPort: key.includes('port'), isAirport: false };
}

/* ═══════════════════════════════════════════════════════
   DYNAMIC GRAPH BUILDER — from user input
   ═══════════════════════════════════════════════════════ */
function buildDynamicGraph(
  source: string,
  destination: string,
  stops: string[],
  mode: string,
  riskTolerance: string,
): { nodes: SCNode[]; edges: SCEdge[]; intelligence: GraphIntelligence } {
  const nodes: SCNode[] = [];
  const edges: SCEdge[] = [];
  const modeConf = MODE_CONFIG[mode.toLowerCase()] || MODE_CONFIG.sea;
  const riskMul = riskTolerance === 'low' ? 1.3 : riskTolerance === 'high' ? 0.7 : 1;

  // Helper to make safe IDs
  const toId = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();

  // ─── Build node chain: source → stops → destination ───
  const chain: { id: string; label: string; type: 'supply' | 'transit' | 'storage' | 'demand' }[] = [];

  // Source
  const srcMeta = getCityMeta(source);
  chain.push({ id: toId(source), label: source, type: 'supply' });
  nodes.push({
    id: toId(source), label: source, type: 'supply',
    risk: seededRange(source + 'r', 15, 45),
    demand: seededRange(source + 'd', 20, 50),
    load: seededRange(source + 'l', 2000, 6000),
    capacity: seededRange(source + 'c', 6000, 10000),
    role: 'Source / Manufacturing Hub',
  });

  // Auto-generate transit hub if mode is sea/air
  if (modeConf.edgeType === 'sea' && srcMeta.isPort) {
    const hubId = toId(source) + '_port';
    const hubLabel = `${source} Port`;
    chain.push({ id: hubId, label: hubLabel, type: 'transit' });
    nodes.push({
      id: hubId, label: hubLabel, type: 'transit',
      risk: seededRange(hubLabel + 'r', 20, 55),
      demand: 0,
      load: seededRange(hubLabel + 'l', 3000, 8000),
      capacity: seededRange(hubLabel + 'c', 8000, 12000),
      role: 'Departure Port',
    });
  }

  // Stops
  for (const stop of stops) {
    if (!stop.trim()) continue;
    const stopMeta = getCityMeta(stop);
    const stopType = stopMeta.isPort ? 'transit' : 'storage';
    chain.push({ id: toId(stop), label: stop, type: stopType });
    nodes.push({
      id: toId(stop), label: stop, type: stopType,
      risk: seededRange(stop + 'r', 15, 60),
      demand: seededRange(stop + 'd', 30, 70),
      load: seededRange(stop + 'l', 1500, 5000),
      capacity: seededRange(stop + 'c', 5000, 9000),
      role: stopType === 'transit' ? 'Transit Hub' : 'Waypoint / Storage',
    });
  }

  // Auto-generate arrival hub
  const dstMeta = getCityMeta(destination);
  if (modeConf.edgeType === 'sea' && dstMeta.isPort) {
    const hubId = toId(destination) + '_port';
    const hubLabel = `${destination} Port`;
    chain.push({ id: hubId, label: hubLabel, type: 'transit' });
    nodes.push({
      id: hubId, label: hubLabel, type: 'transit',
      risk: seededRange(hubLabel + 'r', 20, 50),
      demand: 0,
      load: seededRange(hubLabel + 'l', 3000, 7000),
      capacity: seededRange(hubLabel + 'c', 7000, 11000),
      role: 'Arrival Port',
    });
  }

  // Destination
  chain.push({ id: toId(destination), label: destination, type: 'demand' });
  nodes.push({
    id: toId(destination), label: destination, type: 'demand',
    risk: seededRange(destination + 'r', 10, 40),
    demand: dstMeta.demand,
    load: seededRange(destination + 'l', 2000, 6000),
    capacity: seededRange(destination + 'c', 6000, 10000),
    role: 'Demand / Customer Region',
  });

  // ─── Build edges along chain ───
  for (let i = 0; i < chain.length - 1; i++) {
    const src = chain[i];
    const tgt = chain[i + 1];
    const seg = `${src.label}-${tgt.label}`;
    const dist = seededRange(seg, 500, 8000);
    const time = Math.round(dist / modeConf.speed);
    const cost = Math.round(dist * modeConf.costMul);
    const risk = Math.min(100, Math.round(seededRange(seg + 'risk', 10, 65) * riskMul));

    edges.push({
      source: src.id,
      target: tgt.id,
      transportMode: modeConf.edgeType,
      distance: dist,
      time,
      cost,
      risk,
      capacity: seededRange(seg + 'cap', 3000, 9000),
      flow: seededRange(seg + 'flow', 1000, 5000),
    });
  }

  // ─── Factor nodes (auto-generated based on route) ───
  const factors: SCNode[] = [];

  // Weather factor if sea route
  if (modeConf.edgeType === 'sea') {
    const affectedTransits = chain.filter(c => c.type === 'transit').map(c => c.id);
    if (affectedTransits.length > 0) {
      factors.push({
        id: 'factor_weather', label: 'Storm Risk', type: 'factor',
        risk: 75, demand: 0, load: 0, capacity: 0, role: 'Weather Disruption',
        factorType: 'weather', severity: seededRange(source + 'sev', 50, 85),
        impactedNodes: affectedTransits, impactedEdges: [0, Math.min(edges.length - 1, 1)],
      });
    }
  }

  // Demand surge if destination is major city
  if (dstMeta.demand >= 75) {
    factors.push({
      id: 'factor_demand', label: 'Demand Surge', type: 'factor',
      risk: 55, demand: 0, load: 0, capacity: 0, role: 'Demand Spike',
      factorType: 'demand', severity: seededRange(destination + 'dsev', 45, 70),
      impactedNodes: [toId(destination)], impactedEdges: [edges.length - 1],
    });
  }

  // Congestion if high traffic route
  if (chain.length > 3) {
    factors.push({
      id: 'factor_congestion', label: 'Route Congestion', type: 'factor',
      risk: 60, demand: 0, load: 0, capacity: 0, role: 'Traffic Congestion',
      factorType: 'traffic', severity: seededRange(source + destination + 'cong', 40, 65),
      impactedNodes: [chain[1].id], impactedEdges: [0],
    });
  }

  nodes.push(...factors);

  // ─── Intelligence ───
  let bottleneck = { nodeId: '', label: '', ratio: 0 };
  for (const n of nodes) {
    if (n.capacity > 0) {
      const ratio = n.load / n.capacity;
      if (ratio > bottleneck.ratio) {
        bottleneck = { nodeId: n.id, label: n.label, ratio: Math.round(ratio * 100) / 100 };
      }
    }
  }

  const highestRiskEdge = edges.reduce((max, e) => e.risk > max.risk ? e : max, edges[0]);
  const demandNode = nodes.filter(n => n.type === 'demand').reduce((max, n) => n.demand > max.demand ? n : max, nodes.find(n => n.type === 'demand')!);
  const critPath = chain.map(c => c.id);
  const critRisk = edges.reduce((s, e) => s + e.risk, 0);

  return {
    nodes,
    edges,
    intelligence: {
      bottleneck,
      criticalPath: { nodes: critPath, totalRisk: critRisk },
      highestRiskRoute: {
        from: nodes.find(n => n.id === highestRiskEdge?.source)?.label || '',
        to: nodes.find(n => n.id === highestRiskEdge?.target)?.label || '',
        risk: highestRiskEdge?.risk || 0,
      },
      demandHotspot: { nodeId: demandNode?.id || '', label: demandNode?.label || '', demand: demandNode?.demand || 0 },
    },
  };
}

/* ═══════════════════════════════════════════════════════
   DEFAULT SIMULATED GRAPH (fallback when no user input)
   ═══════════════════════════════════════════════════════ */
function getDefaultGraph() {
  return buildDynamicGraph(
    'Mumbai', 'Rotterdam',
    ['Dubai', 'Singapore'],
    'sea', 'medium',
  );
}

/* ═══════════════════════════════════════════════════════
   DEMO GRAPHS — 3 rich, static, all-capability showcases
   Zero randomness — all values hardcoded for presentation
   ═══════════════════════════════════════════════════════ */

/* ── Demo 1: India Distribution Network ── */
function getDemoIndia() {
  const nodes: SCNode[] = [
    { id: 'china_factory', label: 'China Factory', type: 'supply', risk: 22, demand: 18, load: 5400, capacity: 7000, role: 'Electronics Manufacturing' },
    { id: 'singapore_port', label: 'Singapore Port', type: 'transit', risk: 58, demand: 0, load: 7200, capacity: 9500, role: 'Major Transshipment Hub' },
    { id: 'dubai_port', label: 'Dubai Port', type: 'transit', risk: 35, demand: 0, load: 4800, capacity: 8000, role: 'Middle East Gateway' },
    { id: 'mumbai_wh', label: 'Mumbai Warehouse', type: 'storage', risk: 48, demand: 0, load: 5600, capacity: 6000, role: 'West India Distribution Center' },
    { id: 'delhi_wh', label: 'Delhi Warehouse', type: 'storage', risk: 20, demand: 0, load: 2800, capacity: 5500, role: 'North India Distribution Center' },
    { id: 'bengaluru', label: 'Bengaluru', type: 'demand', risk: 15, demand: 92, load: 4200, capacity: 5000, role: 'Tech Hub — Consumer Market' },
    { id: 'hyderabad', label: 'Hyderabad', type: 'demand', risk: 12, demand: 78, load: 3100, capacity: 4500, role: 'Pharma & IT — Consumer Market' },
    { id: 'war_zone', label: 'War Zone (Red Sea)', type: 'factor', risk: 90, demand: 0, load: 0, capacity: 0, role: 'Geopolitical Disruption', factorType: 'conflict', severity: 88, impactedNodes: ['dubai_port'], impactedEdges: [2] },
    { id: 'storm_bay', label: 'Storm (Bay of Bengal)', type: 'factor', risk: 82, demand: 0, load: 0, capacity: 0, role: 'Weather Disruption', factorType: 'weather', severity: 75, impactedNodes: ['singapore_port', 'mumbai_wh'], impactedEdges: [1, 3] },
    { id: 'demand_surge', label: 'Demand Surge (BLR)', type: 'factor', risk: 55, demand: 0, load: 0, capacity: 0, role: 'Demand Spike', factorType: 'demand', severity: 65, impactedNodes: ['bengaluru'], impactedEdges: [5] },
    { id: 'traffic_mum', label: 'Traffic Congestion (MUM)', type: 'factor', risk: 62, demand: 0, load: 0, capacity: 0, role: 'Traffic Congestion', factorType: 'traffic', severity: 52, impactedNodes: ['mumbai_wh', 'bengaluru'], impactedEdges: [3, 5] },
  ];
  const edges: SCEdge[] = [
    { source: 'china_factory', target: 'singapore_port', transportMode: 'sea', distance: 4200, time: 168, cost: 18500, risk: 32, capacity: 8000, flow: 5400 },
    { source: 'singapore_port', target: 'mumbai_wh', transportMode: 'sea', distance: 3800, time: 144, cost: 16200, risk: 68, capacity: 7000, flow: 5100 },
    { source: 'china_factory', target: 'dubai_port', transportMode: 'sea', distance: 6800, time: 240, cost: 28000, risk: 72, capacity: 6500, flow: 3200 },
    { source: 'dubai_port', target: 'delhi_wh', transportMode: 'air', distance: 2800, time: 6, cost: 42000, risk: 18, capacity: 2500, flow: 1800 },
    { source: 'mumbai_wh', target: 'delhi_wh', transportMode: 'road', distance: 1400, time: 24, cost: 4500, risk: 28, capacity: 4000, flow: 2200 },
    { source: 'mumbai_wh', target: 'bengaluru', transportMode: 'road', distance: 980, time: 16, cost: 3200, risk: 42, capacity: 3500, flow: 3400 },
    { source: 'delhi_wh', target: 'hyderabad', transportMode: 'air', distance: 1500, time: 3, cost: 12000, risk: 10, capacity: 2000, flow: 1600 },
    { source: 'singapore_port', target: 'dubai_port', transportMode: 'sea', distance: 5600, time: 192, cost: 22000, risk: 45, capacity: 5000, flow: 1400 },
  ];
  return {
    nodes, edges,
    intelligence: {
      bottleneck: { nodeId: 'mumbai_wh', label: 'Mumbai Warehouse', ratio: 0.93 },
      criticalPath: { nodes: ['china_factory', 'singapore_port', 'mumbai_wh', 'bengaluru'], totalRisk: 142 },
      highestRiskRoute: { from: 'China Factory', to: 'Dubai Port', risk: 72 },
      demandHotspot: { nodeId: 'bengaluru', label: 'Bengaluru', demand: 92 },
    },
  };
}

/* ── Demo 2: Global Pharma Supply Chain ── */
function getDemoPharma() {
  const nodes: SCNode[] = [
    { id: 'swiss_plant', label: 'Swiss Pharma Plant', type: 'supply', risk: 8, demand: 10, load: 3200, capacity: 5000, role: 'Active Ingredient Manufacturing' },
    { id: 'ireland_plant', label: 'Ireland Bio-Plant', type: 'supply', risk: 12, demand: 15, load: 2800, capacity: 4500, role: 'Biologic Drug Production' },
    { id: 'frankfurt_hub', label: 'Frankfurt Air Hub', type: 'transit', risk: 18, demand: 0, load: 6200, capacity: 7000, role: 'European Air Freight Hub' },
    { id: 'rotterdam_port', label: 'Rotterdam Port', type: 'transit', risk: 25, demand: 0, load: 8400, capacity: 10000, role: 'Europes Largest Port' },
    { id: 'ny_cold_store', label: 'New York Cold Storage', type: 'storage', risk: 30, demand: 0, load: 4800, capacity: 5200, role: 'Temperature-Controlled Warehouse' },
    { id: 'sao_paulo_wh', label: 'São Paulo Warehouse', type: 'storage', risk: 42, demand: 0, load: 3600, capacity: 4000, role: 'LATAM Distribution Hub' },
    { id: 'new_york', label: 'New York', type: 'demand', risk: 10, demand: 95, load: 5800, capacity: 7000, role: 'US Northeast Healthcare Market' },
    { id: 'sao_paulo', label: 'São Paulo', type: 'demand', risk: 22, demand: 82, load: 3200, capacity: 4000, role: 'Brazil Healthcare Market' },
    { id: 'tokyo', label: 'Tokyo', type: 'demand', risk: 14, demand: 88, load: 2900, capacity: 3500, role: 'Japan Healthcare Market' },
    // Factors
    { id: 'cold_breach', label: 'Cold Chain Breach', type: 'factor', risk: 85, demand: 0, load: 0, capacity: 0, role: 'Temperature Excursion', factorType: 'weather', severity: 80, impactedNodes: ['ny_cold_store', 'sao_paulo_wh'], impactedEdges: [3, 5] },
    { id: 'fda_hold', label: 'FDA Import Hold', type: 'factor', risk: 70, demand: 0, load: 0, capacity: 0, role: 'Regulatory Delay', factorType: 'conflict', severity: 72, impactedNodes: ['new_york'], impactedEdges: [4] },
    { id: 'pandemic_surge', label: 'Pandemic Demand Surge', type: 'factor', risk: 65, demand: 0, load: 0, capacity: 0, role: 'Global Health Emergency', factorType: 'demand', severity: 90, impactedNodes: ['new_york', 'tokyo', 'sao_paulo'], impactedEdges: [4, 6, 7] },
  ];
  const edges: SCEdge[] = [
    { source: 'swiss_plant', target: 'frankfurt_hub', transportMode: 'road', distance: 400, time: 8, cost: 2200, risk: 10, capacity: 4000, flow: 3200 },
    { source: 'ireland_plant', target: 'rotterdam_port', transportMode: 'sea', distance: 1200, time: 36, cost: 5800, risk: 22, capacity: 5000, flow: 2800 },
    { source: 'frankfurt_hub', target: 'rotterdam_port', transportMode: 'road', distance: 450, time: 6, cost: 1800, risk: 8, capacity: 6000, flow: 4500 },
    { source: 'rotterdam_port', target: 'ny_cold_store', transportMode: 'sea', distance: 5800, time: 192, cost: 32000, risk: 35, capacity: 8000, flow: 6200 },
    { source: 'ny_cold_store', target: 'new_york', transportMode: 'road', distance: 50, time: 2, cost: 800, risk: 5, capacity: 5000, flow: 4800 },
    { source: 'rotterdam_port', target: 'sao_paulo_wh', transportMode: 'sea', distance: 9500, time: 336, cost: 45000, risk: 48, capacity: 5000, flow: 3600 },
    { source: 'sao_paulo_wh', target: 'sao_paulo', transportMode: 'road', distance: 80, time: 3, cost: 600, risk: 12, capacity: 3500, flow: 3200 },
    { source: 'frankfurt_hub', target: 'tokyo', transportMode: 'air', distance: 9400, time: 14, cost: 85000, risk: 15, capacity: 2000, flow: 1800 },
  ];
  return {
    nodes, edges,
    intelligence: {
      bottleneck: { nodeId: 'ny_cold_store', label: 'New York Cold Storage', ratio: 0.92 },
      criticalPath: { nodes: ['swiss_plant', 'frankfurt_hub', 'rotterdam_port', 'ny_cold_store', 'new_york'], totalRisk: 58 },
      highestRiskRoute: { from: 'Rotterdam Port', to: 'São Paulo Warehouse', risk: 48 },
      demandHotspot: { nodeId: 'new_york', label: 'New York', demand: 95 },
    },
  };
}

/* ── Demo 3: EV Battery Supply Chain ── */
function getDemoEV() {
  const nodes: SCNode[] = [
    { id: 'aus_lithium', label: 'Australia Lithium Mine', type: 'supply', risk: 18, demand: 5, load: 4500, capacity: 6000, role: 'Raw Lithium Extraction' },
    { id: 'chile_copper', label: 'Chile Copper Mine', type: 'supply', risk: 25, demand: 8, load: 3800, capacity: 5000, role: 'Copper & Cobalt Mining' },
    { id: 'shanghai_refinery', label: 'Shanghai Refinery', type: 'transit', risk: 40, demand: 0, load: 8500, capacity: 9000, role: 'Battery-Grade Processing' },
    { id: 'busan_port', label: 'Busan Port', type: 'transit', risk: 28, demand: 0, load: 6200, capacity: 8000, role: 'Korea Transshipment Hub' },
    { id: 'catl_factory', label: 'CATL Megafactory', type: 'storage', risk: 35, demand: 0, load: 7800, capacity: 8500, role: 'Battery Cell Manufacturing' },
    { id: 'nevada_giga', label: 'Tesla Gigafactory', type: 'storage', risk: 15, demand: 0, load: 5200, capacity: 6500, role: 'EV Assembly — Nevada' },
    { id: 'tesla_us', label: 'US EV Market', type: 'demand', risk: 10, demand: 96, load: 6800, capacity: 8000, role: 'North America EV Sales' },
    { id: 'bmw_munich', label: 'BMW Munich', type: 'demand', risk: 12, demand: 85, load: 4200, capacity: 5000, role: 'European EV Assembly' },
    { id: 'byd_shenzhen', label: 'BYD Shenzhen', type: 'demand', risk: 8, demand: 90, load: 5500, capacity: 6000, role: 'China EV Market Leader' },
    // Factors
    { id: 'trade_war', label: 'US-China Tariffs', type: 'factor', risk: 88, demand: 0, load: 0, capacity: 0, role: 'Trade War — 100% EV Tariff', factorType: 'conflict', severity: 92, impactedNodes: ['catl_factory', 'tesla_us'], impactedEdges: [5] },
    { id: 'lithium_shortage', label: 'Lithium Shortage', type: 'factor', risk: 75, demand: 0, load: 0, capacity: 0, role: 'Raw Material Scarcity', factorType: 'demand', severity: 78, impactedNodes: ['aus_lithium', 'shanghai_refinery'], impactedEdges: [0] },
    { id: 'typhoon_pacific', label: 'Typhoon (Pacific)', type: 'factor', risk: 80, demand: 0, load: 0, capacity: 0, role: 'Severe Weather — Shipping Lane', factorType: 'weather', severity: 70, impactedNodes: ['busan_port', 'shanghai_refinery'], impactedEdges: [3] },
    { id: 'chip_shortage', label: 'Semiconductor Shortage', type: 'factor', risk: 68, demand: 0, load: 0, capacity: 0, role: 'Component Supply Crisis', factorType: 'traffic', severity: 65, impactedNodes: ['nevada_giga', 'bmw_munich'], impactedEdges: [5, 7] },
  ];
  const edges: SCEdge[] = [
    { source: 'aus_lithium', target: 'shanghai_refinery', transportMode: 'sea', distance: 8200, time: 288, cost: 42000, risk: 30, capacity: 6000, flow: 4500 },
    { source: 'chile_copper', target: 'shanghai_refinery', transportMode: 'sea', distance: 18000, time: 600, cost: 78000, risk: 55, capacity: 4500, flow: 3800 },
    { source: 'shanghai_refinery', target: 'catl_factory', transportMode: 'road', distance: 200, time: 4, cost: 1200, risk: 8, capacity: 9000, flow: 8500 },
    { source: 'catl_factory', target: 'busan_port', transportMode: 'sea', distance: 950, time: 36, cost: 8500, risk: 20, capacity: 7000, flow: 5500 },
    { source: 'busan_port', target: 'nevada_giga', transportMode: 'sea', distance: 9200, time: 360, cost: 65000, risk: 38, capacity: 6000, flow: 4200 },
    { source: 'nevada_giga', target: 'tesla_us', transportMode: 'road', distance: 600, time: 10, cost: 3500, risk: 5, capacity: 8000, flow: 6800 },
    { source: 'catl_factory', target: 'byd_shenzhen', transportMode: 'road', distance: 1300, time: 18, cost: 4200, risk: 10, capacity: 6000, flow: 5500 },
    { source: 'busan_port', target: 'bmw_munich', transportMode: 'sea', distance: 18500, time: 650, cost: 92000, risk: 42, capacity: 4000, flow: 3200 },
  ];
  return {
    nodes, edges,
    intelligence: {
      bottleneck: { nodeId: 'shanghai_refinery', label: 'Shanghai Refinery', ratio: 0.94 },
      criticalPath: { nodes: ['aus_lithium', 'shanghai_refinery', 'catl_factory', 'busan_port', 'nevada_giga', 'tesla_us'], totalRisk: 101 },
      highestRiskRoute: { from: 'Chile Copper Mine', to: 'Shanghai Refinery', risk: 55 },
      demandHotspot: { nodeId: 'tesla_us', label: 'US EV Market', demand: 96 },
    },
  };
}

const DEMO_GRAPHS: Record<string, () => ReturnType<typeof getDemoIndia>> = {
  '1': getDemoIndia,
  '2': getDemoPharma,
  '3': getDemoEV,
};

function getDemoGraph(id: string) {
  return (DEMO_GRAPHS[id] || getDemoIndia)();
}

/* ═══════════════════════════════════════════════════════
   ROUTE HANDLER
   ═══════════════════════════════════════════════════════ */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const isDemo = params.get('demo') === 'true';
  const demoId = params.get('demoId') || '1';
  const source = params.get('source');
  const destination = params.get('destination');
  const stopsRaw = params.get('stops');
  const mode = params.get('mode') || 'sea';
  const riskTolerance = params.get('riskTolerance') || 'medium';

  let graph: ReturnType<typeof buildDynamicGraph>;

  if (isDemo) {
    // Static demo graph — zero randomness, all hardcoded
    graph = getDemoGraph(demoId);
  } else if (source && destination) {
    // Build from user input
    const stops = stopsRaw ? stopsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
    graph = buildDynamicGraph(source, destination, stops, mode, riskTolerance);
  } else {
    // Try to pull from backend, then fallback
    try {
      const res = await fetch(`${API_BASE}/dashboard`, { cache: 'no-store' });
      if (res.ok) {
        const d = await res.json();
        const shipments = d.recentShipments || [];
        if (shipments.length > 0) {
          const first = shipments[0];
          const route = first.route || '';
          const [src, dst] = route.split('→').map((s: string) => s.trim());
          if (src && dst) {
            graph = buildDynamicGraph(src, dst, [], first.mode || 'sea', 'medium');
          } else {
            graph = getDefaultGraph();
          }
        } else {
          graph = getDefaultGraph();
        }
      } else {
        graph = getDefaultGraph();
      }
    } catch {
      graph = getDefaultGraph();
    }
  }

  const summary = {
    totalNodes: graph.nodes.length,
    totalEdges: graph.edges.length,
    highRiskPaths: graph.edges.filter(e => e.risk >= 60).length,
    avgFlow: graph.edges.length > 0 ? Math.round(graph.edges.reduce((s, e) => s + e.flow, 0) / graph.edges.length) : 0,
    factorNodes: graph.nodes.filter(n => n.type === 'factor').length,
  };

  return NextResponse.json({
    nodes: graph.nodes,
    edges: graph.edges,
    summary,
    intelligence: graph.intelligence,
  });
}
