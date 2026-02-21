import { CostSheetDataContract } from '@/contracts/cost-sheet';

const template: CostSheetDataContract = {
  "header": {
    "code": "",
    "name": "=GET_ANEXO_FILA_DATO('I', 1, 'description')",
    "date": new Date().toISOString().split('T')[0],
    "quantity": "=GET_ANEXO_FILA_DATO('I', 1, 'consumption_norm')",
    "currency": "CUP",
    "category": "",
    "type": "EMPRESA",
    "unit": "=GET_ANEXO_FILA_DATO('I', 1, 'um')",
    "product_code": "=GET_ANEXO_FILA_DATO('I', 1, 'code')",
    "company": "",
    "organism": "",
    "union": "",
    "destination": "",
    "production_level": 0,
    "capacity_utilization": 0,
    "sale_price": "=GET_FILA_DATO('14', 'total')",
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
          "totalFormula": "sum(children)",
          "formula": "sum(children)",
          "children": [
            {
              "id": "1.1",
              "label": "De ello: - Insumos (MP)",
              "valorHistorico": 0,
              "value": 0,
              "baseDeCalculoRef": "I",
              "calculationMethod": "ANEXO",
              "totalFormula": "AnexoI",
              "formula": "AnexoI",
              "children": [],
              "baseRef": "I"
            },
            {
              "id": "1.2",
              "label": "- Combustibles y lubricantes",
              "valorHistorico": 0,
              "value": 0,
              "baseDeCalculoRef": "I",
              "calculationMethod": "ANEXO",
              "totalFormula": "AnexoI",
              "formula": "AnexoI",
              "children": [],
              "baseRef": "I"
            },
            {
              "id": "1.3",
              "label": "- Energía",
              "valorHistorico": 0,
              "value": 0,
              "baseDeCalculoRef": "I",
              "calculationMethod": "ANEXO",
              "totalFormula": "AnexoI",
              "formula": "AnexoI",
              "children": [],
              "baseRef": "I"
            }
          ]
        }
      ]
    },
    {
      "id": "s2",
      "label": "Sección 2: Gasto de Fuerza de Trabajo",
      "rows": [
        {
          "id": "2",
          "label": "GASTO DE FUERZA DE TRABAJO",
          "valorHistorico": 0,
          "value": 0,
          "calculationMethod": "FORMULA",
          "totalFormula": "sum(children)",
          "formula": "sum(children)",
          "children": [
            {
              "id": "2.1",
              "label": "De ello: Salarios",
              "valorHistorico": 0,
              "value": 0,
              "baseDeCalculoRef": "II",
              "calculationMethod": "ANEXO",
              "totalFormula": "AnexoII",
              "formula": "AnexoII",
              "children": [],
              "baseRef": "II"
            }
          ]
        }
      ]
    },
    {
      "id": "s3",
      "label": "Sección 3: Otros Gastos Directos",
      "rows": [
        {
          "id": "3",
          "label": "OTROS GASTOS DIRECTOS",
          "valorHistorico": 0,
          "value": 0,
          "calculationMethod": "FORMULA",
          "totalFormula": "sum(children)",
          "formula": "sum(children)",
          "children": [
            {
              "id": "3.1",
              "label": "De ello: Otros",
              "valorHistorico": 0,
              "value": 0,
              "baseDeCalculoRef": "IV",
              "calculationMethod": "ANEXO",
              "totalFormula": "AnexoIV",
              "formula": "AnexoIV",
              "children": [],
              "baseRef": "IV"
            }
          ]
        }
      ]
    },
    {
      "id": "s4",
      "label": "Sección 4: Depreciación",
      "rows": [
        {
          "id": "4",
          "label": "DEPRECIACIÓN",
          "valorHistorico": 0,
          "value": 0,
          "baseDeCalculoRef": "III",
          "calculationMethod": "ANEXO",
          "totalFormula": "AnexoIII",
          "formula": "AnexoIII",
          "children": [],
          "baseRef": "III"
        }
      ]
    },
    {
      "id": "s5",
      "label": "Sección 5: Costo Directo",
      "rows": [
        {
          "id": "5",
          "label": "COSTO DIRECTO",
          "valorHistorico": 0,
          "value": 0,
          "calculationMethod": "FORMULA",
          "totalFormula": "ref('1') + ref('2') + ref('3') + ref('4')",
          "formula": "ref('1') + ref('2') + ref('3') + ref('4')",
          "children": []
        }
      ]
    },
    {
      "id": "s12",
      "label": "Sección 12: Costo Total",
      "rows": [
        {
          "id": "12",
          "label": "COSTO TOTAL",
          "valorHistorico": 0,
          "value": 0,
          "calculationMethod": "FORMULA",
          "totalFormula": "ref('5')",
          "formula": "ref('5')",
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
          "valorHistorico": 0,
          "value": 0,
          "baseDeCalculoRef": "12",
          "calculationMethod": "FORMULA",
          "totalFormula": "ref('12') * 0.3",
          "formula": "ref('12') * 0.3"
        },
        {
          "id": "13.1",
          "label": "Precio antes de Impuesto",
          "valorHistorico": 0,
          "value": 0,
          "calculationMethod": "FORMULA",
          "totalFormula": "ref('12') + ref('13')",
          "formula": "ref('12') + ref('13')"
        },
        {
          "id": "13.2",
          "label": "Imp s/Ventas y Serv",
          "valorHistorico": 0,
          "value": 0,
          "calculationMethod": "FORMULA",
          "totalFormula": "ref('13.1')/0.9*0.1",
          "formula": "ref('13.1')/0.9*0.1"
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
          "calculationMethod": "FORMULA",
          "totalFormula": "ref('13.1') + ref('13.2')",
          "formula": "ref('13.1') + ref('13.2')"
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
        { "key": "description", "label": "Descripción" },
        { "key": "um", "label": "UM" },
        { "key": "consumption_norm", "label": "Norma" },
        { "key": "price", "label": "Precio" },
        { "key": "total", "label": "Total", "formula": "consumption_norm * price" }
      ],
      "data": []
    },
    {
      "id": "II",
      "title": "II - DESGLOSE DE LOS GASTOS DE SALARIO DE LOS OBREROS",
      "columns": [
        { "key": "no", "label": "NO" },
        { "key": "description", "label": "Puesto" },
        { "key": "time_norm", "label": "Horas" },
        { "key": "hourly_rate", "label": "Tarifa" },
        { "key": "worker_count", "label": "Cant" },
        { "key": "total", "label": "Total", "formula": "time_norm * hourly_rate * worker_count" }
      ],
      "data": []
    },
    {
      "id": "III",
      "title": "III - ANEXO DE DEPRECIACIÓN DE EQUIPOS",
      "columns": [
        { "key": "name", "label": "Equipo" },
        { "key": "initial_value", "label": "Valor" },
        { "key": "useful_life", "label": "% Deprec" },
        { "key": "quantity", "label": "Meses" },
        { "key": "depreciation_cost", "label": "Deprec", "formula": "(initial_value * (useful_life / 100)) / quantity" }
      ],
      "data": []
    },
    {
      "id": "IV",
      "title": "IV - ANEXO DE OTROS GASTOS DIRECTOS",
      "columns": [
        { "key": "description", "label": "Descripción" },
        { "key": "amount", "label": "Importe" }
      ],
      "data": []
    },
    {
      "id": "V",
      "title": "V - ANEXO DE DIETAS DE TRABAJADORES",
      "columns": [
        { "key": "worker_name", "label": "Nombre" },
        { "key": "daily_allowance", "label": "Dieta" },
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
  "id": "costpro-reinicio",
  "name": "Plantilla de Reinicio",
  "version": "1.1.0",
  "metadata": {
    "author": "Jules",
    "description": "Plantilla base limpia con fórmulas de encabezado automatizadas."
  },
  "footer": "FIN DEL DOCUMENTO • GENERADO POR COSTPRO"
};

export default template;
