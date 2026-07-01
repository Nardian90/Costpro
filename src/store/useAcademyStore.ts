import { create } from 'zustand';
import { supabase } from '@/lib/supabaseClient';

export interface AcademyCard {
  id: string;
  question: string;
  answer: string;
  difficulty: string;
  category: string;
  source: string;
}

export interface UserProgress {
  card_id: string;
  mastery_score: number;
  next_review: string;
}

interface AcademyState {
  dueCards: (AcademyCard & { progress?: UserProgress })[];
  newCards: AcademyCard[];
  loading: boolean;
  fetchInProgress: boolean;
  error: string | null;
  fetchDailyCards: () => Promise<void>;
  evaluateCard: (cardId: string, score: number) => Promise<void>;
  generateCards: (filename: string, aiProvider?: string, aiApiKey?: string) => Promise<void>;
}

export const useAcademyStore = create<AcademyState>((set, get) => ({
  dueCards: [],
  newCards: [],
  loading: false,
  fetchInProgress: false,
  error: null,

  fetchDailyCards: async () => {
    // FIX: Guard against concurrent fetch calls that can return stale data
    if (get().fetchInProgress) return;
    set({ fetchInProgress: true, loading: true, error: null });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch('/api/academy/review', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (!response.ok) {
         const errorData = await response.json();
         throw new Error(errorData.error || 'Failed to fetch daily cards');
      }
      const data = await response.json();

      const due = data.due.map((d: any) => ({
        ...d.learning_cards,
        progress: {
          card_id: d.card_id,
          mastery_score: d.mastery_score,
          next_review: d.next_review
        }
      }));

      set({
        dueCards: due,
        newCards: data.new,
        loading: false
      });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    } finally {
      set({ fetchInProgress: false });
    }
  },

  evaluateCard: async (cardId, score) => {
    // FIX-RCT-114: Save card reference before optimistic removal for rollback on error
    const card = get().dueCards.find(c => c.id === cardId) || get().newCards.find(c => c.id === cardId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(`/api/academy/review/${cardId}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ score })
      });
      if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to evaluate card');
      }

      // Update local state: remove from due/new
      set(state => ({
        dueCards: state.dueCards.filter(c => c.id !== cardId),
        newCards: state.newCards.filter(c => c.id !== cardId)
      }));
    } catch (e: any) {
      console.error('Error evaluating card:', e);
      // FIX-RCT-114: Restore card on error
      if (card) {
        set(state => ({
          dueCards: state.dueCards.find(c => c.id === cardId) ? state.dueCards : [...state.dueCards, card],
          newCards: state.newCards.find(c => c.id === cardId) ? state.newCards : [...state.newCards, card],
        }));
      }
    }
  },

  generateCards: async (filename, aiProvider, aiApiKey) => {
    set({ loading: true, error: null });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch('/api/academy/generate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ filename, aiProvider, aiApiKey })
      });
      if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to generate cards');
      }

      set({ loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  }
}));
