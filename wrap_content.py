import sys

filepath = 'src/components/views/terminal/views/cost_sheet/CostSheetView.tsx'
with open(filepath, 'r') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if '<CostSheetNav' in line:
        # Wrap the Nav items area if needed, or just let it be.
        # Actually the user said "Centrar la tabla dentro del layout".
        new_lines.append(line)
    elif '<div className="mt-4">' in line:
        new_lines.append(line.replace('<div className="mt-4">', '<div className="mt-4 w-full flex justify-center"><div className="w-full max-w-6xl">'))
    elif '</div>' in line and len(new_lines) > 0 and '</div>' == line.strip() and lines[lines.index(line)+1:lines.index(line)+2] == ['            </>\n']:
        # This is the end of the viewMode === 'expert' block
        new_lines.append('                    </div></div>\n')
        new_lines.append(line)
    else:
        new_lines.append(line)

# The logic above is a bit brittle. Let's try a better replacement.
content = "".join(lines)
old_block = """                <div className="mt-4">
                    {activeSection === 'kpis' && ("""
new_block = """                <div className="mt-4 w-full flex justify-center">
                    <div className="w-full max-w-6xl">
                    {activeSection === 'kpis' && ("""
content = content.replace(old_block, new_block)

# Close the divs before the closing parenthesis of the map/block
old_end = """                    {activeSection === 'massive-gen' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                             <CostSheetMassiveGenerator isSection={true} initialProducts={quickModeProducts || undefined} />
                        </div>
                    )}
                </div>"""
new_end = """                    {activeSection === 'massive-gen' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                             <CostSheetMassiveGenerator isSection={true} initialProducts={quickModeProducts || undefined} />
                        </div>
                    )}
                    </div>
                </div>"""
content = content.replace(old_end, new_end)

# Also handle the preview mode
old_preview = """            <CostSheetPreview
                data={data}
                calculatedValues={calculatedValues}
                calculatedAnnexes={calculatedAnnexes}
                calculatedHeader={calculatedHeader}
            />"""
new_preview = """            <div className="w-full flex justify-center">
                <div className="w-full max-w-6xl">
                    <CostSheetPreview
                        data={data}
                        calculatedValues={calculatedValues}
                        calculatedAnnexes={calculatedAnnexes}
                        calculatedHeader={calculatedHeader}
                    />
                </div>
            </div>"""
content = content.replace(old_preview, new_preview)

with open(filepath, 'w') as f:
    f.write(content)
