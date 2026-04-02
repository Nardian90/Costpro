import re
import sys

def count_tags(filename):
    with open(filename, 'r') as f:
        content = f.read()
    content = re.sub(r'{\/\*.*?\*\/}', '', content, flags=re.DOTALL)
    content = re.sub(r'\/\/.*', '', content)
    open_divs = len(re.findall(r'<div(?!\s*/>)', content))
    close_divs = len(re.findall(r'</div', content))
    print(f"Open divs: {open_divs}")
    print(f"Close divs: {close_divs}")
    for tag in ['Table', 'TableHeader', 'TableBody', 'TableRow', 'TableCell', 'TableFooter', 'Button', 'Select', 'Switch']:
        opens = len(re.findall(rf'<{tag}(?!\s*/>)', content))
        closes = len(re.findall(rf'</{tag}', content))
        if opens != closes:
            print(f"{tag}: {opens} opens, {closes} closes")

if __name__ == "__main__":
    count_tags(sys.argv[1])
