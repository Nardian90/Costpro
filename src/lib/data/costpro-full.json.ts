const template = {
  id: "costpro-full-v5",
  name: "Modelo Integral de Ficha de Costo (v5)",
  version: "5.0.0",
  metadata: {
    author: "CostPro",
  },
  header: {
    code: "FC-FC-DEMO-295",
    name: "Consultoría de Marketing",
    date: "2023-01-26",
    unit: "UM: Unidades",
    quantity: 111,
    currency: "CUP",
    category: "ORGANISMO",
    type: "EMPRESA: EMPRESA",
    productionLevel: "Nivel de Producción: 610",
    utilization: "% Utilización capacidad: 100.00%",
    salePrice: "Precio de Venta: 2,565,124.06",
  },
  sections: [
    // Section 1: Gasto Material
    {
      id: "s1",
      label: "Sección 1: Gasto Material",
      rows: [
        {
          id: "1",
          code: "gasto_material_total",
          label: "Gasto Material",
          formula: "=sum(children)",
          helpText: "Total de gastos materiales directos.",
          children: [
            {
              id: "1.1",
              code: "gasto_material_insumos",
              label: "De ello: Insumos (MP)",
              valorHistorico: 0.00,
              baseDeCalculoRef: "I",
              calculationMethod: "ValorFijo",
              totalFormula: "baseValue",
              helpText: "Derivado del Anexo I."
            },
            {
              id: "1.2",
              code: "gasto_material_combustibles",
              label: "Combustibles y lubricantes",
              valorHistorico: 15000.00,
              calculationMethod: "ValorFijo",
              helpText: "Gastos de combustibles asociados."
            },
            {
              id: "1.3",
              code: "gasto_material_energia",
              label: "Energía",
              valorHistorico: 86587.34,
              calculationMethod: "ValorFijo",
              helpText: "Energía eléctrica directa."
            },
            {
              id: "1.4",
              code: "gasto_material_agua",
              label: "Agua",
              valorHistorico: 46057.10,
              calculationMethod: "ValorFijo",
              helpText: "Agua para procesos productivos."
            }
          ]
        },
      ],
    },
    // Section 2: Salario Directo
    {
      id: "s2",
      label: "Sección 2: Salario Directo",
      rows: [
        {
          id: "2",
          code: "salario_directo_total",
          label: "Salario Directo",
          formula: "=sum(children)",
          helpText: "Total de salarios directos.",
          children: [
             {
              id: "2.1",
              code: "salario_directo_obreros",
              label: "De ello: Salarios",
              valorHistorico: 8000.00,
              baseDeCalculoRef: "II",
              calculationMethod: "ValorFijo",
              totalFormula: "baseValue",
              helpText: "Derivado del Anexo II."
            },
            {
              id: "2.2",
              code: "salario_directo_vacaciones",
              label: "Vacaciones",
              formula: "=pct(ref('2.1'), 9.09)",
              value: 0.0909,
              is_percent: true,
              base_ref: "2.1",
              helpText: "9.09% de los salarios directos."
            }
          ]
        },
      ],
    },
    // Section 3: Otros Gastos Directos
    {
      id: "s3",
      label: "Sección 3: Otros Gastos Directos",
      rows: [
        {
          id: "3",
          code: "otros_gastos_directos_total",
          label: "Otros Gastos Directos",
          formula: "=sum(children)",
          helpText: "Otros gastos directamente imputables.",
          children: [
            {
              id: "3.1",
              code: "otros_gastos_depreciacion_total",
              label: "De ello: Depreciación (Total)",
              baseDeCalculoRef: "III",
              calculationMethod: "ValorFijo",
              totalFormula: "baseValue",
              children: [
                { id: "3.1.1", label: "-Otras Construcciones", valorHistorico: 0, calculationMethod: "ValorFijo" },
                { id: "3.1.2", label: "-Edificios", valorHistorico: 0, calculationMethod: "ValorFijo" },
                { id: "3.1.3", label: "-Maquinas y eq. energéticos", valorHistorico: 0, calculationMethod: "ValorFijo" },
                { id: "3.1.4", label: "-Maquinas y eq. productivos", valorHistorico: 0, calculationMethod: "ValorFijo" },
                { id: "3.1.5", label: "-Aparatos y eq. técnicos", valorHistorico: 0, calculationMethod: "ValorFijo" },
              ]
            },
            { id: "3.2", label: "-Mantenimiento", valorHistorico: 12312.81, calculationMethod: "ValorFijo" },
            { id: "3.3", label: "-Servicios contratados", valorHistorico: 6389.75, calculationMethod: "ValorFijo" },
            { id: "3.4", label: "-Medios de protección", valorHistorico: 19664.13, calculationMethod: "ValorFijo" },
            { id: "3.5", label: "-Alquiler locales", valorHistorico: 0, calculationMethod: "ValorFijo" },
            { id: "3.6", label: "-Alimentación", valorHistorico: 0, calculationMethod: "ValorFijo" },
            { id: "3.7", label: "-Dietas", valorHistorico: 0, baseDeCalculoRef: "V", calculationMethod: "ValorFijo", totalFormula: "baseValue", helpText: "Derivado del Anexo V." },
          ]
        },
      ],
    },
    // Section 4: Gastos Asociados a la Producción
    {
      id: "s4",
      label: "Sección 4: Gastos Asociados a la Prod.",
      rows: [
        {
          id: "4",
          code: "gastos_asociados_prod_total",
          label: "Gastos Asociados Prod.",
          formula: "=sum(children)",
          children: [
            { id: "4.1", label: "De ello: Salarios", valorHistorico: 25000.00, calculationMethod: "Prorrateo", baseDeCalculoRef: "I" },
            { id: "4.2", label: "-Otros gastos", valorHistorico: 0, calculationMethod: "ValorFijo" },
          ]
        }
      ],
    },
    // Section 5: COSTO TOTAL
    {
      id: "s5",
      label: "Sección 5: COSTO TOTAL",
      rows: [
        { id: "5", code: "costo_total", label: "COSTO TOTAL (1+2+3+4)", formula: "=sum(ref('1'), ref('2'), ref('3'), ref('4'))" },
      ],
    },
    // Section 6: Gastos Generales y Admón.
    {
      id: "s6",
      label: "Sección 6: Gtos. Grales y Admón.",
      rows: [
        {
          id: "6",
          code: "gtos_grales_admon_total",
          label: "Gtos. Grales y Admón.",
          calculationMethod: "Prorrateo",
          baseDeCalculoRef: "I",
          valorHistorico: 30000.00
        },
      ],
    },
    {
      id: "s7",
      label: "Sección 7: Gtos. Dist. y Venta",
       rows: [
        {
          id: "7",
          label: "Gtos. Dist. y Venta",
          valorHistorico: 0
        },
      ],
    },
    {
      id: "s8",
      label: "Sección 8: Gastos Financieros",
      rows: [
        {
          id: "8",
          label: "Gastos Financieros",
          valorHistorico: 0
        },
      ],
    },
    {
      id: "s9",
      label: "Sección 9: Gasto Financ. OSDE",
      rows: [
         { id: "9", label: "Gasto Financ. OSDE", valorHistorico: 0, calculationMethod: "ValorFijo" },
      ],
    },
    // Section 10: Gastos Tributarios
    {
      id: "s10",
      label: "Sección 10: Gastos Tributarios",
      rows: [
        {
          id: "10",
          code: "gastos_tributarios_total",
          label: "Gastos Tributarios",
          formula: "=sum(children)",
          children: [
            {
              id: "10.1",
              label: "De ello: -Contrib. Seg. Social (14%)",
              valorHistorico: 4620,
              formula: "=round2(pct(ref('2.1') + ref('4.1') + ref('6.1'), 14))",
              helpText: "14% del total de salarios directos, asociados y administración."
            },
            {
              id: "10.2",
              label: "-Imp. Fuerza Trabajo (5%)",
              valorHistorico: 1650,
              formula: "=round2(pct(ref('2.1') + ref('4.1') + ref('6.1'), 5))",
              helpText: "5% del total de salarios directos, asociados y administración."
            }
          ]
        },
      ],
    },
    // Summary sections
    {
      id: "s11",
      label: "Sección 11: TOTAL DE GASTOS",
      rows: [
        { id: "11", label: "TOTAL DE GASTOS (6+7+8+9+10)", formula: "=sum(ref('6'), ref('7'), ref('8'), ref('9'), ref('10'))" }
      ],
    },
    {
      id: "s12",
      label: "Sección 12: TOTAL COSTOS Y GASTOS",
      rows: [
        { id: "12", label: "TOTAL COSTOS Y GASTOS (5+11)", formula: "=sum(ref('5'), ref('11'))" }
      ],
    },
    {
        id: "s13",
        label: "Sección 13: RESULTADO FINAL",
        rows: [
            { id: "13", label: "Utilidad", valorHistorico: 0.20, is_percent: true, base_ref: '12', helpText: "Margen de utilidad." },
            { id: "13.1", label: "Precio antes de Impuesto", formula: "=sum(ref('12'), ref('13'))" },
            { id: "13.2", label: "Imp s/Ventas y Serv", valorHistorico: 0.10, is_percent: true, base_ref: '13.1', helpText: "Impuesto sobre ventas." },
            { id: "14", label: "Precio o Tarifa Final", formula: "=sum(ref('13.1'), ref('13.2'))" }
        ]
    },
    {
        id: "s14",
        label: "Sección 14: UNITARIOS",
        rows: [
            { id: "15", label: "Costo y gasto UNITARIO", formula: "=ref('12') / header('quantity')" },
            { id: "16", label: "VENTA UNITARIA", formula: "=ref('14') / header('quantity')" }
        ]
    }
  ],
  annexes: [
    {
      id: "I",
      title: "I - DESGLOSE DE MATERIAS PRIMAS Y MATERIALES FUNDAMENTALES",
      columns: [
        { key: "no", label: "NO" },
        { key: "classification", label: "Clasificación" },
        { key: "code", label: "Código" },
        { key: "description", label: "Descripción de la Mat. Prima" },
        { key: "reference", label: "Referencia" },
        { key: "um", label: "UM" },
        { key: "consumption_norm", label: "Norma de Consumo" },
        { key: "price", label: "Precio Total" },
        { key: "total", label: "Total", formula: "consumption_norm * price" }
      ],
      data: [
        { no: 1.00, classification: "1.1 - Insumos (MP)", code: "Código Cemento P-350", description: "Cemento P-350", reference: 0, um: "t", consumption_norm: 3.22, price: 2672.47 },
        { no: 2.00, classification: "1.1 - Insumos (MP)", code: "Código Arena Lavada", description: "Arena Lavada", reference: 0, um: "m3", consumption_norm: 5.85, price: 1112.18 },
        { no: 3.00, classification: "1.1 - Insumos (MP)", code: "Código Acero de Refuerzo", description: "Acero de Refuerzo", reference: 0, um: "kg", consumption_norm: 97.16, price: 10989.54 },
        { no: 4.00, classification: "1.1 - Insumos (MP)", code: "Código Pintura Vinilica", description: "Pintura Vinilica", reference: 0, um: "L", consumption_norm: 18.96, price: 2563.80 },
        { no: 5.00, classification: "1.1 - Insumos (MP)", code: "Código Ladrillo Común", description: "Ladrillo Común", reference: 0, um: "millar", consumption_norm: 2.95, price: 3707.02 }
      ]
    },
    {
        id: "II",
        title: "II - DESGLOSE DE LOS GASTOS DE SALARIO DE LOS OBREROS",
        columns: [
            { key: "no", label: "NO" },
            { key: "description", label: "Descripción" },
            { key: "time_norm", label: "Norma de Tiempo (h)" },
            { key: "hourly_rate", label: "Tarifa Horaria ($/h)" },
            { key: "worker_count", label: "Cant. Obreros" },
            { key: "total", label: "Total", formula: "time_norm * hourly_rate * worker_count" }
        ],
        data: [
            { no: 1.00, description: "Albañil", time_norm: 143.40, hourly_rate: 41.17, worker_count: 2.00 },
            { no: 2.00, description: "Carpintero", time_norm: 86.70, hourly_rate: 61.00, worker_count: 3.00 },
            { no: 3.00, description: "Electricista", time_norm: 70.40, hourly_rate: 56.54, worker_count: 1.00 },
            { no: 4.00, description: "Plomero", time_norm: 45.40, hourly_rate: 52.91, worker_count: 1.00 },
            { no: 5.00, description: "Operador de Grúa", time_norm: 142.80, hourly_rate: 84.04, worker_count: 1.00 },
        ]
    },
    {
        id: "III",
        title: "III - ANEXO DE DEPRECIACIÓN DE EQUIPOS",
        columns: [
            { key: "classification", label: "Clasif." },
            { key: "code", label: "Código" },
            { key: "name", label: "Descripción del Equipo" },
            { key: "initial_value", label: "Valor de Compra", is_numeric: true, is_editable: true },
            { key: "residual_value", label: "Depreciado", is_numeric: true, is_editable: true },
            { key: "useful_life", label: "% Deprec.", is_numeric: true, is_editable: true },
            { key: "quantity", label: "Tiempo Explot.", is_numeric: true, is_editable: true },
            { key: "depreciation_cost", label: "Deprec.", formula: "(initial_value * (useful_life / 100)) / quantity", is_numeric: true, is_editable: false }
        ],
        data: [
      {
        id: "3.1.4",
        code: "EQ-001",
        name: "Hormigonera 1",
        initial_value: 150000,
        residual_value: 30000,
        useful_life: 10,
        quantity: 1,
        depreciation_cost: 0,
      },
      {
        id: "3.1.5",
        code: "EQ-002",
        name: "Andamio Metálico",
        initial_value: 50000,
        residual_value: 10000,
        useful_life: 12,
        quantity: 1,
        depreciation_cost: 0,
      },
      {
        id: "3.1.1",
        code: "ED-001",
        name: "Nave de Producción",
        initial_value: 2500000,
        residual_value: 500000,
        useful_life: 2,
        quantity: 1,
        depreciation_cost: 0,
      },
        ]
    },
    {
        id: "IV",
        title: "IV - ANEXO DE OTROS GASTOS DIRECTOS",
        columns: [
            { key: "classification", label: "Clasificación" },
            { key: "code", label: "Código" },
            { key: "description", label: "Descripción" },
            { key: "amount", label: "Importe" }
        ],
        data: [
            { classification: "3.2 - Mantenimiento", code: "MANT-01", description: "Mantenimiento Preventivo General", amount: 12312.81 },
            { classification: "3.3 - Servicios Contratados", code: "SERV-01", description: "Servicios de Limpieza Contratado", amount: 6389.75 },
            { classification: "3.4 - Medios de Protección", code: "PROT-01", description: "Equipos de Protección Personal (EPP)", amount: 19664.13 },
        ]
    },
    {
        id: "V",
        title: "V - ANEXO DE DIETAS DE TRABAJADORES",
        columns: [
            { key: "code", label: "Código" },
            { key: "worker_name", label: "Nombre del Trabajador" },
            { key: "daily_allowance", label: "Gasto de Dieta Diario" },
            { key: "days", label: "Días" },
            { key: "total", label: "Total", formula: "daily_allowance * days" }
        ],
        data: [
            { code: "TR-001", worker_name: "Juan Pérez (Jefe de Obra)", daily_allowance: 500.00, days: 20.00 },
            { code: "TR-002", worker_name: "Ana García (Especialista)", daily_allowance: 450.00, days: 15.00 },
            { code: "TR-003", worker_name: "Carlos Rodríguez (Técnico)", daily_allowance: 400.00, days: 22.00 },
        ]
    }
  ],
  signature: {
      prepared_by: "Elaborado por:",
      approved_by: "Aprobado por:"
  },
  footer: "Elaborado con COSTPRO"
};
export default template;
