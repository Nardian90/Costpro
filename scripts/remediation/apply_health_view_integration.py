import sys

content = open('src/components/views/terminal/views/health/SystemHealthView.tsx', 'r').read()

# 1. Add import
import_text = "import { HealthAgentLogs } from './HealthAgentLogs';"
if import_text not in content:
    # Insert after last import
    last_import = content.rfind("import")
    newline_after_last_import = content.find("\n", last_import)
    content = content[:newline_after_last_import+1] + import_text + "\n" + content[newline_after_last_import+1:]

# 2. Add component before Footer
insertion_point = content.find('<footer className="flex flex-col md:flex-row gap-6">')
if insertion_point != -1 and "HealthAgentLogs" not in content[insertion_point-200:insertion_point]:
    component_text = """      <section className="bg-card/30 p-8 rounded-[40px] border border-border/50 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-32 -mt-32" />
        <HealthAgentLogs />
      </section>\n\n"""
    content = content[:insertion_point] + component_text + content[insertion_point:]

with open('src/components/views/terminal/views/health/SystemHealthView.tsx', 'w') as f:
    f.write(content)
print("Successfully updated SystemHealthView.tsx")
