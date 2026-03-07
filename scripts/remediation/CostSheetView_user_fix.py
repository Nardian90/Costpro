import sys

file_path = 'src/components/views/terminal/views/cost_sheet/CostSheetView.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# Add const { user } = useAuthStore();
if 'const { user } = useAuthStore();' not in content:
    content = content.replace('const isMobile = useIsMobile();',
                              'const isMobile = useIsMobile();\n  const { user } = useAuthStore();')

with open(file_path, 'w') as f:
    f.write(content)
