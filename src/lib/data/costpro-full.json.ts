
const template = {
  id: "costpro-full-v5",
  name: "Modelo Integral de Ficha de Costo (v5)",
  version: "5.0.0",
  metadata: {
    author: "CostPro",
  },
  header: {
    code: "FC-01-VIV-02-2024",
    name: "PRODUCTO / SERVICIO DE EJEMPLO",
    date: "2024-05-28",
    unit: "u",
    quantity: 1.0,
    currency: "CUP",
    category: "PRODUCCION PRINCIPAL",
    type: "PRODUCCION",
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
              label: "Insumos (Materia Prima)",
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
              valorHistorico: 0.00,
              calculationMethod: "ValorFijo",
              helpText: "Gastos de combustibles asociados."
            },
            {
              id: "1.3",
              code: "gasto_material_energia",
              label: "Energía",
              valorHistorico: 0.00,
              calculationMethod: "ValorFijo",
              helpText: "Energía eléctrica directa."
            },
            {
              id: "1.4",
              code: "gasto_material_agua",
              label: "Agua",
              valorHistorico: 0.00,
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
              label: "Salarios",
              valorHistorico: 0.00,
              baseDeCalculoRef: "II",
              calculationMethod: "ValorFijo",
              totalFormula: "baseValue",
              helpText: "Derivado del Anexo II."
            },
            {
              id: "2.2",
              code: "salario_directo_vacaciones",
              label: "Vacaciones (9.09%)",
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
              label: "Depreciación (Total)",
              formula: "=sum(children)",
              children: [
                { id: "3.1.1", label: "Edificios", valorHistorico: 0, calculationMethod: "ValorFijo" },
                { id: "3.1.2", label: "Otras Construcciones", valorHistorico: 0, calculationMethod: "ValorFijo" },
                { id: "3.1.3", label: "Maquinas y equipos energéticos", valorHistorico: 0, calculationMethod: "ValorFijo" },
                { id: "3.1.4", label: "Maquinas y equipos productivos", valorHistorico: 0, calculationMethod: "ValorFijo", baseDeCalculoRef: "III", totalFormula: "baseValue" },
                { id: "3.1.5", label: "Aparatos y equipos técnicos", valorHistorico: 0, calculationMethod: "ValorFijo" },
              ]
            },
            { id: "3.2", label: "Mantenimiento", valorHistorico: 0, calculationMethod: "ValorFijo" },
            { id: "3.3", label: "Servicios contratados", valorHistorico: 0, calculationMethod: "ValorFijo" },
            { id: "3.4", label: "Medios de protección", valorHistorico: 0, calculationMethod: "ValorFijo" },
            { id: "3.5", label: "Alquiler locales", valorHistorico: 0, calculationMethod: "ValorFijo" },
            { id: "3.6", label: "Alimentación", valorHistorico: 0, calculationMethod: "ValorFijo" },
            { id: "3.7", label: "Dietas", valorHistorico: 0, baseDeCalculoRef: "V", calculationMethod: "ValorFijo", totalFormula: "baseValue", helpText: "Derivado del Anexo V." },
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
            { id: "4.1", label: "De ello: Salarios", valorHistorico: 0, calculationMethod: "ValorFijo" },
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
          formula: "=sum(children)",
          children: [
            { id: "6.1", label: "De ello: Salarios", valorHistorico: 0, calculationMethod: "ValorFijo" },
            { id: "6.2", label: "-Comunicación", valorHistorico: 0, calculationMethod: "ValorFijo" },
            { id: "6.3", label: "-Depreciación", valorHistorico: 0, calculationMethod: "ValorFijo" },
            { id: "6.4", label: "-Energía", valorHistorico: 0, calculationMethod: "ValorFijo" },
            { id: "6.5", label: "-Otros Gastos Admin.", valorHistorico: 0, calculationMethod: "ValorFijo" },
          ]
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
          formula: "=sum(children)",
          children: [
            { id: "7.1", label: "De ello: Salarios", valorHistorico: 0, calculationMethod: "ValorFijo" },
            { id: "7.2", label: "-Otros gastos", valorHistorico: 0, calculationMethod: "ValorFijo" },
          ]
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
          formula: "=sum(children)",
          children: [
            { id: "8.1", label: "De ello: Intereses y comisiones", valorHistorico: 0, calculationMethod: "ValorFijo" },
            { id: "8.2", label: "-Otros Gastos Financ.", valorHistorico: 0, calculationMethod: "ValorFijo" },
          ]
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
              formula: "=pct(sum(ref('2.1'), ref('4.1'), ref('6.1'), ref('7.1')), 14)",
              helpText: "14% del total de salarios directos, asociados y administración."
            },
            {
              id: "10.2",
              label: "-Imp. Fuerza Trabajo (5%)",
              formula: "=pct(sum(ref('2.1'), ref('4.1'), ref('6.1'), ref('7.1')), 5)",
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
            { id: "13", label: "Utilidad", value: 0.20, is_percent: true, base_ref: '12', helpText: "Margen de utilidad." },
            { id: "13.1", label: "Precio antes de Impuesto", formula: "=sum(ref('12'), ref('13'))" },
            { id: "13.2", label: "Imp s/Ventas y Serv", value: 0.10, is_percent: true, base_ref: '13.1', helpText: "Impuesto sobre ventas." },
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
      title: "Anexo I - Materias Primas y Materiales",
      columns: [
        { key: "no", label: "NO" },
        { key: "classification", label: "Clasificación" },
        { key: "description", label: "Descripción" },
        { key: "um", label: "UM" },
        { key: "consumption_norm", label: "Norma de Consumo" },
        { key: "price", label: "Precio" },
        { key: "total", label: "Total", formula: "consumption_norm * price" }
      ],
      data: [
        { no: 1.00, classification: "1.1 - Insumos (MP)", description: "Cemento P-350", um: "t", consumption_norm: 4.34, price: 2960.93 },
        { no: 2.00, classification: "1.1 - Insumos (MP)", description: "Arena Lavada", um: "m3", consumption_norm: 6.04, price: 2143.18 },
        { no: 3.00, classification: "1.1 - Insumos (MP)", description: "Acero de Refuerzo", um: "kg", consumption_norm: 189.37, price: 8042.38 },
      ]
    },
    {
        id: "II",
        title: "Anexo II - Mano de Obra Directa",
        columns: [
            { key: "no", label: "NO" },
            { key: "description", label: "Descripción" },
            { key: "time_norm", label: "Norma de Tiempo (h)" },
            { key: "hourly_rate", label: "Tarifa Horaria ($/h)" },
            { key: "worker_count", label: "Cant. Obreros" },
            { key: "total", label: "Total", formula: "time_norm * hourly_rate * worker_count" }
        ],
        data: [
            { no: 1.00, description: "Albañil", time_norm: 140.20, hourly_rate: 41.80, worker_count: 5.00 },
            { no: 2.00, description: "Carpintero", time_norm: 93.70, hourly_rate: 51.61, worker_count: 1.00 },
        ]
    },
    {
        id: "III",
        title: "Anexo III - Depreciación de Activos Fijos",
        columns: [
            { key: "description", label: "Descripción" },
            { key: "purchase_value", label: "Valor de Compra" },
            { key: "depreciation_percent", label: "% Deprec." },
            { key: "usage_time", label: "Tiempo Uso" },
            { key: "depreciation_cost", label: "Deprec.", formula: "(purchase_value * (depreciation_percent / 100)) / usage_time" }
        ],
        data: [
            { description: "Hormigonera 1m3", purchase_value: 150000.00, depreciation_percent: 10.00, usage_time: 1.00 },
        ]
    },
    {
        id: "IV",
        title: "Anexo IV - Otros Gastos Directos",
        columns: [
            { key: "classification", label: "Clasificación" },
            { key: "description", label: "Descripción" },
            { key: "amount", label: "Importe" }
        ],
        data: [
            { classification: "3.2 - Mantenimiento", description: "Mantenimiento Preventivo", amount: 6851.72 },
        ]
    },
    {
        id: "V",
        title: "Anexo V - Dietas de Trabajadores",
        columns: [
            { key: "worker_name", label: "Nombre" },
            { key: "daily_allowance", label: "Gasto Diario" },
            { key: "days", label: "Días" },
            { key: "total", label: "Total", formula: "daily_allowance * days" }
        ],
        data: [
            { worker_name: "Juan Pérez", daily_allowance: 500.00, days: 20.00 },
        ]
    }
  ],
  signature: {
      prepared_by: "",
      approved_by: ""
  },
  footer: "Generado por COSTPRO - Sistema de Gestión de Costos"
};
export default template;
