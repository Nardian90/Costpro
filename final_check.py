import sys

content = open('src/lib/export/pdf-generator.ts').read()
if 'indigo' in content:
    print("Found indigo variable")
else:
    print("Indigo variable not found")

if '[75, 0, 130]' in content:
    print("Found indigo color replacement")
