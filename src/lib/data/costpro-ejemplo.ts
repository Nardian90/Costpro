
import { CostSheetDataContract } from '@/contracts/cost-sheet';

const template: CostSheetDataContract = {
  "id": "costpro-full-v5",
  "name": "Producción de Pan de Corteza Dura (Lote Especial)",
  "version": "5.7.25",
  "metadata": {
    "author": "Eli - Senior Specialist",
    "description": "Ficha de referencia para estudio de costos industriales complejos con integración de anexos y fórmulas dinámicas."
  },
  "header": {
    "code": "=GET_ANEXO_FILA_DATO(\"I\", 1, \"code\")",
    "name": "=GET_ANEXO_FILA_DATO(\"I\", 1, \"description\")",
    "date": new Date().toISOString().split('T')[0],
    "unit": "=GET_ANEXO_FILA_DATO(\"I\", 1, \"um\")",
    "quantity": "=GET_ANEXO_FILA_DATO(\"I\", 1, \"consumption_norm\")",
    "currency": "CUP",
    "category": "",
    "type": "EMPRESA",
    "product_code": "=GET_ANEXO_FILA_DATO(\"I\", 1, \"code\")",
    "company": "PANIFICADORA NACIONAL S.A.",
    "organism": "MINAL",
    "union": "UNION MOLINERA",
    "destination": "Consumo Social",
    "production_level": 1200,
    "capacity_utilization": 83.33,
    "sale_price": "=GET_FILA_DATO(\"16.1\", \"total\")",
    "client": ""
  },
  "sections": [
    {
      "id": "s1",
      "label": "Sección 1: Gasto Material",
      "rows": [
        {
          "id": "1",
          "label": "GASTO MATERIAL",
          "valorHistorico": 0,
          "value": 0,
          "baseDeCalculoRef": "",
          "baseRef": "",
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA(hijos)",
          "formula": "=SUMA(hijos)",
          "isPercent": false,
          "helpText": "",
          "children": [
            {
              "id": "1.1",
              "label": "De ello: - Insumos (MP)",
              "valorHistorico": 365464.56,
              "value": 0,
              "baseDeCalculoRef": "I",
              "baseRef": "I",
              "calculationMethod": "FORMULA",
              "totalFormula": "AnexoI",
              "formula": "AnexoI",
              "isPercent": false,
              "helpText": "",
              "children": [],
              "vhFormula": ""
            },
            {
              "id": "1.2",
              "label": "- Combustibles y lubricantes",
              "valorHistorico": 0,
              "value": 0,
              "baseDeCalculoRef": "I",
              "baseRef": "I",
              "calculationMethod": "FORMULA",
              "totalFormula": "AnexoI",
              "formula": "AnexoI",
              "isPercent": false,
              "helpText": "",
              "children": []
            },
            {
              "id": "1.3",
              "label": "- Energía",
              "valorHistorico": 0,
              "value": 0,
              "baseDeCalculoRef": "I",
              "baseRef": "I",
              "calculationMethod": "FORMULA",
              "totalFormula": "AnexoI",
              "formula": "AnexoI",
              "isPercent": false,
              "helpText": "",
              "children": []
            },
            {
              "id": "1.4",
              "label": "- Agua",
              "valorHistorico": 0,
              "value": 0,
              "baseDeCalculoRef": "I",
              "baseRef": "I",
              "calculationMethod": "FORMULA",
              "totalFormula": "AnexoI",
              "formula": "AnexoI",
              "isPercent": false,
              "helpText": "",
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
          "valorHistorico": 0,
          "value": 0,
          "baseDeCalculoRef": "",
          "baseRef": "",
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA(hijos)",
          "formula": "=SUMA(hijos)",
          "isPercent": false,
          "helpText": "",
          "children": [
            {
              "id": "2.1",
              "label": "De ello: Salarios",
              "valorHistorico": 36000,
              "value": 0,
              "baseDeCalculoRef": "II",
              "baseRef": "II",
              "calculationMethod": "FORMULA",
              "totalFormula": "AnexoII",
              "formula": "AnexoII",
              "isPercent": false,
              "helpText": "",
              "children": [],
              "vhFormula": ""
            },
            {
              "id": "2.2",
              "label": "Vacaciones",
              "valorHistorico": 3272.4,
              "value": 0,
              "baseDeCalculoRef": "2.1",
              "baseRef": "2.1",
              "calculationMethod": "FORMULA",
              "totalFormula": "=PCT(ref('2.1'), 9.09)",
              "formula": "=PCT(ref('2.1'), 9.09)",
              "isPercent": true,
              "helpText": "",
              "children": [],
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
          "valorHistorico": 0,
          "value": 0,
          "baseDeCalculoRef": "",
          "baseRef": "",
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA(hijos)",
          "formula": "=SUMA(hijos)",
          "isPercent": false,
          "helpText": "",
          "children": [
            {
              "id": "3.1",
              "label": "DE ELLO: DEPRECIACIÓN (TOTAL)",
              "valorHistorico": 0,
              "value": 0,
              "baseDeCalculoRef": "",
              "baseRef": "",
              "calculationMethod": "FORMULA",
              "totalFormula": "=SUMA(hijos)",
              "formula": "=SUMA(hijos)",
              "isPercent": false,
              "helpText": "",
              "children": [
                {
                  "id": "3.1.1",
                  "label": "-Edificios",
                  "valorHistorico": 0,
                  "value": 0,
                  "baseDeCalculoRef": "III",
                  "baseRef": "III",
                  "calculationMethod": "FORMULA",
                  "totalFormula": "AnexoIII",
                  "formula": "AnexoIII",
                  "isPercent": false,
                  "helpText": "",
                  "children": []
                },
                {
                  "id": "3.1.2",
                  "label": "-Otras Construcciones",
                  "valorHistorico": 0,
                  "value": 0,
                  "baseDeCalculoRef": "III",
                  "baseRef": "III",
                  "calculationMethod": "FORMULA",
                  "totalFormula": "AnexoIII",
                  "formula": "AnexoIII",
                  "isPercent": false,
                  "helpText": "",
                  "children": []
                },
                {
                  "id": "3.1.3",
                  "label": "-Maquinas y eq. energéticos",
                  "valorHistorico": 0,
                  "value": 0,
                  "baseDeCalculoRef": "III",
                  "baseRef": "III",
                  "calculationMethod": "FORMULA",
                  "totalFormula": "AnexoIII",
                  "formula": "AnexoIII",
                  "isPercent": false,
                  "helpText": "",
                  "children": []
                },
                {
                  "id": "3.1.4",
                  "label": "-Maquinas y eq. productivos",
                  "valorHistorico": 0,
                  "value": 0,
                  "baseDeCalculoRef": "III",
                  "baseRef": "III",
                  "calculationMethod": "FORMULA",
                  "totalFormula": "AnexoIII",
                  "formula": "AnexoIII",
                  "isPercent": false,
                  "helpText": "",
                  "children": []
                },
                {
                  "id": "3.1.5",
                  "label": "-Aparatos y eq. técnicos",
                  "valorHistorico": 0,
                  "value": 0,
                  "baseDeCalculoRef": "III",
                  "baseRef": "III",
                  "calculationMethod": "FORMULA",
                  "totalFormula": "AnexoIII",
                  "formula": "AnexoIII",
                  "isPercent": false,
                  "helpText": "",
                  "children": []
                }
              ]
            },
            {
              "id": "3.2",
              "label": "-Mantenimiento",
              "valorHistorico": 0,
              "value": 0,
              "baseDeCalculoRef": "IV",
              "baseRef": "IV",
              "calculationMethod": "FORMULA",
              "totalFormula": "AnexoIV",
              "formula": "AnexoIV",
              "isPercent": false,
              "helpText": "",
              "children": []
            },
            {
              "id": "3.3",
              "label": "-Servicios contratados",
              "valorHistorico": 0,
              "value": 0,
              "baseDeCalculoRef": "IV",
              "baseRef": "IV",
              "calculationMethod": "FORMULA",
              "totalFormula": "AnexoIV",
              "formula": "AnexoIV",
              "isPercent": false,
              "helpText": "",
              "children": []
            },
            {
              "id": "3.4",
              "label": "-Medios de protección",
              "valorHistorico": 0,
              "value": 0,
              "baseDeCalculoRef": "IV",
              "baseRef": "IV",
              "calculationMethod": "FORMULA",
              "totalFormula": "AnexoIV",
              "formula": "AnexoIV",
              "isPercent": false,
              "helpText": "",
              "children": []
            },
            {
              "id": "3.5",
              "label": "-Alquiler locales",
              "valorHistorico": 0,
              "value": 0,
              "baseDeCalculoRef": "IV",
              "baseRef": "IV",
              "calculationMethod": "FORMULA",
              "totalFormula": "AnexoIV",
              "formula": "AnexoIV",
              "isPercent": false,
              "helpText": "",
              "children": []
            },
            {
              "id": "3.6",
              "label": "-Alimentación",
              "valorHistorico": 0,
              "value": 0,
              "baseDeCalculoRef": "IV",
              "baseRef": "IV",
              "calculationMethod": "FORMULA",
              "totalFormula": "AnexoIV",
              "formula": "AnexoIV",
              "isPercent": false,
              "helpText": "",
              "children": []
            },
            {
              "id": "3.7",
              "label": "-Dietas",
              "valorHistorico": 0,
              "value": 0,
              "baseDeCalculoRef": "V",
              "baseRef": "V",
              "calculationMethod": "FORMULA",
              "totalFormula": "AnexoV",
              "formula": "AnexoV",
              "isPercent": false,
              "helpText": "",
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
          "valorHistorico": 0,
          "value": 0,
          "baseDeCalculoRef": "",
          "baseRef": "",
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA(hijos)",
          "formula": "=SUMA(hijos)",
          "isPercent": false,
          "helpText": "",
          "children": [
            {
              "id": "4.1",
              "label": "De ello: Salarios",
              "valorHistorico": 0,
              "value": 0,
              "baseDeCalculoRef": "",
              "baseRef": "",
              "calculationMethod": "FORMULA",
              "totalFormula": "",
              "formula": "vh('4.1.1')/vh('1.1.1')*ref('1.1.1')",
              "isPercent": false,
              "helpText": "",
              "children": []
            },
            {
              "id": "4.2",
              "label": "-Otros gastos",
              "valorHistorico": 0,
              "value": 0,
              "baseDeCalculoRef": "",
              "baseRef": "",
              "calculationMethod": "FORMULA",
              "totalFormula": "",
              "formula": "vh('4.1.1')/vh('1.1.1')*ref('1.1.1')",
              "isPercent": false,
              "helpText": "",
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
          "valorHistorico": 0,
          "value": 0,
          "baseDeCalculoRef": "",
          "baseRef": "",
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA ( ref('1') , ref('2') , ref('3') , ref('4') )",
          "formula": "=SUMA ( ref('1') , ref('2') , ref('3') , ref('4') )",
          "isPercent": false,
          "helpText": "",
          "children": [],
          "vhFormula": "=SUMA ( vh('1') , vh('2') , vh('3') , vh('4') )"
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
          "valorHistorico": 0,
          "value": 0,
          "baseDeCalculoRef": "",
          "baseRef": "",
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA(hijos)",
          "formula": "=SUMA(hijos)",
          "isPercent": false,
          "helpText": "",
          "children": [
            {
              "id": "6.1",
              "label": "- Salarios",
              "valorHistorico": 37931.5,
              "value": 0,
              "baseDeCalculoRef": "",
              "baseRef": "",
              "calculationMethod": "FORMULA",
              "totalFormula": "",
              "formula": "vh('6.1.1')/vh('1.1.1')*ref('1.1.1')",
              "isPercent": false,
              "helpText": "",
              "children": [],
              "vhFormula": ""
            },
            {
              "id": "6.2",
              "label": "- Comunicación",
              "valorHistorico": 0,
              "value": 0,
              "baseDeCalculoRef": "",
              "baseRef": "",
              "calculationMethod": "FORMULA",
              "totalFormula": "",
              "formula": "vh('6.1.2')/vh('1.1.1')*ref('1.1.1')",
              "isPercent": false,
              "helpText": "",
              "children": []
            },
            {
              "id": "6.3",
              "label": "- Depreciacion",
              "valorHistorico": 0,
              "value": 0,
              "baseDeCalculoRef": "",
              "baseRef": "",
              "calculationMethod": "FORMULA",
              "totalFormula": "",
              "formula": "vh('6.1.3')/vh('1.1.1')*ref('1.1.1')",
              "isPercent": false,
              "helpText": "",
              "children": []
            },
            {
              "id": "6.4",
              "label": "- Energia",
              "valorHistorico": 0,
              "value": 0,
              "baseDeCalculoRef": "",
              "baseRef": "",
              "calculationMethod": "FORMULA",
              "totalFormula": "",
              "formula": "vh('6.1.4')/vh('1.1.1')*ref('1.1.1')",
              "isPercent": false,
              "helpText": "",
              "children": []
            },
            {
              "id": "6.5",
              "label": "- Otros Gastos Admin.",
              "valorHistorico": 37205,
              "value": 0,
              "baseDeCalculoRef": "",
              "baseRef": "",
              "calculationMethod": "FORMULA",
              "totalFormula": "",
              "formula": "vh('6.1.5')/vh('1.1.1')*ref('1.1.1')",
              "isPercent": false,
              "helpText": "",
              "children": [],
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
          "valorHistorico": 0,
          "value": 0,
          "baseDeCalculoRef": "",
          "baseRef": "",
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA(hijos)",
          "formula": "=SUMA(hijos)",
          "isPercent": false,
          "helpText": "",
          "children": [
            {
              "id": "7.1",
              "label": "- Salarios",
              "valorHistorico": 0,
              "value": 0,
              "baseDeCalculoRef": "",
              "baseRef": "",
              "calculationMethod": "FORMULA",
              "totalFormula": "",
              "formula": "vh('7.1.1')/vh('1.1.1')*ref('1.1.1')",
              "isPercent": false,
              "helpText": "",
              "children": []
            },
            {
              "id": "7.2",
              "label": "- Otros gastos",
              "valorHistorico": 0,
              "value": 0,
              "baseDeCalculoRef": "",
              "baseRef": "",
              "calculationMethod": "FORMULA",
              "totalFormula": "",
              "formula": "vh('7.1.2')/vh('1.1.1')*ref('1.1.1')",
              "isPercent": false,
              "helpText": "",
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
          "valorHistorico": 0,
          "value": 0,
          "baseDeCalculoRef": "",
          "baseRef": "",
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA(hijos)",
          "formula": "=SUMA(hijos)",
          "isPercent": false,
          "helpText": "",
          "children": [
            {
              "id": "8.1",
              "label": "- Intereses y comisiones",
              "valorHistorico": 3911.31,
              "value": 0,
              "baseDeCalculoRef": "",
              "baseRef": "",
              "calculationMethod": "FORMULA",
              "totalFormula": "",
              "formula": "vh('8.1.1')/vh('1.1.1')*ref('1.1.1')",
              "isPercent": false,
              "helpText": "",
              "children": [],
              "vhFormula": ""
            },
            {
              "id": "8.2",
              "label": "- Otros Gastos Financ.",
              "valorHistorico": 6652.22,
              "value": 0,
              "baseDeCalculoRef": "",
              "baseRef": "",
              "calculationMethod": "FORMULA",
              "totalFormula": "",
              "formula": "=0",
              "isPercent": false,
              "helpText": "",
              "children": [],
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
          "valorHistorico": 0,
          "value": 0,
          "baseDeCalculoRef": "",
          "baseRef": "",
          "calculationMethod": "FORMULA",
          "totalFormula": "",
          "formula": "vh('9.1')/vh('1.1.1')*ref('1.1.1')",
          "isPercent": false,
          "helpText": "",
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
          "valorHistorico": 0,
          "value": 0,
          "baseDeCalculoRef": "",
          "baseRef": "",
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA(hijos)",
          "formula": "=SUMA(hijos)",
          "isPercent": false,
          "helpText": "",
          "children": [
            {
              "id": "10.1",
              "label": "De ello: -Contrib. Seg. Social (14%)",
              "valorHistorico": 10843.54,
              "value": 0,
              "baseDeCalculoRef": "2.1",
              "baseRef": "2.1",
              "calculationMethod": "FORMULA",
              "totalFormula": "=ROUND2(PCT(ref('2.1') + ref('4.1') + ref('6.1') + ref('7.1'), 14))",
              "formula": "=ROUND2(PCT(ref('2.1') + ref('4.1') + ref('6.1') + ref('7.1'), 14))",
              "isPercent": false,
              "helpText": "",
              "children": [],
              "vhFormula": ""
            },
            {
              "id": "10.2",
              "label": "-Imp. Fuerza Trabajo (5%)",
              "valorHistorico": 3872.7,
              "value": 0,
              "baseDeCalculoRef": "2.1",
              "baseRef": "2.1",
              "calculationMethod": "FORMULA",
              "totalFormula": "=ROUND2(PCT(ref('2.1') + ref('4.1') + ref('6.1') + ref('7.1'), 5))",
              "formula": "=ROUND2(PCT(ref('2.1') + ref('4.1') + ref('6.1') + ref('7.1'), 5))",
              "isPercent": false,
              "helpText": "",
              "children": [],
              "vhFormula": ""
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
          "valorHistorico": 0,
          "value": 0,
          "baseDeCalculoRef": "",
          "baseRef": "",
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA(ref('6'), ref('7'), ref('8'), ref('9'), ref('10'))",
          "formula": "=SUMA(ref('6'), ref('7'), ref('8'), ref('9'), ref('10'))",
          "isPercent": false,
          "helpText": "",
          "children": [],
          "vhFormula": "=SUMA ( vh ( 6 ) , vh ( 7 ) , vh ( 8 ) , vh ( 9 ) , vh ( 10 ) )"
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
          "valorHistorico": 0,
          "value": 0,
          "baseDeCalculoRef": "",
          "baseRef": "",
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA ( ref('5') , ref('11') )",
          "formula": "=SUMA ( ref('5') , ref('11') )",
          "isPercent": false,
          "helpText": "",
          "children": [],
          "vhFormula": "=SUMA ( vh('5') , vh('11') )"
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
          "valorHistorico": 93547.55,
          "value": 0,
          "baseDeCalculoRef": "12",
          "baseRef": "12",
          "calculationMethod": "FORMULA",
          "totalFormula": "ref('12') * 0.3",
          "formula": "ref('12') * 0.3",
          "isPercent": false,
          "helpText": "",
          "children": [],
          "vhFormula": ""
        },
        {
          "id": "13.1",
          "label": "Precio antes de Impuesto",
          "valorHistorico": 0,
          "value": 0,
          "baseDeCalculoRef": "",
          "baseRef": "",
          "calculationMethod": "FORMULA",
          "totalFormula": "ref('12') + ref('13')",
          "formula": "ref('12') + ref('13')",
          "isPercent": false,
          "helpText": "",
          "children": [],
          "vhFormula": "vh('12') + vh('13')"
        },
        {
          "id": "13.2",
          "label": "Imp s/Ventas y Serv",
          "valorHistorico": 66522.21,
          "value": 0,
          "baseDeCalculoRef": "",
          "baseRef": "",
          "calculationMethod": "FORMULA",
          "totalFormula": "ref('13.2')/0.9*0.1",
          "formula": "ref('13.2')/0.9*0.1",
          "isPercent": false,
          "helpText": "",
          "children": [],
          "vhFormula": ""
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
          "valorHistorico": 0,
          "value": 0,
          "baseDeCalculoRef": "",
          "baseRef": "",
          "calculationMethod": "FORMULA",
          "totalFormula": "ref('13.2') +ref('13.3')",
          "formula": "ref('13.2') +ref('13.3')",
          "isPercent": false,
          "helpText": "",
          "children": [],
          "vhFormula": "vh('13.2') +vh('13.3')"
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
          "valorHistorico": 0,
          "value": 0,
          "baseDeCalculoRef": "",
          "baseRef": "",
          "calculationMethod": "FORMULA",
          "totalFormula": "=ref('12') / cantidad",
          "formula": "=ref('12') / cantidad",
          "isPercent": false,
          "helpText": "",
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
          "valorHistorico": 0,
          "value": 0,
          "baseDeCalculoRef": "",
          "baseRef": "",
          "calculationMethod": "FORMULA",
          "totalFormula": "=ref('14') / cantidad",
          "formula": "=ref('14') / cantidad",
          "isPercent": false,
          "helpText": "",
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
        {
          "key": "no",
          "label": "NO"
        },
        {
          "key": "classification",
          "label": "Clasificación"
        },
        {
          "key": "code",
          "label": "Código"
        },
        {
          "key": "description",
          "label": "Descripción de la Mat. Prima"
        },
        {
          "key": "um",
          "label": "UM"
        },
        {
          "key": "consumption_norm",
          "label": "Norma de Consumo"
        },
        {
          "key": "price",
          "label": "Precio Unitario"
        },
        {
          "key": "total",
          "label": "Total",
          "formula": "consumption_norm * price"
        }
      ],
      "data": [
        {
          "no": 0,
          "classification": "1.1.1 - De ello: - Insumos (MP)",
          "code": "SKU001",
          "description": "1 LITRO",
          "um": "Unidades",
          "consumption_norm": 1,
          "price": 6360,
          "total": 0
        }
      ]
    },
    {
      "id": "II",
      "title": "II - DESGLOSE DE LOS GASTOS DE SALARIO DE LOS OBREROS",
      "columns": [
        {
          "key": "no",
          "label": "NO"
        },
        {
          "key": "classification",
          "label": "Clasificación"
        },
        {
          "key": "description",
          "label": "Descripción del Puesto"
        },
        {
          "key": "time_norm",
          "label": "Horas Mensuales"
        },
        {
          "key": "hourly_rate",
          "label": "Tarifa $/h"
        },
        {
          "key": "worker_count",
          "label": "Cant. Obreros"
        },
        {
          "key": "total",
          "label": "Total",
          "formula": "time_norm * hourly_rate * worker_count"
        }
      ],
      "data": [
        {
          "no": 0,
          "classification": "2.1.1 - De ello: Salarios",
          "description": "Dependiente",
          "time_norm": 0.01,
          "hourly_rate": 34.56,
          "worker_count": 1,
          "total": 0
        }
      ]
    },
    {
      "id": "III",
      "title": "III - ANEXO DE DEPRECIACIÓN DE EQUIPOS",
      "columns": [
        {
          "key": "classification",
          "label": "Clasif."
        },
        {
          "key": "code",
          "label": "Código"
        },
        {
          "key": "name",
          "label": "Descripción del Equipo"
        },
        {
          "key": "initial_value",
          "label": "Valor de Compra"
        },
        {
          "key": "useful_life",
          "label": "% Deprec."
        },
        {
          "key": "quantity",
          "label": "Tiempo Explot."
        },
        {
          "key": "depreciation_cost",
          "label": "Deprec.",
          "formula": "(initial_value * (useful_life / 100)) / quantity"
        }
      ],
      "data": []
    },
    {
      "id": "IV",
      "title": "IV - ANEXO DE OTROS GASTOS DIRECTOS",
      "columns": [
        {
          "key": "classification",
          "label": "Clasificación"
        },
        {
          "key": "code",
          "label": "Código"
        },
        {
          "key": "description",
          "label": "Descripción"
        },
        {
          "key": "amount",
          "label": "Importe"
        }
      ],
      "data": []
    },
    {
      "id": "V",
      "title": "V - ANEXO DE DIETAS DE TRABAJADORES",
      "columns": [
        {
          "key": "classification",
          "label": "Clasificación"
        },
        {
          "key": "code",
          "label": "Código"
        },
        {
          "key": "worker_name",
          "label": "Nombre del Trabajador"
        },
        {
          "key": "daily_allowance",
          "label": "Gasto de Dieta Diario"
        },
        {
          "key": "days",
          "label": "Días"
        },
        {
          "key": "total",
          "label": "Total",
          "formula": "daily_allowance * days"
        }
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
