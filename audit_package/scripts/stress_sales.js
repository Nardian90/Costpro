import http from 'k6/http';
import { check, sleep } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

export let options = {
    vus: 5,
    iterations: 100,
};

const BASE_URL = 'https://api.example.com'; // Replace with actual URL
const JWT = '__REPLACE_WITH_JWT__';
const STORE_ID = '__REPLACE_WITH_STORE_ID__';
const PRODUCT_ID = '__REPLACE_WITH_PRODUCT_ID__';

export default function () {
    const payload = JSON.stringify({
        p_store_id: STORE_ID,
        p_seller_id: '00000000-0000-0000-0000-000000000000', // Dummy
        p_payment_method: 'cash',
        p_total_amount: 100,
        p_subtotal: 100,
        p_discount_type: 'none',
        p_discount_value: 0,
        p_items: [
            {
                product_id: PRODUCT_ID,
                quantity: 1,
                price: 100,
                cost: 50
            }
        ],
        p_transaction_id: uuidv4()
    });

    const params = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${JWT}`,
        },
    };

    let res = http.post(`${BASE_URL}/rest/v1/rpc/create_sale`, payload, params);
    check(res, {
        'status is 200': (r) => r.status === 200,
    });
    sleep(0.1);
}
