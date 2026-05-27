import os

with open('src/services/__tests__/store-service.test.ts', 'r') as f:
    content = f.read()

# The resetStore test expects only 2 insert calls for audit logs.
# But there are other calls to from().select() for notifications and dependencies.
# The chain mock needs to handle multiple different calls.

content = content.replace(
    "chain.then.mockImplementation((resolve: any) => resolve({ data: null, error: null }));",
    "chain.then.mockImplementation((resolve: any) => resolve({ data: [], error: null }));"
)

with open('src/services/__tests__/store-service.test.ts', 'w') as f:
    f.write(content)

print("Fixed store-service.test.ts")
