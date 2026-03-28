import { NextRequest, NextResponse } from 'next/server';
import { API_BASE } from '@/lib/api';

/* ── DELETE /api/shipments/[id] ─────────────────────────────────────────── */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!id || id.startsWith('mock-')) {
    // Mock IDs can't be deleted from DB — just acknowledge
    return NextResponse.json({ success: true, message: 'Mock record removed from view.' });
  }

  try {
    const res = await fetch(`${API_BASE}/supply-chain-requests/${id}`, {
      method: 'DELETE',
    });

    if (res.ok) {
      return NextResponse.json({ success: true, message: `Shipment ${id} deleted.` });
    }

    const err = await res.text();
    return NextResponse.json({ success: false, message: err }, { status: res.status });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: 'FastAPI unreachable.' },
      { status: 503 },
    );
  }
}

/* ── PATCH /api/shipments/[id] — write back insights (route / simulation) ─ */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();

  if (!id || id.startsWith('mock-')) {
    return NextResponse.json({ success: true, skipped: true });
  }

  try {
    const res = await fetch(`${API_BASE}/supply-chain-requests/${id}/insights`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ type: body.type, data: body.data }),
    });

    if (res.ok) {
      return NextResponse.json({ success: true });
    }

    const err = await res.text();
    return NextResponse.json({ success: false, message: err }, { status: res.status });
  } catch {
    return NextResponse.json({ success: false, message: 'FastAPI unreachable.' }, { status: 503 });
  }
}

/* ── GET /api/shipments/[id] ─────────────────────────────────────────────── */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const res = await fetch(`${API_BASE}/supply-chain-requests/${id}`);
    if (res.ok) {
      return NextResponse.json(await res.json());
    }
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch {
    return NextResponse.json({ error: 'FastAPI unreachable.' }, { status: 503 });
  }
}
