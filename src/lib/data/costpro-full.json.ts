
const template = {
  id: "costpro-full-v2",
  name: "Ficha de Costo Completa (v2)",
  version: "2.0.0",
  metadata: {
    author: "CostPro",
  },
  header: {
    code: "FC-01-VIV-02-2024",
    name: "HORMIGON HIDRAULICO DE F'C=25 MPa",
    date: "2024-05-28",
    unit: "m3",
    quantity: 1.0,
    currency: "CUP",
    category: "PRODUCCION PRINCIPAL",
    type: "PRODUCCION",
  },
  sections: [
    {
      id: "s1",
      label: "Gasto Material",
      rows: [
        { id: "1", code: "gasto_material_total", label: "Gasto Material", formula: "=sum(annex('I'))" },
      ],
    },
    {
      id: "s2",
      label: "Salario Directo",
      rows: [
        { id: "2", code: "salario_directo_total", label: "Salario Directo", formula: "=sum(annex('II'))" },
      ],
    },
    {
      id: "s3",
      label: "Otros Gastos Directos",
      rows: [
        { id: "3", code: "otros_gastos_directos_total", label: "Otros Gastos Directos", formula: "=sum(annex('III'), annex('IV'))" },
      ],
    },
    {
      id: "s4",
      label: "Gastos Asociados a la Producción",
      rows: [
        { id: "4", code: "gastos_asociados_prod_total", label: "Gastos Asociados a la Producción", value: 0.00 }
      ],
    },
    {
      id: "s5",
      label: "COSTO TOTAL",
      rows: [
        { id: "5", code: "costo_produccion", label: "COSTO DE PRODUCCIÓN (1+2+3+4)", formula: "=sum(ref('1'), ref('2'), ref('3'), ref('4'))" },
      ],
    },
    {
      id: "s6",
      label: "Gtos. Grales y de Admón.",
      rows: [
        { id: "6", code: "gtos_grales_admon_total", label: "Gtos. Grales y de Admón.", value: 0.00 },
      ],
    },
    {
      id: "s7",
      label: "Gtos. de Distribución y Venta",
       rows: [
        { id: "7", code: "gtos_dist_venta_total", label: "Gtos. de Distribución y Venta", value: 0.00 },
      ],
    },
    {
      id: "s8",
      label: "Gastos Financieros",
      rows: [
        { id: "8", code: "gastos_financieros_total", label: "Gastos Financieros", value: 0.00 },
      ],
    },
    {
      id: "s9",
      label: "Gasto Financ. OSDE",
      rows: [
         { id: "9", code: "gasto_financ_osde", label: "Gasto Financ. OSDE", value: 0.00 },
      ],
    },
    {
      id: "s10",
      label: "Gastos Tributarios",
      rows: [
        { id: "10", code: "gastos_tributarios_total", label: "Gastos Tributarios", formula: "=sum(ref('10.1'), ref('10.2'))" },
        { id: "10.1", code: "gastos_tributarios_seg_social", label: "De ello: -Contrib. Seg. Social (14%)", value: 61070.93 },
        { id: "10.2", code: "gastos_tributarios_fuerza_trabajo", label: "-Imp. Fuerza Trabajo (5%)", value: 21811.05 }
      ],
    },
    {
      id: "s11",
      label: "TOTAL DE GASTOS",
      rows: [
        { id: "11", code: "total_gastos", label: "TOTAL DE GASTOS (6+7+8+9+10)", formula: "=sum(ref('6'), ref('7'), ref('8'), ref('9'), ref('10'))" }
      ],
    },
    {
      id: "s12",
      label: "TOTAL COSTOS Y GASTOS",
      rows: [
        { id: "12", code: "total_costos_gastos", label: "TOTAL COSTOS Y GASTOS (5+11)", formula: "=sum(ref('5'), ref('11'))" }
      ],
    },
    {
        id: "s13",
        label: "RESULTADO",
        rows: [
            { id: "13", code: "resultado_utilidad", label: "Utilidad", value: 0.20, is_percent: true, base_ref: '12' },
            { id: "13.1", code: "resultado_precio_antes_imp", label: "Precio antes de Impuesto", formula: "=ref('12') * (1 + ref('13'))" },
            { id: "13.2", code: "resultado_impuesto_ventas", label: "Imp s/Ventas y Serv", value: 0.10, is_percent: true, base_ref: '13.1' },
            { id: "14", code: "resultado_final", label: "Precio o Tarifa Final", formula: "=ref('13.1') * (1 + ref('13.2'))" }
        ]
    },
    {
        id: "s14",
        label: "UNITARIOS",
        rows: [
            { id: "15", code: "costo_unitario", label: "Costo y gasto UNITARIO", formula: "=ref('12') / header('quantity')" },
            { id: "16", code: "venta_unitaria", label: "VENTA UNITARIA", formula: "=ref('14') / header('quantity')" }
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
