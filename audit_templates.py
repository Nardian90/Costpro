import os
import re

data_dir = 'src/lib/data/'
templates = [f for f in os.listdir(data_dir) if f.endswith('.ts')]

for template in templates:
    path = os.path.join(data_dir, template)
    with open(path, 'r') as f:
        content = f.read()

    # Audit 1: Search for double dots in classification
    bad_dots = re.findall(r'"classification":\s*"[^"]*\.\.[^"]*"', content)
    if bad_dots:
        print(f"Found double dots in {template}: {bad_dots}")

    # Audit 2: Search for quantity vs cantidad in formulas (consistency)
    # The engine now supports both, but better to be consistent.
    # We already fixed 'Lavar' and 'Reinicio'.

    # Audit 3: Search for totalFormula vs formula consistency if needed.

    # Audit 4: Check if baseRef is used and mapper now supports it.

print("Audit complete.")
