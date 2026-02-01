
import { MatchingEngine } from '../ipv/engine';

self.onmessage = async (e) => {
  const { type, transactions, products, rules } = e.data;

  if (type === 'RECONCILE_BATCH') {
    const engine = new MatchingEngine(products, rules);
    const results = await engine.reconcileAll(transactions);

    self.postMessage({
      type: 'BATCH_COMPLETE',
      results
    });
  }
};
