import re

with open('src/components/views/terminal/views/ipv/MatchingRulesEditor.tsx', 'r') as f:
    content = f.read()

# 1. Definir descripciones con claves normalizadas (usando guion bajo)
new_descriptions = """const RULE_DESCRIPTIONS: Record<string, any> = {
    "STOCK_LIMIT": {
        "trigger": "Se activa globalmente si la regla está habilitada en el motor de matching.",
        "setup": [
            "Control de stock habilitado en configuración",
            "Productos con stock inicial cargado (stock_inicial_manual)",
            "Configuración 'allow_negative' (Permitir stock negativo)"
        ],
        "logic": [
            "El sistema intercepta cada intento de matching.",
            "Verifica el 'Stock Virtual' (Stock inicial - movimientos ya aplicados en esta sesión).",
            "Si el stock es insuficiente, intenta una 'Descomposición' (ej: de un combo a sus partes).",
            "Si persiste la falta de stock y 'allow_negative' es falso, bloquea la asignación del producto."
        ],
        "result": "Evita que el sistema asigne productos que físicamente no deberían estar disponibles, forzando al motor a buscar otras combinaciones o usar comodines.",
        "scenarios": [
            "Venta de 'Cerveza 355ml': Si el stock virtual es 0, la regla HARD_REF o EXACT_SUM ignorará este producto aunque el precio coincida."
        ],
        "interaction": "Afecta a todas las reglas que asignan productos (HARD_REF, EXACT_SUM, WILDCARDS). Si falla, el monto restante pasa a la siguiente regla.",
        "errors": [
            "Error de inventario: Si el stock real no coincide con el sistema, el matching será incorrecto.",
            "Bloqueo total: Si no hay stock de nada, ninguna regla de producto podrá ejecutarse."
        ]
    },
    "HARD_REF": {
        "trigger": "Se activa cuando una transacción bancaria contiene texto que coincide con el código de un producto o referencia específica.",
        "setup": [
            "Código de producto (SKU) definido en catálogo",
            "Observaciones en el mensaje bancario (ej: 'PAGO REF 102')",
            "Integraciones (Comodia) que envíen la referencia en la metadata"
        ],
        "logic": [
            "Escanea el campo de observaciones de la transacción.",
            "Busca coincidencias exactas con el campo 'cod' de los productos activos.",
            "Calcula cuántas unidades del producto caben en el importe total de la transacción.",
            "Crea una línea de conciliación vinculada a ese producto específico."
        ],
        "result": "Matching inmediato con confianza del 100%. El estado de la transacción cambia a 'COMPLETO' si el importe se cubre totalmente.",
        "scenarios": [
            "Transferencia con nota 'Cerveza-Premium': El sistema detecta el código 'Cerveza-Premium' y asigna la cantidad correspondiente al monto transferido."
        ],
        "interaction": "Es una regla de alta prioridad. Si tiene éxito, reduce el 'monto restante' para las reglas posteriores o finaliza el proceso.",
        "errors": [
            "Ambigüedad: Si el código de un producto es un número común (ej: '100'), puede haber falsos positivos.",
            "Referencia incompleta: Si el usuario escribe mal el código en la transferencia."
        ]
    },
    "EXACT_SUM": {
        "trigger": "Se activa para transacciones que no han sido resueltas por referencias directas (HARD_REF).",
        "setup": [
            "Catálogo de productos con precios actualizados",
            "Parámetros de profundidad (depth) y tiempo límite (timeout) configurados en la meta de la regla"
        ],
        "logic": [
            "Inicia un algoritmo combinatorio (Backtracking/Subset Sum).",
            "Busca entre los productos activos combinaciones cuyos precios sumen exactamente el importe de la transacción.",
            "Respeta los límites de stock si la regla STOCK_LIMIT está activa.",
            "Si encuentra una combinación válida, genera las líneas de productos correspondientes."
        ],
        "result": "Desglose automático de ventas complejas (ej: varios productos en una sola transferencia). Las columnas de 'Transferencia' se pueblan con los productos hallados.",
        "scenarios": [
            "Transferencia de $1500: El sistema encuentra que Pollo ($1200) + Refresco ($300) = $1500 exactos. Asigna ambos productos."
        ],
        "interaction": "Consume el monto total. Si no encuentra una suma exacta, no aplica ningún producto y delega en WILDCARDS o CASH_FILL.",
        "errors": [
            "Timeout: En transacciones muy grandes con muchos productos, el sistema puede rendirse para evitar bloqueos.",
            "Múltiples soluciones: El sistema elige la primera combinación óptima encontrada."
        ]
    },
    "PRICE_FLEX": {
        "trigger": "Se activa cuando no hay un match exacto por suma, permitiendo un margen de error en el precio unitario.",
        "setup": [
            "Rango de variación permitido (ej: 10%)",
            "Límite máximo de variación en centavos"
        ],
        "logic": [
            "Evalúa productos cuyo precio sea cercano al monto restante.",
            "Ajusta virtualmente el precio del producto (dentro del rango) para forzar el match.",
            "Si el ajuste logra cuadrar la transacción, se acepta el producto."
        ],
        "result": "Permite cerrar transacciones donde hubo pequeños errores de redondeo o cambios de precio no reportados.",
        "scenarios": [
            "Transferencia de $99.50: El producto cuesta $100. Con 0.5% de flexibilidad, el sistema lo acepta como un match válido."
        ],
        "interaction": "Ayuda a EXACT_SUM a finalizar cuando hay diferencias mínimas de céntimos.",
        "errors": [
            "Distorsión de costos: Si el margen es muy alto, los reportes de rentabilidad pueden verse afectados."
        ]
    },
    "CASH_FILL": {
        "trigger": "Se activa para cerrar diferencias residuales mediante inyección de efectivo.",
        "setup": [
            "Productos marcados como 'Elegibles para Cash Filler' en el catálogo",
            "Configuración de límite diario y umbral por transacción"
        ],
        "logic": [
            "Aplica la estrategia de 'Ajuste Óptimo' (Min Fit).",
            "Busca el producto activo que requiera la menor inyección de efectivo posible (Precio - Saldo transferido).",
            "Genera una línea compuesta (Transferencia + Efectivo) para el producto elegido.",
            "Respeta los límites de efectivo diarios configurados por el usuario."
        ],
        "result": "Garantiza que las transacciones queden 100% conciliadas minimizando el uso de efectivo 'artificial'.",
        "scenarios": [
            "Restante de $900: El sistema elige un producto de $950 (inyectando $50) en lugar de uno de $1500 (inyectando $600)."
        ],
        "interaction": "Se ejecuta después de las sumas exactas para cerrar operaciones que de otro modo quedarían parciales.",
        "errors": [
            "Límite excedido: Si se agota el presupuesto de efectivo diario configurado.",
            "Sin productos: Si no hay productos activos cuyos precio sea superior al remante."
        ]
    },
    "WILDCARDS": {
        "trigger": "Se activa como red de seguridad para asignar transferencias a productos genéricos.",
        "setup": [
            "Productos marcados con el flag 'isWildcardCandidate' (ej: 'Venta Diversa')",
            "Stock disponible en el producto comodín"
        ],
        "logic": [
            "Identifica productos comodín en el catálogo.",
            "Calcula la cantidad necesaria para cubrir o acercarse al monto restante.",
            "Prioriza productos con menor stock para balancear inventario."
        ],
        "result": "Evita que el monto transferido quede sin asignar, usando ítems de 'relleno' definidos por el usuario.",
        "scenarios": [
            "Quedan $50 de transferencia: Se asigna 1 unidad de 'Venta Diversa' ($50) para cerrar la operación."
        ],
        "interaction": "Penúltima instancia antes de la auto-suplencia.",
        "errors": [
            "Sin stock: Si los productos comodín también se agotan."
        ]
    },
    "TOLERANCE": {
        "trigger": "Se activa al final del pipeline si queda un residuo despreciable.",
        "setup": [
            "Monto de tolerancia configurado (ej: 100 centavos)"
        ],
        "logic": [
            "Compara el residuo final contra el límite de tolerancia.",
            "Si es menor o igual, marca la transacción como 'COMPLETO'.",
            "No genera líneas adicionales, simplemente acepta la pequeña diferencia."
        ],
        "result": "Limpia ruidos visuales de céntimos en los reportes finales.",
        "scenarios": [
            "Diferencia de $0.05: El sistema la ignora y la transacción pasa a estado Cuadrado."
        ],
        "interaction": "Es el filtro de precisión final.",
        "errors": [
            "Pérdida agregada: Si la tolerancia es muy alta, el acumulado mensual podría desviarse."
        ]
    },
    "AUTO_SUPPLY": {
        "trigger": "Se activa automáticamente cuando la transferencia supera el costo de los productos identificados.",
        "setup": [
            "Regla habilitada en el panel de control",
            "Productos activos con precio > 0"
        ],
        "logic": [
            "Detecta el excedente de dinero en la transferencia bancaria.",
            "Busca productos disponibles en el catálogo para 'agotar' ese saldo sobrante.",
            "Prioriza productos con stock bajo para limpieza de inventario.",
            "Genera líneas de conciliación automáticas marcadas como sobrepago."
        ],
        "result": "Mantiene el balance de caja al 100% incluso en sobrepagos, asignando mercancía de forma inteligente.",
        "scenarios": [
            "Cliente paga $1200 por algo de $1000: El sistema añade un producto de $200 para equilibrar el ingreso."
        ],
        "interaction": "Se ejecuta al final del ciclo de matching solo si hay excedente.",
        "errors": [
            "Sin inventario: Si no hay productos disponibles para cubrir el sobrepago."
        ]
    }
};"""

