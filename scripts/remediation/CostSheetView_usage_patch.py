import sys

file_path = 'src/components/views/terminal/views/cost_sheet/CostSheetView.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# Add imports
if 'import { usageService }' not in content:
    content = content.replace('import { toast } from \'sonner\';',
                              'import { toast } from \'sonner\';\nimport { usageService } from \'' + '@' + '/services/usage-service\';\nimport { UpgradeModal } from \'' + '@' + '/components/modals/UpgradeModal\';')

# Add state
if 'const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);' not in content:
    content = content.replace('const [isExportModalOpen, setIsExportModalOpen] = useState(false);',
                              'const [isExportModalOpen, setIsExportModalOpen] = useState(false);\n  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);')

# Inject usage check in handleExportPDF
# We look for the start of handleExportPDF
old_handle_export = "const handleExportPDF = React.useCallback(async (options: ExportOptions) => {"
new_handle_export = """const handleExportPDF = React.useCallback(async (options: ExportOptions) => {
    // Usage Quota Check
    if (user) {
        const { allowed } = await usageService.checkQuota(user.id, 'fc_export', user.plan);
        if (!allowed) {
            setIsUpgradeModalOpen(true);
            return;
        }
    }
"""
content = content.replace(old_handle_export, new_handle_export)

# Inject trackUsage in downloadPDF or after successful download
# Better after toast.success in handleExportPDF
content = content.replace('toast.success("PDF consolidado generado con éxito", { id: toastId });',
                          'toast.success("PDF consolidado generado con éxito", { id: toastId });\n                if (user) await usageService.trackUsage(user.id, "fc_export", user.plan);')

content = content.replace('toast.success(` PDFs generados con éxito`, { id: toastId });',
                          'toast.success(` PDFs generados con éxito`, { id: toastId });\n            if (user) await usageService.trackUsage(user.id, "fc_export", user.plan);')

# Add UpgradeModal at the end of the return
content = content.replace('      />\n    </>',
                          '      />\n      <UpgradeModal \n        isOpen={isUpgradeModalOpen} \n        onClose={() => setIsUpgradeModalOpen(false)} \n        action="exportar" \n      />\n    </>')

with open(file_path, 'w') as f:
    f.write(content)
