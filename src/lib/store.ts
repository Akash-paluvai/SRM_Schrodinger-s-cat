import { create } from 'zustand';

/* ── Simulation result (existing) ── */
interface SimulationResult {
  disruption: string;
  delay: string;
  costIncrease: string;
  suggestedRoute: string;
  confidence: number;
  reasoning: string;
}

/* ── Shipment (new) ── */
export interface ShipmentStop {
  id: string;
  location: string;
}

export interface ShipmentPayload {
  source: string;
  destination: string;
  stops: ShipmentStop[];
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

/* ── Store ── */
interface AppStore {
  simulationResult: SimulationResult | null;
  setSimulationResult: (result: SimulationResult) => void;
  clearSimulation: () => void;

  shipment: ShipmentPayload | null;
  setShipment: (payload: ShipmentPayload) => void;
  clearShipment: () => void;

  /** MongoDB _id of the saved shipment — set after successful DB write */
  shipmentDbId: string | null;
  setShipmentDbId: (id: string) => void;
  clearShipmentDbId: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  simulationResult: null,
  setSimulationResult: (result) => set({ simulationResult: result }),
  clearSimulation: () => set({ simulationResult: null }),

  shipment: null,
  setShipment: (payload) => set({ shipment: payload }),
  clearShipment: () => set({ shipment: null }),

  shipmentDbId: null,
  setShipmentDbId: (id) => set({ shipmentDbId: id }),
  clearShipmentDbId: () => set({ shipmentDbId: null }),
}));
