import { create } from 'zustand';

interface SessionState {
  isOnline: boolean;
  isCheckingSession: boolean;
  lastChecked: number;
  status: 'stable' | 'checking' | 'error' | 'online' | 'offline';
  setOnlineStatus: (isOnline: boolean) => void;
  setSessionStatus: (isChecking: boolean, newStatus?: SessionState['status']) => void;
  setStatus: (status: SessionState['status']) => void;
}

export const useSessionStore = create<SessionState>()((set) => ({
  isOnline: typeof window !== 'undefined' ? window.navigator.onLine : true,
  isCheckingSession: false,
  lastChecked: 0,
  status: 'stable',
  setOnlineStatus: (isOnline: boolean) => set({ isOnline, status: isOnline ? 'online' : 'offline' }),
  setSessionStatus: (isChecking: boolean, newStatus: SessionState['status'] = 'checking') =>
    set({
      isCheckingSession: isChecking,
      lastChecked: Date.now(),
      status: newStatus
    }),
  setStatus: (status: SessionState['status']) => set({ status }),
}));
