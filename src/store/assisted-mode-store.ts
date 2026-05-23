import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export type AssistedViewMode = 'prod' | 'serv' | 'com';

interface AssistedModeState {
  // Navigation & UI State
  mode: AssistedViewMode;
  activeNodeId: string | null;
  isPanelOpen: boolean;
  panelSide: 'left' | 'right';

  // Viewport State
  zoom: number;
  pan: { x: number; y: number };

  // Actions
  setMode: (mode: AssistedViewMode) => void;
  setActiveNode: (nodeId: string | null) => void;
  togglePanel: (isOpen?: boolean) => void;
  setPanelSide: (side: 'left' | 'right') => void;
  setViewport: (zoom: number, pan: { x: number; y: number }) => void;
  resetViewport: () => void;
}

export const useAssistedModeStore = create<AssistedModeState>()(
  devtools(
    (set) => ({
      mode: 'prod',
      activeNodeId: null,
      isPanelOpen: false,
      panelSide: 'right',
      zoom: 1,
      pan: { x: 0, y: 0 },

      setMode: (mode) => set({ mode, activeNodeId: null }),
      setActiveNode: (nodeId) => set({ activeNodeId: nodeId, isPanelOpen: !!nodeId }),
      togglePanel: (isOpen) => set((state) => ({ isPanelOpen: isOpen ?? !state.isPanelOpen })),
      setPanelSide: (side) => set({ panelSide: side }),
      setViewport: (zoom, pan) => set({ zoom, pan }),
      resetViewport: () => set({ zoom: 1, pan: { x: 0, y: 0 } }),
    }),
    { name: 'assisted-mode-store' }
  )
);
