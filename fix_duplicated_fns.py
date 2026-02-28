import re

with open('src/components/views/terminal/views/cost_sheet/CostSheetInteractiveTable.tsx', 'r') as f:
    content = f.read()

pattern = r"(const applySuggestedFormula = \(\) => \{)(\s+const findInSections = \(sections: any\[\]\): any => \{.*?return null;\s+};)(\s+const findInSections = \(sections: any\[\]\): any => \{.*?return null;\s+};)"
content = re.sub(pattern, r"\1\2", content, flags=re.DOTALL)

with open('src/components/views/terminal/views/cost_sheet/CostSheetInteractiveTable.tsx', 'w') as f:
    f.write(content)
