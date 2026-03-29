import { NextResponse } from 'next/server';

import { API_BASE } from '@/lib/api';

export async function GET() {
  try {
    const res = await fetch(`${API_BASE}/supply-chain-requests?limit=20`, { cache: 'no-store' });
    if (res.ok) {
        const json = await res.json();
        const shipments = json.data || [];
        const decisions = shipments.filter((s: any) => s.insights && s.insights.data).map((s: any, idx: number) => {
            const data = s.insights.data;
            const agents = data.agents || [];
            
            const weatherRisk = agents.find((a: any) => a.agent === 'weather')?.risk_score || 10;
            const trafficRisk = agents.find((a: any) => a.agent === 'traffic')?.risk_score || 10;
            const newsRisk = agents.find((a: any) => a.agent === 'news')?.risk_score || 10;
            const demandRisk = agents.find((a: any) => a.agent === 'demand')?.risk_score || 10;
            
            return {
                id: `DEC-${s._id.slice(-4).toUpperCase()}`,
                action: `Optimal Route: ${data.source} → ${data.destination}`,
                timestamp: data.run_at || s.createdAt || new Date().toISOString(),
                status: 'EXECUTED',
                factors: {
                    weather: Math.round(weatherRisk),
                    congestion: Math.round(trafficRisk),
                    geopolitics: Math.round(newsRisk),
                    demand: Math.round(demandRisk)
                },
                outcome: {
                    delayReduction: 'Simulated',
                    costReduction: data.economic_cost ? `$${data.economic_cost?.toLocaleString()} total` : 'Optimized',
                    riskReduction: `Final Risk: ${Math.round(data.final_risk || 0)}/100`
                },
                reasoning: `AI selected this route based on game theory optimization. Dominant risk was ${data.dominant_risk}. Expected delay is ${data.expected_delay?.toFixed(1)} days. Worst case scenarios show a p95 delay of ${data.p95_delay?.toFixed(1)} days.`,
                alternatives: [
                    { action: 'Standard Ocean Route', risk: 'MEDIUM', delay: '+2.1 days', cost: '+$40K' },
                    { action: 'Air Freight', risk: 'LOW', delay: '-5.0 days', cost: '+$350K' }
                ]
            };
        });
        
        if (decisions.length > 0) {
            return NextResponse.json({ decisions });
        }
    }
  } catch (e) {
    console.error("DB Explain Error", e);
  }

  // Fallback to static mock
  return NextResponse.json({
    decisions: [
      {
        id: 'DEC-001',
        action: 'Route Changed: Shanghai → LA',
        timestamp: '2025-03-28T01:45:00Z',
        status: 'EXECUTED',
        factors: {
          geopolitics: 15,
          weather: 62,
          congestion: 18,
          demand: 5,
        },
        outcome: {
          delayReduction: '2.3 days saved',
          costReduction: '$142,000 saved',
          riskReduction: '87 → 34 risk score',
        },
        reasoning: 'Typhoon Mawar projected to cross original route within 36 hours. Rerouting via northern Pacific adds 1.2 days but avoids 3.5-day weather delay and $380K potential damage. Net benefit: $142K and 2.3 days.',
        alternatives: [
          { action: 'Hold at port', risk: 'MEDIUM', delay: '+3.5 days', cost: '+$280K' },
          { action: 'Speed increase', risk: 'HIGH', delay: '+0 days', cost: '+$95K fuel' },
        ],
      },
      {
        id: 'DEC-002',
        action: 'Supplier Switch: TK-Osaka → TK-Seoul',
        timestamp: '2025-03-28T00:30:00Z',
        status: 'EXECUTED',
        factors: {
          geopolitics: 8,
          weather: 5,
          congestion: 12,
          demand: 75,
        },
        outcome: {
          delayReduction: '4.1 days saved',
          costReduction: '$67,000 saved',
          riskReduction: '64 → 22 risk score',
        },
        reasoning: 'Osaka supplier capacity dropped 15% due to demand surge. Seoul backup supplier has 40% spare capacity with equivalent quality certifications. Lead time improves by 4.1 days.',
        alternatives: [
          { action: 'Wait for Osaka capacity', risk: 'MEDIUM', delay: '+4.1 days', cost: '+$67K' },
          { action: 'Split order', risk: 'LOW', delay: '+1.5 days', cost: '+$23K' },
        ],
      },
    ],
  });
}
