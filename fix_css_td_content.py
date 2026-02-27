import sys

path = 'src/app/globals.css'
with open(path, 'r') as f:
    content = f.read()

# Fix content within td to justify correctly
search_str = '''  .table-to-cards td > div,
  .table-to-cards td > span,
  .table-to-cards td > p,
  .table-to-cards td > input,
  .table-to-cards td > select,
  .table-to-cards td > button {
    flex: 1;
    text-align: left;
    font-size: 0.875rem;
    word-break: break-word;
  }'''

replace_str = '''  .table-to-cards td > div,
  .table-to-cards td > span,
  .table-to-cards td > p,
  .table-to-cards td > input,
  .table-to-cards td > select,
  .table-to-cards td > button {
    flex: 1;
    text-align: right !important;
    font-size: 0.875rem;
    word-break: break-word;
    width: auto !important;
  }'''

if search_str in content:
    content = content.replace(search_str, replace_str)
    with open(path, 'w') as f:
        f.write(content)
    print("CSS td content fixed")
else:
    print("CSS td content search string not found")
