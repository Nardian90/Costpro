import re

def cleanup(file_path):
    with open(file_path, 'r') as f:
        content = f.read()

    # Remove unused imports
    content = content.replace("import { cn } from '@/lib/utils';", "")
    content = content.replace("import { Skeleton } from '@/components/ui/skeleton';", "")

    with open(file_path, 'w') as f:
        f.write(content)

if __name__ == "__main__":
    cleanup('src/components/views/terminal/views/cost_sheet/CostSheetView.tsx')
