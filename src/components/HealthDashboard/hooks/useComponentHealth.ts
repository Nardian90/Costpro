import { useAuthStore } from '@/store';
import { useState, useEffect } from 'react';

export function useComponentHealth(pollingInterval: number = 60000) {
  const [components, setComponents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/system-health/knowledge', { headers: { 'Authorization': `Bearer ${useAuthStore.getState().token}` } });
      if (!res.ok) throw new Error('Failed to fetch components knowledge');
      const json = await res.json();

      const componentList = (json.components || []).map((c: any) => {
        // Calculate health based on formula:
        // componentHealth = ((confidenceScore / 10) * 0.5) + ((documentationCoverage / 10) * 0.3) + (((10 - couplingScore) / 10) * 0.2)

        const graphData = json.graph?.components?.find((gc: any) => gc.component_id === c.id) || {};
        const confidenceScore = graphData.health || 10.0;
        const documentationCoverage = graphData.documentation_quality || 10.0;
        const couplingScore = graphData.couplingScore || 0.0;

        const health = (
          (confidenceScore / 10) * 0.5 +
          (documentationCoverage / 10) * 0.3 +
          ((10 - couplingScore) / 10) * 0.2
        ) * 10;

        return {
          ...c,
          health: Number(health.toFixed(1)),
          couplingScore,
          openQuestions: graphData.openQuestions || [],
          hasLogic: !!c.business_logic
        };
      });

      setComponents(componentList);
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
  }, [pollingInterval]); // FIX-RCT-104: fetchData reads from getState() — stable reference, no dep needed

  return { components, loading, error, refetch: fetchData };
}
