const template = {
  id: "costpro-full-v5",
  name: "Soporte Técnico",
  version: "5.0.0",
  metadata: {
    author: "CostPro",
  },
  header: {
    code: "FC-DEMO-243",
    name: "Soporte Técnico",
    date: "2026-01-30",
    unit: "Unidades",
    quantity: 183,
    currency: "CUP",
    category: "ORGANISMO",
    type: "EMPRESA",
    productionLevel: "562",
    utilization: "100.00%",
    salePrice: "3,349,592.94",
  },
  sections: [
    {
      id: "s1",
      label: "Sección 1: Gasto Material",
      rows: [
        {
          id: "1",
          code: "gasto_material_total",
          label: "GASTO MATERIAL",
          formula: "=sum(children)",
          helpText: "Total de gastos materiales directos.",
          children: [
            {
              id: "1.1",
              code: "gasto_material_insumos",
              label: "De ello: - Insumos (MP)",
              valorHistorico: 0,
              baseDeCalculoRef: "I",
              base_display_override: "1,00",
              calculationMethod: "ValorFijo",
              helpText: "Derivado del Anexo I."
            },
            {
              id: "1.2",
              code: "gasto_material_combustibles",
              label: "- Combustibles y lubricantes",
              valorHistorico: 0,
              base_display_override: "1,00",
              calculationMethod: "ValorFijo",
              totalFormula: "128749.02",
              helpText: "Gastos de combustibles asociados."
            },
            {
              id: "1.3",
              code: "gasto_material_energia",
              label: "- Energía",
              valorHistorico: 0,
              base_display_override: "1,00",
              calculationMethod: "ValorFijo",
              totalFormula: "68483.52",
              helpText: "Energía eléctrica directa."
            },
            {
              id: "1.4",
              code: "gasto_material_agua",
              label: "- Agua",
              valorHistorico: 0,
              base_display_override: "1,00",
              calculationMethod: "ValorFijo",
              totalFormula: "0.00",
              helpText: "Agua para procesos productivos."
            }
          ]
        },
      ],
    },
    {
      id: "s2",
      label: "Sección 2: SALARIO DIRECTO",
      rows: [
        {
          id: "2",
          code: "salario_directo_total",
          label: "SALARIO DIRECTO",
          formula: "=sum(children)",
          helpText: "Total de salarios directos.",
          children: [
             {
              id: "2.1",
              code: "salario_directo_obreros",
              label: "De ello: Salarios",
              valorHistorico: 0,
              baseDeCalculoRef: "II",
              base_display_override: "1,00",
              calculationMethod: "ValorFijo",
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
    {
      id: "s3",
      label: "Sección 3: OTROS GASTOS DIRECTOS",
      rows: [
        {
          id: "3",
          code: "otros_gastos_directos_total",
          label: "OTROS GASTOS DIRECTOS",
          formula: "=sum(children)",
          children: [
            {
              id: "3.1",
              code: "otros_gastos_depreciacion_total",
              label: "DE ELLO: DEPRECIACIÓN (TOTAL)",
              baseDeCalculoRef: "III",
              calculationMethod: "ValorFijo",
              children: [
                { id: "3.1.1", label: "-Otras Construcciones", valorHistorico: 0, calculationMethod: "ValorFijo" },
                { id: "3.1.2", label: "-Edificios", valorHistorico: 24.65, calculationMethod: "ValorFijo", totalFormula: "valorHistorico" },
                { id: "3.1.3", label: "-Maquinas y eq. energéticos", valorHistorico: 0, calculationMethod: "ValorFijo" },
                { id: "3.1.4", label: "-Maquinas y eq. productivos", valorHistorico: 0, calculationMethod: "ValorFijo" },
                { id: "3.1.5", label: "-Aparatos y eq. técnicos", valorHistorico: 0, calculationMethod: "ValorFijo" },
              ]
            },
            { id: "3.2", label: "-Mantenimiento", valorHistorico: 11593.24, calculationMethod: "ValorFijo", totalFormula: "valorHistorico" },
            { id: "3.3", label: "-Servicios contratados", valorHistorico: 3472.42, calculationMethod: "ValorFijo", totalFormula: "valorHistorico" },
            { id: "3.4", label: "-Medios de protección", valorHistorico: 13165.29, calculationMethod: "ValorFijo", totalFormula: "valorHistorico" },
            { id: "3.5", label: "-Alquiler locales", valorHistorico: 0, calculationMethod: "ValorFijo" },
            { id: "3.6", label: "-Alimentación", valorHistorico: 0, calculationMethod: "ValorFijo" },
            { id: "3.7", label: "-Dietas", valorHistorico: 0, baseDeCalculoRef: "V", calculationMethod: "ValorFijo", helpText: "Derivado del Anexo V." },
          ]
        },
      ],
    },
    {
      id: "s4",
      label: "Sección 4: GASTOS ASOCIADOS A LA PRODUCCIÓN",
      rows: [
        {
          id: "4",
          code: "gastos_asociados_prod_total",
          label: "GASTOS ASOCIADOS PROD.",
          formula: "=sum(children)",
          children: [
            { id: "4.1", label: "De ello: Salarios", valorHistorico: 0, calculationMethod: "ValorFijo", totalFormula: "0.00" },
            { id: "4.2", label: "-Otros gastos", valorHistorico: 0, calculationMethod: "ValorFijo" },
          ]
        }
      ],
    },
    {
      id: "s5",
      label: "Sección 5: COSTO TOTAL",
      rows: [
        { id: "5", code: "costo_total", label: "COSTO TOTAL (1+2+3+4)", formula: "=sum(ref('1'), ref('2'), ref('3'), ref('4'))" },
      ],
    },
    {
      id: "s6",
      label: "Sección 6: GTOS. GRALES Y ADMÓN.",
      rows: [
        {
          id: "6",
          code: "gtos_grales_admon_total",
          label: "GTOS. GRALES Y ADMÓN.",
          calculationMethod: "ValorFijo",
          totalFormula: "30000.00",
          valorHistorico: 30000.00
        },
      ],
    },
    {
      id: "s10",
      label: "Sección 10: GASTOS TRIBUTARIOS",
      rows: [
        {
          id: "10",
          code: "gastos_tributarios_total",
          label: "GASTOS TRIBUTARIOS",
          formula: "=sum(children)",
          children: [
            {
              id: "10.1",
              label: "De ello: -Contrib. Seg. Social (14%)",
              valorHistorico: 0,
              formula: "=round2(pct(ref('2.1') + ref('4.1'), 14))",
              helpText: "14% del total de salarios directos y asociados."
            },
            {
              id: "10.2",
              label: "-Imp. Fuerza Trabajo (5%)",
              valorHistorico: 0,
              formula: "=round2(pct(ref('2.1') + ref('4.1'), 5))",
              helpText: "5% del total de salarios directos y asociados."
            }
          ]
        },
      ],
    },
    {
      id: "s12",
      label: "Sección 12: TOTAL COSTOS Y GASTOS",
      rows: [
        { id: "12", label: "TOTAL COSTOS Y GASTOS", formula: "=sum(ref('5'), ref('6'), ref('10'))" }
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
        { key: "um", label: "UM" },
        { key: "consumption_norm", label: "Norma de Consumo" },
        { key: "price", label: "Precio Total" },
        { key: "total", label: "Total", formula: "consumption_norm * price" }
      ],
      data: [
        { no: 1.00, classification: "1.1 - Insumos (MP)", code: "MAT-001", description: "Insumos Tecnológicos", um: "u", consumption_norm: 183, price: 7750.3781 },
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
            { no: 1.00, description: "Personal de Soporte", time_norm: 183.00, hourly_rate: 374.226885, worker_count: 1.00 },
        ]
    },
    {
        id: "III",
        title: "III - ANEXO DE DEPRECIACIÓN DE EQUIPOS",
        columns: [
            { key: "classification", label: "Clasif." },
            { key: "code", label: "Código" },
            { key: "name", label: "Descripción del Equipo" },
            { key: "initial_value", label: "Valor de Compra" },
            { key: "useful_life", label: "% Deprec." },
            { key: "quantity", label: "Tiempo Explot." },
            { key: "depreciation_cost", label: "Deprec.", formula: "(initial_value * (useful_life / 100)) / quantity" }
        ],
        data: [
            { classification: "3.1.2 - Edificios", code: "ED-001", name: "Oficina Central", initial_value: 2500000, useful_life: 2, quantity: 2028.3975 }
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
            { classification: "3.2 - Mantenimiento", code: "MANT-01", description: "Mantenimiento Preventivo General", amount: 11593.24 },
            { classification: "3.3 - Servicios Contratados", code: "SERV-01", description: "Servicio de Limpieza Contratado", amount: 3472.42 },
            { classification: "3.4 - Medios de Protección", code: "PROT-01", description: "Equipos de Protección Personal (EPP)", amount: 13165.29 },
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
  footer: "FIN DEL DOCUMENTO • GENERADO AUTOMÁTICAMENTE POR COSTPRO V1.0"
};
export default template;
