import { MatchingEngine } from './engine';

self.onmessage = async (e) => {
  try {
    const { type, transactions, products, rules, stockMap } = e.data;

    if (type === 'RECONCILE_BATCH') {
      const engine = new MatchingEngine(products, rules);
      const results = await engine.reconcileAll(
          transactions,
          (percentage) => {
              self.postMessage({ type: 'PROGRESS', percentage });
          },
          stockMap
      );

      self.postMessage({
        type: 'BATCH_COMPLETE',
        results
      });
    }
  } catch (err) {
    console.error('Worker execution error:', err);
    // Notify the main thread about the error if possible,
    // though worker.onerror in the main thread should also catch this.
    throw err;
  }
};
