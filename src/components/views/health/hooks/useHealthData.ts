import { useState, useEffect } from 'react';

export interface HealthData {
  audit: any;
  metrics: any;
  graph: any;
  system: any;
  reviewQueue: any;
  integrityReport: string | null;
  pipelineState: any;
  knowledgeGraph: any;
  userHelp: any;
  views: any;
  workflows: any;
  components: any;
  docsList: string[];
}

export function useHealthData() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const response = await fetch('/api/intelligence');
      if (!response.ok) {
        throw new Error('Failed to fetch system intelligence data');
      }
      const json = await response.json();
      setData(json);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching health data:', err);
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
