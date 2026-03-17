import sys
content = open('src/components/views/terminal/views/ipv/TransactionTable.tsx').read()
import re

# Find the start of the broken block
broken_start = content.find('}\n\n: { transactions: BankTransaction[] }) {')
if broken_start != -1:
    # Find the end of the broken block
    brace_count = 0
    start_search = content.find('{', broken_start)
    end_idx = -1
    for i in range(start_search, len(content)):
        if content[i] == '{':
            brace_count += 1
        elif content[i] == '}':
            brace_count -= 1
            if brace_count == 0:
                end_idx = i + 1
                break
    if end_idx != -1:
        new_content = content[:broken_start+1] + content[end_idx:]
        open('src/components/views/terminal/views/ipv/TransactionTable.tsx', 'w').write(new_content)
        print('Fixed broken function block')
else:
    print('Broken block not found')
