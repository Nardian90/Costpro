import re

with open('src/components/views/terminal/views/ipv/MatchingRulesEditor.tsx', 'r') as f:
    content = f.read()

# Buscamos el final de RULE_DESCRIPTIONS y el inicio del return
# Sabemos que RULE_DESCRIPTIONS termina en "    }\n};"
# Y luego sigue el return.

pattern = re.compile(r'\}\n\};(.*?)\n\s+return \(', re.DOTALL)

# Lo que debería haber en medio es la interfaz y la definición de la función
missing_code = """
};

interface SortableRuleItemProps {
    rule: MatchingRule;
    toggleRule: (id: string, active: boolean) => Promise<void>;
    usageCount: number;
    updateRuleMeta: (id: string, meta: any) => Promise<void>;
    updatePriority: (id: string, newPriority: number) => Promise<void>;
    totalRules: number;
}

function SortableRuleItem({ rule, toggleRule, usageCount, updateRuleMeta, updatePriority, totalRules }: SortableRuleItemProps) {
    const info = RULE_DESCRIPTIONS[rule.tipo.replace(' ', '_')] || { trigger: "N/A", setup: [], logic: [], result: "N/A", scenarios: [], interaction: "N/A", errors: [] };

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: rule.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };
"""

# Reemplazamos desde }; hasta el return
# Nota: el pattern incluye el }; inicial, así que lo quitamos del search o lo incluimos en el replace
content = re.sub(r'\}\n\};.*?\n\s+return \(', missing_code + "\n    return (", content, flags=re.DOTALL)

with open('src/components/views/terminal/views/ipv/MatchingRulesEditor.tsx', 'w') as f:
    f.write(content)
