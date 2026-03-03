import sys

file_path = 'src/components/views/terminal/views/cost_sheet/CostSheetView.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# Patch handleQuickGenerate
old_quick = "const handleQuickGenerate = React.useCallback((rows: any[]) => {"
new_quick = """const handleQuickGenerate = React.useCallback(async (rows: any[]) => {
    if (user) {
        const { allowed } = await usageService.checkQuota(user.id, 'fc_create', user.plan);
        if (!allowed) {
            setIsUpgradeModalOpen(true);
            return;
        }
    }
"""
content = content.replace(old_quick, new_quick)

# trackUsage for quick generate
content = content.replace('setQuickModeProducts(rows.map(r => ({', 'if (user) await usageService.trackUsage(user.id, "fc_create", user.plan);\n        setQuickModeProducts(rows.map(r => ({')

with open(file_path, 'w') as f:
    f.write(content)
