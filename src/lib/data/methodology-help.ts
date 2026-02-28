export const methodologyHelp: Record<string, string> = {
  "1": "Resolución 148: Los gastos materiales incluyen materias primas, materiales auxiliares, envases y embalajes, combustibles, energía y agua vinculados directamente al proceso productivo o de servicios.",
  "2": "Resolución 148: El salario directo comprende las remuneraciones por el tiempo trabajado, incluyendo el salario básico, pagos adicionales y estimulación vinculados a la producción directa.",
  "2.2": "Resolución 148: Las vacaciones se calculan como el 9.09% del salario devengado para asegurar la reserva legal de descanso retribuido.",
  "3": "Resolución 148: Otros gastos directos incluyen depreciación de activos fijos, mantenimiento, servicios contratados y otros insumos que no son materiales pero son directos.",
  "4": "Resolución 148: Gastos asociados a la producción incluyen salarios de personal de apoyo y otros gastos indirectos de taller o área de servicios.",
  "5": "Costo de Producción: Suma de todos los gastos directos (Materiales + Salario + Otros Directos + Gastos Asociados).",
  "6": "Resolución 148: Gastos Generales y de Administración comprenden el sostenimiento de la estructura directiva y administrativa de la entidad.",
  "7": "Resolución 148: Gastos de Distribución y Venta incluyen transporte, publicidad y otros costos para colocar el producto en el mercado.",
  "8": "Gastos Financieros: Intereses bancarios y comisiones vinculadas al financiamiento del capital de trabajo.",
  "10": "Gastos Tributarios: Contribución a la seguridad social (14%) e Impuesto sobre la fuerza de trabajo (5%).",
  "12": "Costo Total: Suma del costo de producción más los gastos de administración, venta, financieros y tributos.",
  "13": "Resolución 148: El margen de utilidad para el cálculo de precios y tarifas no debe exceder el 30% sobre el costo total, salvo excepciones aprobadas.",
  "13.2": "Impuesto sobre Ventas y Servicios: Se calcula sobre el precio antes de impuesto para determinar la carga fiscal final.",
  "14": "Precio Final: Valor total que incluye todos los costos, gastos, utilidad e impuestos aplicables.",
  "15": "Costo Unitario: Costo total dividido entre la cantidad de unidades producidas o nivel de servicios.",
  "16": "Precio Unitario: Precio final dividido entre la cantidad proyectada."
};

export const getMethodologyHelp = (id: string, label: string): string => {
  const cleanId = id.split('.')[0];
  return methodologyHelp[id] || methodologyHelp[cleanId] || `Metodología estándar para ${label} según Resolución 148.`;
};
