
import { MatchingEngine } from '../ipv/engine';

self.onmessage = async (e) => {
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
};
