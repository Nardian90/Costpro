import * as ts from 'typescript';
import * as fs from 'fs';

function getImports(sourceFile: ts.SourceFile): string[] {
    const imports: string[] = [];
    ts.forEachChild(sourceFile, node => {
        if (ts.isImportDeclaration(node)) {
            if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
                imports.push(node.moduleSpecifier.text);
            }
        } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
            if (ts.isStringLiteral(node.moduleSpecifier)) {
                imports.push(node.moduleSpecifier.text);
            }
        }
    });
    return imports;
}

const targetPaths = process.argv.slice(2);
const results: Record<string, string[]> = {};

targetPaths.forEach(filePath => {
    try {
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const content = fs.readFileSync(filePath, 'utf-8');
            const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
            results[filePath] = getImports(sourceFile);
        }
    } catch (e) {
        // Skip
    }
});

console.log(JSON.stringify(results));
