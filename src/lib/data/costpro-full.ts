
import { CostSheetDataContract } from '@/contracts/cost-sheet';

const template: CostSheetDataContract = {
  "id": "costpro-full-v5",
  "name": "Producción de Pan Artistas",
  "version": "5.0.0",
  "metadata": {
    "author": "CostPro Enterprise"
  },
  "header": {
    "code": "FC-PAN-2026",
    "name": "Producción de Pan Artistas",
    "date": "2026-02-27",
    "unit": "Kilogramos",
    "quantity": 100,
    "currency": "CUP",
    "category": "ORGANISMO",
    "type": "EMPRESA",
    "product_code": "PROD-PAN-001",
    "company": "EMPRESA ALIMENTARIA",
    "organism": "MINAL",
    "union": "UNION MOLINERA",
    "destination": "Producción",
    "production_level": 1000,
    "capacity_utilization": 85.5,
    "sale_price": 12.50,
    "client": "Población"
  },
  "sections": [
    {
      "id": "s1",
      "label": "Sección 1: Gasto Material",
      "rows": [
        {
          "id": "1",
          "label": "GASTO MATERIAL",
          "valor_historico": 0,
          "value": 0,
          "base_ref": "",
          "calculation_method": "FORMULA",
          "total_formula": "=SUMA(hijos)",
          "formula": "=SUMA(hijos)",
          "is_percent": false,
          "help_text": "",
          "children": [
            {
              "id": "1.1",
              "label": "De ello: - Insumos (MP)",
              "valor_historico": 0,
              "value": 0,
              "base_ref": "I",
              "calculation_method": "FORMULA",
              "total_formula": "AnexoI",
              "formula": "AnexoI",
              "is_percent": false,
              "help_text": "",
              "children": []
            },
            {
              "id": "1.2",
              "label": "- Combustibles y lubricantes",
              "valor_historico": 0,
              "value": 0,
              "base_ref": "I",
              "calculation_method": "FORMULA",
              "total_formula": "AnexoI",
              "formula": "AnexoI",
              "is_percent": false,
              "help_text": "",
              "children": []
            },
            {
              "id": "1.3",
              "label": "- Energía",
              "valor_historico": 0,
              "value": 0,
              "base_ref": "I",
              "calculation_method": "FORMULA",
              "total_formula": "AnexoI",
              "formula": "AnexoI",
              "is_percent": false,
              "help_text": "",
              "children": []
            },
            {
              "id": "1.4",
              "label": "- Agua",
              "valor_historico": 0,
              "value": 0,
              "base_ref": "I",
              "calculation_method": "FORMULA",
              "total_formula": "AnexoI",
              "formula": "AnexoI",
              "is_percent": false,
              "help_text": "",
              "children": []
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
          "valor_historico": 0,
          "value": 0,
          "base_ref": "",
          "calculation_method": "FORMULA",
          "total_formula": "=SUMA(hijos)",
          "formula": "=SUMA(hijos)",
          "is_percent": false,
          "help_text": "",
          "children": [
            {
              "id": "2.1",
              "label": "De ello: Salarios",
              "valor_historico": 0,
              "value": 0,
              "base_ref": "II",
              "calculation_method": "FORMULA",
              "total_formula": "AnexoII",
              "formula": "AnexoII",
              "is_percent": false,
              "help_text": "",
              "children": []
            },
            {
              "id": "2.2",
              "label": "Vacaciones",
              "valor_historico": 0,
              "value": 0,
              "base_ref": "2.1",
              "calculation_method": "FORMULA",
              "total_formula": "=PCT(ref('2.1'), 9.09)",
              "formula": "=PCT(ref('2.1'), 9.09)",
              "is_percent": true,
              "help_text": "",
              "children": []
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
          "valor_historico": 0,
          "value": 0,
          "base_ref": "",
          "calculation_method": "FORMULA",
          "total_formula": "=SUMA(hijos)",
          "formula": "=SUMA(hijos)",
          "is_percent": false,
          "help_text": "",
          "children": [
            {
              "id": "3.1",
              "label": "DE ELLO: DEPRECIACIÓN (TOTAL)",
              "valor_historico": 0,
              "value": 0,
              "base_ref": "",
              "calculation_method": "FORMULA",
              "total_formula": "=SUMA(hijos)",
              "formula": "=SUMA(hijos)",
              "is_percent": false,
              "help_text": "",
              "children": [
                {
                  "id": "3.1.1",
                  "label": "-Edificios",
                  "valor_historico": 0,
                  "value": 0,
                  "base_ref": "III",
                  "calculation_method": "FORMULA",
                  "total_formula": "AnexoIII",
                  "formula": "AnexoIII",
                  "is_percent": false,
                  "help_text": "",
                  "children": []
                },
                {
                  "id": "3.1.2",
                  "label": "-Otras Construcciones",
                  "valor_historico": 0,
                  "value": 0,
                  "base_ref": "III",
                  "calculation_method": "FORMULA",
                  "total_formula": "AnexoIII",
                  "formula": "AnexoIII",
                  "is_percent": false,
                  "help_text": "",
                  "children": []
                },
                {
                  "id": "3.1.3",
                  "label": "-Maquinas y eq. energéticos",
                  "valor_historico": 0,
                  "value": 0,
                  "base_ref": "III",
                  "calculation_method": "FORMULA",
                  "total_formula": "AnexoIII",
                  "formula": "AnexoIII",
                  "is_percent": false,
                  "help_text": "",
                  "children": []
                },
                {
                  "id": "3.1.4",
                  "label": "-Maquinas y eq. productivos",
                  "valor_historico": 0,
                  "value": 0,
                  "base_ref": "III",
                  "calculation_method": "FORMULA",
                  "total_formula": "AnexoIII",
                  "formula": "AnexoIII",
                  "is_percent": false,
                  "help_text": "",
                  "children": []
                },
                {
                  "id": "3.1.5",
                  "label": "-Aparatos y eq. técnicos",
                  "valor_historico": 0,
                  "value": 0,
                  "base_ref": "III",
                  "calculation_method": "FORMULA",
                  "total_formula": "AnexoIII",
                  "formula": "AnexoIII",
                  "is_percent": false,
                  "help_text": "",
                  "children": []
                }
              ]
            },
            {
              "id": "3.2",
              "label": "-Mantenimiento",
              "valor_historico": 0,
              "value": 0,
              "base_ref": "IV",
              "calculation_method": "FORMULA",
              "total_formula": "AnexoIV",
              "formula": "AnexoIV",
              "is_percent": false,
              "help_text": "",
              "children": []
            },
            {
              "id": "3.3",
              "label": "-Servicios contratados",
              "valor_historico": 0,
              "value": 0,
              "base_ref": "IV",
              "calculation_method": "FORMULA",
              "total_formula": "AnexoIV",
              "formula": "AnexoIV",
              "is_percent": false,
              "help_text": "",
              "children": []
            },
            {
              "id": "3.4",
              "label": "-Medios de protección",
              "valor_historico": 0,
              "value": 0,
              "base_ref": "IV",
              "calculation_method": "FORMULA",
              "total_formula": "AnexoIV",
              "formula": "AnexoIV",
              "is_percent": false,
              "help_text": "",
              "children": []
            },
            {
              "id": "3.5",
              "label": "-Alquiler locales",
              "valor_historico": 0,
              "value": 0,
              "base_ref": "IV",
              "calculation_method": "FORMULA",
              "total_formula": "AnexoIV",
              "formula": "AnexoIV",
              "is_percent": false,
              "help_text": "",
              "children": []
            },
            {
              "id": "3.6",
              "label": "-Alimentación",
              "valor_historico": 0,
              "value": 0,
              "base_ref": "IV",
              "calculation_method": "FORMULA",
              "total_formula": "AnexoIV",
              "formula": "AnexoIV",
              "is_percent": false,
              "help_text": "",
              "children": []
            },
            {
              "id": "3.7",
              "label": "-Dietas",
              "valor_historico": 0,
              "value": 0,
              "base_ref": "V",
              "calculation_method": "FORMULA",
              "total_formula": "AnexoV",
              "formula": "AnexoV",
              "is_percent": false,
              "help_text": "",
              "children": []
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
          "valor_historico": 0,
          "value": 0,
          "base_ref": "",
          "calculation_method": "FORMULA",
          "total_formula": "=SUMA(hijos)",
          "formula": "=SUMA(hijos)",
          "is_percent": false,
          "help_text": "",
          "children": [
            {
              "id": "4.1",
              "label": "De ello: Salarios",
              "valor_historico": 0,
              "value": 0,
              "base_ref": "",
              "calculation_method": "ValorFijo",
              "total_formula": "",
              "formula": "",
              "is_percent": false,
              "help_text": "",
              "children": []
            },
            {
              "id": "4.2",
              "label": "-Otros gastos",
              "valor_historico": 0,
              "value": 0,
              "base_ref": "",
              "calculation_method": "ValorFijo",
              "total_formula": "",
              "formula": "",
              "is_percent": false,
              "help_text": "",
              "children": []
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
          "valor_historico": 0,
          "value": 0,
          "base_ref": "",
          "calculation_method": "FORMULA",
          "total_formula": "=SUMA ( ref('1') , ref('2') , ref('3') , ref('4') )",
          "formula": "=SUMA ( ref('1') , ref('2') , ref('3') , ref('4') )",
          "is_percent": false,
          "help_text": "",
          "children": []
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
          "valor_historico": 0,
          "value": 0,
          "base_ref": "",
          "calculation_method": "FORMULA",
          "total_formula": "=SUMA(hijos)",
          "formula": "=SUMA(hijos)",
          "is_percent": false,
          "help_text": "",
          "children": [
            {
              "id": "6.1",
              "label": "- Salarios",
              "valor_historico": 0,
              "value": 0,
              "base_ref": "",
              "calculation_method": "ValorFijo",
              "total_formula": "",
              "formula": "",
              "is_percent": false,
              "help_text": "",
              "children": []
            },
            {
              "id": "6.2",
              "label": "- Comunicación",
              "valor_historico": 0,
              "value": 0,
              "base_ref": "",
              "calculation_method": "ValorFijo",
              "total_formula": "",
              "formula": "",
              "is_percent": false,
              "help_text": "",
              "children": []
            },
            {
              "id": "6.3",
              "label": "- Depreciacion",
              "valor_historico": 0,
              "value": 0,
              "base_ref": "",
              "calculation_method": "ValorFijo",
              "total_formula": "",
              "formula": "",
              "is_percent": false,
              "help_text": "",
              "children": []
            },
            {
              "id": "6.4",
              "label": "- Energia",
              "valor_historico": 0,
              "value": 0,
              "base_ref": "",
              "calculation_method": "ValorFijo",
              "total_formula": "",
              "formula": "",
              "is_percent": false,
              "help_text": "",
              "children": []
            },
            {
              "id": "6.5",
              "label": "- Otros Gastos Admin.",
              "valor_historico": 0,
              "value": 0,
              "base_ref": "",
              "calculation_method": "ValorFijo",
              "total_formula": "",
              "formula": "",
              "is_percent": false,
              "help_text": "",
              "children": []
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
          "valor_historico": 0,
          "value": 0,
          "base_ref": "",
          "calculation_method": "FORMULA",
          "total_formula": "=SUMA(hijos)",
          "formula": "=SUMA(hijos)",
          "is_percent": false,
          "help_text": "",
          "children": [
            {
              "id": "7.1",
              "label": "- Salarios",
              "valor_historico": 0,
              "value": 0,
              "base_ref": "",
              "calculation_method": "ValorFijo",
              "total_formula": "",
              "formula": "",
              "is_percent": false,
              "help_text": "",
              "children": []
            },
            {
              "id": "7.2",
              "label": "- Otros gastos",
              "valor_historico": 0,
              "value": 0,
              "base_ref": "",
              "calculation_method": "ValorFijo",
              "total_formula": "",
              "formula": "",
              "is_percent": false,
              "help_text": "",
              "children": []
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
          "valor_historico": 0,
          "value": 0,
          "base_ref": "",
          "calculation_method": "FORMULA",
          "total_formula": "=SUMA(hijos)",
          "formula": "=SUMA(hijos)",
          "is_percent": false,
          "help_text": "",
          "children": [
            {
              "id": "8.1",
              "label": "- Intereses y comisiones",
              "valor_historico": 0,
              "value": 0,
              "base_ref": "",
              "calculation_method": "ValorFijo",
              "total_formula": "",
              "formula": "",
              "is_percent": false,
              "help_text": "",
              "children": []
            },
            {
              "id": "8.2",
              "label": "- Otros Gastos Financ.",
              "valor_historico": 0,
              "value": 0,
              "base_ref": "",
              "calculation_method": "ValorFijo",
              "total_formula": "",
              "formula": "",
              "is_percent": false,
              "help_text": "",
              "children": []
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
          "valor_historico": 0,
          "value": 0,
          "base_ref": "",
          "calculation_method": "ValorFijo",
          "total_formula": "",
          "formula": "",
          "is_percent": false,
          "help_text": "",
          "children": []
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
          "valor_historico": 0,
          "value": 0,
          "base_ref": "",
          "calculation_method": "FORMULA",
          "total_formula": "=SUMA(hijos)",
          "formula": "=SUMA(hijos)",
          "is_percent": false,
          "help_text": "",
          "children": [
            {
              "id": "10.1",
              "label": "De ello: -Contrib. Seg. Social (14%)",
              "valor_historico": 0,
              "value": 0,
              "base_ref": "2.1",
              "calculation_method": "FORMULA",
              "total_formula": "=ROUND2(PCT(ref('2.1') + ref('4.1') + ref('6.1') + ref('7.1'), 14))",
              "formula": "=ROUND2(PCT(ref('2.1') + ref('4.1') + ref('6.1') + ref('7.1'), 14))",
              "is_percent": false,
              "help_text": "",
              "children": []
            },
            {
              "id": "10.2",
              "label": "-Imp. Fuerza Trabajo (5%)",
              "valor_historico": 0,
              "value": 0,
              "base_ref": "2.1",
              "calculation_method": "FORMULA",
              "total_formula": "=ROUND2(PCT(ref('2.1') + ref('4.1') + ref('6.1') + ref('7.1'), 5))",
              "formula": "=ROUND2(PCT(ref('2.1') + ref('4.1') + ref('6.1') + ref('7.1'), 5))",
              "is_percent": false,
              "help_text": "",
              "children": []
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
          "valor_historico": 0,
          "value": 0,
          "base_ref": "",
          "calculation_method": "FORMULA",
          "total_formula": "=SUMA(ref('6'), ref('7'), ref('8'), ref('9'), ref('10'))",
          "formula": "=SUMA(ref('6'), ref('7'), ref('8'), ref('9'), ref('10'))",
          "is_percent": false,
          "help_text": "",
          "children": []
        }
      ]
    },
    {
      "id": "s12",
      "label": "Sección 12: TOTAL COSTOS Y GASTOS",
      "rows": [
        {
          "id": "12",
          "label": "TOTAL COSTOS Y GASTOS (5+11)",
          "valor_historico": 0,
          "value": 0,
          "base_ref": "",
          "calculation_method": "FORMULA",
          "total_formula": "=SUMA ( ref('5') , ref('11') )",
          "formula": "=SUMA ( ref('5') , ref('11') )",
          "is_percent": false,
          "help_text": "",
          "children": []
        }
      ]
    },
    {
      "id": "s13",
      "label": "Sección 13: Utilidad",
      "rows": [
        {
          "id": "13",
          "label": "Utilidad",
          "valor_historico": 0,
          "value": 0,
          "base_ref": "12",
          "calculation_method": "FORMULA",
          "total_formula": "ref('12') * 0.3",
          "formula": "ref('12') * 0.3",
          "is_percent": false,
          "help_text": "",
          "children": []
        },
        {
          "id": "13.1",
          "label": "Precio antes de Impuesto",
          "valor_historico": 0,
          "value": 0,
          "base_ref": "",
          "calculation_method": "FORMULA",
          "total_formula": "ref('12') + ref('13')",
          "formula": "ref('12') + ref('13')",
          "is_percent": false,
          "help_text": "",
          "children": []
        },
        {
          "id": "13.2",
          "label": "Imp s/Ventas y Serv",
          "valor_historico": 0,
          "value": 0,
          "base_ref": "",
          "calculation_method": "FORMULA",
          "total_formula": "ref('14') - ref('13.1')",
          "formula": "ref('14') - ref('13.1')",
          "is_percent": false,
          "help_text": "",
          "children": []
        }
      ]
    },
    {
      "id": "s14",
      "label": "Sección 14: Precio o Tarifa Final",
      "rows": [
        {
          "id": "14",
          "label": "Precio o Tarifa Final",
          "valor_historico": 0,
          "value": 0,
          "base_ref": "",
          "calculation_method": "FORMULA",
          "total_formula": "ref('13.1') / 0.9",
          "formula": "ref('13.1') / 0.9",
          "is_percent": false,
          "help_text": "",
          "children": []
        }
      ]
    },
    {
      "id": "s15",
      "label": "Sección 15: Costo y gasto UNITARIO",
      "rows": [
        {
          "id": "15",
          "label": "Costo y gasto UNITARIO",
          "valor_historico": 0,
          "value": 0,
          "base_ref": "",
          "calculation_method": "FORMULA",
          "total_formula": "=ref('12') / cantidad",
          "formula": "=ref('12') / cantidad",
          "is_percent": false,
          "help_text": "",
          "children": []
        }
      ]
    },
    {
      "id": "s16",
      "label": "Sección 16: VENTA UNITARIA",
      "rows": [
        {
          "id": "16",
          "label": "VENTA UNITARIA",
          "valor_historico": 0,
          "value": 0,
          "base_ref": "",
          "calculation_method": "FORMULA",
          "total_formula": "=ref('14') / cantidad",
          "formula": "=ref('14') / cantidad",
          "is_percent": false,
          "help_text": "",
          "children": []
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
  "signature": {
    "prepared_by": "Elaborado por:",
    "approved_by": "Aprobado por:"
  },
  "footer": "FIN DEL DOCUMENTO • GENERADO AUTOMÁTICAMENTE POR COSTPRO V1.0"
};

export default template;
