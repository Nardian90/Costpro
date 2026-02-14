
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
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA(hijos)",
          "formula": "=SUMA(hijos)",
          "children": [
            {
              "id": "1.1",
              "label": "De ello: - Insumos (MP)",
              "valorHistorico": 18500,
              "value": 0,
              "baseDeCalculoRef": "I",
              "baseRef": "I",
              "calculationMethod": "FORMULA",
              "totalFormula": "AnexoI",
              "formula": "AnexoI",
              "children": []
            },
            {
              "id": "1.2",
              "label": "- Combustibles y lubricantes",
              "valorHistorico": 2400,
              "value": 0,
              "baseDeCalculoRef": "I",
              "baseRef": "I",
              "calculationMethod": "FORMULA",
              "totalFormula": "AnexoI",
              "formula": "AnexoI",
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
              "children": []
            },
            {
              "id": "1.4",
              "label": "- Agua",
              "valorHistorico": 50,
              "value": 0,
              "baseDeCalculoRef": "I",
              "baseRef": "I",
              "calculationMethod": "FORMULA",
              "totalFormula": "AnexoI",
              "formula": "AnexoI",
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
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA(hijos)",
          "formula": "=SUMA(hijos)",
          "children": [
            {
              "id": "2.1",
              "label": "De ello: Salarios",
              "valorHistorico": 52000,
              "value": 0,
              "baseDeCalculoRef": "II",
              "baseRef": "II",
              "calculationMethod": "FORMULA",
              "totalFormula": "AnexoII",
              "formula": "AnexoII",
              "children": []
            },
            {
              "id": "2.2",
              "label": "Vacaciones",
              "valorHistorico": 4726.80,
              "value": 9.09,
              "baseDeCalculoRef": "2.1",
              "baseRef": "2.1",
              "calculationMethod": "FORMULA",
              "totalFormula": "=PCT(ref('2.1'), 9.09)",
              "formula": "=PCT(ref('2.1'), 9.09)",
              "is_percent": true,
              "isPercent": true,
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
          "valorHistorico": 0,
          "value": 0,
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA(hijos)",
          "formula": "=SUMA(hijos)",
          "children": [
            {
              "id": "3.1",
              "label": "DE ELLO: DEPRECIACIÓN (TOTAL)",
              "valorHistorico": 0,
              "value": 0,
              "calculationMethod": "FORMULA",
              "totalFormula": "=SUMA(hijos)",
              "formula": "=SUMA(hijos)",
              "children": [
                {
                  "id": "3.1.4",
                  "label": "-Maquinas y eq. productivos",
                  "valorHistorico": 1200,
                  "value": 0,
                  "baseDeCalculoRef": "III",
                  "baseRef": "III",
                  "calculationMethod": "FORMULA",
                  "totalFormula": "AnexoIII",
                  "formula": "AnexoIII",
                  "children": []
                }
              ]
            },
            {
              "id": "3.2",
              "label": "-Mantenimiento",
              "valorHistorico": 2000,
              "value": 0,
              "baseDeCalculoRef": "IV",
              "baseRef": "IV",
              "calculationMethod": "FORMULA",
              "totalFormula": "AnexoIV",
              "formula": "AnexoIV",
              "children": []
            },
            {
              "id": "3.6",
              "label": "-Alimentación",
              "valorHistorico": 1500,
              "value": 0,
              "baseDeCalculoRef": "IV",
              "baseRef": "IV",
              "calculationMethod": "FORMULA",
              "totalFormula": "AnexoIV",
              "formula": "AnexoIV",
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
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA(hijos)",
          "formula": "=SUMA(hijos)",
          "children": [
            {
              "id": "4.1",
              "label": "De ello: Salarios",
              "valorHistorico": 5000,
              "value": 5000,
              "calculationMethod": "ValorFijo",
              "children": []
            },
            {
              "id": "4.2",
              "label": "-Otros gastos",
              "valorHistorico": 2500,
              "value": 2500,
              "calculationMethod": "ValorFijo",
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
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA ( ref('1') , ref('2') , ref('3') , ref('4') )",
          "formula": "=SUMA ( ref('1') , ref('2') , ref('3') , ref('4') )",
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
          "valorHistorico": 0,
          "value": 0,
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA(hijos)",
          "formula": "=SUMA(hijos)",
          "children": [
            {
              "id": "6.1",
              "label": "- Salarios",
              "valorHistorico": 3000,
              "value": 3000,
              "calculationMethod": "ValorFijo",
              "children": []
            },
            {
              "id": "6.5",
              "label": "- Otros Gastos Admin.",
              "valorHistorico": 1200,
              "value": 1200,
              "calculationMethod": "ValorFijo",
              "children": []
            }
          ]
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
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA(hijos)",
          "formula": "=SUMA(hijos)",
          "children": [
            {
              "id": "10.1",
              "label": "De ello: -Contrib. Seg. Social (14%)",
              "valorHistorico": 8400,
              "value": 0,
              "baseDeCalculoRef": "2.1",
              "baseRef": "2.1",
              "calculationMethod": "FORMULA",
              "totalFormula": "=ROUND2(PCT(ref('2.1') + ref('4.1') + ref('6.1'), 14))",
              "formula": "=ROUND2(PCT(ref('2.1') + ref('4.1') + ref('6.1'), 14))",
              "children": []
            },
            {
              "id": "10.2",
              "label": "-Imp. Fuerza Trabajo (5%)",
              "valorHistorico": 3000,
              "value": 0,
              "baseDeCalculoRef": "2.1",
              "baseRef": "2.1",
              "calculationMethod": "FORMULA",
              "totalFormula": "=ROUND2(PCT(ref('2.1') + ref('4.1') + ref('6.1'), 5))",
              "formula": "=ROUND2(PCT(ref('2.1') + ref('4.1') + ref('6.1'), 5))",
              "children": []
            }
          ]
        }
      ]
    },
    {
      "id": "s12",
      "label": "Sección 12: TOTAL COSTOS Y GASTOS",
      "rows": [
        {
          "id": "12",
          "label": "TOTAL COSTOS Y GASTOS (5+6+10)",
          "valorHistorico": 0,
          "value": 0,
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA ( ref('5') , ref('6'), ref('10') )",
          "formula": "=SUMA ( ref('5') , ref('6'), ref('10') )",
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
          "label": "Utilidad (30%)",
          "valorHistorico": 0,
          "value": 0,
          "baseDeCalculoRef": "12",
          "baseRef": "12",
          "calculationMethod": "FORMULA",
          "totalFormula": "ref('12') * 0.3",
          "formula": "ref('12') * 0.3",
          "children": []
        },
        {
          "id": "13.1",
          "label": "Precio antes de Impuesto",
          "valorHistorico": 0,
          "value": 0,
          "calculationMethod": "FORMULA",
          "totalFormula": "ref('12') + ref('13')",
          "formula": "ref('12') + ref('13')",
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
          "label": "Precio o Tarifa Final (con 10% Impuesto)",
          "valorHistorico": 0,
          "value": 0,
          "calculationMethod": "FORMULA",
          "totalFormula": "ref('13.1') / 0.9",
          "formula": "ref('13.1') / 0.9",
          "children": []
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
          "valorHistorico": 0,
          "value": 0,
          "calculationMethod": "FORMULA",
          "totalFormula": "=ref('14') / cantidad",
          "formula": "=ref('14') / cantidad",
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
        { "key": "classification", "label": "Clasificación" },
        { "key": "code", "label": "Código" },
        { "key": "description", "label": "Descripción" },
        { "key": "um", "label": "UM" },
        { "key": "consumption_norm", "label": "Norma" },
        { "key": "price", "label": "Precio" },
        { "key": "total", "label": "Total", "formula": "consumption_norm * price" }
      ],
      "data": [
        { "classification": "1.1", "code": "MP-001", "description": "Harina de Trigo Especial", "um": "kg", "consumption_norm": 450, "price": 45.00 },
        { "classification": "1.1", "code": "MP-002", "description": "Levadura Seca", "um": "kg", "consumption_norm": 5, "price": 250.00 },
        { "classification": "1.1", "code": "MP-003", "description": "Sal Refinada", "um": "kg", "consumption_norm": 10, "price": 15.00 },
        { "classification": "1.2", "code": "COMB-001", "description": "Aceite Vegetal (Combustión)", "um": "L", "consumption_norm": 20, "price": 120.00 },
        { "classification": "1.4", "code": "AGUA-001", "description": "Agua Potable", "um": "m3", "consumption_norm": 1, "price": 50.00 }
      ]
    },
    {
      "id": "II",
      "title": "II - DESGLOSE DE LOS GASTOS DE SALARIO DE LOS OBREROS",
      "columns": [
        { "key": "classification", "label": "Clasificación" },
        { "key": "description", "label": "Puesto" },
        { "key": "time_norm", "label": "Horas" },
        { "key": "hourly_rate", "label": "Tarifa" },
        { "key": "worker_count", "label": "Cant." },
        { "key": "total", "label": "Total", "formula": "time_norm * hourly_rate * worker_count" }
      ],
      "data": [
        { "classification": "2.1", "description": "Maestro Panadero", "time_norm": 160, "hourly_rate": 150.00, "worker_count": 1 },
        { "classification": "2.1", "description": "Ayudante Panadero", "time_norm": 160, "hourly_rate": 100.00, "worker_count": 2 }
      ]
    },
    {
      "id": "III",
      "title": "III - ANEXO DE DEPRECIACIÓN DE EQUIPOS",
      "columns": [
        { "key": "classification", "label": "Clasif." },
        { "key": "code", "label": "Código" },
        { "key": "name", "label": "Equipo" },
        { "key": "initial_value", "label": "Valor Compra" },
        { "key": "useful_life", "label": "% Anual" },
        { "key": "quantity", "label": "Meses" },
        { "key": "depreciation_cost", "label": "Deprec.", "formula": "(initial_value * (useful_life / 100)) / quantity" }
      ],
      "data": [
        { "classification": "3.1.4", "code": "EQ-001", "name": "Horno Rotativo Industrial", "initial_value": 250000, "useful_life": 10, "quantity": 12 }
      ]
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
      "data": [
        { "classification": "3.2", "code": "SERV-001", "description": "Mantenimiento Preventivo", "amount": 2000 },
        { "classification": "3.6", "code": "ALIM-001", "description": "Alimentación de Operarios", "amount": 1500 }
      ]
    }
  ],
  "signature": {
    "prepared_by": "Eli - Senior Developer & UX Specialist",
    "approved_by": "Dirección de Operaciones"
  },
  "footer": "DOCUMENTO DE REFERENCIA EDUCATIVA • GENERADO POR ELI v5.7.25"
};

export default template;
