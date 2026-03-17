file_path = 'src/components/views/terminal/views/ipv/TransactionTable.tsx'
with open(file_path, 'r') as f:
    lines = f.readlines()

new_lines = []
skip = False
for line in lines:
    if 'function BulkForceMatchPopover' in line:
        skip = True
    if not skip:
        new_lines.append(line)
    if skip and line.strip() == '}':
        # Check if it's the end of BulkForceMatchPopover
        # We need a more robust check if possible, but let's see.
        # Actually it's followed by 'export function TransactionTable' or end of file usually.
        # Let's check next line
        skip = False

with open(file_path, 'w') as f:
    f.writelines(new_lines)
