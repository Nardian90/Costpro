content = open('src/components/views/terminal/views/health/SystemHealthView.tsx', 'r').read()

# The logs showed:
# 27 | import {
# 28 | import { HealthAgentLogs } from './HealthAgentLogs';
# 29 |   Accordion,

search_text = """import {
import { HealthAgentLogs } from './HealthAgentLogs';
  Accordion,"""

replace_text = """import { HealthAgentLogs } from './HealthAgentLogs';
import {
  Accordion,"""

if search_text in content:
    new_content = content.replace(search_text, replace_text)
    with open('src/components/views/terminal/views/health/SystemHealthView.tsx', 'w') as f:
        f.write(new_content)
    print("Successfully fixed import in SystemHealthView.tsx")
else:
    print("Search text not found. Checking for slightly different pattern...")
    # Alternative attempt based on cat -n output
    # 27	import {
    # 28	import { HealthAgentLogs } from './HealthAgentLogs';
    # 29	  Accordion,
    import re
    new_content = re.sub(r'import\s+\{\s*\n\s*import\s+\{\s*HealthAgentLogs\s*\}\s*from\s*\'\./HealthAgentLogs\'\s*;\s*\n\s*Accordion',
                         "import { HealthAgentLogs } from './HealthAgentLogs';\nimport {\n  Accordion", content)
    if new_content != content:
        with open('src/components/views/terminal/views/health/SystemHealthView.tsx', 'w') as f:
            f.write(new_content)
        print("Successfully fixed import using regex")
    else:
        print("Could not find broken pattern to fix.")
