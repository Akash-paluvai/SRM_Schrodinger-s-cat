import { NextRequest, NextResponse } from 'next/server';
import { API_BASE } from '@/lib/api';

/**
 * Proxy for FastAPI intelligence endpoints.
 *
 * GET  ?id={docId}        → GET  /api/v1/intelligence/{docId}
 * GET  ?orderId={orderId} → GET  /api/v1/intelligence/order/{orderId}
 * POST ?id={docId}        → POST /api/v1/intelligence/{docId}/run
 */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id      = searchParams.get('id');
  const orderId = searchParams.get('orderId');

  let url: string;
  if (id) {
    url = `${API_BASE}/intelligence/${id}`;
  } else if (orderId) {
    url = `${API_BASE}/intelligence/order/${orderId}`;
  } else {
    return NextResponse.json(
      { error: 'Provide either ?id= or ?orderId=' },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: text },
        { status: res.status },
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[intelligence-live] proxy error:', err);
    return NextResponse.json(
      { error: 'Backend unreachable' },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json(
      { error: 'Provide ?id={docId} to trigger agent run' },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(`${API_BASE}/intelligence/${id}/run`, {
      method: 'POST',
      cache: 'no-store',
    });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[intelligence-live] run proxy error:', err);
    return NextResponse.json(
      { error: 'Backend unreachable' },
      { status: 502 },
    );
  }
}
