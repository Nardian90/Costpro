import sys

path = 'src/app/globals.css'
with open(path, 'r') as f:
    content = f.read()

# Add height: auto !important to .table-to-cards tr as well
search_str = '''  .table-to-cards table,
  .table-to-cards thead,
  .table-to-cards tr,
  .table-to-cards td {
    display: block;
    width: 100% !important;
  }'''

replace_str = '''  .table-to-cards table,
  .table-to-cards thead,
  .table-to-cards tr,
  .table-to-cards td {
    display: block;
    width: 100% !important;
    height: auto !important;
  }'''

if search_str in content:
    content = content.replace(search_str, replace_str)
    with open(path, 'w') as f:
        f.write(content)
    print("CSS v2 fixed")
else:
    print("CSS v2 search string not found")
