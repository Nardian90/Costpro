import sys

file_path = 'src/components/views/terminal/Sidebar.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# Add useAuthStore to imports
if 'useAuthStore' not in content:
    content = content.replace('useUIStore } from \'' + '@' + '/store\';',
                              'useUIStore, useAuthStore } from \'' + '@' + '/store\';')

# Add const { user } = useAuthStore();
if 'const { user } = useAuthStore();' not in content:
    content = content.replace('const { isCalculatorOpen, setIsCalculatorOpen } = useUIStore();',
                              'const { isCalculatorOpen, setIsCalculatorOpen } = useUIStore();\n  const { user } = useAuthStore();')

with open(file_path, 'w') as f:
    f.write(content)
