import { CostSheetDataContract } from '@/contracts/cost-sheet';

const template: CostSheetDataContract = {
  "header": {
    "code": "HEL-001",
    "name": "Helado de Chocolate (Caja 10L)",
    "date": new Date().toISOString().split('T')[0],
    "quantity": 10,
    "currency": "CUP",
    "category": "Alimentos",
    "type": "PRODUCCION",
    "unit": "Lt",
    "product_code": "P-HEL-CHOC",
    "company": "Heladería Real",
    "organism": "",
    "union": "",
    "destination": "Venta Minorista",
    "production_level": 500,
    "capacity_utilization": 0.8,
    "sale_price": 5500,
    "client": ""
  },
  "sections": [
    { "id": "s1", "label": "Sección 1: Gasto Material", "rows": [ { "id": "1", "label": "GASTO MATERIAL", "calculationMethod": "FORMULA", "totalFormula": "AnexoI" } ] },
    { "id": "s2", "label": "Sección 2: SALARIO DIRECTO", "rows": [ { "id": "2", "label": "SALARIO DIRECTO", "calculationMethod": "FORMULA", "totalFormula": "AnexoII" } ] },
    { "id": "s3", "label": "Sección 3: OTROS GASTOS DIRECTOS", "rows": [ { "id": "3", "label": "OTROS GASTOS DIRECTOS", "calculationMethod": "FORMULA", "totalFormula": "AnexoIV" } ] },
    { "id": "s4", "label": "Sección 4: Gastos Asociados Prod.", "rows": [ { "id": "4", "label": "Gastos Asociados Prod.", "calculationMethod": "FORMULA", "totalFormula": "ref('2') * 0.095 + AnexoIII" } ] },
    { "id": "s5", "label": "Sección 5: COSTO TOTAL", "rows": [ { "id": "5", "label": "COSTO TOTAL", "calculationMethod": "FORMULA", "totalFormula": "ref('1') + ref('2') + ref('3') + ref('4')" } ] },
    { "id": "s6", "label": "Sección 6: Gtos. Grales y Admón.", "rows": [ { "id": "6", "label": "Gtos. Grales y Admón.", "calculationMethod": "FORMULA", "totalFormula": "ref('2') * 0.12" } ] },
    { "id": "s7", "label": "Sección 7: Gtos. Dist. y Venta", "rows": [ { "id": "7", "label": "Gtos. Dist. y Venta", "calculationMethod": "FORMULA", "totalFormula": "ref('5') * 0.08" } ] },
    { "id": "s8", "label": "Sección 8", "rows": [{ "id": "8", "label": "Gastos Financieros", "calculationMethod": "FORMULA", "totalFormula": "0" }] },
    { "id": "s9", "label": "Sección 9", "rows": [{ "id": "9", "label": "Gasto Financ. OSDE", "calculationMethod": "FORMULA", "totalFormula": "0" }] },
    { "id": "s10", "label": "Sección 10", "rows": [{ "id": "10", "label": "Gastos Tributarios", "calculationMethod": "FORMULA", "totalFormula": "0" }] },
    { "id": "s11", "label": "Sección 11: TOTAL DE GASTOS", "rows": [ { "id": "11", "label": "TOTAL DE GASTOS", "calculationMethod": "FORMULA", "totalFormula": "ref('6') + ref('7') + ref('8') + ref('9') + ref('10')" } ] },
    { "id": "s12", "label": "Sección 12: TOTAL COSTOS Y GASTOS", "rows": [ { "id": "12", "label": "TOTAL COSTOS Y GASTOS", "calculationMethod": "FORMULA", "totalFormula": "ref('5') + ref('11')" } ] },
    { "id": "s13", "label": "Sección 13: Utilidad", "rows": [
        { "id": "13", "label": "Utilidad", "calculationMethod": "FORMULA", "totalFormula": "ref('12') * 0.30" },
        { "id": "13.1", "label": "Precio antes de Impuesto", "calculationMethod": "FORMULA", "totalFormula": "ref('12') + ref('13')" },
        { "id": "13.2", "label": "Imp s/Ventas y Serv", "calculationMethod": "FORMULA", "totalFormula": "ref('13.1')/0.9*0.1" }
      ]
    },
    { "id": "s14", "label": "Sección 14: Precio o Tarifa Final", "rows": [ { "id": "14", "label": "Precio o Tarifa Final", "calculationMethod": "FORMULA", "totalFormula": "ref('13.1') + ref('13.2')" } ] },
    { "id": "s15", "label": "Sección 15: Costo y gasto UNITARIO", "rows": [ { "id": "15", "label": "Costo y gasto UNITARIO", "calculationMethod": "FORMULA", "totalFormula": "ref('12') / quantity" } ] },
    { "id": "s16", "label": "Sección 16: VENTA UNITARIA", "rows": [ { "id": "16", "label": "VENTA UNITARIA", "calculationMethod": "FORMULA", "totalFormula": "ref('14') / quantity" } ] }
  ],
  "annexes": [
    {
      "id": "I", "title": "I - INGREDIENTES", "columns": [
        { "key": "description", "label": "Ingrediente" },
        { "key": "um", "label": "UM" },
        { "key": "consumption_norm", "label": "Cant" },
        { "key": "price", "label": "Precio" },
        { "key": "total", "label": "Total", "formula": "consumption_norm * price" }
      ],
      "data": [
        { "description": "Leche en Polvo", "um": "Kg", "consumption_norm": 2.5, "price": 450 },
        { "description": "Azúcar", "um": "Kg", "consumption_norm": 1.2, "price": 120 },
        { "description": "Cacao en Polvo", "um": "Kg", "consumption_norm": 0.8, "price": 850 },
        { "description": "Grasa Vegetal", "um": "Kg", "consumption_norm": 0.5, "price": 320 }
      ]
    },
    {
      "id": "II", "title": "II - MANO DE OBRA", "columns": [
        { "key": "description", "label": "Puesto" },
        { "key": "time_norm", "label": "Horas" },
        { "key": "hourly_rate", "label": "Tarifa" },
        { "key": "worker_count", "label": "Cant" },
        { "key": "total", "label": "Total", "formula": "time_norm * hourly_rate * worker_count" }
      ],
      "data": [
        { "description": "Maestro Heladero", "time_norm": 4, "hourly_rate": 250, "worker_count": 1 },
        { "description": "Auxiliar", "time_norm": 4, "hourly_rate": 150, "worker_count": 1 }
      ]
    },
    {
      "id": "III", "title": "III - DEPRECIACIÓN FRÍO", "columns": [
        { "key": "name", "label": "Equipo" },
        { "key": "initial_value", "label": "Valor" },
        { "key": "useful_life", "label": "% Anual" },
        { "key": "quantity", "label": "Meses" },
        { "key": "depreciation_cost", "label": "Deprec", "formula": "(initial_value * (useful_life / 100)) / quantity" }
      ],
      "data": [
        { "name": "Cámara Fría", "initial_value": 850000, "useful_life": 10, "quantity": 12 },
        { "name": "Heladora Industrial", "initial_value": 450000, "useful_life": 8, "quantity": 12 }
      ]
    },
    {
      "id": "IV", "title": "IV - OTROS GASTOS", "columns": [
        { "key": "description", "label": "Descripción" },
        { "key": "amount", "label": "Importe" }
      ],
      "data": [
        { "description": "Electricidad (Consumo Alto)", "amount": 1500 },
        { "description": "Envases de Plástico 10L", "amount": 850 }
      ]
    },
    { "id": "V", "title": "V - DIETAS", "columns": [], "data": [] }
  ],
  "signature": { "prepared_by": "Jefe de Almacén", "approved_by": "Director" },
  "id": "template-icecream",
  "name": "Producción de Helado",
  "version": "1.0.0",
  "metadata": {
    "author": "Jules",
    "description": "Ficha completa para producción de helado industrial."
  }
};

export default template;
