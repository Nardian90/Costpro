import sys

content = open('src/components/views/terminal/views/cost_sheet/CostSheetSummary.tsx').read()

replacements = [
    ("'text-blue-500'", "'text-[#39FF14]'"),
    ("'text-orange-500'", "'text-green-400'"),
    ("'text-amber-500'", "'text-emerald-400'"),
    ("'text-slate-500'", "'text-lime-400'")
]

for old, new in replacements:
    content = content.replace(old, new)

with open('src/components/views/terminal/views/cost_sheet/CostSheetSummary.tsx', 'w') as f:
    f.write(content)
print("Successfully patched")
