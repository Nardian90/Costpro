import sys

def apply_diff(file_path, diff):
    with open(file_path, 'r') as f:
        content = f.read()

    blocks = diff.split('<<<<<<< SEARCH\n')
    for block in blocks[1:]:
        search_part, replace_part = block.split('=======\n')
        replace_part = replace_part.split('>>>>>>> REPLACE')[0]
        if search_part in content:
            content = content.replace(search_part, replace_part)
        else:
            print(f'Warning: Search part not found')

    with open(file_path, 'w') as f:
        f.write(content)

file_path = 'src/components/views/terminal/views/cost_sheet/CostSheetView.tsx'
diff = """<<<<<<< SEARCH
    if (calculationResult) {
        if (options.consolidated) {
            const success = await downloadPDF(options, `ficha-consolidada-${data?.header?.code || 'export'}.pdf`);
            if (success) {
                toast.success("PDF consolidado generado con éxito", { id: toastId });
                return;
            }
        } else {
            // Separate export
            let count = 0;
            if (options.includeFC) {
                await downloadPDF({ ...options, includeAudit: false, includeAnnexes: [] }, `ficha-${data?.header?.code || 'export'}.pdf`);
                count++;
            }

            for (const annexId of options.includeAnnexes) {
                await downloadPDF({ ...options, includeFC: false, includeAudit: false, includeAnnexes: [annexId] }, `anexo-${annexId}-${data?.header?.code || 'export'}.pdf`);
                count++;
            }

            if (options.includeAudit) {
                await downloadPDF({ ...options, includeFC: false, includeAnnexes: [] }, `auditoria-${data?.header?.code || 'export'}.pdf`);
                count++;
            }
=======
    if (calculationResult) {
        const h = calculationResult.metadata?.header || data?.header || {};
        const evalCode = h.code || 'export';
        const evalName = h.name || 'ficha';
        const safeBaseName = `${evalCode}-${evalName}`.replace(/[/\\?%*:|"<>]/g, '-');

        if (options.consolidated) {
            const success = await downloadPDF(options, `ficha-consolidada-${safeBaseName}.pdf`);
            if (success) {
                toast.success("PDF consolidado generado con éxito", { id: toastId });
                return;
            }
        } else {
            // Separate export
            let count = 0;
            if (options.includeFC) {
                await downloadPDF({ ...options, includeAudit: false, includeAnnexes: [] }, `ficha-${safeBaseName}.pdf`);
                count++;
            }

            for (const annexId of options.includeAnnexes) {
                await downloadPDF({ ...options, includeFC: false, includeAudit: false, includeAnnexes: [annexId] }, `anexo-${annexId}-${safeBaseName}.pdf`);
                count++;
            }

            if (options.includeAudit) {
                await downloadPDF({ ...options, includeFC: false, includeAnnexes: [] }, `auditoria-${safeBaseName}.pdf`);
                count++;
            }
>>>>>>> REPLACE"""
apply_diff(file_path, diff)
