import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Ramp up to 10 users
    { duration: '1m', target: 10 },   // Stay at 10 users
    { duration: '30s', target: 20 },  // Ramp up to 20 users
    { duration: '1m', target: 20 },   // Stay at 20 users
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<5000'], // 95% of requests < 5s
    errors: ['rate<0.1'],              // Error rate < 10%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function k6FcRoutes() {
  // Test: GET /api/product-cost-sheets
  const params = { headers: { Cookie: __ENV.AUTH_COOKIE || '' } };
  
  const res1 = http.get(`${BASE_URL}/api/product-cost-sheets?product_id=00000000-0000-0000-0000-000000000001`, params);
  check(res1, { 'GET cost-sheets status 200 or 404': (r) => r.status === 200 || r.status === 404 });
  errorRate.add(res1.status >= 500);
  sleep(1);

  // Test: GET /api/store-cost-templates
  const res2 = http.get(`${BASE_URL}/api/store-cost-templates?store_id=00000000-0000-0000-0000-000000000001`, params);
  check(res2, { 'GET templates status 200 or 404': (r) => r.status === 200 || r.status === 404 });
  errorRate.add(res2.status >= 500);
  sleep(1);

  // Test: GET /api/product-cost-sheets/quick-pdf
  const res3 = http.get(`${BASE_URL}/api/product-cost-sheets/quick-pdf?product_id=00000000-0000-0000-0000-000000000001`, params);
  check(res3, { 'GET quick-pdf status 200 or 404': (r) => r.status === 200 || r.status === 404 || r.status === 400 });
  errorRate.add(res3.status >= 500);
  sleep(1);
}
