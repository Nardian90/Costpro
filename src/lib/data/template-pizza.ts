import { CostSheetDataContract } from '@/contracts/cost-sheet';

const template: CostSheetDataContract = {
  "header": {
    "code": "PIZ-01",
    "name": "Pizza Margarita",
    "date": new Date().toISOString().split('T')[0],
    "quantity": 1,
    "currency": "CUP",
    "category": "Alimentos",
    "type": "GASTRONOMIA",
    "unit": "Unidad",
    "product_code": "P-PIZZA-M",
    "company": "Pizzería Bella",
    "organism": "",
    "union": "",
    "destination": "Consumo Directo",
    "production_level": 50,
    "capacity_utilization": 1,
    "sale_price": 850,
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
      "id": "s12",
      "label": "Sección 12: Costo Total",
      "rows": [
        {
          "id": "12",
          "label": "COSTO TOTAL",
          "calculationMethod": "FORMULA",
          "totalFormula": "ref('1') + ref('2')"
        }
      ]
    }
  ],
  "annexes": [
    {
      "id": "I",
      "title": "I - INGREDIENTES",
      "columns": [
        { "key": "classification", "label": "Clasif" },
        { "key": "description", "label": "Ingrediente" },
        { "key": "um", "label": "UM" },
        { "key": "consumption_norm", "label": "Cant" },
        { "key": "price", "label": "Precio" },
        { "key": "total", "label": "Total", "formula": "consumption_norm * price" }
      ],
      "data": [
        { "classification": "1.1", "description": "Masa de Pizza", "um": "Kg", "consumption_norm": 0.2, "price": 150 },
        { "classification": "1.1", "description": "Salsa de Tomate", "um": "Kg", "consumption_norm": 0.05, "price": 400 },
        { "classification": "1.1", "description": "Queso Mozzarella", "um": "Kg", "consumption_norm": 0.1, "price": 2500 }
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
        { "classification": "2.1", "description": "Pizzero", "time_norm": 0.25, "hourly_rate": 200 }
      ]
    }
  ],
  "signature": {
    "prepared_by": "Chef",
    "approved_by": "Administrador"
  },
  "id": "template-pizza",
  "name": "Pizza Margarita (Baja-Media Complejidad)",
  "version": "1.0.0",
  "metadata": {
    "author": "Jules",
    "description": "Ficha con ingredientes y mano de obra."
  }
};

export default template;
