import { MatchingEngine } from './engine';
import { type BankTransaction, type Product, type MatchingRule } from '../dexie';

self.onmessage = async (e: MessageEvent) => {
  const { type, transactions, products, rules } = e.data;

  if (type === 'RECONCILE_BATCH') {
    const engine = new MatchingEngine(products, rules);
    const results = [];

    const uniqueDates = new Set<string>();

    for (const tx of transactions) {
      const result = await engine.matchTransaction(tx);
      results.push({
        transactionId: tx.id,
        ...result
      });
      uniqueDates.add(tx.fecha);
    }

    // Generar agregados para los días procesados
    for (const date of uniqueDates) {
      await engine.generateDailyAggregate(date);
    }

    self.postMessage({ type: 'BATCH_COMPLETE', results });
  }
};

// Necesario para que TypeScript lo trate como un módulo
export {};
