import { db, type CatalogAudit } from '../dexie';

export class CatalogAuditService {
  static async log(audit: Omit<CatalogAudit, 'id' | 'timestamp'>) {
    await db.catalog_audit.add({
      ...audit,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    });
  }
  static async getHistory() {
    return await db.catalog_audit.orderBy('timestamp').reverse().toArray();
  }
}
