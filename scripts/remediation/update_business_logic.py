import json
import os

ARCHITECTURE_PATH = "public/system_architecture.json"
GRAPH_PATH = "public/architecture_graph.json"

MANUAL_MAPPING = {
    "CostSheetWizard": "Facilita la creación estandarizada de fichas de costo. Automatiza la aplicación de la Resolución 12/2007 para asegurar que todos los cálculos de precios cumplan con la normativa legal vigente.",
    "FormulaEditor": "Permite la personalización de algoritmos de formación de precios. Es la herramienta para directivos para ajustar márgenes de contribución y coeficientes de gastos indirectos sin intervención técnica.",
    "BankIngestion": "Punto de entrada para la digitalización de la economía. Transforma estados de cuenta bancarios en registros contables, eliminando errores manuales en la conciliación de pagos QR y transferencias.",
    "IncomeReceiptSection": "Garantiza la transparencia fiscal. Genera el Modelo SC-3-01, documento legal indispensable para la declaración de ingresos ante las autoridades pertinentes.",
    "InventoryAdjustmentModal": "Controla las desviaciones de inventario. Cada ajuste requiere una justificación que se audita automáticamente para prevenir mermas no autorizadas o fraudes.",
    "CatalogTable": "El cerebro de los productos. Centraliza el costo unitario y el precio de venta sugerido, asegurando que todos los puntos de venta operen con márgenes unificados.",
    "SystemHealthView": "El panel de control ejecutivo. Traduce métricas técnicas complejas en un Índice de Salud (SHI) que permite a los dueños de negocio entender la estabilidad y seguridad de su inversión tecnológica.",
    "AuditSummary": "El 'ojo que todo lo ve'. Registra cada cambio sensible en el sistema, permitiendo reconstruir eventos en caso de discrepancias operativas o auditorías de seguridad.",
    "CashRegister": "Gestiona el flujo de efectivo en el punto de venta. Permite realizar aperturas, arqueos y cierres de caja, asegurando la integridad financiera de las operaciones diarias.",
    "RoleManager": "Controla el acceso granular al sistema. Define qué acciones puede realizar cada perfil (Admin, Encargado, Cajero, Almacén) según las políticas de seguridad de la empresa.",
    "UserManager": "Administración centralizada de identidades. Permite la creación y gestión de credenciales para el personal, manteniendo la trazabilidad de acciones por usuario.",
    "POSView": "Interfaz de venta rápida diseñada para la eficiencia operativa. Soporta múltiples métodos de pago y descuentos, descontando automáticamente el inventario en tiempo real.",
    "InventoryView": "Panel de control de existencias. Proporciona visibilidad total sobre el stock actual, costos acumulados y alertas de reposición para evitar quiebres de inventario.",
    "PurchaseOrder": "Módulo de reaprovisionamiento. Formaliza la recepción de mercancía de proveedores, actualizando costos y existencias de manera automatizada.",
}

def get_logic_for_component(item):
    name = item.get("name", "")
    path = item.get("path", "")

    # 1. Check explicit mapping
    if name in MANUAL_MAPPING:
        return MANUAL_MAPPING[name], True, 10.0

    # 2. Check path-based inference
    description = ""
    is_documented = False
    quality = 0.0

    if "features/ipv" in path:
        description = "[No definido en el manual] Componente del módulo IPV (Ingresos, Pagos y Ventas). Se encarga de la gestión de transacciones bancarias y conciliación contable."
        quality = 6.0
    elif "features/inventory" in path:
        description = "[No definido en el manual] Componente del módulo de Inventario. Soporta el control de existencias y trazabilidad de productos."
        quality = 6.0
    elif "features/pos" in path:
        description = "[No definido en el manual] Componente del Punto de Venta. Facilita la operación comercial y facturación al cliente final."
        quality = 6.0
    elif "features/cost-sheets" in path:
        description = "[No definido en el manual] Componente del motor de fichas de costo. Participa en el cálculo de formación de precios y márgenes comerciales."
        quality = 6.0
    elif "features/auth" in path or "roles" in path:
        description = "[No definido en el manual] Componente de Seguridad y Gobernanza. Gestiona permisos, roles y sesiones de usuario."
        quality = 5.0
    elif "components/ui" in path:
        description = "[No definido en el manual] Componente de interfaz de usuario de bajo nivel. Proporciona elementos visuales estandarizados (Shadcn UI)."
        quality = 4.0
    else:
        description = f"[No definido en el manual] Componente técnico {name} encargado de soportar la funcionalidad operativa del módulo {os.path.dirname(path).split('/')[-1]}."
        quality = 3.0

    return description, False, quality

def update_json(file_path, list_key=None):
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        return

    with open(file_path, "r") as f:
        data = json.load(f)

    items = data[list_key] if list_key else data

    for item in items:
        logic, is_doc, quality = get_logic_for_component(item)
        item["business_logic"] = logic
        item["is_documented"] = is_doc
        item["documentation_quality"] = quality

    with open(file_path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Updated {file_path}")

if __name__ == "__main__":
    update_json(ARCHITECTURE_PATH, "architecture")
    update_json(GRAPH_PATH, "nodes")
