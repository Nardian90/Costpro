import sys

file_path = 'src/components/views/terminal/views/cost_sheet/CostSheetView.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# Patch handleImportJSON
old_import = "const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {"
new_import = """const handleImportJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (user) {
        const { allowed } = await usageService.checkQuota(user.id, 'fc_import', user.plan);
        if (!allowed) {
            setIsUpgradeModalOpen(true);
            return;
        }
    }
"""
content = content.replace(old_import, new_import)

# trackUsage for import
# Look for reader.onload
content = content.replace('setData(importedData);', 'if (user) await usageService.trackUsage(user.id, "fc_import", user.plan);\n            setData(importedData);')

with open(file_path, 'w') as f:
    f.write(content)
