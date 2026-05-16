import re

with open('src/components/views/terminal/views/cost_sheet/CostSheetNarrative.tsx', 'r') as f:
    content = f.read()

# Match <Tooltip ... /> including multiline
# and replace it with a clean version
# We only want to keep the content and cursor we just added.

content = re.sub(
    r'<Tooltip content=\{<ThemedTooltip />\} cursor=\{[^}]+\}\s+[^>]+/>',
    r'<Tooltip content={<ThemedTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.4)", stroke: "hsl(var(--border))" }} />',
    content
)

with open('src/components/views/terminal/views/cost_sheet/CostSheetNarrative.tsx', 'w') as f:
    f.write(content)
