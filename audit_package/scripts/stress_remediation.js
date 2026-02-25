import http from 'k6/http';
import { check, sleep } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

export let options = {
    vus: 10,
    iterations: 1000,
};

const BASE_URL = 'https://api.example.com';
const JWT = '__REPLACE_WITH_JWT__';
const STORE_ID = '__REPLACE_WITH_STORE_ID__';
const DEST_STORE_ID = '__REPLACE_WITH_DEST_STORE_ID__';
const PRODUCT_IDS = [/* Array of 300 IDs */];

export default function () {
    const rand = Math.random();
    let res;
    const params = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${JWT}`,
        },
    };

    if (rand < 0.7) {
        // 70% Sales
        const payload = JSON.stringify({
            p_store_id: STORE_ID,
            p_seller_id: '00000000-0000-0000-0000-000000000000',
            p_payment_method: 'cash',
            p_total_amount: 10,
            p_subtotal: 10,
            p_discount_type: 'none',
            p_discount_value: 0,
            p_items: [{ product_id: PRODUCT_IDS[0], quantity: 1, price: 10, cost: 5 }],
            p_transaction_id: uuidv4()
        });
        res = http.post(`${BASE_URL}/rest/v1/rpc/create_sale`, payload, params);
    } else if (rand < 0.9) {
        // 20% Receptions
        const payload = JSON.stringify({
            p_store_id: STORE_ID,
            p_supplier: 'Stress Supplier',
            p_reception_date: '2024-03-24',
            p_invoice_number: 'STR-' + uuidv4().substring(0,8),
            p_items: [{ product_id: PRODUCT_IDS[0], quantity: 10, unit_cost: 5 }],
            p_transaction_id: uuidv4()
        });
        res = http.post(`${BASE_URL}/rest/v1/rpc/register_reception`, payload, params);
    } else {
        // 10% Transfers (Simplified: Create only)
        const payload = JSON.stringify({
            p_origin_store_id: STORE_ID,
            p_destination_store_id: DEST_STORE_ID,
            p_items: [{ product_id: PRODUCT_IDS[0], quantity: 1, unit_cost: 5 }],
            p_transaction_id: uuidv4()
        });
        res = http.post(`${BASE_URL}/rest/v1/rpc/create_transfer`, payload, params);
    }

    check(res, {
        'is 200': (r) => r.status === 200,
    });
    sleep(0.05);
}
