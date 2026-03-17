import sys

with open('src/lib/ipv/__tests__/engine.test.ts', 'r') as f:
    content = f.read()

# Fix the mock to include db.matching_logs
content = content.replace(
    '  db: {',
    '  db: {\n    matching_logs: {\n      add: vi.fn().mockResolvedValue("mock-id"),\n      where: vi.fn().mockReturnThis(),\n      equals: vi.fn().mockReturnThis(),\n      reverse: vi.fn().mockReturnThis(),\n      sortBy: vi.fn().mockResolvedValue([]),\n    },'
)

# Remove the incorrectly placed matching_logs outside db
content = content.replace(
    '  matching_logs: {\n    add: vi.fn().mockResolvedValue(\'mock-id\'),\n    where: vi.fn().mockReturnThis(),\n    equals: vi.fn().mockReturnThis(),\n    reverse: vi.fn().mockReturnThis(),\n    sortBy: vi.fn().mockResolvedValue([]),\n  },\n',
    ''
)

with open('src/lib/ipv/__tests__/engine.test.ts', 'w') as f:
    f.write(content)
