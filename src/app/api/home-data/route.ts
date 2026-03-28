import { NextResponse } from 'next/server';
import { API_BASE } from '@/lib/api';

/* Static portfolio / trade values — as specified, keep fixed */
const STATIC_METRICS = {
  trade: {
    importsVolume: '4.2M TEU',
    exportsVolume: '3.8M TEU',
  },
  performance: {
    onTimeRate:         96.4,
    avgDelayReduction:  '2.1 days',
    costOptimization:   14.7,
  },
  risk: {
    riskIndex:         34,
    activeDisruptions:  7,
  },
  extra: {
    revenueHandled: '$2.4B',
    aiConfidence:   93,
  },
  activeAlerts: [
    { id: 1, severity: 'critical', title: 'Port congestion — Singapore',     time: '12 min ago' },
    { id: 2, severity: 'warning',  title: 'Weather disruption — North Atlantic', time: '28 min ago' },
    { id: 3, severity: 'info',     title: 'Suez Canal throughput normalized', time: '1 hr ago'   },
  ],
};

export async function GET() {
  /* ── Try to pull real data from FastAPI ── */
  try {
    const res = await fetch(`${API_BASE}/dashboard`, {
      next: { revalidate: 30 }, // cache 30 s
    });

    if (res.ok) {
      const live = await res.json();

      return NextResponse.json({
        operations:      live.operations,
        recentShipments: live.recentShipments,
        ...STATIC_METRICS,
      });
    }
  } catch {
    /* FastAPI not running — fall through to mock */
  }

  /* ── Fallback mock (dev / FastAPI offline) ── */
  return NextResponse.json({
    operations: {
      totalShipments:      12847,
      activeDeliveries:    1423,
      completedDeliveries: 11424,
    },
    recentShipments: [
      { id: 'mock-1', displayId: 'SH-4821', route: 'Shanghai → Rotterdam',   status: 'IN_TRANSIT', mode: 'Sea',  eta: '2025-04-02', cargo: 'Electronics'   },
      { id: 'mock-2', displayId: 'SH-4820', route: 'Tokyo → Vancouver',       status: 'AT_PORT',   mode: 'Sea',  eta: '2025-04-05', cargo: 'Auto Parts'    },
      { id: 'mock-3', displayId: 'SH-4819', route: 'Mumbai → Dubai',          status: 'IN_TRANSIT', mode: 'Air',  eta: '2025-03-30', cargo: 'Pharmaceuticals'},
      { id: 'mock-4', displayId: 'SH-4818', route: 'Hamburg → Santos',        status: 'DELAYED',   mode: 'Sea',  eta: '2025-04-08', cargo: 'Raw Materials' },
      { id: 'mock-5', displayId: 'SH-4817', route: 'Los Angeles → Dallas',    status: 'DELIVERED', mode: 'Road', eta: '2025-03-28', cargo: 'FMCG'         },
    ],
    ...STATIC_METRICS,
  });
}
