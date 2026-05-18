import re

path = 'src/lib/export/pdf-generator.ts'
with open(path, 'r') as f:
    content = f.read()

# Fix alternateRowStyles typing
content = content.replace(
    "const alternateRowStyles: any = pdfFormat === 'pro' ? { fillColor: [245, 251, 246] } : undefined;",
    "const alternateRowStyles = pdfFormat === 'pro' ? { fillColor: [245, 251, 246] as [number, number, number] } : undefined;"
)

# Fix watermark logic to be safer
watermark_old = """      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(40); doc.setTextColor(200, 200, 200); doc.saveGraphicsState(); doc.setGState(new (doc as any).GState({opacity: 0.1}));
        doc.text('CONFIDENCIAL', pageWidth / 2, doc.internal.pageSize.height / 2, { align: 'center', angle: 45 });
        doc.restoreGraphicsState();
      }"""

watermark_new = """      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(40);
        doc.setTextColor(240, 240, 240);
        doc.text('CONFIDENCIAL', pageWidth / 2, doc.internal.pageSize.height / 2, { align: 'center', angle: 45 });
      }"""

content = content.replace(watermark_old, watermark_new)

with open(path, 'w') as f:
    f.write(content)
