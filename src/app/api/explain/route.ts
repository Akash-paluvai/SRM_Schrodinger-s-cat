import { NextResponse } from 'next/server';

export async function GET() {
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
