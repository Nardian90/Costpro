import { CostSheetDataContract } from '@/contracts/cost-sheet';

const template: CostSheetDataContract = {
  "header": {
    "code": "IND-04",
    "name": "Pintura Acrílica Blanca (1000L)",
    "date": new Date().toISOString().split('T')[0],
    "quantity": 1000,
    "currency": "CUP",
    "category": "Químicos",
    "type": "INDUSTRIAL",
    "unit": "Litro",
    "product_code": "Q-PINT-B1",
    "company": "QuimiColor S.A.",
    "organism": "Ministerio de Industrias",
    "union": "GEIC",
    "destination": "Venta Mayorista",
    "production_level": 5000,
    "capacity_utilization": 0.2,
    "sale_price": 650000,
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
      "id": "s5",
      "label": "Sección 5: Dietas",
      "rows": [
        {
          "id": "5",
          "label": "DIETAS",
          "calculationMethod": "FORMULA",
          "totalFormula": "AnexoV",
          "baseDeCalculoRef": "V"
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
          "totalFormula": "ref('1') + ref('2') + ref('3') + ref('4') + ref('5')"
        }
      ]
    }
  ],
  "annexes": [
    {
      "id": "I",
      "title": "I - MATERIAS PRIMAS Y REACTIVOS",
      "columns": [
        { "key": "classification", "label": "Clasif" },
        { "key": "description", "label": "Material" },
        { "key": "um", "label": "UM" },
        { "key": "consumption_norm", "label": "Cant" },
        { "key": "price", "label": "Precio" },
        { "key": "total", "label": "Total", "formula": "consumption_norm * price" }
      ],
      "data": [
        { "classification": "1.1", "description": "Resina Acrílica", "um": "Kg", "consumption_norm": 400, "price": 850 },
        { "classification": "1.1", "description": "Dióxido de Titanio", "um": "Kg", "consumption_norm": 150, "price": 1200 },
        { "classification": "1.1", "description": "Carbonato de Calcio", "um": "Kg", "consumption_norm": 200, "price": 45 },
        { "classification": "1.1", "description": "Aditivos y Fungicidas", "um": "Lt", "consumption_norm": 10, "price": 3500 },
        { "classification": "1.1", "description": "Agua Desionizada", "um": "Lt", "consumption_norm": 350, "price": 15 }
      ]
    },
    {
      "id": "II",
      "title": "II - MANO DE OBRA OPERATIVA",
      "columns": [
        { "key": "classification", "label": "Clasif" },
        { "key": "description", "label": "Puesto" },
        { "key": "time_norm", "label": "Horas" },
        { "key": "hourly_rate", "label": "Tarifa" },
        { "key": "total", "label": "Total", "formula": "time_norm * hourly_rate" }
      ],
      "data": [
        { "classification": "2.1", "description": "Operador de Mezclado", "time_norm": 40, "hourly_rate": 250 },
        { "classification": "2.1", "description": "Químico de Control", "time_norm": 10, "hourly_rate": 450 },
        { "classification": "2.1", "description": "Auxiliar de Envasado", "time_norm": 20, "hourly_rate": 150 }
      ]
    },
    {
      "id": "III",
      "title": "III - DEPRECIACIÓN DE PLANTA",
      "columns": [
        { "key": "classification", "label": "Clasif" },
        { "key": "name", "label": "Equipo" },
        { "key": "initial_value", "label": "Valor" },
        { "key": "useful_life", "label": "% Deprec" },
        { "key": "quantity", "label": "Meses" },
        { "key": "depreciation_cost", "label": "Deprec", "formula": "(initial_value * (useful_life / 100)) / quantity" }
      ],
      "data": [
        { "classification": "4.1", "name": "Reactor de 2000L", "initial_value": 4500000, "useful_life": 5, "quantity": 12 },
        { "classification": "4.1", "name": "Línea de Envasado", "initial_value": 2500000, "useful_life": 8, "quantity": 12 },
        { "classification": "4.1", "name": "Montacargas Eléctrico", "initial_value": 1200000, "useful_life": 10, "quantity": 12 }
      ]
    },
    {
      "id": "IV",
      "title": "IV - OTROS GASTOS DE OPERACIÓN",
      "columns": [
        { "key": "classification", "label": "Clasif" },
        { "key": "description", "label": "Descripción" },
        { "key": "amount", "label": "Importe" }
      ],
      "data": [
        { "classification": "3.1", "description": "Consumo Eléctrico Industrial", "amount": 25000 },
        { "classification": "3.1", "description": "Tratamiento de Residuales", "amount": 12000 },
        { "classification": "3.1", "description": "Envases (Cubetas 20L x 50)", "amount": 15000 }
      ]
    },
    {
      "id": "V",
      "title": "V - DIETAS Y ALOJAMIENTOS",
      "columns": [
        { "key": "classification", "label": "Clasif" },
        { "key": "worker_name", "label": "Concepto" },
        { "key": "daily_allowance", "label": "Tarifa" },
        { "key": "days", "label": "Cantidad" },
        { "key": "total", "label": "Total", "formula": "daily_allowance * days" }
      ],
      "data": [
        { "classification": "5.1", "worker_name": "Dietas de Operadores (Comedor)", "daily_allowance": 150, "days": 70 },
        { "classification": "5.1", "worker_name": "Transporte de Personal", "daily_allowance": 500, "days": 20 }
      ]
    }
  ],
  "signature": {
    "prepared_by": "Jefe de Planta",
    "approved_by": "Director Técnico"
  },
  "id": "template-industrial",
  "name": "Pintura Industrial (Alta Complejidad)",
  "version": "1.0.0",
  "metadata": {
    "author": "Jules",
    "description": "Ficha completa con todos los anexos para producción industrial a gran escala."
  }
};

export default template;
