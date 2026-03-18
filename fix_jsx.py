import re

path = 'src/components/views/terminal/views/ipv/CatalogTable.tsx'
with open(path, 'r') as f:
    content = f.read()

# Fix the specific lines with invalid JSX
# Replace the line 701 with correct closing tag
content = content.replace('</TableHead className="sticky top-0 left-[100px] bg-background z-30">', '</TableHead>')

# Fix the ones with missing quotes or wrong formatting
content = re.sub(r'className="sticky top-0 bg-background z-20 "text-right"', 'className="sticky top-0 bg-background z-20 text-right"', content)
content = re.sub(r'className="sticky top-0 bg-background z-20 "text-center"', 'className="sticky top-0 bg-background z-20 text-center"', content)

with open(path, 'w') as f:
    f.write(content)
