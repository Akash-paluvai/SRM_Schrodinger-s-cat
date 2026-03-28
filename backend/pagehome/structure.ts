/**
 * Structure a validated shipment input into a supply chain problem
 * ready for the optimization / simulation engine.
 */

import { ShipmentInput } from './validate';

export interface StructuredProblem {
  id: string;
  timestamp: string;
  origin: string;
  destination: string;
  intermediateStops: { id: string; location: string }[];
  shipment: {
    type: string;
    quantity: string;
    mode: string;
  };
  constraints: {
    deadline: string | null;
    budget: string | null;
    priority: string;
    riskTolerance: string;
  };
  logistics: {
    distributionStrategy: string;
    warehouseConstraints: string;
    supplierPreferences: string;
  };
  regulatory: {
    restrictedRegions: string;
    compliance: string;
    timeWindows: string;
    ecoRouting: boolean;
    insurance: boolean;
  };
  status: string;
}

/**
 * Convert a raw ShipmentInput into a StructuredProblem
 * that can be sent to the optimization engine.
 */
export function structureProblem(input: ShipmentInput): StructuredProblem {
  return {
    id: `SCH-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    timestamp: new Date().toISOString(),
    origin: input.source,
    destination: input.destination,
    intermediateStops: input.stops.filter((s) => s.location.trim()),
    shipment: {
      type: input.shipmentType,
      quantity: input.quantity,
      mode: input.transportMode,
    },
    constraints: {
      deadline: input.deadline || null,
      budget: input.budget || null,
      priority: input.priority,
      riskTolerance: input.riskTolerance,
    },
    logistics: {
      distributionStrategy: input.distributionStrategy || 'full',
      warehouseConstraints: input.warehouseConstraints || '',
      supplierPreferences: input.supplierPreferences || '',
    },
    regulatory: {
      restrictedRegions: input.restrictedRegions || '',
      compliance: input.complianceRequirements || '',
      timeWindows: input.timeWindows || '',
      ecoRouting: input.ecoRouting,
      insurance: input.insurance,
    },
    status: 'PENDING_OPTIMIZATION',
  };
}
