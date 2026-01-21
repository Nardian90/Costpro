
const template = {
  id: "costpro-full-v4", // Version up
  name: "Ficha de Costo Interactiva (v4)",
  version: "4.0.0",
  metadata: {
    author: "CostPro",
  },
  header: {
    code: "FC-01-VIV-02-2024",
    name: "HORMIGON HIDRAULICO DE F'C=25 MPa",
    date: "2024-05-28",
    unit: "m3",
    quantity: 10.0,
    currency: "CUP",
    category: "PRODUCCION PRINCIPAL",
    type: "PRODUCCION",
  },
  sections: [
    // Section 1: Gasto Material
    {
      id: "s1",
      label: "Gasto Material",
      rows: [
        {
          id: "1",
          code: "gasto_material_total",
          label: "Gasto Material",
          formula: "=sum(children)",
          helpText: "Suma total de los gastos de materiales directos.",
          children: [
            {
              id: "1.1",
              code: "gasto_material_insumos",
              label: "Insumos (MP)",
              valorHistorico: 150000.00,
              baseDeCalculoRef: "I",
              calculationMethod: "ValorFijo",
              totalFormula: "baseValue",
              helpText: "Materias primas y materiales fundamentales detallados en el Anexo I."
            },
            {
              id: "1.2",
              code: "gasto_material_combustibles",
              label: "Combustibles y lubricantes",
              valorHistorico: 15000.00,
              baseDeCalculoRef: null,
              calculationMethod: "ValorFijo",
              totalFormula: "valorHistorico",
              helpText: "Gastos de combustibles y lubricantes asociados a la producción."
            }
          ]
        },
      ],
    },
    // Section 2: Salario Directo
    {
      id: "s2",
      label: "Salario Directo",
      rows: [
        {
          id: "2",
          code: "salario_directo_total",
          label: "Salario Directo",
          formula: "=sum(children)",
          helpText: "Suma total de los salarios directos de los obreros implicados en la producción.",
          children: [
             {
              id: "2.1",
              code: "salario_directo_obreros",
              label: "Salarios de Obreros",
              valorHistorico: 437435.00, // Placeholder
              baseDeCalculoRef: "II",
              calculationMethod: "ValorFijo",
              totalFormula: "baseValue",
              helpText: "Salarios directos calculados según el desglose del Anexo II."
            }
          ]
        },
      ],
    },
    // Section 3: Otros Gastos Directos
    {
      id: "s3",
      label: "Otros Gastos Directos",
      rows: [
        {
          id: "3",
          code: "otros_gastos_directos_total",
          label: "Otros Gastos Directos",
          formula: "=sum(children)",
          helpText: "Suma de otros gastos directos como depreciación, mantenimiento, etc.",
          children: [
            {
              id: "3.1",
              code: "otros_gastos_depreciacion",
              label: "Depreciación de Equipos",
              valorHistorico: 27000.00, // Placeholder
              baseDeCalculoRef: "III",
              calculationMethod: "ValorFijo",
              totalFormula: "baseValue",
              helpText: "Depreciación de equipos productivos, detallado en Anexo III."
            },
            {
              id: "3.2",
              code: "otros_gastos_varios",
              label: "Otros Gastos Varios",
              valorHistorico: 27127.47, // Placeholder
              baseDeCalculoRef: "IV",
              calculationMethod: "ValorFijo",
              totalFormula: "baseValue",
              helpText: "Otros gastos como mantenimiento y EPP, detallado en Anexo IV."
            }
          ]
        },
      ],
    },
    // Section 4: Gastos Asociados a la Producción
    {
      id: "s4",
      label: "Gastos Asociados a la Producción",
      rows: [
        {
          id: "4",
          code: "gastos_asociados_prod_total",
          label: "Gastos Asociados a la Producción",
          valorHistorico: 0.00,
          baseDeCalculoRef: null,
          calculationMethod: "ValorFijo",
          totalFormula: "valorHistorico",
          helpText: "Gastos indirectos de producción que no se clasifican en las categorías anteriores."
        }
      ],
    },
    // Section 5: COSTO TOTAL
    {
      id: "s5",
      label: "COSTO TOTAL",
      rows: [
        { id: "5", code: "costo_produccion", label: "COSTO DE PRODUCCIÓN (1+2+3+4)", formula: "=sum(ref('1'), ref('2'), ref('3'), ref('4'))", helpText: "Costo total de producción antes de gastos generales." },
      ],
    },
    // Section 6: Gastos Generales y de Admón.
    {
      id: "s6",
      label: "Gtos. Grales y de Admón.",
      rows: [
        {
          id: "6",
          code: "gtos_grales_admon_total",
          label: "Gtos. Grales y de Admón.",
          valorHistorico: 50000.00,
          baseDeCalculoRef: "2", // Example: Salario Directo Total
          calculationMethod: "Prorrateo", // <-- Key change
          helpText: "Gastos generales y de administración, calculados como un porciento de una base seleccionada (ej. Salario Directo)."
        },
      ],
    },
    {
      id: "s7",
      label: "Gtos. de Distribución y Venta",
       rows: [
        { id: "7", code: "gtos_dist_venta_total", label: "Gtos. de Distribución y Venta", valorHistorico: 0.00, baseDeCalculoRef: null, calculationMethod: "ValorFijo", totalFormula: "valorHistorico", helpText: "Gastos relacionados con la distribución y venta del producto." },
      ],
    },
    {
      id: "s8",
      label: "Gastos Financieros",
      rows: [
        { id: "8", code: "gastos_financieros_total", label: "Gastos Financieros", valorHistorico: 0.00, baseDeCalculoRef: null, calculationMethod: "ValorFijo", totalFormula: "valorHistorico", helpText: "Gastos por concepto de financiamiento." },
      ],
    },
    {
      id: "s9",
      label: "Gasto Financ. OSDE",
      rows: [
         { id: "9", code: "gasto_financ_osde", label: "Gasto Financ. OSDE", valorHistorico: 0.00, baseDeCalculoRef: null, calculationMethod: "ValorFijo", totalFormula: "valorHistorico", helpText: "Gastos financieros específicos de la OSDE." },
      ],
    },
    // Section 10: Gastos Tributarios
    {
      id: "s10",
      label: "Gastos Tributarios",
      rows: [
        {
          id: "10",
          code: "gastos_tributarios_total",
          label: "Gastos Tributarios",
          formula: "=sum(children)",
          helpText: "Suma de todos los gastos tributarios aplicables.",
          children: [
            { id: "10.1", code: "gastos_tributarios_seg_social", label: "De ello: -Contrib. Seg. Social (14%)", valorHistorico: 61070.93, baseDeCalculoRef: null, calculationMethod: "ValorFijo", totalFormula: "valorHistorico", helpText: "Contribución a la seguridad social (14% del salario)." },
            { id: "10.2", code: "gastos_tributarios_fuerza_trabajo", label: "-Imp. Fuerza Trabajo (5%)", valorHistorico: 21811.05, baseDeCalculoRef: null, calculationMethod: "ValorFijo", totalFormula: "valorHistorico", helpText: "Impuesto sobre la utilización de la fuerza de trabajo (5% del salario)." }
          ]
        },
      ],
    },
    // Summary sections
    {
      id: "s11",
      label: "TOTAL DE GASTOS",
      rows: [
        { id: "11", code: "total_gastos", label: "TOTAL DE GASTOS (6+7+8+9+10)", formula: "=sum(ref('6'), ref('7'), ref('8'), ref('9'), ref('10'))", helpText: "Suma total de gastos indirectos." }
      ],
    },
    {
      id: "s12",
      label: "TOTAL COSTOS Y GASTOS",
      rows: [
        { id: "12", code: "total_costos_gastos", label: "TOTAL COSTOS Y GASTOS (5+11)", formula: "=sum(ref('5'), ref('11'))", helpText: "Suma del costo de producción y los gastos indirectos." }
      ],
    },
    {
        id: "s13",
        label: "RESULTADO",
        rows: [
            { id: "13", code: "resultado_utilidad", label: "Utilidad", value: 0.20, is_percent: true, base_ref: '12', helpText: "Margen de utilidad deseado, como porciento del total de costos y gastos." },
            { id: "13.1", code: "resultado_precio_antes_imp", label: "Precio antes de Impuesto", formula: "=sum(ref('12'), ref('13'))", helpText: "Precio de venta antes de aplicar impuestos sobre las ventas." },
            { id: "13.2", code: "resultado_impuesto_ventas", label: "Imp s/Ventas y Serv", value: 0.10, is_percent: true, base_ref: '13.1', helpText: "Impuesto sobre ventas y servicios, como porciento del precio antes de impuestos." },
            { id: "14", code: "resultado_final", label: "Precio o Tarifa Final", formula: "=sum(ref('13.1'), ref('13.2'))", helpText: "Precio final de venta al público." }
        ]
    },
    {
        id: "s14",
        label: "UNITARIOS",
        rows: [
            { id: "15", code: "costo_unitario", label: "Costo y gasto UNITARIO", formula: "=ref('12') / header('quantity')", helpText: "Costo total por unidad producida." },
            { id: "16", code: "venta_unitaria", label: "VENTA UNITARIA", formula: "=ref('14') / header('quantity')", helpText: "Precio de venta por unidad producida." }
        ]
    }
  ],
  annexes: [
    {
      id: "I",
      title: "DESGLOSE DE MATERIAS PRIMAS Y MATERIALES FUNDAMENTALES",
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
        { no: 1.00, classification: "1.1 - Insumos (MP)", code: "Código", description: "Cemento P-350", reference: 0, um: "t", consumption_norm: 4.34, price: 2960.93 },
        { no: 2.00, classification: "1.1 - Insumos (MP)", code: "Código", description: "Arena Lavada", reference: 0, um: "m3", consumption_norm: 6.04, price: 2143.18 },
        { no: 3.00, classification: "1.1 - Insumos (MP)", code: "Código", description: "Acero de Refuerzo", reference: 0, um: "kg", consumption_norm: 189.37, price: 8042.38 },
        { no: 4.00, classification: "1.1 - Insumos (MP)", code: "Código", description: "Pintura Vinílica", reference: 0, um: "L", consumption_norm: 12.26, price: 931.01 },
        { no: 5.00, classification: "1.1 - Insumos (MP)", code: "Código", description: "Ladrillo Común", reference: 0, um: "millar", consumption_norm: 1.35, price: 6739.91 },
      ]
    },
    {
        id: "II",
        title: "DESGLOSE DE LOS GASTOS DE SALARIO DE LOS OBREROS",
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
            { no: 3.00, description: "Electricista", time_norm: 62.60, hourly_rate: 74.65, worker_count: 1.00 },
            { no: 4.00, description: "Plomero", time_norm: 53.00, hourly_rate: 69.32, worker_count: 1.00 },
            { no: 5.00, description: "Operador de Grúa", time_norm: 138.00, hourly_rate: 88.71, worker_count: 1.00 }
        ]
    },
    {
        id: "III",
        title: "ANEXO DE DEPRECIACIÓN DE EQUIPOS",
        columns: [
            { key: "classification", label: "Clasif." },
            { key: "code", label: "Código" },
            { key: "description", label: "Descripción del Equipo" },
            { key: "purchase_value", label: "Valor de Compra" },
            { key: "depreciated_value", label: "Depreciado" },
            { key: "depreciation_percent", label: "%Deprec." },
            { key: "usage_time", label: "Tiempo Explot." },
            { key: "depreciation_cost", label: "Deprec.", formula: "(purchase_value * (depreciation_percent / 100)) / usage_time" }
        ],
        data: [
            { classification: "3.1.4", code: "EQ-001", description: "Hormigonera 1m3", purchase_value: 150000.00, depreciated_value: 30000.00, depreciation_percent: 10.00, usage_time: 1.00 },
            { classification: "3.1.5", code: "EQ-002", description: "Andamio Metálico (juego)", purchase_value: 50000.00, depreciated_value: 10000.00, depreciation_percent: 12.00, usage_time: 1.00 },
            { classification: "3.1.1", code: "ED-001", description: "Nave de Producción Temporal", purchase_value: 2500000.00, depreciated_value: 500000.00, depreciation_percent: 2.00, usage_time: 1.00 }
        ]
    },
    {
        id: "IV",
        title: "ANEXO DE OTROS GASTOS DIRECTOS",
        columns: [
            { key: "classification", label: "Clasificación" },
            { key: "code", label: "Código" },
            { key: "description", label: "Descripción" },
            { key: "amount", label: "Importe" }
        ],
        data: [
            { classification: "3.2 - Mantenimiento", code: "MANT-01", description: "Mantenimiento Preventivo General", amount: 6851.72 },
            { classification: "3.3 - Servicios Contratados", code: "SERV-01", description: "Servicio de Limpieza Contratado", amount: 3146.22 },
            { classification: "3.4 - Medios de Protección", code: "PROT-01", description: "Equipos de Protección Personal (EPP)", amount: 17129.53 }
        ]
    },
    {
        id: "V",
        title: "ANEXO DE DIETAS DE TRABAJADORES",
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
            { code: "TR-003", worker_name: "Carlos Rodríguez (Técnico)", daily_allowance: 400.00, days: 22.00 }
        ]
    }
  ],
  signature: {
      prepared_by: "",
      approved_by: ""
  },
  footer: "Elaborado con COSTPRO"
};
export default template;
