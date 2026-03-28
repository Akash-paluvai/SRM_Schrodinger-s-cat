import { create } from 'zustand';

interface SimulationResult {
  disruption: string;
  delay: string;
  costIncrease: string;
  suggestedRoute: string;
  confidence: number;
  reasoning: string;
}

interface AppStore {
  simulationResult: SimulationResult | null;
  setSimulationResult: (result: SimulationResult) => void;
  clearSimulation: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  simulationResult: null,
  setSimulationResult: (result) => set({ simulationResult: result }),
  clearSimulation: () => set({ simulationResult: null }),
}));
