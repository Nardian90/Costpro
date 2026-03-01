export const METHODOLOGY_HELP: Record<string, string> = {
  "1": "Gastos Materiales: Incluye materias primas, materiales auxiliares, envases, piezas de repuesto, útiles y herramientas, combustible y energía.",
  "2": "Gastos de la Fuerza de Trabajo: Comprende los salarios y otras remuneraciones, así como las contribuciones a la seguridad social.",
  "3": "Otros Gastos Directos: Servicios recibidos de terceros, depreciación de activos fijos directamente vinculados a la producción.",
  "4": "Total de Gastos Directos: Sumatoria de los grupos 1, 2 y 3.",
  "5": "Gastos Indirectos: Gastos de administración, mantenimiento y otros que no se identifican directamente con el producto.",
  "6": "Costo Total de Producción o Servicio: Suma de Gastos Directos e Indirectos (Fila 4 + Fila 5).",
  "7": "Gastos de Distribución y Ventas: Gastos incurridos en el proceso de comercialización y entrega.",
  "8": "Otros Gastos: Gastos financieros y otros no previstos en los grupos anteriores.",
  "9": "Costo Total: Suma del Costo de Producción, Gastos de Distribución y Otros Gastos (Fila 6 + Fila 7 + Fila 8).",
  "10": "Aportes: Impuestos y tasas establecidos por ley.",
  "11": "Coeficiente de Gastos Indirectos: Relación entre gastos indirectos y directos (Fila 5 / Fila 4).",
  "12": "Costo de Elaboración: Costo total excluyendo el costo de las materias primas principales.",
  "13": "Utilidad: Margen de beneficio. La Resolución 148 establece límites específicos según el tipo de actividad (generalmente hasta un 30% sobre el costo total).",
  "14": "Precio de Venta: Suma del Costo Total y la Utilidad (Fila 9 + Fila 13).",
  "15": "Impuesto sobre Ventas: Gravamen aplicado al precio de venta final.",
  "16": "Precio Final: Precio de venta al público incluyendo todos los impuestos."
};

export const getRowHelp = (rowId: string) => {
  const section = rowId.split('.')[0];
  return METHODOLOGY_HELP[section] || "Consulte la Resolución 148 para más detalles sobre este ítem.";
};
