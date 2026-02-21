import { CostSheetDataContract } from '@/contracts/cost-sheet';

const template: CostSheetDataContract = {
  "header": {
    "code": "REF-000",
    "name": "NUEVO PRODUCTO O SERVICIO",
    "date": new Date().toISOString().split('T')[0],
    "quantity": 1,
    "currency": "CUP",
    "category": "General",
    "type": "EMPRESA",
    "unit": "U",
    "product_code": "P-000",
    "company": "",
    "organism": "",
    "union": "",
    "destination": "",
    "production_level": 0,
    "capacity_utilization": 0,
    "sale_price": 0,
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
          "calculationMethod": "FORMULA",
          "totalFormula": "sum(children)",
          "children": [
            { "id": "1.1", "label": "De ello: - Insumos (MP)", "calculationMethod": "ANEXO", "baseRef": "I", "totalFormula": "AnexoI" },
            { "id": "1.2", "label": "- Combustibles y lubricantes", "calculationMethod": "ANEXO", "baseRef": "I", "totalFormula": "AnexoI" },
            { "id": "1.3", "label": "- Energía", "calculationMethod": "ANEXO", "baseRef": "I", "totalFormula": "AnexoI" }
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
          "calculationMethod": "FORMULA",
          "totalFormula": "sum(children)",
          "children": [
            { "id": "2.1", "label": "De ello: Salarios", "calculationMethod": "ANEXO", "baseRef": "II", "totalFormula": "AnexoII" }
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
          "calculationMethod": "FORMULA",
          "totalFormula": "sum(children)",
          "children": [
            { "id": "3.1", "label": "De ello: Otros", "calculationMethod": "ANEXO", "baseRef": "IV", "totalFormula": "AnexoIV" }
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
          "label": "Gastos Asociados Prod.",
          "calculationMethod": "FORMULA",
          "totalFormula": "ref('2.1') * 0.095",
          "helpText": "9.5% de Contribución Especial a la Seguridad Social"
        }
      ]
    },
    {
      "id": "s5",
      "label": "Sección 5: COSTO TOTAL",
      "rows": [
        {
          "id": "5",
          "label": "COSTO TOTAL",
          "calculationMethod": "FORMULA",
          "totalFormula": "ref('1') + ref('2') + ref('3') + ref('4')"
        }
      ]
    },
    {
      "id": "s6",
      "label": "Sección 6: Gtos. Grales y Admón.",
      "rows": [
        {
          "id": "6",
          "label": "Gtos. Grales y Admón.",
          "calculationMethod": "FORMULA",
          "totalFormula": "ref('2.1') * 0.05",
          "helpText": "5% Estimado de Gastos de Administración"
        }
      ]
    },
    {
      "id": "s7",
      "label": "Sección 7: Gtos. Dist. y Venta",
      "rows": [
        {
          "id": "7",
          "label": "Gtos. Dist. y Venta",
          "calculationMethod": "FORMULA",
          "totalFormula": "ref('5') * 0.02",
          "helpText": "2% Estimado de Gastos de Distribución"
        }
      ]
    },
    {
      "id": "s8",
      "label": "Sección 8: Gastos Financieros",
      "rows": [ { "id": "8", "label": "Gastos Financieros", "calculationMethod": "FORMULA", "totalFormula": "0" } ]
    },
    {
      "id": "s9",
      "label": "Sección 9: Gasto Financ. OSDE",
      "rows": [ { "id": "9", "label": "Gasto Financ. OSDE", "calculationMethod": "FORMULA", "totalFormula": "0" } ]
    },
    {
      "id": "s10",
      "label": "Sección 10: Gastos Tributarios",
      "rows": [ { "id": "10", "label": "Gastos Tributarios", "calculationMethod": "FORMULA", "totalFormula": "0" } ]
    },
    {
      "id": "s11",
      "label": "Sección 11: TOTAL DE GASTOS",
      "rows": [
        {
          "id": "11",
          "label": "TOTAL DE GASTOS",
          "calculationMethod": "FORMULA",
          "totalFormula": "ref('6') + ref('7') + ref('8') + ref('9') + ref('10')"
        }
      ]
    },
    {
      "id": "s12",
      "label": "Sección 12: TOTAL COSTOS Y GASTOS",
      "rows": [
        {
          "id": "12",
          "label": "TOTAL COSTOS Y GASTOS",
          "calculationMethod": "FORMULA",
          "totalFormula": "ref('5') + ref('11')"
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
          "calculationMethod": "FORMULA",
          "totalFormula": "ref('12') * 0.3",
          "helpText": "30% de Margen de Utilidad"
        },
        {
          "id": "13.1", "label": "Precio antes de Impuesto", "calculationMethod": "FORMULA", "totalFormula": "ref('12') + ref('13')"
        },
        {
          "id": "13.2", "label": "Imp s/Ventas y Serv", "calculationMethod": "FORMULA", "totalFormula": "ref('13.1')/0.9*0.1"
        }
      ]
    },
    {
      "id": "s14",
      "label": "Sección 14: Precio o Tarifa Final",
      "rows": [
        { "id": "14", "label": "Precio o Tarifa Final", "calculationMethod": "FORMULA", "totalFormula": "ref('13.1') + ref('13.2')" }
      ]
    },
    {
      "id": "s15",
      "label": "Sección 15: Costo y gasto UNITARIO",
      "rows": [
        { "id": "15", "label": "Costo y gasto UNITARIO", "calculationMethod": "FORMULA", "totalFormula": "ref('12') / quantity" }
      ]
    },
    {
      "id": "s16",
      "label": "Sección 16: VENTA UNITARIA",
      "rows": [
        { "id": "16", "label": "VENTA UNITARIA", "calculationMethod": "FORMULA", "totalFormula": "ref('14') / quantity" }
      ]
    }
  ],
  "annexes": [
    {
      "id": "I", "title": "I - DESGLOSE DE MATERIAS PRIMAS Y MATERIALES",
      "columns": [
        { "key": "classification", "label": "Clasif" },
        { "key": "description", "label": "Descripción" },
        { "key": "um", "label": "UM" },
        { "key": "consumption_norm", "label": "Norma" },
        { "key": "price", "label": "Precio" },
        { "key": "total", "label": "Total", "formula": "consumption_norm * price" }
      ],
      "data": []
    },
    {
      "id": "II", "title": "II - DESGLOSE DE SALARIOS",
      "columns": [
        { "key": "description", "label": "Puesto" },
        { "key": "time_norm", "label": "Horas" },
        { "key": "hourly_rate", "label": "Tarifa" },
        { "key": "worker_count", "label": "Cant" },
        { "key": "total", "label": "Total", "formula": "time_norm * hourly_rate * worker_count" }
      ],
      "data": []
    },
    {
      "id": "III", "title": "III - ANEXO DE DEPRECIACIÓN",
      "columns": [
        { "key": "name", "label": "Equipo" },
        { "key": "initial_value", "label": "Valor" },
        { "key": "useful_life", "label": "% Anual" },
        { "key": "quantity", "label": "Meses" },
        { "key": "depreciation_cost", "label": "Deprec", "formula": "(initial_value * (useful_life / 100)) / quantity" }
      ],
      "data": []
    },
    {
      "id": "IV", "title": "IV - OTROS GASTOS DIRECTOS",
      "columns": [
        { "key": "description", "label": "Descripción" },
        { "key": "amount", "label": "Importe" }
      ],
      "data": []
    },
    {
      "id": "V", "title": "V - DIETAS",
      "columns": [
        { "key": "worker_name", "label": "Nombre" },
        { "key": "daily_allowance", "label": "Dieta" },
        { "key": "days", "label": "Días" },
        { "key": "total", "label": "Total", "formula": "daily_allowance * days" }
      ],
      "data": []
    }
  ],
  "signature": { "prepared_by": "", "approved_by": "" },
  "id": "costpro-reinicio",
  "name": "Plantilla de Reinicio",
  "version": "2.0.0",
  "metadata": {
    "author": "Jules",
    "description": "Estructura completa de 16 secciones y 5 anexos para nuevos modelos."
  }
};

export default template;
