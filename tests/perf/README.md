# Performance Tests — FC Automatizada Routes

This directory contains k6 performance test scripts for the FC Automatizada (Ficha de Costo) API routes in CostPro.

## Prerequisites

Install [k6](https://k6.io/docs/get-started/installation/):

```bash
# macOS
brew install k6

# Linux (Debian/Ubuntu)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C49146641CD2
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Windows (Chocolatey)
choco install k6
```

## Test Scripts

### `k6-fc-routes.js`

Tests the three main FC-related API endpoints under load:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/product-cost-sheets` | GET | List cost sheets for a product |
| `/api/store-cost-templates` | GET | List cost templates for a store |
| `/api/product-cost-sheets/quick-pdf` | GET | Generate quick PDF for a product's cost sheet |

### Load Profile

```
Stage 1: Ramp up to 10 virtual users over 30s
Stage 2: Hold at 10 virtual users for 1m
Stage 3: Ramp up to 20 virtual users over 30s
Stage 4: Hold at 20 virtual users for 1m
Stage 5: Ramp down to 0 virtual users over 30s
Total duration: ~3m 30s
```

### Performance Thresholds

| Metric | Threshold | Description |
|--------|-----------|-------------|
| `http_req_duration` | p(95) < 5000ms | 95% of requests must complete within 5 seconds |
| `errors` | rate < 10% | Less than 10% of requests may result in server errors (5xx) |

## Running the Tests

### Basic Run (No Authentication)

```bash
k6 run tests/perf/k6-fc-routes.js
```

This runs against `http://localhost:3000` by default. Responses will likely be 401/403 since the endpoints require authentication.

### Run with Authentication

```bash
AUTH_COOKIE="sb-access-token=YOUR_TOKEN; sb-refresh-token=YOUR_TOKEN" k6 run tests/perf/k6-fc-routes.js
```

### Run Against a Different URL

```bash
BASE_URL=https://staging.costpro.app k6 run tests/perf/k6-fc-routes.js
```

### Run with Both Custom URL and Auth

```bash
BASE_URL=https://staging.costpro.app \
  AUTH_COOKIE="sb-access-token=YOUR_TOKEN" \
  k6 run tests/perf/k6-fc-routes.js
```

### Run with JSON Output

```bash
k6 run --out json=results.json tests/perf/k6-fc-routes.js
```

### Run with Cloud Output (k6 Cloud)

```bash
k6 cloud tests/perf/k6-fc-routes.js
```

## Interpreting Results

k6 outputs a summary table after the test completes:

```
     ✓ GET cost-sheets status 200 or 404
     ✓ GET templates status 200 or 404
     ✓ GET quick-pdf status 200 or 404

     checks.........................: 100.00% ✓ 600      ✗ 0
     data_received..................: 1.2 MB  5.7 kB/s
     data_sent......................: 120 kB  577 B/s
     errors.........................: 0.00%   ✓ 0        ✗ 600
     http_req_duration..............: avg=245ms min=42ms med=180ms max=4.2s p(95)=1.8s
     http_reqs......................: 600     2.86/s
     iteration_duration.............: avg=3.45s min=3.1s med=3.3s  max=7.1s p(95)=5.8s
     iterations.....................: 200     0.95/s
     vus............................: 10      min=10     max=20
```

### Key Metrics to Watch

- **`http_req_duration p(95)`**: Should be below 5000ms. If it exceeds this, the API is too slow under load.
- **`errors rate`**: Should be below 10%. High error rates indicate server failures under load.
- **`iterations`**: Total number of complete test iterations. Lower than expected indicates timeouts or failures.
- **`vus`**: Current virtual users. Should match the configured stages.

## Customizing the Test

### Adjusting Load Levels

Edit the `stages` array in `k6-fc-routes.js`:

```javascript
export const options = {
  stages: [
    { duration: '30s', target: 50 },  // Higher ramp-up for stress testing
    { duration: '2m', target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],  // Stricter threshold
    errors: ['rate<0.05'],              // Stricter error rate
  },
};
```

### Adding New Endpoints

Add new test cases inside the `default function`:

```javascript
export default function () {
  // ... existing tests ...

  // Test: GET /api/cost-sheets/export-pdf
  const res4 = http.get(
    `${BASE_URL}/api/cost-sheets/export-pdf?product_id=00000000-0000-0000-0000-000000000001&store_id=00000000-0000-0000-0000-000000000001`,
    params,
  );
  check(res4, { 'GET export-pdf status 200 or 404': (r) => r.status === 200 || r.status === 404 || r.status === 400 });
  errorRate.add(res4.status >= 500);
  sleep(1);
}
```

## CI Integration

To run performance tests in CI, add a step to your workflow:

```yaml
- name: Run performance tests
  run: |
    k6 run --out json=perf-results.json tests/perf/k6-fc-routes.js
  env:
    BASE_URL: http://localhost:3000
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| All requests return 401 | Missing auth cookie | Set `AUTH_COOKIE` environment variable |
| All requests return 404 | Application not running | Start the dev server first: `bun run dev` |
| High error rate (>10%) | Server overloaded or buggy | Check server logs for errors |
| High p(95) latency | Slow database queries | Check Supabase dashboard for slow queries |
| Connection refused | Wrong URL or port | Verify `BASE_URL` and that the server is running |
