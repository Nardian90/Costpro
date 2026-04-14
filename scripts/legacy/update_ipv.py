import sys

with open("src/components/views/terminal/views/ipv/IPVView.tsx", "r") as f:
    content = f.read()

# Add lazy import if not exists
if "const MatchingHistoryView = lazy" not in content:
    import_marker = "const MatchingRulesEditor = lazy"
    idx = content.find(import_marker)
    if idx != -1:
        end_of_line = content.find("\n", idx) + 1
        content = content[:end_of_line] + "const MatchingHistoryView = lazy(() => import(\"./MatchingHistoryView\"));\n" + content[end_of_line:]

# Add to content area if not exists
if "{activeTab === 'matching-history'" not in content and '{activeTab === "matching-history"' not in content:
    marker = "{activeTab === 'rules' && ("
    if marker not in content:
        marker = '{activeTab === "rules" && ('

    idx = content.find(marker)
    if idx != -1:
        # Find end of block
        depth = 0
        current = idx
        while current < len(content):
            if content[current] == '{': depth += 1
            elif content[current] == '}': depth -= 1

            if depth == 0 and content[current] == '}':
                # Check if it is really the end of the conditional block
                next_char_idx = current + 1
                while next_char_idx < len(content) and content[next_char_idx].isspace():
                    next_char_idx += 1

                content = content[:next_char_idx] + """
          {activeTab === 'matching-history' && (
            <div className="m-0 animate-in fade-in duration-500">
                <Suspense fallback={<div className="h-[400px] flex items-center justify-center">Cargando historial...</div>}>
                    <MatchingHistoryView />
                </Suspense>
            </div>
          )}""" + content[next_char_idx:]
                break
            current += 1

with open("src/components/views/terminal/views/ipv/IPVView.tsx", "w") as f:
    f.write(content)
