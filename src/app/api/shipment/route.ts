import { NextRequest, NextResponse } from 'next/server';
import { API_BASE } from '@/lib/api';

/* ── helpers ── */
function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function parseBudget(raw: string): number | null {
  if (!raw) return null;
  const n = parseFloat(raw.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : n;
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  /* ── Validation ── */
  const errors: string[] = [];
  if (!body.source?.trim())       errors.push('Source location is required');
  if (!body.destination?.trim())  errors.push('Destination location is required');
  if (!body.shipmentType)         errors.push('Shipment type is required');
  if (!body.quantity?.trim())     errors.push('Quantity is required');
  if (!body.transportMode)        errors.push('Transport mode is required');

  if (errors.length > 0) {
    return NextResponse.json({ success: false, errors }, { status: 400 });
  }

  /* ── Transform form payload → FastAPI schema ── */
  const fastApiPayload: Record<string, unknown> = {
    sourceLocation:      body.source.trim(),
    destinationLocation: body.destination.trim(),
    stops: (body.stops ?? [])
      .filter((s: { location: string }) => s.location?.trim())
      .map((s: { location: string }, i: number) => ({
        location: s.location.trim(),
        order:    i + 1,
      })),
    shipmentType:         body.shipmentType   || null,
    quantity:             body.quantity?.trim() || null,
    transportMode:        body.transportMode   || null,
    deliveryDeadline:     body.deadline ? new Date(body.deadline).toISOString() : null,
    budget:               parseBudget(body.budget ?? ''),
    priorityLevel:        body.priority      ? capitalize(body.priority)      : null,
    riskTolerance:        body.riskTolerance ? capitalize(body.riskTolerance) : null,
    distributionStrategy: body.distributionStrategy ? capitalize(body.distributionStrategy) : null,
    warehouseConstraints: body.warehouseConstraints?.trim()
      ? { preferredLocations: [body.warehouseConstraints.trim()] }
      : undefined,
    supplierPreferences: body.supplierPreferences?.trim()
      ? { preferredSuppliers: [body.supplierPreferences.trim()] }
      : undefined,
    restrictedRegions:      body.restrictedRegions?.trim()      ? [body.restrictedRegions.trim()]      : [],
    complianceRequirements: body.complianceRequirements?.trim() ? [body.complianceRequirements.trim()] : [],
    timeWindows:            [],
    insights: {
      type: 'form_submission',
      data: {
        ecoRouting: body.ecoRouting ?? false,
        insurance:  body.insurance  ?? false,
        timeWindows: body.timeWindows?.trim() || null,
      },
    },
  };

  /* ── POST to FastAPI ── */
  let dbId: string | null = null;
  try {
    const faRes = await fetch(`${API_BASE}/supply-chain-requests`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(fastApiPayload),
    });

    if (faRes.ok) {
      const faJson = await faRes.json();
      dbId = faJson.id ?? null;
    } else {
      const errText = await faRes.text();
      console.error('[shipment API] FastAPI error:', faRes.status, errText);
    }
  } catch (err) {
    console.error('[shipment API] FastAPI unreachable:', err);
  }

  return NextResponse.json({
    success: true,
    dbId,   // null if FastAPI unavailable — frontend still navigates to /map
    message: dbId
      ? 'Shipment saved to database and queued for optimization.'
      : 'Shipment queued (DB unavailable — proceeding offline).',
  });
}
