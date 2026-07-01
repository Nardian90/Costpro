import { test, expect } from '@playwright/test';

test.describe('Security Headers', () => {
  test('should set X-Content-Type-Options to nosniff', async ({ request }) => {
    const response = await request.get('/');
    expect(response.status()).toBe(200);

    const header = response.headers()['x-content-type-options'];
    expect(header).toBe('nosniff');
  });

  test('should set X-Frame-Options to SAMEORIGIN', async ({ request }) => {
    const response = await request.get('/');
    expect(response.status()).toBe(200);

    const header = response.headers()['x-frame-options'];
    expect(header).toBe('SAMEORIGIN');
  });

  test('should set Referrer-Policy', async ({ request }) => {
    const response = await request.get('/');
    expect(response.status()).toBe(200);

    const header = response.headers()['referrer-policy'];
    expect(header).toBeDefined();
    expect(header).toContain('strict-origin-when-cross-origin');
  });

  test('should set Strict-Transport-Security', async ({ request }) => {
    const response = await request.get('/');
    expect(response.status()).toBe(200);

    const header = response.headers()['strict-transport-security'];
    expect(header).toBeDefined();
    expect(header).toContain('max-age=31536000');
    expect(header).toContain('includeSubDomains');
  });

  test('should set Content-Security-Policy with nonce', async ({ request }) => {
    const response = await request.get('/');
    expect(response.status()).toBe(200);

    const csp = response.headers()['content-security-policy'];
    expect(csp).toBeDefined();

    // Verify CSP contains key directives
    expect(csp).toContain('default-src');
    expect(csp).toContain('script-src');
    expect(csp).toContain("'nonce-");

    // Verify CSP disallows inline scripts by default (uses nonce instead)
    expect(csp).toContain('strict-dynamic');
  });
});
