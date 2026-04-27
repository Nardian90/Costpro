import { useAuthStore } from '@/store';
import { useState, useEffect } from 'react';

export interface HealthData {
  audit: any;
  metrics: any;
  graph: any;
  system: any;
  manifest: any;
  changes: any;
  reviewQueue: any;
  integrityReport: string | null;
  pipelineState: any;
  knowledgeGraph: any;
  userHelp: any;
  views: any;
  workflows: any;
  components: any;
  docsList: string[];
  healthSummary: {
    timestamp: string;
    integrityScore: number;
    status: string;
  };
}

export function useHealthData() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    const { token } = useAuthStore.getState();
    try {
      setLoading(true);
      const response = await fetch('/api/intelligence', { headers: { 'Authorization': `Bearer ${token}` } });
      if (!response.ok) {
        throw new Error('Failed to fetch system intelligence data from v9.0 engine');
      }
      const json = await response.json();
      setData(json);
      setError(null);
    } catch (err: any) {
      console.error('Intelligence Hub Sync Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return { data, loading, error, refetch: fetchData };
}
