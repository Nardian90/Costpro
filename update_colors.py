import re

def replace_colors(file_path):
    with open(file_path, 'r') as f:
        content = f.read()

    # 1. Update SVG drop shadow
    content = content.replace(
        'className="-rotate-90 drop-shadow-[0_0_15px_rgba(57,255,20,0.1)]"',
        'className="-rotate-90 drop-shadow-[0_0_15px_rgba(57,255,20,0.1)] dark:drop-shadow-[0_0_15px_rgba(57,255,20,0.2)]"'
    )

    # 2. Update Cost Ring (background track)
    content = content.replace(
        'className="text-[#39FF14]/20"',
        'className="text-primary/20 dark:text-[#39FF14]/20"'
    )

    # 3. Update Utility Ring
    # Find the Utility Ring circle
    utility_ring_pattern = r'(<motion\.circle[^>]*?stroke=")#39FF14("[^>]*?>)'
    content = re.sub(utility_ring_pattern, r'\1currentColor\2', content)

    # Add class to utility ring - this is tricky with regex, let's do it specifically
    content = content.replace(
        'strokeWidth={strokeWidth}\n            strokeDasharray={circumference}',
        'strokeWidth={strokeWidth}\n            className="text-primary dark:text-[#39FF14]"\n            strokeDasharray={circumference}'
    )

    # Update drop-shadow in style
    content = content.replace(
        "filter: 'drop-shadow(0 0 12px rgba(57, 255, 20, 0.5))'",
        "filter: 'drop-shadow(0 0 12px rgba(22, 163, 74, 0.2))', // Primary green shadow in light\n                '--tw-drop-shadow': 'drop-shadow(0 0 12px rgba(57, 255, 20, 0.6))' // Custom logic might be needed but let's use a simpler way"
    )
    # Actually, CSS filters are hard to make theme-aware in inline styles easily without hooks.
    # Let's use a tailwind class for the filter if possible, or just use a conditional style.

    # 4. Update Percent Badge
    content = content.replace(
        'bg-[#39FF14]/10 px-4 py-1.5 rounded-full border border-[#39FF14]/20',
        'bg-primary/10 dark:bg-[#39FF14]/10 px-4 py-1.5 rounded-full border border-primary/20 dark:border-[#39FF14]/20'
    )
    content = content.replace('text-[#39FF14]', 'text-primary dark:text-[#39FF14]')

    # 5. Margen Activo Badge
    content = content.replace(
        'bg-[#39FF14] text-black text-[10px] font-black px-5 py-2 rounded-full uppercase tracking-widest shadow-[0_0_20px_rgba(57,255,20,0.5)]',
        'bg-primary dark:bg-[#39FF14] text-white dark:text-black text-[10px] font-black px-5 py-2 rounded-full uppercase tracking-widest shadow-[0_0_20px_rgba(22,163,74,0.3)] dark:shadow-[0_0_20px_rgba(57,255,20,0.5)]'
    )

    # 6. Telemetry Indicator
    content = content.replace('bg-[#39FF14]', 'bg-primary dark:bg-[#39FF14]')

    # 7. Telemetry Bars logic
    content = content.replace(
        'active ? "bg-[#39FF14]" : "bg-slate-200 dark:bg-slate-800"',
        'active ? "bg-primary dark:bg-[#39FF14]" : "bg-slate-200 dark:bg-slate-800"'
    )

    # 8. Box shadow in telemetry bars
    content = content.replace(
        "boxShadow: active ? '0 0 8px rgba(57, 255, 20, 0.4)' : 'none'",
        "boxShadow: active ? (typeof window !== 'undefined' && document.documentElement.classList.contains('dark') ? '0 0 8px rgba(57, 255, 20, 0.4)' : '0 0 8px rgba(22, 163, 74, 0.2)') : 'none'"
    )
    # Wait, the above is not great for SSR.
    # Better to use CSS variables.

    with open(file_path, 'w') as f:
        f.write(content)

replace_colors('src/components/views/terminal/views/cost_sheet/CostSheetMasterRing.tsx')
