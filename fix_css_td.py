import sys

path = 'src/app/globals.css'
with open(path, 'r') as f:
    content = f.read()

# Fix td width and overflow in cards
search_str = '''  .table-to-cards td {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    padding: 0.75rem 0.5rem !important;
    border: none;
    border-bottom: 1px solid rgba(0, 0, 0, 0.05);
    gap: 1.5rem;
    word-break: break-all;
    min-height: 2.5rem;
    width: 100% !important;
    box-sizing: border-box;
    white-space: normal !important;
  }'''

replace_str = '''  .table-to-cards td {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    padding: 0.75rem 0.5rem !important;
    border: none !important;
    border-bottom: 1px solid rgba(0, 0, 0, 0.05) !important;
    gap: 1.5rem;
    word-break: break-all;
    min-height: 2.5rem;
    width: 100% !important;
    box-sizing: border-box;
    white-space: normal !important;
    max-width: none !important;
  }'''

if search_str in content:
    content = content.replace(search_str, replace_str)
    with open(path, 'w') as f:
        f.write(content)
    print("CSS td fixed")
else:
    print("CSS td search string not found")
