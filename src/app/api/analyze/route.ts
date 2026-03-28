import { NextRequest, NextResponse } from 'next/server';
import { API_BASE } from '@/lib/api';

export async function POST(req: NextRequest) {
  const body = await req.json();

  try {
    const res = await fetch(`${API_BASE}/analyze`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        source:          body.source          || 'Mumbai',
        destination:     body.destination     || 'Rotterdam',
        stops:           body.stops           || [],
        shipment_type:   body.shipmentType    || 'Electronics',
        transport_mode:  body.transportMode   || 'Sea',
        disruption_scenario: body.disruption  || null,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'FastAPI unreachable' }, { status: 503 });
  }
}
