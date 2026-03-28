import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    riskOverview: {
      score: 73,
      level: 'ELEVATED',
      trend: 'INCREASING',
      change: '+8 pts (24h)',
    },
    newsAlerts: [
      { id: 1, severity: 'critical', title: 'Typhoon Mawar Category 4', body: 'Expected to impact South China Sea shipping lanes within 48 hours. 12 vessels in path.', time: '2 min ago', source: 'NOAA' },
      { id: 2, severity: 'warning', title: 'Santos Port Workers Strike', body: 'Brazilian dockworkers union announced 72-hour strike starting Monday.', time: '18 min ago', source: 'Reuters' },
      { id: 3, severity: 'info', title: 'Suez Canal Throughput Normal', body: 'Canal operations running at 98% capacity. No delays expected.', time: '45 min ago', source: 'SCA' },
      { id: 4, severity: 'warning', title: 'EU Carbon Tax Update', body: 'New emissions regulations may increase Mediterranean route costs by 3-5%.', time: '1 hr ago', source: 'EC' },
    ],
    weatherAlerts: [
      { region: 'South China Sea', condition: 'Typhoon', severity: 'critical', windSpeed: '140 km/h', wavHeight: '8m' },
      { region: 'North Atlantic', condition: 'Storm', severity: 'warning', windSpeed: '65 km/h', wavHeight: '4m' },
      { region: 'Mediterranean', condition: 'Clear', severity: 'low', windSpeed: '12 km/h', wavHeight: '0.5m' },
    ],
    demandSignals: [
      { product: 'Electronics', change: '+12%', trend: 'up', region: 'North America' },
      { product: 'Auto Parts', change: '-8%', trend: 'down', region: 'Europe' },
      { product: 'Pharmaceuticals', change: '+22%', trend: 'up', region: 'Asia-Pacific' },
      { product: 'Raw Materials', change: '+3%', trend: 'stable', region: 'Global' },
    ],
  });
}
