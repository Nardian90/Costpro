import { create } from 'zustand';

interface SessionState {
  isOnline: boolean;
  isCheckingSession: boolean;
  lastChecked: number;
  status: 'stable' | 'checking' | 'error';
  setOnlineStatus: (isOnline: boolean) => void;
  setSessionStatus: (isChecking: boolean, newStatus?: 'stable' | 'checking' | 'error') => void;
  setStatus: (status: 'stable' | 'checking' | 'error') => void;
}

export const useSessionStore = create<SessionState>()((set) => ({
  isOnline: typeof window !== 'undefined' ? window.navigator.onLine : true,
  isCheckingSession: false,
  lastChecked: 0,
  status: 'stable',
  setOnlineStatus: (isOnline: boolean) => set({ isOnline }),
  setSessionStatus: (isChecking: boolean, newStatus: 'stable' | 'checking' | 'error' = 'checking') =>
    set({
      isCheckingSession: isChecking,
      lastChecked: isChecking ? Date.now() : Date.now(),
      status: newStatus
    }),
  setStatus: (status: 'stable' | 'checking' | 'error') => set({ status }),
}));