# 2. Reemplazar objeto RULE_DESCRIPTIONS (clave: normalizar con .replace(' ', '_'))
# Buscamos la línea: const info = RULE_DESCRIPTIONS[rule.tipo] || ...
# Pero primero el objeto completo
content = re.sub(r'const RULE_DESCRIPTIONS: Record<string, any> = \{.*? \};', new_descriptions, content, flags=re.DOTALL)

# Asegurar que SortableRuleItem usa la clave normalizada
# Buscamos: const info = RULE_DESCRIPTIONS[rule.tipo] || { trigger: "N/A", setup: [], logic: [], result: "N/A", scenarios: [], interaction: "N/A", errors: [] };
search_info = r'const info = RULE_DESCRIPTIONS\[rule\.tipo\] \|\|'
replace_info = r"const info = RULE_DESCRIPTIONS[rule.tipo.replace(' ', '_')] ||"
content = re.sub(search_info, replace_info, content)

# 3. Traducir títulos de las reglas en la h4 (etiquetas dinámicas)
translation_map_code = """{ {
                                        'STOCK_LIMIT': 'Límites de Inventario',
                                        'HARD_REF': 'Referencia Exacta',
                                        'EXACT_SUM': 'Suma Combinatoria',
                                        'CASH_FILL': 'Inyección de Efectivo',
                                        'WILDCARDS': 'Comodines Genéricos',
                                        'PRICE_FLEX': 'Flexibilidad de Precio',
                                        'AUTO_SUPPLY': 'Auto-Suplencia',
                                        'TOLERANCE': 'Tolerancia de Cuadre'
                                    }[rule.tipo.replace(' ', '_')] || rule.tipo }"""

# El patrón busca la h4 que contiene rule.tipo.replace(/_/g, ' ')
pattern_h4 = re.compile(r'\{\s*rule\.tipo\.replace\(/_/g,\s*\' \'\)\s*\}')
content = pattern_h4.sub(translation_map_code, content)

with open('src/components/views/terminal/views/ipv/MatchingRulesEditor.tsx', 'w') as f:
    f.write(content)
