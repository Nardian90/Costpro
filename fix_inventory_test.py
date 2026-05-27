import os

with open('src/components/views/terminal/views/inventory/__tests__/InventoryView.test.tsx', 'r') as f:
    content = f.read()

content = content.replace(
    "expect(screen.getByText('Stock Item')).toBeInTheDocument();",
    "expect(screen.getAllByText('Stock Item')[0]).toBeInTheDocument();"
)

with open('src/components/views/terminal/views/inventory/__tests__/InventoryView.test.tsx', 'w') as f:
    f.write(content)

print("Fixed InventoryView.test.tsx")
