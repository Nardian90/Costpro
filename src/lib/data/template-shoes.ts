import { CostSheetDataContract } from '@/contracts/cost-sheet';

const template: CostSheetDataContract = {
  "header": {
    "code": "ZAP-001",
    "name": "Zapatos de Cuero Formal (Par)",
    "date": new Date().toISOString().split('T')[0],
    "quantity": 1,
    "currency": "CUP",
    "category": "Calzado",
    "type": "PRODUCCION",
    "unit": "Par",
    "product_code": "P-ZAP-CUERO",
    "company": "Calzado Estilo",
    "organism": "",
    "union": "",
    "destination": "Venta Minorista",
    "production_level": 100,
    "capacity_utilization": 0.9,
    "sale_price": 6500,
    "client": ""
  },
  "sections": [
    { "id": "s1", "label": "Sección 1: Gasto Material", "rows": [ { "id": "1", "label": "GASTO MATERIAL", "calculationMethod": "FORMULA", "totalFormula": "AnexoI" } ] },
    { "id": "s2", "label": "Sección 2: SALARIO DIRECTO", "rows": [ { "id": "2", "label": "SALARIO DIRECTO", "calculationMethod": "FORMULA", "totalFormula": "AnexoII" } ] },
    { "id": "s3", "label": "Sección 3: OTROS GASTOS DIRECTOS", "rows": [ { "id": "3", "label": "OTROS GASTOS DIRECTOS", "calculationMethod": "FORMULA", "totalFormula": "AnexoIV" } ] },
    { "id": "s4", "label": "Sección 4: Gastos Asociados Prod.", "rows": [ { "id": "4", "label": "Gastos Asociados Prod.", "calculationMethod": "FORMULA", "totalFormula": "ref('2') * 0.095 + AnexoIII" } ] },
    { "id": "s5", "label": "Sección 5: COSTO TOTAL", "rows": [ { "id": "5", "label": "COSTO TOTAL", "calculationMethod": "FORMULA", "totalFormula": "ref('1') + ref('2') + ref('3') + ref('4')" } ] },
    { "id": "s6", "label": "Sección 6: Gtos. Grales y Admón.", "rows": [ { "id": "6", "label": "Gtos. Grales y Admón.", "calculationMethod": "FORMULA", "totalFormula": "ref('2') * 0.10" } ] },
    { "id": "s7", "label": "Sección 7: Gtos. Dist. y Venta", "rows": [ { "id": "7", "label": "Gtos. Dist. y Venta", "calculationMethod": "FORMULA", "totalFormula": "ref('5') * 0.06" } ] },
    { "id": "s8", "label": "Sección 8", "rows": [{ "id": "8", "label": "Gastos Financieros", "calculationMethod": "FORMULA", "totalFormula": "0" }] },
    { "id": "s9", "label": "Sección 9", "rows": [{ "id": "9", "label": "Gasto Financ. OSDE", "calculationMethod": "FORMULA", "totalFormula": "0" }] },
    { "id": "s10", "label": "Sección 10", "rows": [{ "id": "10", "label": "Gastos Tributarios", "calculationMethod": "FORMULA", "totalFormula": "0" }] },
    { "id": "s11", "label": "Sección 11: TOTAL DE GASTOS", "rows": [ { "id": "11", "label": "TOTAL DE GASTOS", "calculationMethod": "FORMULA", "totalFormula": "ref('6') + ref('7') + ref('8') + ref('9') + ref('10')" } ] },
    { "id": "s12", "label": "Sección 12: TOTAL COSTOS Y GASTOS", "rows": [ { "id": "12", "label": "TOTAL COSTOS Y GASTOS", "calculationMethod": "FORMULA", "totalFormula": "ref('5') + ref('11')" } ] },
    { "id": "s13", "label": "Sección 13: Utilidad", "rows": [
        { "id": "13", "label": "Utilidad", "calculationMethod": "FORMULA", "totalFormula": "ref('12') * 0.25" },
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
      "id": "I", "title": "I - MATERIALES", "columns": [
        { "key": "description", "label": "Material" },
        { "key": "um", "label": "UM" },
        { "key": "consumption_norm", "label": "Cant" },
        { "key": "price", "label": "Precio" },
        { "key": "total", "label": "Total", "formula": "consumption_norm * price" }
      ],
      "data": [
        { "description": "Cuero Vacuno (Flor)", "um": "Pie2", "consumption_norm": 4, "price": 450 },
        { "description": "Suela de Caucho", "um": "Par", "consumption_norm": 1, "price": 1200 },
        { "description": "Forro Textil", "um": "m2", "consumption_norm": 0.2, "price": 350 },
        { "description": "Hilos y Pegamentos", "um": "Set", "consumption_norm": 1, "price": 150 }
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
        { "description": "Cortador", "time_norm": 0.5, "hourly_rate": 180, "worker_count": 1 },
        { "description": "Aparador (Costura)", "time_norm": 1.5, "hourly_rate": 220, "worker_count": 1 },
        { "description": "Montador", "time_norm": 1, "hourly_rate": 250, "worker_count": 1 }
      ]
    },
    {
      "id": "III", "title": "III - DEPRECIACIÓN", "columns": [
        { "key": "name", "label": "Equipo" },
        { "key": "initial_value", "label": "Valor" },
        { "key": "useful_life", "label": "% Anual" },
        { "key": "quantity", "label": "Meses" },
        { "key": "depreciation_cost", "label": "Deprec", "formula": "(initial_value * (useful_life / 100)) / quantity" }
      ],
      "data": [
        { "name": "Máquina de Coser Industrial", "initial_value": 85000, "useful_life": 10, "quantity": 12 },
        { "name": "Prensa Hidráulica", "initial_value": 150000, "useful_life": 15, "quantity": 12 }
      ]
    },
    {
      "id": "IV", "title": "IV - OTROS GASTOS", "columns": [
        { "key": "description", "label": "Descripción" },
        { "key": "amount", "label": "Importe" }
      ],
      "data": [
        { "description": "Hormas de Madera (Desgaste)", "amount": 120 },
        { "description": "Empaque y Caja", "amount": 250 }
      ]
    },
    { "id": "V", "title": "V - DIETAS", "columns": [], "data": [] }
  ],
  "signature": { "prepared_by": "Cortador Jefe", "approved_by": "Administrador" },
  "id": "template-shoes",
  "name": "Fabricación de Calzado",
  "version": "1.0.0",
  "metadata": {
    "author": "Jules",
    "description": "Ficha detallada para industria ligera (calzado)."
  }
};

export default template;
