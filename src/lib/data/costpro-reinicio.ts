

const template: any = {
  "header": {
    "resolution": "Res 148/2023",
    "code": "=GET_ANEXO_FILA_DATO(\"I\", 1, \"code\")",
    "name": "Plantilla de Reinicio",
    "date": "2026-02-26",
    "quantity": 1,
    "currency": "CUP",
    "category": "General",
    "type": "EMPRESA",
    "unit": "1",
    "product_code": "",
    "company": "",
    "organism": "",
    "union": "",
    "destination": "servicios",
    "production_level": 1,
    "capacity_utilization": 100,
    "sale_price": "=ref('14.1')",
    "client": ""
  } as any,
  "sections": [
    {
      "id": "s1",
      "label": "Sección 1: Gasto Material",
      "rows": [
        {
          "id": "1",
          "label": "GASTO MATERIAL",
          "helpText": "Incluye todos los materiales primarios, combustibles, energía y agua consumidos directamente en la producción. Se nutre del Anexo I.",
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA(hijos)",
          "children": [
            {
              "id": "1.1",
              "label": "De ello: - Insumos (MP)",
              "valorHistorico": 0,
              "calculationMethod": "FORMULA",
              "totalFormula": "AnexoI",
              "baseRef": "I",
              "vhFormula": ""
            },
            {
              "id": "1.2",
              "label": "- Combustibles y lubricantes",
              "calculationMethod": "FORMULA",
              "totalFormula": "AnexoI",
              "baseRef": "I"
            },
            {
              "id": "1.3",
              "label": "- Energía",
              "calculationMethod": "FORMULA",
              "totalFormula": "AnexoI",
              "baseRef": "I"
            },
            {
              "id": "1.4",
              "label": "- Agua",
              "calculationMethod": "FORMULA",
              "totalFormula": "AnexoI",
              "baseRef": "I"
            }
          ]
        }
      ]
    },
    {
      "id": "s2",
      "label": "Sección 2: SALARIO DIRECTO",
      "rows": [
        {
          "id": "2",
          "label": "SALARIO DIRECTO",
          "helpText": "Salarios de obreros vinculados directamente a la producción. Incluye vacaciones. Se nutre del Anexo II.",
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA(hijos)",
          "children": [
            {
              "id": "2.1",
              "label": "De ello: Salarios",
              "valorHistorico": 0,
              "calculationMethod": "FORMULA",
              "totalFormula": "AnexoII",
              "baseRef": "II",
              "vhFormula": ""
            },
            {
              "id": "2.2",
              "label": "Vacaciones",
              "calculationMethod": "FORMULA",
              "totalFormula": "=PCT(ref('2.1'), 9.09)",
              "formula": "=PCT(ref('2.1.1'), 9.09)",
              "baseRef": "2.1",
              "isPercent": true,
              "vhFormula": "=PCT(vh('2.1.1'), 9.09)"
            }
          ]
        }
      ]
    },
    {
      "id": "s3",
      "label": "Sección 3: OTROS GASTOS DIRECTOS",
      "rows": [
        {
          "id": "3",
          "label": "OTROS GASTOS DIRECTOS",
          "helpText": "Depreciación de equipos, mantenimiento, servicios contratados, protección, alquileres, alimentación y dietas. Se nutre de los Anexos III, IV y V.",
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA(hijos)",
          "children": [
            {
              "id": "3.1",
              "label": "DE ELLO: DEPRECIACIÓN (TOTAL)",
              "calculationMethod": "FORMULA",
              "totalFormula": "=SUMA(hijos)",
              "children": [
                {
                  "id": "3.1.1",
                  "label": "-Edificios",
                  "calculationMethod": "FORMULA",
                  "totalFormula": "AnexoIII",
                  "baseRef": "III"
                },
                {
                  "id": "3.1.2",
                  "label": "-Otras Construcciones",
                  "calculationMethod": "FORMULA",
                  "totalFormula": "AnexoIII",
                  "baseRef": "III"
                },
                {
                  "id": "3.1.3",
                  "label": "-Maquinas y eq. energéticos",
                  "calculationMethod": "FORMULA",
                  "totalFormula": "AnexoIII",
                  "baseRef": "III"
                },
                {
                  "id": "3.1.4",
                  "label": "-Maquinas y eq. productivos",
                  "calculationMethod": "FORMULA",
                  "totalFormula": "AnexoIII",
                  "baseRef": "III"
                },
                {
                  "id": "3.1.5",
                  "label": "-Aparatos y eq. técnicos",
                  "calculationMethod": "FORMULA",
                  "totalFormula": "AnexoIII",
                  "baseRef": "III"
                }
              ]
            },
            {
              "id": "3.2",
              "label": "-Mantenimiento",
              "calculationMethod": "FORMULA",
              "totalFormula": "AnexoIV",
              "baseRef": "IV"
            },
            {
              "id": "3.3",
              "label": "-Servicios contratados",
              "valorHistorico": 0,
              "calculationMethod": "FORMULA",
              "totalFormula": "AnexoIV",
              "baseRef": "IV",
              "vhFormula": ""
            },
            {
              "id": "3.4",
              "label": "-Medios de protección",
              "calculationMethod": "FORMULA",
              "totalFormula": "AnexoIV",
              "baseRef": "IV"
            },
            {
              "id": "3.5",
              "label": "-Alquiler locales",
              "calculationMethod": "FORMULA",
              "totalFormula": "AnexoIV",
              "baseRef": "IV"
            },
            {
              "id": "3.6",
              "label": "-Alimentación",
              "calculationMethod": "FORMULA",
              "totalFormula": "AnexoIV",
              "baseRef": "IV"
            },
            {
              "id": "3.7",
              "label": "-Dietas",
              "calculationMethod": "FORMULA",
              "totalFormula": "AnexoV",
              "baseRef": "V"
            }
          ]
        }
      ]
    },
    {
      "id": "s4",
      "label": "Sección 4: Gastos Asociados Prod.",
      "rows": [
        {
          "id": "4",
          "label": "GASTOS ASOCIADOS PROD.",
          "helpText": "Gastos indirectos de producción asignados proporcionalmente al gasto material. Incluye salarios indirectos y otros gastos.",
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA(hijos)",
          "children": [
            {
              "id": "4.1",
              "label": "De ello: Salarios",
              "calculationMethod": "FORMULA",
              "totalFormula": "vh('4.1.1')/vh('1.1.1')*ref('1.1.1')"
            },
            {
              "id": "4.2",
              "label": "-Otros gastos",
              "valorHistorico": 0,
              "calculationMethod": "FORMULA",
              "totalFormula": "vh('4.1.1')/vh('1.1.1')*ref('1.1.1')",
              "formula": "vh('4.1.2')/vh('1.1.1')*ref('1.1.1')",
              "vhFormula": ""
            }
          ]
        }
      ]
    },
    {
      "id": "s5",
      "label": "Sección 5: COSTO TOTAL",
      "rows": [
        {
          "id": "5",
          "label": "COSTO TOTAL (1+2+3+4)",
          "helpText": "Suma de todos los costos directos y gastos asociados a la producción. Base para calcular gastos generales.",
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA(ref('1'), ref('2'), ref('3'), ref('4'))"
        }
      ]
    },
    {
      "id": "s6",
      "label": "Sección 6: Gtos. Grales y Admón.",
      "rows": [
        {
          "id": "6",
          "label": "GTOS. GRALES Y ADMÓN.",
          "helpText": "Gastos generales y de administración: salarios administrativos, comunicación, depreciación, energía y otros gastos. Prorrateados por VH del gasto material.",
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA(hijos)",
          "children": [
            {
              "id": "6.1",
              "label": "- Salarios",
              "valorHistorico": 0,
              "calculationMethod": "FORMULA",
              "totalFormula": "vh('6.1.1')/vh('1.1.1')*ref('1.1.1')",
              "vhFormula": ""
            },
            {
              "id": "6.2",
              "label": "- Comunicación",
              "calculationMethod": "FORMULA",
              "totalFormula": "vh('6.1.2')/vh('1.1.1')*ref('1.1.1')"
            },
            {
              "id": "6.3",
              "label": "- Depreciacion",
              "calculationMethod": "FORMULA",
              "totalFormula": "vh('6.1.3')/vh('1.1.1')*ref('1.1.1')"
            },
            {
              "id": "6.4",
              "label": "- Energia",
              "valorHistorico": 0,
              "calculationMethod": "FORMULA",
              "totalFormula": "vh('6.1.4')/vh('1.1.1')*ref('1.1.1')",
              "vhFormula": ""
            },
            {
              "id": "6.5",
              "label": "- Otros Gastos Admin.",
              "valorHistorico": 0,
              "calculationMethod": "FORMULA",
              "totalFormula": "vh('6.1.5')/vh('1.1.1')*ref('1.1.1')",
              "formula": "vh('6.1.5')/vh('1.1.1')*ref('1.1.1')",
              "vhFormula": ""
            }
          ]
        }
      ]
    },
    {
      "id": "s7",
      "label": "Sección 7: Gtos. Dist. y Venta",
      "rows": [
        {
          "id": "7",
          "label": "GTOS. DIST. Y VENTA",
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA(hijos)",
          "children": [
            {
              "id": "7.1",
              "label": "- Salarios",
              "calculationMethod": "FORMULA",
              "totalFormula": "vh('7.1.1')/vh('1.1.1')*ref('1.1.1')"
            },
            {
              "id": "7.2",
              "label": "- Otros gastos",
              "calculationMethod": "FORMULA",
              "totalFormula": "vh('7.1.2')/vh('1.1.1')*ref('1.1.1')"
            }
          ]
        }
      ]
    },
    {
      "id": "s8",
      "label": "Sección 8: Gastos Financieros",
      "rows": [
        {
          "id": "8",
          "label": "GASTOS FINANCIEROS",
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA(hijos)",
          "children": [
            {
              "id": "8.1",
              "label": "- Intereses y comisiones",
              "calculationMethod": "FORMULA",
              "totalFormula": "vh('8.1.1')/vh('1.1.1')*ref('1.1.1')",
              "valorHistorico": 0,
              "vhFormula": ""
            },
            {
              "id": "8.2",
              "label": "- Otros Gastos Financ.",
              "calculationMethod": "FORMULA",
              "totalFormula": "0",
              "valorHistorico": 0,
              "vhFormula": ""
            }
          ]
        }
      ]
    },
    {
      "id": "s9",
      "label": "Sección 9: Gasto Financ. OSDE",
      "rows": [
        {
          "id": "9",
          "label": "GASTO FINANC. OSDE",
          "calculationMethod": "FORMULA",
          "totalFormula": "vh('9.1')/vh('1.1.1')*ref('1.1.1')"
        }
      ]
    },
    {
      "id": "s10",
      "label": "Sección 10: Gastos Tributarios",
      "rows": [
        {
          "id": "10",
          "label": "GASTOS TRIBUTARIOS",
          "helpText": "Contribución a la Seguridad Social (14%) e Impuesto sobre la Fuerza de Trabajo (5%). Aplica sobre los salarios de secciones 2, 4, 6 y 7.",
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA(hijos)",
          "children": [
            {
              "id": "10.1",
              "label": "De ello: -Contrib. Seg. Social (14%)",
              "calculationMethod": "FORMULA",
              "totalFormula": "=ROUND2(( ref('2.1') + ref('4.1.1') + ref('6.1.1') + ref('7.1.1') ) * 0.14 )",
              "formula": "=ROUND2(( ref('2.1') + ref('4.1.1') + ref('6.1.1') + ref('7.1.1') ) * 0.14 )",
              "vhFormula": "=ROUND2 ( ( vh('2.1') + vh('4.1.1') + vh('6.1.1') + vh('7.1.1') ) * 0.14 )"
            },
            {
              "id": "10.2",
              "label": "-Imp. Fuerza Trabajo (5%)",
              "calculationMethod": "FORMULA",
              "totalFormula": "=ROUND2(( ref('2.1') + ref('4.1.1') + ref('6.1.1') + ref('7.1.1') ) * 0.05 )",
              "vhFormula": "=ROUND2 ( ( vh('2.1') + vh('4.1.1') + vh('6.1.1') + vh('7.1.1') ) * 0.05 )"
            }
          ]
        }
      ]
    },
    {
      "id": "s11",
      "label": "Sección 11: TOTAL DE GASTOS",
      "rows": [
        {
          "id": "11",
          "label": "TOTAL DE GASTOS (6+7+8+9+10)",
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA(ref('6'), ref('7'), ref('8'), ref('9'), ref('10'))",
          "formula": "=SUMA(ref('6'), ref('7'), ref('8'), ref('9'), ref('10'))",
          "vhFormula": "=SUM ( vh('6') , vh('7') , vh('8') , vh('9') , vh('10') )"
        }
      ]
    },
    {
      "id": "s12",
      "label": "Sección 12: TOTAL COSTOS Y GASTOS",
      "rows": [
        {
          "id": "12.1",
          "label": "TOTAL COSTOS Y GASTOS (5+11)",
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA(ref('5'), ref('11'))",
          "formula": "=SUMA(ref('5'), ref('11'))",
          "vhFormula": "=SUMA(vh('5'), vh('11'))"
        }
      ]
    },
    {
      "id": "s13",
      "label": "Sección 13: Utilidad",
      "rows": [
        {
          "id": "13.1",
          "label": "Utilidad",
          "helpText": "Porcentaje de utilidad (30% por defecto según Res 148/2023) aplicado sobre el total de costos y gastos. Editable según política de la entidad.",
          "calculationMethod": "FORMULA",
          "totalFormula": "ref('12.1') * 0.3",
          "baseRef": "12.1",
          "vhFormula": "vh('12.1') * 0.3"
        },
        {
          "id": "13.2",
          "label": "Precio antes de Impuesto",
          "calculationMethod": "FORMULA",
          "totalFormula": "ref('12.1') + ref('13.1')",
          "vhFormula": "vh('12.1') + vh('13.1')"
        },
        {
          "id": "13.3",
          "label": "Imp s/Ventas y Serv (13.3)",
          "calculationMethod": "FORMULA",
          "totalFormula": "ref('13.2')/0.9*0.1",
          "formula": "ref('13.2')/0.9*0.1",
          "vhFormula": "vh('13.2')/0.9*0.1"
        }
      ]
    },
    {
      "id": "s14",
      "label": "Sección 14: Precio o Tarifa Final",
      "rows": [
        {
          "id": "14.1",
          "label": "Precio o Tarifa Final",
          "calculationMethod": "FORMULA",
          "totalFormula": "ref('13.2') + ref('13.3')",
          "formula": "ref('13.2') + ref('13.3')",
          "vhFormula": "vh('13.2') + vh('13.3')"
        }
      ]
    },
    {
      "id": "s15",
      "label": "Sección 15: Costo y gasto UNITARIO",
      "rows": [
        {
          "id": "15.1",
          "label": "Costo y gasto UNITARIO",
          "calculationMethod": "FORMULA",
          "totalFormula": "ref('12.1') / quantity",
          "formula": "ref('12.1') / cantidad"
        }
      ]
    },
    {
      "id": "s16",
      "label": "Sección 16: VENTA UNITARIA",
      "rows": [
        {
          "id": "16.1",
          "label": "VENTA UNITARIA",
          "calculationMethod": "FORMULA",
          "totalFormula": "ref('14.1') / quantity",
          "formula": "=ref('14.1') / cantidad"
        }
      ]
    }
  ],
  "annexes": [
    {
      "id": "I",
      "title": "I - DESGLOSE DE MATERIAS PRIMAS Y MATERIALES FUNDAMENTALES",
      "columns": [
        { "key": "no", "label": "NO" },
        { "key": "classification", "label": "Clasificación" },
        { "key": "code", "label": "Código" },
        { "key": "description", "label": "Descripción de la Mat. Prima" },
        { "key": "um", "label": "UM" },
        { "key": "consumption_norm", "label": "Norma de Consumo" },
        { "key": "price", "label": "Precio Unitario" },
        { "key": "total", "label": "Total", "formula": "consumption_norm * price" }
      ],
      "data": []
    },
    {
      "id": "II",
      "title": "II - DESGLOSE DE LOS GASTOS DE SALARIO DE LOS OBREROS",
      "columns": [
        { "key": "no", "label": "NO" },
        { "key": "classification", "label": "Clasificación" },
        { "key": "description", "label": "Descripción del Puesto" },
        { "key": "time_norm", "label": "Horas Mensuales" },
        { "key": "hourly_rate", "label": "Tarifa $/h" },
        { "key": "worker_count", "label": "Cant. Obreros" },
        { "key": "total", "label": "Total", "formula": "time_norm * hourly_rate * worker_count" }
      ],
      "data": []
    },
    {
      "id": "III",
      "title": "III - ANEXO DE DEPRECIACIÓN DE EQUIPOS",
      "columns": [
        { "key": "classification", "label": "Clasif." },
        { "key": "code", "label": "Código" },
        { "key": "name", "label": "Descripción del Equipo" },
        { "key": "initial_value", "label": "Valor de Compra" },
        { "key": "useful_life", "label": "% Deprec." },
        { "key": "quantity", "label": "Tiempo Explot." },
        { "key": "depreciation_cost", "label": "Deprec.", "formula": "(initial_value * (useful_life / 100)) / quantity" }
      ],
      "data": []
    },
    {
      "id": "IV",
      "title": "IV - ANEXO DE OTROS GASTOS DIRECTOS",
      "columns": [
        { "key": "classification", "label": "Clasificación" },
        { "key": "code", "label": "Código" },
        { "key": "description", "label": "Descripción" },
        { "key": "amount", "label": "Importe" }
      ],
      "data": []
    },
    {
      "id": "V",
      "title": "V - ANEXO DE DIETAS DE TRABAJADORES",
      "columns": [
        { "key": "classification", "label": "Clasificación" },
        { "key": "code", "label": "Código" },
        { "key": "worker_name", "label": "Nombre del Trabajador" },
        { "key": "daily_allowance", "label": "Gasto de Dieta Diario" },
        { "key": "days", "label": "Días" },
        { "key": "total", "label": "Total", "formula": "daily_allowance * days" }
      ],
      "data": []
    }
  ],
  "signature": { "prepared_by": "Elaborado por:", "approved_by": "Aprobado por:" },
  "id": "costpro-reinicio",
  "name": "Plantilla de Reinicio",
  "version": "5.7.25",
  "metadata": {
    "author": "Jules",
    "description": "Plantilla base con metodología de 16 secciones y carga dinámica de encabezado desde Anexo I.",
    "integrity": "full"
  }
};

export default template;
