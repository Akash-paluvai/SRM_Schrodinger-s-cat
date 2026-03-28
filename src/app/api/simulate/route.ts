import { NextRequest, NextResponse } from 'next/server';

const scenarios: Record<string, { delay: string; costIncrease: string; suggestedRoute: string; confidence: number; reasoning: string }> = {
  war: {
    delay: '+5.2 days',
    costIncrease: '+34%',
    suggestedRoute: 'Reroute via Cape of Good Hope. Avoid Suez Canal and Red Sea corridors.',
    confidence: 91,
    reasoning: 'Conflict zone detected in Red Sea. Historical data shows 94% of vessels rerouted during similar events (2024 Houthi crisis). AI recommends preemptive diversion for 23 active shipments.',
  },
  storm: {
    delay: '+2.8 days',
    costIncrease: '+18%',
    suggestedRoute: 'Hold vessels at safe harbor (Hong Kong). Resume after storm passes.',
    confidence: 87,
    reasoning: 'Category 4 typhoon projected path intersects 3 major shipping lanes. Probability of delay >90%. Cost of hold < cost of damage/rescue. 8 vessels affected.',
  },
  'port-block': {
    delay: '+4.1 days',
    costIncrease: '+22%',
    suggestedRoute: 'Divert to alternate ports: Port Klang (MY), Tanjung Pelepas (MY).',
    confidence: 94,
    reasoning: 'Port congestion index at Singapore exceeds 95th percentile. Average berth wait 72hrs. Nearby ports have 40% available capacity. Diversion saves net 2.3 days.',
  },
};

export async function POST(request: NextRequest) {
  const body = await request.json();
  const disruption = (body.disruption || 'storm').toLowerCase().replace(' ', '-');

  // Simulate processing delay
  await new Promise((resolve) => setTimeout(resolve, 300));

  const result = scenarios[disruption] || scenarios['storm'];

  return NextResponse.json({
    disruption: body.disruption || 'Storm',
    ...result,
    timestamp: new Date().toISOString(),
    affectedRoutes: Math.floor(Math.random() * 15) + 5,
    affectedShipments: Math.floor(Math.random() * 200) + 50,
  });
}
