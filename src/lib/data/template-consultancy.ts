import { CostSheetDataContract } from '@/contracts/cost-sheet';

const template: CostSheetDataContract = {
  "header": {
    "code": "SERV-001",
    "name": "Consultoría Estratégica Mensual",
    "date": new Date().toISOString().split('T')[0],
    "quantity": 1,
    "currency": "CUP",
    "category": "Servicios Professionales",
    "type": "SERVICIO",
    "unit": "Proyecto",
    "product_code": "S-CONSULT-01",
    "company": "Asesores Globales",
    "organism": "",
    "union": "",
    "destination": "Empresas",
    "production_level": 1,
    "capacity_utilization": 1,
    "sale_price": 75000,
    "client": ""
  },
  "sections": [
    {
      "id": "s1", "label": "Sección 1: Gasto Material", "rows": [ { "id": "1", "label": "GASTO MATERIAL", "calculationMethod": "FORMULA", "totalFormula": "AnexoI" } ]
    },
    {
      "id": "s2", "label": "Sección 2: SALARIO DIRECTO", "rows": [ { "id": "2", "label": "SALARIO DIRECTO", "calculationMethod": "FORMULA", "totalFormula": "AnexoII" } ]
    },
    {
      "id": "s3", "label": "Sección 3: OTROS GASTOS DIRECTOS", "rows": [ { "id": "3", "label": "OTROS GASTOS DIRECTOS", "calculationMethod": "FORMULA", "totalFormula": "AnexoIV" } ]
    },
    {
      "id": "s4", "label": "Sección 4: Gastos Asociados Prod.", "rows": [ { "id": "4", "label": "Gastos Asociados Prod.", "calculationMethod": "FORMULA", "totalFormula": "ref('2') * 0.095" } ]
    },
    {
      "id": "s5", "label": "Sección 5: COSTO TOTAL", "rows": [ { "id": "5", "label": "COSTO TOTAL", "calculationMethod": "FORMULA", "totalFormula": "ref('1') + ref('2') + ref('3') + ref('4')" } ]
    },
    {
      "id": "s6", "label": "Sección 6: Gtos. Grales y Admón.", "rows": [ { "id": "6", "label": "Gtos. Grales y Admón.", "calculationMethod": "FORMULA", "totalFormula": "ref('2') * 0.20" } ]
    },
    {
      "id": "s7", "label": "Sección 7: Gtos. Dist. y Venta", "rows": [ { "id": "7", "label": "Gtos. Dist. y Venta", "calculationMethod": "FORMULA", "totalFormula": "ref('5') * 0.05" } ]
    },
    { "id": "s8", "label": "Sección 8", "rows": [{ "id": "8", "label": "Gastos Financieros", "calculationMethod": "FORMULA", "totalFormula": "0" }] },
    { "id": "s9", "label": "Sección 9", "rows": [{ "id": "9", "label": "Gasto Financ. OSDE", "calculationMethod": "FORMULA", "totalFormula": "0" }] },
    { "id": "s10", "label": "Sección 10", "rows": [{ "id": "10", "label": "Gastos Tributarios", "calculationMethod": "FORMULA", "totalFormula": "0" }] },
    {
      "id": "s11", "label": "Sección 11: TOTAL DE GASTOS", "rows": [ { "id": "11", "label": "TOTAL DE GASTOS", "calculationMethod": "FORMULA", "totalFormula": "ref('6') + ref('7') + ref('8') + ref('9') + ref('10')" } ]
    },
    {
      "id": "s12", "label": "Sección 12: TOTAL COSTOS Y GASTOS", "rows": [ { "id": "12", "label": "TOTAL COSTOS Y GASTOS", "calculationMethod": "FORMULA", "totalFormula": "ref('5') + ref('11')" } ]
    },
    {
      "id": "s13", "label": "Sección 13: Utilidad", "rows": [
        { "id": "13", "label": "Utilidad", "calculationMethod": "FORMULA", "totalFormula": "ref('12') * 0.40" },
        { "id": "13.1", "label": "Precio antes de Impuesto", "calculationMethod": "FORMULA", "totalFormula": "ref('12') + ref('13')" },
        { "id": "13.2", "label": "Imp s/Ventas y Serv", "calculationMethod": "FORMULA", "totalFormula": "ref('13.1')/0.9*0.1" }
      ]
    },
    {
      "id": "s14", "label": "Sección 14: Precio o Tarifa Final", "rows": [ { "id": "14", "label": "Precio o Tarifa Final", "calculationMethod": "FORMULA", "totalFormula": "ref('13.1') + ref('13.2')" } ]
    },
    {
      "id": "s15", "label": "Sección 15: Costo y gasto UNITARIO", "rows": [ { "id": "15", "label": "Costo y gasto UNITARIO", "calculationMethod": "FORMULA", "totalFormula": "ref('12') / quantity" } ]
    },
    {
      "id": "s16", "label": "Sección 16: VENTA UNITARIA", "rows": [ { "id": "16", "label": "VENTA UNITARIA", "calculationMethod": "FORMULA", "totalFormula": "ref('14') / quantity" } ]
    }
  ],
  "annexes": [
    {
      "id": "I", "title": "I - MATERIALES DE OFICINA", "columns": [
        { "key": "description", "label": "Descripción" },
        { "key": "um", "label": "UM" },
        { "key": "consumption_norm", "label": "Cant" },
        { "key": "price", "label": "Precio" },
        { "key": "total", "label": "Total", "formula": "consumption_norm * price" }
      ],
      "data": [
        { "description": "Resmas de Papel A4", "um": "Paquete", "consumption_norm": 5, "price": 1200 },
        { "description": "Tóner para Impresora", "um": "U", "consumption_norm": 1, "price": 4500 }
      ]
    },
    {
      "id": "II", "title": "II - ESPECIALISTAS", "columns": [
        { "key": "description", "label": "Puesto" },
        { "key": "time_norm", "label": "Horas" },
        { "key": "hourly_rate", "label": "Tarifa" },
        { "key": "worker_count", "label": "Cant" },
        { "key": "total", "label": "Total", "formula": "time_norm * hourly_rate * worker_count" }
      ],
      "data": [
        { "description": "Consultor Senior", "time_norm": 40, "hourly_rate": 800, "worker_count": 1 },
        { "description": "Analista de Datos", "time_norm": 20, "hourly_rate": 450, "worker_count": 1 }
      ]
    },
    { "id": "III", "title": "III - DEPRECIACIÓN", "columns": [], "data": [] },
    {
      "id": "IV", "title": "IV - OTROS GASTOS", "columns": [
        { "key": "description", "label": "Descripción" },
        { "key": "amount", "label": "Importe" }
      ],
      "data": [
        { "description": "Suscripción Software BI", "amount": 3500 },
        { "description": "Internet de Alta Velocidad", "amount": 2000 }
      ]
    },
    { "id": "V", "title": "V - DIETAS", "columns": [], "data": [] }
  ],
  "signature": { "prepared_by": "Socio Principal", "approved_by": "Cliente" },
  "id": "template-consultancy",
  "name": "Consultoría Estratégica",
  "version": "1.0.0",
  "metadata": {
    "author": "Jules",
    "description": "Modelo de costos para servicios de consultoría profesional."
  }
};

export default template;
