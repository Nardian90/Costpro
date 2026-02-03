const template = {
  id: "costpro-full-v5",
  name: "Producción de Pan Artistas",
  version: "5.0.0",
  metadata: {
    author: "CostPro Enterprise",
  },
  header: {
    code: "FC-PAN-2026",
    name: "Producción de Pan Artistas (1kg)",
    date: "2026-02-27",
    unit: "Kilogramos",
    quantity: 500,
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
          children: [
            { id: "1.1", label: "De ello: - Insumos (MP)", valorHistorico: 0, baseDeCalculoRef: "I", calculationMethod: "ValorFijo" },
            { id: "1.2", label: "- Combustibles y lubricantes", valorHistorico: 0, totalFormula: "128749.02", calculationMethod: "ValorFijo" },
            { id: "1.3", label: "- Energía", valorHistorico: 0, totalFormula: "68483.52", calculationMethod: "ValorFijo" },
            { id: "1.4", label: "- Agua", valorHistorico: 0, totalFormula: "0.00", calculationMethod: "ValorFijo" }
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
          children: [
             { id: "2.1", label: "De ello: Salarios", valorHistorico: 0, baseDeCalculoRef: "II", calculationMethod: "ValorFijo" },
             { id: "2.2", label: "Vacaciones", formula: "=pct(ref('2.1'), 9.09)", value: 0.0909, is_percent: true, base_ref: "2.1" }
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
              label: "DE ELLO: DEPRECIACIÓN (TOTAL)",
              baseDeCalculoRef: "III",
              calculationMethod: "ValorFijo",
              children: [
                { id: "3.1.1", label: "-Edificios", valorHistorico: 24.65, calculationMethod: "ValorFijo", totalFormula: "valorHistorico" },
                { id: "3.1.2", label: "-Otras Construcciones", valorHistorico: 0, calculationMethod: "ValorFijo" },
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
            { id: "3.7", label: "-Dietas", valorHistorico: 0, baseDeCalculoRef: "V", calculationMethod: "ValorFijo" },
          ]
        },
      ],
    },
    {
      id: "s4",
      label: "Sección 4: Gastos Asociados Prod.",
      rows: [
        {
          id: "4",
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
        { id: "5", label: "COSTO TOTAL (1+2+3+4)", formula: "=sum(ref('1'), ref('2'), ref('3'), ref('4'))" },
      ],
    },
    {
      id: "s6",
      label: "Sección 6: Gtos. Grales y Admón.",
      rows: [
        {
          id: "6",
          label: "GTOS. GRALES Y ADMÓN.",
          formula: "=sum(children)",
          children: [
              { id: "6.1", label: "- Salarios", valorHistorico: 30000.00, calculationMethod: "ValorFijo", totalFormula: "valorHistorico" },
              { id: "6.2", label: "- Comunicación", valorHistorico: 0, calculationMethod: "ValorFijo" },
              { id: "6.3", label: "- Depreciacion", valorHistorico: 0, calculationMethod: "ValorFijo" },
              { id: "6.4", label: "- Energia", valorHistorico: 0, calculationMethod: "ValorFijo" },
              { id: "6.5", label: "- Otros Gastos Admin.", valorHistorico: 0, calculationMethod: "ValorFijo" }
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
                label: "GTOS. DIST. Y VENTA",
                formula: "=sum(children)",
                children: [
                    { id: "7.1", label: "- Salarios", valorHistorico: 0, calculationMethod: "ValorFijo" },
                    { id: "7.2", label: "- Otros gastos", valorHistorico: 0, calculationMethod: "ValorFijo" }
                ]
            }
        ]
    },
    {
        id: "s8",
        label: "Sección 8: Gastos Financieros",
        rows: [
            {
                id: "8",
                label: "GASTOS FINANCIEROS",
                formula: "=sum(children)",
                children: [
                    { id: "8.1", label: "- Intereses y comisiones", valorHistorico: 0, calculationMethod: "ValorFijo" },
                    { id: "8.2", label: "- Otros Gastos Financ.", valorHistorico: 0, calculationMethod: "ValorFijo" }
                ]
            }
        ]
    },
    {
        id: "s9",
        label: "Sección 9: Gasto Financ. OSDE",
        rows: [
            { id: "9", label: "GASTO FINANC. OSDE", valorHistorico: 0, calculationMethod: "ValorFijo" }
        ]
    },
    {
      id: "s10",
      label: "Sección 10: Gastos Tributarios",
      rows: [
        {
          id: "10",
          label: "GASTOS TRIBUTARIOS",
          formula: "=sum(children)",
          children: [
            {
              id: "10.1",
              label: "De ello: -Contrib. Seg. Social (14%)",
              formula: "=round2(pct(ref('2.1') + ref('4.1') + ref('6.1') + ref('7.1'), 14))"
            },
            {
              id: "10.2",
              label: "-Imp. Fuerza Trabajo (5%)",
              formula: "=round2(pct(ref('2.1') + ref('4.1') + ref('6.1') + ref('7.1'), 5))"
            }
          ]
        },
      ],
    },
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
        label: "Sección 13: Utilidad",
        rows: [
            { id: "13", label: "Utilidad", valorHistorico: 0.20, is_percent: true, base_ref: '12' },
            { id: "13.1", label: "Precio antes de Impuesto", formula: "=sum(ref('12'), ref('13'))" },
            { id: "13.2", label: "Imp s/Ventas y Serv", valorHistorico: 0.10, is_percent: true, base_ref: '13.1' }
        ]
    },
    {
        id: "s14",
        label: "Sección 14: Precio o Tarifa Final",
        rows: [
            { id: "14", label: "Precio o Tarifa Final", formula: "=sum(ref('13.1'), ref('13.2'))" }
        ]
    },
    {
        id: "s15",
        label: "Sección 15: Costo y gasto UNITARIO",
        rows: [
            { id: "15", label: "Costo y gasto UNITARIO", formula: "=ref('12') / header.quantity" }
        ]
    },
    {
        id: "s16",
        label: "Sección 16: VENTA UNITARIA",
        rows: [
            { id: "16", label: "VENTA UNITARIA", formula: "=ref('14') / header.quantity" }
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
        { key: "price", label: "Precio Unitario" },
        { key: "total", label: "Total", formula: "consumption_norm * price" }
      ],
      data: [
        { no: 1.00, classification: "1.1 - Insumos (MP)", code: "MP-001", description: "Harina de Trigo Especial", um: "kg", consumption_norm: 350.00, price: 450.00 },
        { no: 2.00, classification: "1.1 - Insumos (MP)", code: "MP-002", description: "Levadura Seca", um: "kg", consumption_norm: 5.00, price: 1200.00 },
        { no: 3.00, classification: "1.1 - Insumos (MP)", code: "MP-003", description: "Sal Común", um: "kg", consumption_norm: 7.00, price: 85.00 },
        { no: 4.00, classification: "1.1 - Insumos (MP)", code: "MP-004", description: "Aceite Vegetal", um: "lt", consumption_norm: 12.00, price: 650.00 },
      ]
    },
    {
        id: "II",
        title: "II - DESGLOSE DE LOS GASTOS DE SALARIO DE LOS OBREROS",
        columns: [
            { key: "no", label: "NO" },
            { key: "classification", label: "Clasificación" },
            { key: "description", label: "Descripción del Puesto" },
            { key: "time_norm", label: "Horas Mensuales" },
            { key: "hourly_rate", label: "Tarifa $/h" },
            { key: "worker_count", label: "Cant. Obreros" },
            { key: "total", label: "Total", formula: "time_norm * hourly_rate * worker_count" }
        ],
        data: [
            { no: 1.00, description: "Maestro Panadero", time_norm: 190.00, hourly_rate: 450.00, worker_count: 2.00 },
            { no: 2.00, description: "Ayudante de Panadería", time_norm: 190.00, hourly_rate: 280.00, worker_count: 4.00 },
            { no: 3.00, description: "Hornero", time_norm: 190.00, hourly_rate: 320.00, worker_count: 2.00 },
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
            { key: "classification", label: "Clasificación" },
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
