import os
import re

def write_file(path, content):
    with open(path, 'w') as f:
        f.write(content)

def fix_shared_mapping():
    path = 'src/lib/cost-engine/shared-mapping.ts'
    if not os.path.exists(path): return
    with open(path, 'r') as f:
        content = f.read()

    # 1. Parents should always be FORMULA if they have children and no fixed value override
    # Actually, even if fixed value is set, if it's a parent we want sum(children) unless a formula is present.
    # The key is to make formaCalculo = 'FORMULA' so the engine runs it.

    pattern = r"if \(formula && !isFixedValue\) formaCalculo = 'FORMULA';"
    replacement = "if (formula) formaCalculo = 'FORMULA';"
    content = content.replace(pattern, replacement)

    write_file(path, content)

def fix_engine():
    path = 'src/lib/ipv/engine.ts'
    if not os.path.exists(path): return
    with open(path, 'r') as f:
        content = f.read()

    # 1. Update attemptDecomposition to accept an optional tag
    content = content.replace(
        "private async attemptDecomposition(cod: string): Promise<boolean> {",
        "private async attemptDecomposition(cod: string, tag: string = ''): Promise<boolean> {"
    )
    content = content.replace(
        "await this.attemptDecomposition(a.cod);",
        "await this.attemptDecomposition(a.cod, tag);"
    )
    content = content.replace(
        "tipo: 'DECOMPOSITION', created_at: new Date().toISOString() });",
        "tipo: 'DECOMPOSITION', created_at: new Date().toISOString(), referencia_transaccion: tag });"
    )

    # 2. Update calls to attemptDecomposition in matchTransaction
    content = content.replace("await this.attemptDecomposition(match.cod);", "await this.attemptDecomposition(match.cod, 'TEMP');")
    content = content.replace("await this.attemptDecomposition(p.cod);", "await this.attemptDecomposition(p.cod, 'TEMP');")
    # The final loop one should NOT use TEMP
    content = content.replace("await this.attemptDecomposition(item.product.cod);", "await this.attemptDecomposition(item.product.cod);")

    # 3. Update rollback to also clear temp decompositions
    content = content.replace(
        "this.pendingMovements = this.pendingMovements.filter(m => m.referencia_transaccion !== 'TEMP');",
        "this.pendingMovements = this.pendingMovements.filter(m => m.referencia_transaccion !== 'TEMP');"
    )
    # (Wait, it already filters by referencia_transaccion !== 'TEMP', and I added tag to decompositions too)

    write_file(path, content)

def fix_bandec_parser():
    path = 'src/lib/ipv/bandecParser.ts'
    if not os.path.exists(path): return
    with open(path, 'r') as f:
        content = f.read()

    # Ensure it uses the right generateHash
    # Actually, I'll just export generateHash from engine.ts if it's causing issues,
    # but the root utils one should be fine.
    # The problem is the test mock.

    write_file(path, content)

if __name__ == "__main__":
    fix_shared_mapping()
    fix_engine()
