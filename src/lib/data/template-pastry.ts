import { CostSheetDataContract } from '@/contracts/cost-sheet';

const template: CostSheetDataContract = {
  "header": {
    "code": "CRO-02",
    "name": "Croissant de Mantequilla",
    "date": new Date().toISOString().split('T')[0],
    "quantity": 20,
    "currency": "CUP",
    "category": "Panadería",
    "type": "PRODUCCION",
    "unit": "Bandeja",
    "product_code": "P-CROIS-01",
    "company": "Dulce Pan",
    "organism": "",
    "union": "",
    "destination": "Cafeterías",
    "production_level": 10,
    "capacity_utilization": 1,
    "sale_price": 4000,
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
          "totalFormula": "ref('2.1') * 0.095"
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
          "totalFormula": "ref('2.1') * 0.12"
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
          "totalFormula": "ref('5') * 0.03"
        }
      ]
    },
    { "id": "s8", "label": "Sección 8", "rows": [{ "id": "8", "label": "Gastos Financieros", "calculationMethod": "FORMULA", "totalFormula": "0" }] },
    { "id": "s9", "label": "Sección 9", "rows": [{ "id": "9", "label": "Gasto Financ. OSDE", "calculationMethod": "FORMULA", "totalFormula": "0" }] },
    { "id": "s10", "label": "Sección 10", "rows": [{ "id": "10", "label": "Gastos Tributarios", "calculationMethod": "FORMULA", "totalFormula": "0" }] },
    {
      "id": "s11",
      "label": "Sección 11: TOTAL DE GASTOS",
      "rows": [
        { "id": "11", "label": "TOTAL DE GASTOS", "calculationMethod": "FORMULA", "totalFormula": "ref('6') + ref('7') + ref('8') + ref('9') + ref('10')" }
      ]
    },
    {
      "id": "s12",
      "label": "Sección 12: TOTAL COSTOS Y GASTOS",
      "rows": [
        { "id": "12", "label": "TOTAL COSTOS Y GASTOS", "calculationMethod": "FORMULA", "totalFormula": "ref('5') + ref('11')" }
      ]
    },
    {
      "id": "s13",
      "label": "Sección 13: Utilidad",
      "rows": [
        { "id": "13", "label": "Utilidad", "calculationMethod": "FORMULA", "totalFormula": "ref('12') * 0.20" },
        { "id": "13.1", "label": "Precio antes de Impuesto", "calculationMethod": "FORMULA", "totalFormula": "ref('12') + ref('13')" },
        { "id": "13.2", "label": "Imp s/Ventas y Serv", "calculationMethod": "FORMULA", "totalFormula": "ref('13.1')/0.9*0.1" }
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
      "id": "I",
      "title": "I - MATERIAS PRIMAS",
      "columns": [
        { "key": "classification", "label": "Clasif" },
        { "key": "description", "label": "Material" },
        { "key": "um", "label": "UM" },
        { "key": "consumption_norm", "label": "Cant" },
        { "key": "price", "label": "Precio" },
        { "key": "total", "label": "Total", "formula": "consumption_norm * price" }
      ],
      "data": [
        { "classification": "1.1.1", "description": "Harina de Trigo", "um": "Kg", "consumption_norm": 2.5, "price": 180 },
        { "classification": "1.1.1", "description": "Mantequilla Importada", "um": "Kg", "consumption_norm": 1.2, "price": 3500 },
        { "classification": "1.1.1", "description": "Leche Entera", "um": "Lt", "consumption_norm": 0.5, "price": 150 }
      ]
    },
    {
      "id": "II",
      "title": "II - MANO DE OBRA",
      "columns": [
        { "key": "classification", "label": "Clasif" },
        { "key": "description", "label": "Puesto" },
        { "key": "time_norm", "label": "Horas" },
        { "key": "hourly_rate", "label": "Tarifa" },
        { "key": "total", "label": "Total", "formula": "time_norm * hourly_rate" }
      ],
      "data": [
        { "classification": "2.1.1", "description": "Maestro Pastelero", "time_norm": 3, "hourly_rate": 300 }
      ]
    },
    { "id": "III", "title": "III - DEPRECIACIÓN", "columns": [], "data": [] },
    {
      "id": "IV",
      "title": "IV - OTROS GASTOS",
      "columns": [
        { "key": "classification", "label": "Clasif" },
        { "key": "description", "label": "Descripción" },
        { "key": "amount", "label": "Importe" }
      ],
      "data": [
        { "classification": "3.1.1", "description": "Bolsas de Papel Kraff", "amount": 250 },
        { "classification": "3.1.1", "description": "Gas de Horno (estimado)", "amount": 500 }
      ]
    },
    { "id": "V", "title": "V - DIETAS", "columns": [], "data": [] }
  ],
  "signature": {
    "prepared_by": "Pastelero Jefe",
    "approved_by": "Dueño"
  },
  "id": "template-pastry",
  "name": "Croissant Artesanal (Media Complejidad)",
  "version": "2.0.0",
  "metadata": {
    "author": "Jules",
    "description": "Ficha completa de 16 secciones para croissant artesanal."
  }
};

export default template;
