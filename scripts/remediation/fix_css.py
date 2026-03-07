import sys

path = 'src/app/globals.css'
with open(path, 'r') as f:
    content = f.read()

# Locate the mobile card tr styles and add height: auto !important
search_str = '''  .table-to-cards tbody tr {
    display: flex;
    flex-direction: column;
    background: var(--background);
    box-shadow: var(--neumorphic-shadow-out-sm);
    border-radius: var(--radius-lg);
    padding: 1rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-sizing: border-box;
  }'''

replace_str = '''  .table-to-cards tbody tr {
    display: flex;
    flex-direction: column;
    background: var(--background);
    box-shadow: var(--neumorphic-shadow-out-sm);
    border-radius: var(--radius-lg);
    padding: 1rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-sizing: border-box;
    height: auto !important;
  }'''

if search_str in content:
    content = content.replace(search_str, replace_str)
    with open(path, 'w') as f:
        f.write(content)
    print("CSS fixed")
else:
    print("CSS search string not found")
