import { CostSheetDataContract } from '@/contracts/cost-sheet';

const template: CostSheetDataContract = {
  "header": {
    "code": "FURN-03",
    "name": "Mesa de Centro de Roble",
    "date": new Date().toISOString().split('T')[0],
    "quantity": 1,
    "currency": "CUP",
    "category": "Mobiliario",
    "type": "CARPINTERIA",
    "unit": "Unidad",
    "product_code": "M-ROBLE-01",
    "company": "Muebles Elite",
    "organism": "",
    "union": "",
    "destination": "Exposición",
    "production_level": 5,
    "capacity_utilization": 1,
    "sale_price": 45000,
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
          "label": "OTROS GASTOS",
          "calculationMethod": "FORMULA",
          "totalFormula": "AnexoIV",
          "baseDeCalculoRef": "IV"
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
          "calculationMethod": "FORMULA",
          "totalFormula": "AnexoIII",
          "baseDeCalculoRef": "III"
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
          "totalFormula": "ref('1') + ref('2') + ref('3') + ref('4')"
        }
      ]
    }
  ],
  "annexes": [
    {
      "id": "I",
      "title": "I - MATERIALES",
      "columns": [
        { "key": "classification", "label": "Clasif" },
        { "key": "description", "label": "Material" },
        { "key": "um", "label": "UM" },
        { "key": "consumption_norm", "label": "Cant" },
        { "key": "price", "label": "Precio" },
        { "key": "total", "label": "Total", "formula": "consumption_norm * price" }
      ],
      "data": [
        { "classification": "1.1", "description": "Madera de Roble", "um": "m3", "consumption_norm": 0.05, "price": 450000 },
        { "classification": "1.1", "description": "Barniz Poliuretano", "um": "Lt", "consumption_norm": 0.5, "price": 2500 },
        { "classification": "1.1", "description": "Tornillos 2 pulg", "um": "Paquete", "consumption_norm": 1, "price": 450 }
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
        { "classification": "2.1", "description": "Ebanista A", "time_norm": 12, "hourly_rate": 350 },
        { "classification": "2.1", "description": "Ayudante", "time_norm": 8, "hourly_rate": 180 }
      ]
    },
    {
      "id": "III",
      "title": "III - DEPRECIACIÓN",
      "columns": [
        { "key": "classification", "label": "Clasif" },
        { "key": "name", "label": "Equipo" },
        { "key": "initial_value", "label": "Valor" },
        { "key": "useful_life", "label": "% Deprec" },
        { "key": "quantity", "label": "Meses" },
        { "key": "depreciation_cost", "label": "Deprec", "formula": "(initial_value * (useful_life / 100)) / quantity" }
      ],
      "data": [
        { "classification": "4.1", "name": "Sierra de Mesa", "initial_value": 120000, "useful_life": 10, "quantity": 12 },
        { "classification": "4.1", "name": "Lijadora Orbital", "initial_value": 15000, "useful_life": 20, "quantity": 12 }
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
        { "classification": "3.1", "description": "Electricidad Taller", "amount": 1200 },
        { "classification": "3.1", "description": "Mantenimiento Herramientas", "amount": 500 }
      ]
    }
  ],
  "signature": {
    "prepared_by": "Ebanista Jefe",
    "approved_by": "Director"
  },
  "id": "template-furniture",
  "name": "Mueble de Roble (Media-Alta Complejidad)",
  "version": "1.0.0",
  "metadata": {
    "author": "Jules",
    "description": "Ficha con materiales, mano de obra, depreciación y otros gastos."
  }
};

export default template;
