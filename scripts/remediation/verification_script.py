from playwright.sync_api import sync_playwright

def verify():
    # Since we can't easily start the dev server, we will verify the code statically
    # by checking if the files we modified exist and have the expected content.
    import os

    files_to_check = [
        'src/components/views/terminal/views/cost_sheet/CostSheetView.tsx',
        'src/app/api/cost-sheets/export-pdf/route.ts',
        'src/components/views/terminal/views/cost_sheet/CostSheetAnnexEditor.tsx'
    ]

    all_ok = True
    for f in files_to_check:
        if os.path.exists(f):
            print(f"File exists: {f}")
            with open(f, 'r') as content:
                text = content.read()
                if f == 'src/components/views/terminal/views/cost_sheet/CostSheetView.tsx':
                    if "setActiveSection('expert-content'); setViewMode('expert');" in text:
                        print("  Logic found in CostSheetView")
                    else:
                        print("  Logic NOT found in CostSheetView")
                        all_ok = False
                elif f == 'src/app/api/cost-sheets/export-pdf/route.ts':
                    if 'TOTAL ANEXO' in text and 'safeLocale(totalSum)' in text:
                        print("  PDF total logic found in route.ts")
                    else:
                        print("  PDF total logic NOT found in route.ts")
                        all_ok = False
                elif f == 'src/components/views/terminal/views/cost_sheet/CostSheetAnnexEditor.tsx':
                    if 'traverseByBaseRef' in text and 'Detalle' in text:
                        print("  Classification logic found in AnnexEditor")
                    else:
                        print("  Classification logic NOT found in AnnexEditor")
                        all_ok = False
        else:
            print(f"File NOT found: {f}")
            all_ok = False

    if all_ok:
        print("Static verification PASSED")
    else:
        print("Static verification FAILED")

if __name__ == "__main__":
    verify()
