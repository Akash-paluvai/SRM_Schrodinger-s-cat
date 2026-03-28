/**
 * pagehome — Backend module for /home page
 *
 * Handles:
 * - Input validation for shipment creation
 * - Data structuring for the supply chain problem
 * - Request preparation for future simulation / optimization
 *
 * Currently uses mock / placeholder logic.
 * Ready for integration with real optimization backend.
 */

export interface ShipmentInput {
  source: string;
  destination: string;
  stops: { id: string; location: string }[];
  shipmentType: string;
  quantity: string;
  transportMode: string;
  deadline: string;
  budget: string;
  priority: 'low' | 'medium' | 'high';
  riskTolerance: 'low' | 'medium' | 'high';
  distributionStrategy: string;
  warehouseConstraints: string;
  supplierPreferences: string;
  restrictedRegions: string;
  complianceRequirements: string;
  timeWindows: string;
  ecoRouting: boolean;
  insurance: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a shipment input payload.
 */
export function validateShipmentInput(input: Partial<ShipmentInput>): ValidationResult {
  const errors: string[] = [];

  if (!input.source?.trim()) errors.push('Source location is required');
  if (!input.destination?.trim()) errors.push('Destination location is required');
  if (!input.shipmentType) errors.push('Shipment type is required');
  if (!input.quantity?.trim()) errors.push('Quantity / volume is required');
  if (!input.transportMode) errors.push('Transport mode is required');

  if (input.deadline) {
    const deadlineDate = new Date(input.deadline);
    if (isNaN(deadlineDate.getTime())) {
      errors.push('Invalid deadline date');
    } else if (deadlineDate < new Date()) {
      errors.push('Deadline must be in the future');
    }
  }

  if (input.budget) {
    const budgetNum = Number(input.budget.replace(/[^0-9.]/g, ''));
    if (isNaN(budgetNum) || budgetNum <= 0) {
      errors.push('Budget must be a positive number');
    }
  }

  return { valid: errors.length === 0, errors };
}
