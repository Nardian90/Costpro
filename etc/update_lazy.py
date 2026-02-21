import sys

def add_lazy_to_file(filepath, search_str, replace_str):
    with open(filepath, 'r') as f:
        content = f.read()

    if 'import { LazyRender }' not in content:
        content = "import { LazyRender } from '@/components/ui/LazyRender';\n" + content

    content = content.replace(search_str, replace_str)

    with open(filepath, 'w') as f:
        f.write(content)

# For CostSheetCardView
search_card = """          return (
            <div key={section.id} className="animate-in fade-in slide-in-from-bottom-2 duration-500 px-4">"""
replace_card = """          return (
            <LazyRender key={section.id}>
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 px-4 mb-8">"""
# and close it
search_card_end = """              </div>
            </div>
          );
        })}"""
replace_card_end = """              </div>
            </div>
            </LazyRender>
          );
        })}"""

add_lazy_to_file('src/components/views/terminal/views/cost_sheet/CostSheetCardView.tsx', search_card, replace_card)
add_lazy_to_file('src/components/views/terminal/views/cost_sheet/CostSheetCardView.tsx', search_card_end, replace_card_end)

# For CostSheetInteractiveTable
search_table = """                return (
                <div key={section.id} id={section.id} className="animate-in fade-in slide-in-from-bottom-2 duration-500 mb-0 last:mb-0 scroll-mt-24">"""
replace_table = """                return (
                <LazyRender key={section.id}>
                <div id={section.id} className="animate-in fade-in slide-in-from-bottom-2 duration-500 mb-8 last:mb-0 scroll-mt-24">"""
# and close it
search_table_end = """                </div>
                );
            });"""
replace_table_end = """                </div>
                </LazyRender>
                );
            });"""

add_lazy_to_file('src/components/views/terminal/views/cost_sheet/CostSheetInteractiveTable.tsx', search_table, replace_table)
add_lazy_to_file('src/components/views/terminal/views/cost_sheet/CostSheetInteractiveTable.tsx', search_table_end, replace_table_end)
