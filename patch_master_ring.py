import sys

content = open('src/components/views/terminal/views/cost_sheet/CostSheetMasterRing.tsx').read()

search_text = """        <div className="flex flex-col items-end text-right min-w-0">
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.1em] sm:tracking-[0.2em] text-slate-500 mb-2 truncate">Utilidad Bruta</span>
            <div className="flex items-baseline gap-1">
                <span className="text-lg sm:text-2xl font-black text-[#39FF14] tabular-nums truncate">{formatCurrency(utility)}</span>
            </div>
            <p className="text-[8px] sm:text-[10px] text-slate-400 mt-1 uppercase font-black tracking-tighter opacity-70">Margen Neto</p>
        </div>"""

replace_text = """        <div className="flex flex-col items-end text-right min-w-0">
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.1em] sm:tracking-[0.2em] text-slate-500 mb-2 truncate">Utilidad Bruta</span>
            <div className="flex flex-col items-end">
                <div className="flex items-baseline gap-1">
                    <span className="text-lg sm:text-2xl font-black text-[#39FF14] tabular-nums truncate">{formatCurrency(utility)}</span>
                </div>
                <div className="text-[10px] font-black text-[#39FF14]/70 mt-0.5">
                    {markupPercent.toFixed(1)}% sobre costo
                </div>
            </div>
            <p className="text-[8px] sm:text-[10px] text-slate-400 mt-1 uppercase font-black tracking-tighter opacity-70">Margen Neto</p>
        </div>"""

if search_text in content:
    new_content = content.replace(search_text, replace_text)
    with open('src/components/views/terminal/views/cost_sheet/CostSheetMasterRing.tsx', 'w') as f:
        f.write(new_content)
    print("Successfully patched")
else:
    print("Search text not found")
    # Print content around where it should be to debug
    idx = content.find('Utilidad Bruta')
    if idx != -1:
        print("Found 'Utilidad Bruta' at index", idx)
        print("Surrounding content:")
        print(content[idx-200:idx+200])
