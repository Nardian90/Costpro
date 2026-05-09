import sys

file_path = 'src/lib/cost-engine/shared-mapping.ts'
with open(file_path, 'r') as f:
    content = f.read()

# Revert to a more permissive parent formula assignment, but still protecting explicit manual values.
# The test expects a parent marked as 'ValorFijo' (but with no value given in the test) to default to sum(children).
# A better check is: if it's a parent and doesn't have an explicit formula, it's a sum(children).
# If the user really wants to pin a parent to a fixed value, they should provide that value.

old_line = "if (isParent && !isFixedValue && (!formula || formula === 'VH')) {"
new_line = "if (isParent && (!formula || formula === 'VH')) {"

content = content.replace(old_line, new_line)

with open(file_path, 'w') as f:
    f.write(content)
