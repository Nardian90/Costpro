import sys

def fix_in_file(file_path):
    with open(file_path, 'r') as f:
        content = f.read()

    # Target both files
    content = content.replace(".replace(/[/\\?%*:|\"<>]/g, '-')", ".replace(/[\\\\/\\\\?%*:|\\\"<>]/g, '-')")
    content = content.replace(".replace(/[/\?%*:|\"<>]/g, '-')", ".replace(/[\\\\/\\\\?%*:|\\\"<>]/g, '-')")
    # Also for the one in View
    content = content.replace(".replace(/[/\\\\?%*:|\"<>]/g, '-')", ".replace(/[\\\\/\\\\?%*:|\\\"<>]/g, '-')")

    with open(file_path, 'w') as f:
        f.write(content)

fix_in_file('src/app/api/cost-sheets/export-pdf/route.ts')
fix_in_file('src/components/views/terminal/views/cost_sheet/CostSheetView.tsx')
