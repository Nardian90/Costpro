import { MatchingEngine } from './engine';

self.onmessage = async (e) => {
  try {
    const { type, transactions, products, rules, stockMap } = e.data;

    if (type === 'RECONCILE_BATCH') {
      const stockMapConverted = new Map<string, number>(
        Array.isArray(stockMap) ? stockMap : []
      );

      const engine = new MatchingEngine(products, rules);

      const BATCH_FLUSH_SIZE = 10;

      const results = await engine.reconcileAll(
        transactions,
        (percentage: number) => {
          self.postMessage({
            type: 'PROGRESS',
            percentage
          });
        }
      );

      for (let i = 0; i < results.length; i += BATCH_FLUSH_SIZE) {
        const chunk = results.slice(i, i + BATCH_FLUSH_SIZE);

        self.postMessage({
          type: 'PARTIAL_RESULTS',
          results: chunk,
          offset: i,
          total: results.length,
          isLast: i + BATCH_FLUSH_SIZE >= results.length
        });
      }

      self.postMessage({
        type: 'BATCH_COMPLETE',
        results,
        totalProcessed: results.length
      });
    }
  } catch (err) {
    console.error('Worker execution error:', err);
    self.postMessage({
      type: 'ERROR',
      error: err instanceof Error ? err.message : 'Unknown error'
    });
  }
};
