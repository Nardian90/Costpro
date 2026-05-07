export function makeAdjustPayload(overrides = {}) {
  return {
    productId: process.env.E2E_TEST_PRODUCT_ID || '00000000-0000-0000-0000-000000000001',
    storeId:   process.env.E2E_TEST_STORE_ID   || '00000000-0000-0000-0000-000000000002',
    quantity: 10,
    movementType: 'add',
    version: 1,
    reason: 'E2E test adjustment',
    ...overrides,
  };
}
