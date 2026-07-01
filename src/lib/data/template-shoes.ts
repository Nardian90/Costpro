import { CostSheetDataContract } from '@/contracts/cost-sheet';

const template: CostSheetDataContract = {
  "header": {
    "resolution": "Res 148/2023",
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
    {
      "id": "s1",
      "label": "Sección 1: Gasto Material",
      "rows": [
        {
          "id": "1",
          "label": "GASTO MATERIAL",
          "helpText": "Incluye materiales primarios, combustibles, energía y agua consumidos en la producción.",
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA(hijos)",
          "children": [
            { "id": "1.1", "label": "De ello: - Insumos (MP)", "calculationMethod": "FORMULA", "totalFormula": "AnexoI", "baseRef": "I" },
            { "id": "1.2", "label": "- Combustibles y lubricantes", "calculationMethod": "FORMULA", "totalFormula": "AnexoI", "baseRef": "I" },
            { "id": "1.3", "label": "- Energía", "calculationMethod": "FORMULA", "totalFormula": "AnexoI", "baseRef": "I" },
            { "id": "1.4", "label": "- Agua", "calculationMethod": "FORMULA", "totalFormula": "AnexoI", "baseRef": "I" }
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
          "helpText": "Salarios de obreros vinculados a la producción. Incluye vacaciones.",
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA(hijos)",
          "children": [
            { "id": "2.1", "label": "De ello: Salarios", "calculationMethod": "FORMULA", "totalFormula": "AnexoII", "baseRef": "II" },
            { "id": "2.2", "label": "Vacaciones", "calculationMethod": "FORMULA", "totalFormula": "=PCT(ref('2.1'), 9.09)", "baseRef": "2.1", "isPercent": true }
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
          "helpText": "Depreciación, mantenimiento, servicios contratados, protección, alquileres, alimentación y dietas.",
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA(hijos)",
          "children": [
            {
              "id": "3.1",
              "label": "DE ELLO: DEPRECIACIÓN (TOTAL)",
              "calculationMethod": "FORMULA",
              "totalFormula": "=SUMA(hijos)",
              "children": [
                { "id": "3.1.1", "label": "-Edificios", "calculationMethod": "FORMULA", "totalFormula": "AnexoIII", "baseRef": "III" },
                { "id": "3.1.2", "label": "-Otras Construcciones", "calculationMethod": "FORMULA", "totalFormula": "AnexoIII", "baseRef": "III" },
                { "id": "3.1.3", "label": "-Maquinas y eq. energéticos", "calculationMethod": "FORMULA", "totalFormula": "AnexoIII", "baseRef": "III" },
                { "id": "3.1.4", "label": "-Maquinas y eq. productivos", "calculationMethod": "FORMULA", "totalFormula": "AnexoIII", "baseRef": "III" },
                { "id": "3.1.5", "label": "-Aparatos y eq. técnicos", "calculationMethod": "FORMULA", "totalFormula": "AnexoIII", "baseRef": "III" }
              ]
            },
            { "id": "3.2", "label": "-Mantenimiento", "calculationMethod": "FORMULA", "totalFormula": "AnexoIV", "baseRef": "IV" },
            { "id": "3.3", "label": "-Servicios contratados", "calculationMethod": "FORMULA", "totalFormula": "AnexoIV", "baseRef": "IV" },
            { "id": "3.4", "label": "-Medios de protección", "calculationMethod": "FORMULA", "totalFormula": "AnexoIV", "baseRef": "IV" },
            { "id": "3.5", "label": "-Alquiler locales", "calculationMethod": "FORMULA", "totalFormula": "AnexoIV", "baseRef": "IV" },
            { "id": "3.6", "label": "-Alimentación", "calculationMethod": "FORMULA", "totalFormula": "AnexoIV", "baseRef": "IV" },
            { "id": "3.7", "label": "-Dietas", "calculationMethod": "FORMULA", "totalFormula": "AnexoV", "baseRef": "V" }
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
          "label": "GASTOS ASOCIADOS PROD.",
          "helpText": "Gastos indirectos de producción asignados proporcionalmente al gasto material.",
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA(hijos)",
          "children": [
            { "id": "4.1", "label": "De ello: Salarios", "calculationMethod": "FORMULA", "totalFormula": "vh('4.1.1')/vh('1.1.1')*ref('1.1.1')" },
            { "id": "4.2", "label": "-Otros gastos", "calculationMethod": "FORMULA", "totalFormula": "vh('4.1.1')/vh('1.1.1')*ref('1.1.1')" }
          ]
        }
      ]
    },
    {
      "id": "s5",
      "label": "Sección 5: COSTO TOTAL",
      "rows": [
        { "id": "5", "label": "COSTO TOTAL (1+2+3+4)", "calculationMethod": "FORMULA", "totalFormula": "=SUMA(ref('1'), ref('2'), ref('3'), ref('4'))" }
      ]
    },
    {
      "id": "s6",
      "label": "Sección 6: Gtos. Grales y Admón.",
      "rows": [
        {
          "id": "6",
          "label": "GTOS. GRALES Y ADMÓN.",
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA(hijos)",
          "children": [
            { "id": "6.1", "label": "- Salarios", "calculationMethod": "FORMULA", "totalFormula": "vh('6.1.1')/vh('1.1.1')*ref('1.1.1')" },
            { "id": "6.2", "label": "- Comunicación", "calculationMethod": "FORMULA", "totalFormula": "vh('6.1.2')/vh('1.1.1')*ref('1.1.1')" },
            { "id": "6.3", "label": "- Depreciacion", "calculationMethod": "FORMULA", "totalFormula": "vh('6.1.3')/vh('1.1.1')*ref('1.1.1')" },
            { "id": "6.4", "label": "- Energia", "calculationMethod": "FORMULA", "totalFormula": "vh('6.1.4')/vh('1.1.1')*ref('1.1.1')" },
            { "id": "6.5", "label": "- Otros Gastos Admin.", "calculationMethod": "FORMULA", "totalFormula": "vh('6.1.5')/vh('1.1.1')*ref('1.1.1')" }
          ]
        }
      ]
    },
    {
      "id": "s7",
      "label": "Sección 7: Gtos. Dist. y Venta",
      "rows": [
        {
          "id": "7",
          "label": "GTOS. DIST. Y VENTA",
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA(hijos)",
          "children": [
            { "id": "7.1", "label": "- Salarios", "calculationMethod": "FORMULA", "totalFormula": "vh('7.1.1')/vh('1.1.1')*ref('1.1.1')" },
            { "id": "7.2", "label": "- Otros gastos", "calculationMethod": "FORMULA", "totalFormula": "vh('7.1.2')/vh('1.1.1')*ref('1.1.1')" }
          ]
        }
      ]
    },
    {
      "id": "s8",
      "label": "Sección 8: Gastos Financieros",
      "rows": [
        {
          "id": "8",
          "label": "GASTOS FINANCIEROS",
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA(hijos)",
          "children": [
            { "id": "8.1", "label": "- Intereses y comisiones", "calculationMethod": "FORMULA", "totalFormula": "vh('8.1.1')/vh('1.1.1')*ref('1.1.1')" },
            { "id": "8.2", "label": "- Otros Gastos Financ.", "calculationMethod": "FORMULA", "totalFormula": "0" }
          ]
        }
      ]
    },
    {
      "id": "s9",
      "label": "Sección 9: Gasto Financ. OSDE",
      "rows": [ { "id": "9", "label": "GASTO FINANC. OSDE", "calculationMethod": "FORMULA", "totalFormula": "vh('9.1')/vh('1.1.1')*ref('1.1.1')" } ]
    },
    {
      "id": "s10",
      "label": "Sección 10: Gastos Tributarios",
      "rows": [
        {
          "id": "10",
          "label": "GASTOS TRIBUTARIOS",
          "helpText": "Contribución a la Seguridad Social (14%) e Impuesto sobre la Fuerza de Trabajo (5%).",
          "calculationMethod": "FORMULA",
          "totalFormula": "=SUMA(hijos)",
          "children": [
            { "id": "10.1", "label": "De ello: -Contrib. Seg. Social (14%)", "calculationMethod": "FORMULA", "totalFormula": "=ROUND2(( ref('2.1') + ref('4.1.1') + ref('6.1.1') + ref('7.1.1') ) * 0.14 )" },
            { "id": "10.2", "label": "-Imp. Fuerza Trabajo (5%)", "calculationMethod": "FORMULA", "totalFormula": "=ROUND2(( ref('2.1') + ref('4.1.1') + ref('6.1.1') + ref('7.1.1') ) * 0.05 )" }
          ]
        }
      ]
    },
    {
      "id": "s11",
      "label": "Sección 11: TOTAL DE GASTOS",
      "rows": [ { "id": "11", "label": "TOTAL DE GASTOS (6+7+8+9+10)", "calculationMethod": "FORMULA", "totalFormula": "=SUMA(ref('6'), ref('7'), ref('8'), ref('9'), ref('10'))" } ]
    },
    {
      "id": "s12",
      "label": "Sección 12: TOTAL COSTOS Y GASTOS",
      "rows": [ { "id": "12.1", "label": "TOTAL COSTOS Y GASTOS (5+11)", "calculationMethod": "FORMULA", "totalFormula": "=SUMA(ref('5'), ref('11'))" } ]
    },
    {
      "id": "s13",
      "label": "Sección 13: Utilidad",
      "rows": [
        { "id": "13.1", "label": "Utilidad", "calculationMethod": "FORMULA", "totalFormula": "ref('12.1') * 0.3", "baseRef": "12" },
        { "id": "13.2", "label": "Precio antes de Impuesto", "calculationMethod": "FORMULA", "totalFormula": "ref('12.1') + ref('13.1')" },
        { "id": "13.3", "label": "Imp s/Ventas y Serv (13.3)", "calculationMethod": "FORMULA", "totalFormula": "ref('13.2')/0.9*0.1" }
      ]
    },
    {
      "id": "s14",
      "label": "Sección 14: Precio o Tarifa Final",
      "rows": [ { "id": "14.1", "label": "Precio o Tarifa Final", "calculationMethod": "FORMULA", "totalFormula": "ref('13.2') + ref('13.3')" } ]
    },
    {
      "id": "s15",
      "label": "Sección 15: Costo y gasto UNITARIO",
      "rows": [ { "id": "15.1", "label": "Costo y gasto UNITARIO", "calculationMethod": "FORMULA", "totalFormula": "ref('12.1') / quantity" } ]
    },
    {
      "id": "s16",
      "label": "Sección 16: VENTA UNITARIA",
      "rows": [ { "id": "16.1", "label": "VENTA UNITARIA", "calculationMethod": "FORMULA", "totalFormula": "ref('14.1') / quantity" } ]
    }
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
