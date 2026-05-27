import os

with open('src/services/__tests__/user-service.test.ts', 'r') as f:
    content = f.read()

# Add mock implementation for the membership check in setActiveStore
content = content.replace(
    "chain.then.mockImplementationOnce((resolve: any) => resolve({ data: { success: true }, error: null }));",
    "chain.then.mockImplementationOnce((resolve: any) => resolve({ data: [{ id: 'm1', status: 'active' }], error: null })); // mock membership check\n      chain.then.mockImplementationOnce((resolve: any) => resolve({ data: { success: true }, error: null })); // mock update"
)

with open('src/services/__tests__/user-service.test.ts', 'w') as f:
    f.write(content)

print("Fixed user-service.test.ts")
