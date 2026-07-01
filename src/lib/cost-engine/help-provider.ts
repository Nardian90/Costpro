export interface HelpSection {
  definition: string;
  purpose: string;
  operation: string;
  commonErrors: string[];
  impact: string;
}

export const EXPERT_HELP_CONTENT: Record<string, HelpSection> = {
  "header": {
    "definition": "Identificación general de la ficha de costo.",
    "purpose": "Establecer el contexto de la producción, incluyendo unidad de medida, moneda y niveles de actividad.",
    "operation": "Complete los datos generales del producto o servicio. Asegúrese de que el 'Nivel de Producción' coincida con la unidad base de cálculo.",
    "commonErrors": ["Error en la tasa de cambio si usa múltiples monedas.", "Niveles de producción en cero."],
    "impact": "Define la base para todos los cálculos unitarios posteriores."
  },
  "s1": {
    "definition": "Sección I: Gastos Materiales.",
    "purpose": "Consolidar todos los costos de materias primas, combustibles y energía.",
    "operation": "Se vincula automáticamente con el Anexo I. Revise que las cantidades y precios unitarios en el anexo sean correctos.",
    "commonErrors": ["Duplicidad de insumos.", "Omisión de gastos de transporte si están incluidos en el precio del material."],
    "impact": "Suele representar entre el 40% y 70% del costo total."
  },
  "s2": {
    "definition": "Sección II: Salario Directo.",
    "purpose": "Registrar el costo de la fuerza de trabajo directamente involucrada en la producción.",
    "operation": "Vínculo con Anexo II. Incluye salarios base y pagos adicionales por condiciones de trabajo.",
    "commonErrors": ["No incluir la reserva de vacaciones (9.09%)", "Error en el cálculo de tarifas horarias."],
    "impact": "Base para el cálculo de contribuciones a la seguridad social."
  },
  "s3": {
    "definition": "Sección III: Otros Gastos Directos.",
    "purpose": "Gastos que no son materiales ni salarios pero se atribuyen directamente al producto.",
    "operation": "Incluye depreciación de equipos específicos, servicios contratados y mantenimiento directo.",
    "commonErrors": ["Confusión con gastos indirectos.", "Tasas de depreciación incorrectas."],
    "impact": "Ajusta la precisión del costo directo total."
  },
  "s4": {
    "definition": "Sección IV: Costo Directo Total.",
    "purpose": "Suma acumulada de materiales, salarios y otros gastos directos.",
    "operation": "Cálculo automático: Secc I + Secc II + Secc III.",
    "commonErrors": ["Fórmulas manuales que sobrescriben el cálculo automático."],
    "impact": "Es el indicador clave para el control de eficiencia en planta."
  },
  "s5": {
    "definition": "Sección V: Gastos Indirectos de Fabricación.",
    "purpose": "Costos de soporte a la producción que no se vinculan a un único producto.",
    "operation": "Se aplican mediante coeficientes de prorrateo definidos en la configuración de indirectos.",
    "commonErrors": ["Base de prorrateo inadecuada.", "Sobreestimación de gastos de administración."],
    "impact": "Determina el Costo de Producción total."
  },
  "annexes-root": {
    "definition": "Contenedor de Anexos Técnicos.",
    "purpose": "Organizar el soporte documental y de cálculo que sustenta los valores de la ficha.",
    "operation": "Expanda para acceder a los detalles de materiales, fuerza de trabajo y otros gastos.",
    "commonErrors": ["No actualizar los anexos después de cambios en el inventario."],
    "impact": "Garantiza la trazabilidad y auditabilidad de cada peso registrado."
  },
  "I": {
    "definition": "Anexo I: Desglose de Materias Primas e Insumos.",
    "purpose": "Detallar cada componente físico del producto final.",
    "operation": "Liste productos del inventario, especifique UM, cantidad y precio. El sistema calculará el importe total.",
    "commonErrors": ["Unidades de medida inconsistentes.", "Precios desactualizados respecto al almacén."],
    "impact": "Alimenta directamente la Sección I de la ficha."
  },
  "II": {
    "definition": "Anexo II: Desglose de Fuerza de Trabajo.",
    "purpose": "Detallar el tiempo y costo de cada operario o puesto.",
    "operation": "Defina cargos, cantidad de trabajadores, tiempo y tarifa. El sistema integra el salario devengado.",
    "commonErrors": ["Cálculo incorrecto del fondo de tiempo.", "Omisión de estimulaciones."],
    "impact": "Alimenta la Sección II y determina las contribuciones sociales."
  },
  "III": {
    "definition": "Anexo III: Otros Gastos Directos Detallados.",
    "purpose": "Desglosar servicios y otros costos específicos.",
    "operation": "Útil para servicios de terceros o gastos de mantenimiento preventivo directo.",
    "commonErrors": ["No separar gastos fijos de variables."],
    "impact": "Aumenta la transparencia en la estructura de costos."
  }
};

export const getHelpContent = (id: string): HelpSection | null => {
  return EXPERT_HELP_CONTENT[id] || null;
};
