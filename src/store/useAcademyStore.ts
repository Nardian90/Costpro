import { create } from 'zustand';

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
  error: string | null;
  fetchDailyCards: () => Promise<void>;
  evaluateCard: (cardId: string, score: number) => Promise<void>;
  generateCards: (filename: string) => Promise<void>;
}

export const useAcademyStore = create<AcademyState>((set, get) => ({
  dueCards: [],
  newCards: [],
  loading: false,
  error: null,

  fetchDailyCards: async () => {
    set({ loading: true, error: null });
    try {
      const response = await fetch('/api/academy/review');
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
    }
  },

  evaluateCard: async (cardId, score) => {
    try {
      const response = await fetch(`/api/academy/review/${cardId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    }
  },

  generateCards: async (filename) => {
    set({ loading: true, error: null });
    try {
      const response = await fetch('/api/academy/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename })
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
