import { SimulationResult, StrategyConfig } from '@/types/pick3';

const STORAGE_KEYS = {
  HISTORY: 'pick3_draw_history',
  SIMULATIONS: 'pick3_simulations',
  CONFIG: 'pick3_current_config',
  PLAYS: 'pick3_saved_plays'
};

export class Pick3Storage {
  static saveSimulation(simulation: SimulationResult) {
    const existing = this.getSimulations();
    const updated = [simulation, ...existing].slice(0, 10); // Keep last 10
    localStorage.setItem(STORAGE_KEYS.SIMULATIONS, JSON.stringify(updated));
  }

  static getSimulations(): SimulationResult[] {
    const data = localStorage.getItem(STORAGE_KEYS.SIMULATIONS);
    return data ? JSON.parse(data) : [];
  }

  static saveConfig(config: StrategyConfig) {
    localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(config));
  }

  static getConfig(): StrategyConfig | null {
    const data = localStorage.getItem(STORAGE_KEYS.CONFIG);
    return data ? JSON.parse(data) : null;
  }

  static savePlays(plays: any[]) {
    localStorage.setItem(STORAGE_KEYS.PLAYS, JSON.stringify(plays));
  }

  static getSavedPlays(): any[] {
    const data = localStorage.getItem(STORAGE_KEYS.PLAYS);
    return data ? JSON.parse(data) : [];
  }

  static clear() {
    Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
  }
}
