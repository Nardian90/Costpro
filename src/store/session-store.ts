import { create } from 'zustand';

type SessionStatus = 'online' | 'offline' | 'checking' | 'error' | 'stable';

interface SessionState {
  isOnline: boolean;
  isCheckingSession: boolean;
  lastChecked: number;
  status: SessionStatus;
  setOnlineStatus: (isOnline: boolean) => void;
  setSessionStatus: (isChecking: boolean, newStatus?: SessionStatus) => void;
  setStatus: (status: SessionStatus) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isCheckingSession: false,
  lastChecked: 0,
  status: 'stable',
  setOnlineStatus: (isOnline) => set({
    isOnline,
    status: isOnline ? 'online' : 'offline'
  }),
  setSessionStatus: (isChecking, newStatus) => {
    const update: Partial<SessionState> = { isCheckingSession: isChecking };
    if (newStatus) {
      update.status = newStatus;
    }
    if (isChecking) {
      update.lastChecked = Date.now();
      update.status = 'checking';
    }
    set(update);
  },
  setStatus: (status) => set({ status }),
}));
