import sys

path = 'src/app/globals.css'
with open(path, 'r') as f:
    content = f.read()

# Make the label take fixed width to align values
search_str = '''  .table-to-cards td::before {
    content: attr(data-label);
    font-weight: 700;
    color: var(--muted-foreground);
    flex-shrink: 0;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    width: 100px;
    text-align: left;
    display: inline-block !important;
  }'''

replace_str = '''  .table-to-cards td::before {
    content: attr(data-label);
    font-weight: 700;
    color: var(--muted-foreground);
    flex-shrink: 0;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    width: 120px;
    text-align: left;
    display: inline-block !important;
  }'''

if search_str in content:
    content = content.replace(search_str, replace_str)
    with open(path, 'w') as f:
        f.write(content)
    print("CSS td label fixed")
else:
    print("CSS td label search string not found")
