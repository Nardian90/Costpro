import sys

# 1. Update TransactionTable.tsx interface and component call
file_path = 'src/components/views/terminal/views/ipv/TransactionTable.tsx'
with open(file_path, 'r') as f:
    content = f.read()

content = content.replace(
    'onForceMatch?: (tx: BankTransaction) => void;',
    'onForceMatch?: (tx: BankTransaction) => void;\n    onAnalyzeAll?: () => void;'
)
content = content.replace(
    'onForceMatch }: TransactionTableProps',
    'onForceMatch, onAnalyzeAll }: TransactionTableProps'
)

# Replace BulkForceMatchPopover with Analizar todo button
content = content.replace(
    '<BulkForceMatchPopover transactions={filtered} />',
    '<Button variant="ghost" size="sm" onClick={onAnalyzeAll} className="h-7 text-xs font-black uppercase text-primary hover:bg-primary/10"><Wand2 className="w-3 h-3 mr-1" /> Analizar todo</Button>'
)

with open(file_path, 'w') as f:
    f.write(content)

# 2. Update IPVView.tsx to pass onAnalyzeAll
file_path_v = 'src/components/views/terminal/views/ipv/IPVView.tsx'
with open(file_path_v, 'r') as f:
    content_v = f.read()

content_v = content_v.replace(
    'onForceMatch={handleForceMatch}\n                />',
    'onForceMatch={handleForceMatch}\n                onAnalyzeAll={handleRunMatching}\n                />'
)

with open(file_path_v, 'w') as f:
    f.write(content_v)

print("Updated files successfully.")
