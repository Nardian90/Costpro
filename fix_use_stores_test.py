import os

with open('src/components/views/terminal/views/stores/__tests__/useStoresView.cartGuard.test.ts', 'r') as f:
    content = f.read()

content = content.replace(
    "expect(mockUpdateUser).toHaveBeenCalledWith({ activeStoreId: 'store-1' });",
    "expect(mockUpdateUser).toHaveBeenCalledWith({ activeStoreId: 'store-1', storeId: 'store-1' });"
)

with open('src/components/views/terminal/views/stores/__tests__/useStoresView.cartGuard.test.ts', 'w') as f:
    f.write(content)

print("Fixed useStoresView.cartGuard.test.ts")
