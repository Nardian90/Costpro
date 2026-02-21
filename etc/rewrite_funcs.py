import sys

with open('src/hooks/logic/useCostSheetCalculator.ts', 'r') as f:
    content = f.read()

import re

# Find evaluateAnnexExpression
annex_func_pattern = r"const evaluateAnnexExpression = \(.*?\): number => \{.*?^\};"
# Find evaluateHeaderExpression
header_func_pattern = r"const evaluateHeaderExpression = \(.*?\): any => \{.*?^\};"

# I'll just replace the problematic lines in evaluateAnnexExpression
# It currently looks like:
#   try {
#     // Simple replacement for annex row variables
#     if (expr.startsWith('=')) expr = expr.substring(1);

new_annex_body_start = """  try {
    let expr = trimmed;
    // Simple replacement for annex row variables
    if (expr.startsWith('=') && expr.length > 1) expr = expr.substring(1);"""

# Wait, I want expr to be available in catch.
new_annex_body_start_v2 = """  let expr = '';
  try {
    expr = trimmed;
    // Simple replacement for annex row variables
    if (expr.startsWith('=') && expr.length > 1) expr = expr.substring(1);"""

# I'll use a simpler search/replace for evaluateAnnexExpression
content = content.replace("  try {\n    // Simple replacement for annex row variables\n    if (expr.startsWith('=') && expr.length > 1) expr = expr.substring(1);",
                          "  let expr = '';\n  try {\n    expr = trimmed;\n    // Simple replacement for annex row variables\n    if (expr.startsWith('=') && expr.length > 1) expr = expr.substring(1);")

# If it didn't match exactly because of my previous messy edits:
content = re.sub(r"try \{\s+// Simple replacement for annex row variables\s+if \(expr\.startsWith\('='\)\) expr = expr\.substring\(1\);",
                 "let expr = '';\n  try {\n    expr = trimmed;\n    // Simple replacement for annex row variables\n    if (expr.startsWith('=') && expr.length > 1) expr = expr.substring(1);",
                 content)

with open('src/hooks/logic/useCostSheetCalculator.ts', 'w') as f:
    f.write(content)
print("Rewrote evaluateAnnexExpression start")
