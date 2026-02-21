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
          "totalFormula": "AnexoI",
          "baseDeCalculoRef": "I"
        }
      ]
    },
    {
      "id": "s2",
      "label": "Sección 2: Fuerza de Trabajo",
      "rows": [
        {
          "id": "2",
          "label": "SALARIOS",
          "calculationMethod": "FORMULA",
          "totalFormula": "AnexoII",
          "baseDeCalculoRef": "II"
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
          "calculationMethod": "FORMULA",
          "totalFormula": "AnexoIV",
          "baseDeCalculoRef": "IV"
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
          "calculationMethod": "FORMULA",
          "totalFormula": "ref('1') + ref('2') + ref('3')"
        }
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
        { "classification": "1.1", "description": "Harina de Trigo", "um": "Kg", "consumption_norm": 2.5, "price": 180 },
        { "classification": "1.1", "description": "Mantequilla Importada", "um": "Kg", "consumption_norm": 1.2, "price": 3500 },
        { "classification": "1.1", "description": "Leche Entera", "um": "Lt", "consumption_norm": 0.5, "price": 150 }
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
        { "classification": "2.1", "description": "Maestro Pastelero", "time_norm": 3, "hourly_rate": 300 }
      ]
    },
    {
      "id": "IV",
      "title": "IV - OTROS GASTOS",
      "columns": [
        { "key": "classification", "label": "Clasif" },
        { "key": "description", "label": "Descripción" },
        { "key": "amount", "label": "Importe" }
      ],
      "data": [
        { "classification": "3.1", "description": "Bolsas de Papel Kraff", "amount": 250 },
        { "classification": "3.1", "description": "Gas de Horno (estimado)", "amount": 500 }
      ]
    }
  ],
  "signature": {
    "prepared_by": "Pastelero Jefe",
    "approved_by": "Dueño"
  },
  "id": "template-pastry",
  "name": "Croissant Artesanal (Media Complejidad)",
  "version": "1.0.0",
  "metadata": {
    "author": "Jules",
    "description": "Ficha con materiales, mano de obra y otros gastos."
  }
};

export default template;
