import { NextResponse } from 'next/server';

import { API_BASE } from '@/lib/api';

export async function GET() {
  try {
    const res = await fetch(`${API_BASE}/supply-chain-requests?limit=20`, { cache: 'no-store' });
    if (res.ok) {
        const json = await res.json();
        const shipments = json.data || [];
        const latestInfo = shipments.find((s: any) => s.insights && s.insights.data);
        
        if (latestInfo) {
            const data = latestInfo.insights.data;
            const route: string[] = data.optimal_route || [];
            
            if (route.length > 0) {
                const nodes = [];
                const edges = [];
                let x = 10;
                
                for (let i = 0; i < route.length; i++) {
                    const nodeName = route[i];
                    nodes.push({
                        id: `N${i}`,
                        label: nodeName,
                        type: i === 0 ? 'supplier' : i === route.length - 1 ? 'warehouse' : 'port',
                        risk: data.risk_level?.toLowerCase() || 'medium',
                        x: x,
                        y: 30 + (i % 2 === 0 ? 10 : -10)
                    });
                    
                    if (i > 0) {
                        edges.push({
                            from: `N${i-1}`,
                            to: `N${i}`,
                            risk: data.risk_level?.toLowerCase() || 'medium',
                            flow: 4500
                        });
                    }
                    x += Math.floor(80 / (route.length || 1));
                }
                
                return NextResponse.json({
                    nodes,
                    edges,
                    summary: {
                        totalNodes: nodes.length,
                        totalEdges: edges.length,
                        highRiskPaths: data.risk_level === 'HIGH' ? edges.length : 0,
                        avgFlow: 4500
                    }
                });
            }
        }
    }
  } catch (e) {
    console.error("DB Graph Error", e);
  }

  // Fallback to static mock if DB fails or lacks insights
  return NextResponse.json({
    nodes: [
      { id: 'S1', label: 'Shanghai Port', type: 'port', risk: 'high', x: 80, y: 20 },
      { id: 'S2', label: 'Singapore Hub', type: 'port', risk: 'low', x: 60, y: 50 },
      { id: 'S3', label: 'Rotterdam Port', type: 'port', risk: 'medium', x: 25, y: 15 },
      { id: 'S4', label: 'Los Angeles Port', type: 'port', risk: 'low', x: 10, y: 30 },
      { id: 'S5', label: 'Dubai Hub', type: 'port', risk: 'low', x: 50, y: 40 },
      { id: 'S6', label: 'Santos Port', type: 'port', risk: 'high', x: 20, y: 70 },
      { id: 'F1', label: 'Foxconn Shenzhen', type: 'supplier', risk: 'medium', x: 82, y: 32 },
      { id: 'F2', label: 'Toyota Osaka', type: 'supplier', risk: 'low', x: 88, y: 18 },
      { id: 'F3', label: 'BASF Ludwigshafen', type: 'supplier', risk: 'low', x: 30, y: 12 },
      { id: 'W1', label: 'Dallas Warehouse', type: 'warehouse', risk: 'low', x: 12, y: 35 },
      { id: 'W2', label: 'Frankfurt Warehouse', type: 'warehouse', risk: 'low', x: 28, y: 20 },
      { id: 'W3', label: 'Tokyo Warehouse', type: 'warehouse', risk: 'medium', x: 90, y: 25 },
    ],
    edges: [
      { from: 'F1', to: 'S1', risk: 'medium', flow: 4200 },
      { from: 'F2', to: 'S1', risk: 'low', flow: 2100 },
      { from: 'S1', to: 'S4', risk: 'high', flow: 6300 },
      { from: 'S1', to: 'S2', risk: 'low', flow: 3400 },
      { from: 'S2', to: 'S5', risk: 'low', flow: 1600 },
      { from: 'S2', to: 'S3', risk: 'medium', flow: 2800 },
      { from: 'S3', to: 'S6', risk: 'high', flow: 2200 },
      { from: 'F3', to: 'S3', risk: 'low', flow: 1800 },
      { from: 'S4', to: 'W1', risk: 'low', flow: 5100 },
      { from: 'S3', to: 'W2', risk: 'low', flow: 2400 },
      { from: 'S1', to: 'W3', risk: 'medium', flow: 1900 },
    ],
    summary: {
      totalNodes: 12,
      totalEdges: 11,
      highRiskPaths: 3,
      avgFlow: 2835,
    },
  });
}
