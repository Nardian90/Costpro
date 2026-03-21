import re

file_path = 'src/lib/dexie.ts'

with open(file_path, 'r') as f:
    content = f.read()

# Incrementar versión si no es 20 o más
version_match = re.search(r'this\.version\((\d+)\)\.stores\(', content)
if version_match:
    current_v = int(version_match.group(1))
    if current_v < 20:
        content = content.replace(f'this.version({current_v}).stores(', f'this.version(20).stores(')

# Agregar imports necesarios si no están
if 'import { MappingRule as MappingRuleType, MappingExecution } from "../core/mapping/mapping.types";' not in content:
    content = 'import { MappingRule as MappingRuleType, MappingExecution } from "../core/mapping/mapping.types";\n' + content

# Agregar tablas a stores
stores_pattern = r'this\.version\(\d+\)\.stores\(\{(.*?)\}\);'
stores_match = re.search(stores_pattern, content, re.DOTALL)
if stores_match:
    stores = stores_match.group(1).strip()
    if 'mapping_rules' not in stores:
        new_stores = stores + ',\n      mapping_rules: "id, reportType, provider, sourceColumn, targetField, active, priority",\n      mapping_executions: "id, reportType, timestamp, successRate"'
        content = content.replace(stores, new_stores)

# Agregar propiedades a la clase
class_pattern = r'export class IPVDatabase extends Dexie \{(.*?)\}'
class_match = re.search(class_pattern, content, re.DOTALL)
if class_match:
    class_body = class_match.group(1)
    if 'mapping_rules!' not in class_body:
        new_properties = '  mapping_rules!: Table<MappingRuleType>;\n  mapping_executions!: Table<MappingExecution>;\n' + class_body
        content = content.replace(class_body, new_properties)

with open(file_path, 'w') as f:
    f.write(content)
