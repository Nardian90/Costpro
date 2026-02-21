import { CostSheetDataContract } from '@/contracts/cost-sheet';

const template: CostSheetDataContract = {
  "header": {
    "code": "JU-001",
    "name": "Jugo Natural de Mango (1L)",
    "date": new Date().toISOString().split('T')[0],
    "quantity": 1,
    "currency": "CUP",
    "category": "Bebidas",
    "type": "PRODUCCION",
    "unit": "Lt",
    "product_code": "P-MANGO-01",
    "company": "Frutalia S.A.",
    "organism": "",
    "union": "",
    "destination": "Mercado Interno",
    "production_level": 100,
    "capacity_utilization": 1,
    "sale_price": 450,
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
      "id": "s12",
      "label": "Sección 12: Costo Total",
      "rows": [
        {
          "id": "12",
          "label": "COSTO TOTAL",
          "calculationMethod": "FORMULA",
          "totalFormula": "ref('1')"
        }
      ]
    }
  ],
  "annexes": [
    {
      "id": "I",
      "title": "I - DESGLOSE DE MATERIAS PRIMAS",
      "columns": [
        { "key": "classification", "label": "Clasif" },
        { "key": "description", "label": "Materia Prima" },
        { "key": "um", "label": "UM" },
        { "key": "consumption_norm", "label": "Norma" },
        { "key": "price", "label": "Precio" },
        { "key": "total", "label": "Total", "formula": "consumption_norm * price" }
      ],
      "data": [
        { "classification": "1.1", "description": "Mango Fresco", "um": "Kg", "consumption_norm": 1.5, "price": 120 },
        { "classification": "1.1", "description": "Azúcar Blanca", "um": "Kg", "consumption_norm": 0.1, "price": 100 },
        { "classification": "1.1", "description": "Agua Tratada", "um": "Lt", "consumption_norm": 0.4, "price": 5 }
      ]
    }
  ],
  "signature": {
    "prepared_by": "Especialista de Costos",
    "approved_by": "Gerente de Producción"
  },
  "id": "template-juice",
  "name": "Jugo Natural (Baja Complejidad)",
  "version": "1.0.0",
  "metadata": {
    "author": "Jules",
    "description": "Ficha simple con solo gasto material."
  }
};

export default template;
