import sys

file_path = 'src/components/views/terminal/views/cost_sheet/CostSheetNav.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# Update the Menu icon color
content = content.replace(
    'className: "neu-raised-sm w-11 h-11 flex items-center justify-center shrink-0 active:scale-90 transition-transform text-primary hover:bg-primary/10"',
    'className: "neu-raised-sm w-11 h-11 flex items-center justify-center shrink-0 active:scale-90 transition-transform text-[#00FF00] hover:bg-primary/10"'
)

# Update ActionMenu className to expand fully to the right
content = content.replace(
    'className="!z-10 shadow-none bg-transparent -mx-4 px-4 py-0"',
    'className="!z-10 shadow-none bg-transparent -mx-4 pl-4 pr-0 py-0"'
)

with open(file_path, 'w') as f:
    f.write(content)
