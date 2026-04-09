import { CostSheetDataContract } from '@/contracts/cost-sheet';

const template: CostSheetDataContract = {
  "header": {
    "code": "REP-001",
    "name": "Reparación de Pantalla iPhone 13",
    "date": new Date().toISOString().split('T')[0],
    "quantity": 1,
    "currency": "CUP",
    "category": "Soporte Técnico",
    "type": "SERVICIO",
    "unit": "Reparación",
    "product_code": "S-REPAIR-IP13",
    "company": "TechFix",
    "organism": "",
    "union": "",
    "destination": "Público",
    "production_level": 1,
    "capacity_utilization": 1,
    "sale_price": 15000,
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
      "id": "I", "title": "I - REPUESTOS", "columns": [
        { "key": "description", "label": "Repuesto" },
        { "key": "um", "label": "UM" },
        { "key": "consumption_norm", "label": "Cant" },
        { "key": "price", "label": "Precio" },
        { "key": "total", "label": "Total", "formula": "consumption_norm * price" }
      ],
      "data": [
        { "description": "Pantalla OLED iPhone 13 Original", "um": "U", "consumption_norm": 1, "price": 8500 },
        { "description": "Pegamento Especial", "um": "Tubo", "consumption_norm": 0.1, "price": 450 }
      ]
    },
    {
      "id": "II", "title": "II - TÉCNICOS", "columns": [
        { "key": "description", "label": "Puesto" },
        { "key": "time_norm", "label": "Horas" },
        { "key": "hourly_rate", "label": "Tarifa" },
        { "key": "worker_count", "label": "Cant" },
        { "key": "total", "label": "Total", "formula": "time_norm * hourly_rate * worker_count" }
      ],
      "data": [
        { "description": "Técnico de Nivel 3", "time_norm": 2, "hourly_rate": 600, "worker_count": 1 }
      ]
    },
    { "id": "III", "title": "III - DEPRECIACIÓN", "columns": [], "data": [] },
    {
      "id": "IV", "title": "IV - OTROS GASTOS", "columns": [
        { "key": "description", "label": "Descripción" },
        { "key": "amount", "label": "Importe" }
      ],
      "data": [
        { "description": "Uso de Máquina de Vacío", "amount": 200 },
        { "description": "Garantía Extendida (Seguro)", "amount": 500 }
      ]
    },
    { "id": "V", "title": "V - DIETAS", "columns": [], "data": [] }
  ],
  "signature": { "prepared_by": "Técnico", "approved_by": "Gerente" },
  "id": "template-repair",
  "name": "Reparación de Dispositivos",
  "version": "1.0.0",
  "metadata": {
    "author": "Jules",
    "description": "Modelo para servicios técnicos y reparación de hardware."
  }
};

export default template;
