import { useAuthStore } from '@/store';
import { useState, useEffect } from 'react';

export function useHealthIndex(pollingInterval: number = 30000) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/system-health', { headers: { 'Authorization': `Bearer ${useAuthStore.getState().token}` } });
      if (!res.ok) throw new Error('Failed to fetch health index');
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, pollingInterval);
    return () => clearInterval(interval);
  }, [pollingInterval]); // FIX-RCT-103: fetchData reads from getState() — stable reference, no dep needed

  return { data, loading, error, refetch: fetchData };
}
