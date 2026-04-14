import re

with open('src/components/views/terminal/views/ipv/MatchingRulesEditor.tsx', 'r') as f:
    content = f.read()

# Normalize lookup in RULE_DESCRIPTIONS
content = content.replace(
    "const info = RULE_DESCRIPTIONS[rule.tipo] ||",
    "const info = RULE_DESCRIPTIONS[rule.tipo.replace(' ', '_')] ||"
)

# Normalize lookup in Label Map
content = content.replace(
    "[rule.tipo] || rule.tipo }",
    "[rule.tipo.replace(' ', '_')] || rule.tipo }"
)

with open('src/components/views/terminal/views/ipv/MatchingRulesEditor.tsx', 'w') as f:
    f.write(content)
