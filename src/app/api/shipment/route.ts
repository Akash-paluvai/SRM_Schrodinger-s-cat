import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json();

  // ── Validation ──
  const errors: string[] = [];
  if (!body.source?.trim()) errors.push('Source location is required');
  if (!body.destination?.trim()) errors.push('Destination location is required');
  if (!body.shipmentType) errors.push('Shipment type is required');
  if (!body.quantity?.trim()) errors.push('Quantity is required');
  if (!body.transportMode) errors.push('Transport mode is required');

  if (errors.length > 0) {
    return NextResponse.json({ success: false, errors }, { status: 400 });
  }

  // ── Structure the supply-chain problem ──
  const structuredProblem = {
    id: `SCH-${Date.now()}`,
    timestamp: new Date().toISOString(),
    origin: body.source,
    destination: body.destination,
    stops: body.stops || [],
    shipment: {
      type: body.shipmentType,
      quantity: body.quantity,
      mode: body.transportMode,
    },
    constraints: {
      deadline: body.deadline || null,
      budget: body.budget || null,
      priority: body.priority || 'medium',
      riskTolerance: body.riskTolerance || 'medium',
    },
    logistics: {
      distributionStrategy: body.distributionStrategy || 'full',
      warehouseConstraints: body.warehouseConstraints || '',
      supplierPreferences: body.supplierPreferences || '',
    },
    regulatory: {
      restrictedRegions: body.restrictedRegions || '',
      compliance: body.complianceRequirements || '',
      timeWindows: body.timeWindows || '',
      ecoRouting: body.ecoRouting || false,
      insurance: body.insurance || false,
    },
    status: 'PENDING_OPTIMIZATION',
  };

  // Simulate processing delay
  await new Promise((resolve) => setTimeout(resolve, 200));

  return NextResponse.json({
    success: true,
    problem: structuredProblem,
  });
}
