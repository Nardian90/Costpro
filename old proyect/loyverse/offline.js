import { supabase } from './supabaseClient.js';

/*
  OfflineService:
  - Manages Dexie (IndexedDB).
  - Syncs Data DOWN (Supabase -> Local) on load/online.
  - Syncs Transactions UP (Local Queue -> Supabase) when online.
*/

export class OfflineService {
    constructor() {
        this.db = new Dexie('LoyverseOfflineDB');
        this.db.version(1).stores({
            products: 'id, name, sku', // Products cache
            inventory: 'id, product_id, store_id', // Inventory cache
            variants: 'id, product_id', // Variants cache
            syncInfo: 'key', // To track last sync time
            pendingTransactions: '++id, created_at' // Queue for offline sales
        });
        this.storeId = null;
    }

    async init(storeId) {
        this.storeId = storeId;
        console.log('[Offline] Initialized for store:', storeId);

        // Attempt initial sync if online
        if (navigator.onLine) {
            await this.syncDown();
            await this.processQueue();
        }

        // Listen for online status
        window.addEventListener('online', () => {
            console.log('[Offline] Back Online. Syncing...');
            this.syncDown();
            this.processQueue();
        });
    }

    // --- SYNC DOWN (Cloud -> Local) ---
    async syncDown() {
        if (!this.storeId) return;

        try {
            console.log('[Offline] Syncing Down...');

            // 1. Fetch Latest Data
            const { data: products } = await supabase.from('products').select('*');
            const { data: variants } = await supabase.from('product_variants').select('*');
            const { data: inventory } = await supabase.from('inventory').select('*').eq('store_id', this.storeId);

            // 2. Update Local DB (Bulk Put)
            if (products) await this.db.products.bulkPut(products);
            if (variants) await this.db.variants.bulkPut(variants);
            if (inventory) await this.db.inventory.bulkPut(inventory);

            await this.db.syncInfo.put({ key: 'lastSync', value: new Date().toISOString() });
            console.log('[Offline] Sync Complete.');

            // Notify UI (optional event)
            window.dispatchEvent(new CustomEvent('offline-data-updated'));

        } catch (err) {
            console.error('[Offline] Sync Down failed:', err);
        }
    }

    // --- READ DATA (Local First) ---
    async getProducts() {
        // Return JOINED data from Local DB
        const products = await this.db.products.toArray();
        const variants = await this.db.variants.toArray();
        const inventory = await this.db.inventory.toArray();

        return products.map(p => {
            const inv = inventory.find(i => i.product_id === p.id);
            const pVariants = variants.filter(v => v.product_id === p.id);
            return {
                ...p,
                stock: inv ? inv.quantity : 0,
                variants: pVariants
            };
        });
    }

    // --- WRITE DATA (Queue -> Cloud) ---
    async saveTransaction(transactionData, userProfile) {
        // 1. Always save to Local Queue first (Safety)
        const offlineId = await this.db.pendingTransactions.add({
            data: transactionData,
            user: userProfile,
            created_at: new Date().toISOString(),
            status: 'pending'
        });

        console.log('[Offline] Transaction queued locally:', offlineId);

        // 2. Optimistic Update: Deduct local stock immediately for UI
        // (This is tricky with Dexie without complex logic, so we rely on the main POSView to update its memory state, 
        //  but we SHOULD update local inventory for persistence if the app reloads offline).
        for (const item of transactionData.items) {
            const invItem = await this.db.inventory.where({ product_id: item.product.id }).first();
            if (invItem) {
                const deduct = item.quantity * item.factor;
                await this.db.inventory.update(invItem.id, { quantity: invItem.quantity - deduct });
            }
        }

        // 3. Try to Push immediately if online
        if (navigator.onLine) {
            await this.processQueue();
        }

        return offlineId;
    }

    async processQueue() {
        const pending = await this.db.pendingTransactions.toArray();
        if (pending.length === 0) return;

        console.log(`[Offline] Processing queue: ${pending.length} items...`);

        for (const task of pending) {
            try {
                await this.pushTransactionToSupabase(task);
                // If success, delete from queue
                await this.db.pendingTransactions.delete(task.id);
            } catch (err) {
                console.error('[Offline] Failed to push transaction:', task.id, err);
                // Keep in queue, retry later
            }
        }
    }

    async pushTransactionToSupabase(task) {
        const { data: tData } = task;

        // 1. Transaction
        const { data: trans, error: tErr } = await supabase.from('transactions').insert({
            store_id: this.storeId,
            user_id: task.user.id,
            total_amount: tData.totalAmount,
            status: 'completed',
            created_at: task.created_at // Preserve original offline time
        }).select().single();

        if (tErr) throw tErr;

        // 2. Items & Stock Movements
        for (const item of tData.items) {
            // Item
            await supabase.from('transaction_items').insert({
                transaction_id: trans.id,
                product_id: item.product.id,
                quantity: item.quantity,
                price_at_sale: item.price
            });

            // Stock Log
            const quantityToDeduct = item.quantity * item.factor;
            await supabase.from('stock_movements').insert({
                store_id: this.storeId,
                product_id: item.product.id,
                variant_id: item.variantId,
                quantity_change: -quantityToDeduct,
                movement_type: 'sale',
                reference_id: trans.id,
                created_at: task.created_at
            });

            // RPC Stock Update
            await supabase.rpc('deduct_stock', {
                p_store_id: this.storeId,
                p_product_id: item.product.id,
                p_quantity: quantityToDeduct
            });
        }
    }
}
