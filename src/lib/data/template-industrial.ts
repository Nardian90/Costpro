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
          "totalFormula": "sum(children)",
          "children": [
            { "id": "1.1", "label": "De ello: - Insumos (MP)", "calculationMethod": "ANEXO", "baseRef": "I", "totalFormula": "AnexoI" },
            { "id": "1.2", "label": "- Combustibles y lubricantes", "calculationMethod": "ANEXO", "baseRef": "I", "totalFormula": "AnexoI" },
            { "id": "1.3", "label": "- Energía", "calculationMethod": "ANEXO", "baseRef": "I", "totalFormula": "AnexoI" }
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
          "totalFormula": "sum(children)",
          "children": [
            { "id": "2.1", "label": "De ello: Salarios", "calculationMethod": "ANEXO", "baseRef": "II", "totalFormula": "AnexoII" }
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
          "totalFormula": "sum(children)",
          "children": [
            { "id": "3.1", "label": "De ello: Otros", "calculationMethod": "ANEXO", "baseRef": "IV", "totalFormula": "AnexoIV" }
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
          "label": "Gastos Asociados Prod.",
          "calculationMethod": "FORMULA",
          "totalFormula": "ref('2.1') * 0.095 + AnexoIII",
          "helpText": "Incluye Depreciación del Anexo III"
        }
      ]
    },
    {
      "id": "s5",
      "label": "Sección 5: COSTO TOTAL",
      "rows": [
        {
          "id": "5",
          "label": "COSTO TOTAL",
          "calculationMethod": "FORMULA",
          "totalFormula": "ref('1') + ref('2') + ref('3') + ref('4')"
        }
      ]
    },
    {
      "id": "s6",
      "label": "Sección 6: Gtos. Grales y Admón.",
      "rows": [
        {
          "id": "6",
          "label": "Gtos. Grales y Admón.",
          "calculationMethod": "FORMULA",
          "totalFormula": "ref('2.1') * 0.08"
        }
      ]
    },
    {
      "id": "s7",
      "label": "Sección 7: Gtos. Dist. y Venta",
      "rows": [
        {
          "id": "7",
          "label": "Gtos. Dist. y Venta",
          "calculationMethod": "FORMULA",
          "totalFormula": "ref('5') * 0.04"
        }
      ]
    },
    { "id": "s8", "label": "Sección 8", "rows": [{ "id": "8", "label": "Gastos Financieros", "calculationMethod": "FORMULA", "totalFormula": "0" }] },
    { "id": "s9", "label": "Sección 9", "rows": [{ "id": "9", "label": "Gasto Financ. OSDE", "calculationMethod": "FORMULA", "totalFormula": "0" }] },
    { "id": "s10", "label": "Sección 10", "rows": [{ "id": "10", "label": "Gastos Tributarios", "calculationMethod": "FORMULA", "totalFormula": "0" }] },
    {
      "id": "s11",
      "label": "Sección 11: TOTAL DE GASTOS",
      "rows": [
        { "id": "11", "label": "TOTAL DE GASTOS", "calculationMethod": "FORMULA", "totalFormula": "ref('6') + ref('7') + ref('8') + ref('9') + ref('10')" }
      ]
    },
    {
      "id": "s12",
      "label": "Sección 12: TOTAL COSTOS Y GASTOS",
      "rows": [
        { "id": "12", "label": "TOTAL COSTOS Y GASTOS", "calculationMethod": "FORMULA", "totalFormula": "ref('5') + ref('11')" }
      ]
    },
    {
      "id": "s13",
      "label": "Sección 13: Utilidad",
      "rows": [
        { "id": "13", "label": "Utilidad", "calculationMethod": "FORMULA", "totalFormula": "ref('12') * 0.12" },
        { "id": "13.1", "label": "Precio antes de Impuesto", "calculationMethod": "FORMULA", "totalFormula": "ref('12') + ref('13')" },
        { "id": "13.2", "label": "Imp s/Ventas y Serv", "calculationMethod": "FORMULA", "totalFormula": "ref('13.1')/0.9*0.1" }
      ]
    },
    {
      "id": "s14",
      "label": "Sección 14: Precio o Tarifa Final",
      "rows": [
        { "id": "14", "label": "Precio o Tarifa Final", "calculationMethod": "FORMULA", "totalFormula": "ref('13.1') + ref('13.2')" }
      ]
    },
    {
      "id": "s15",
      "label": "Sección 15: Costo y gasto UNITARIO",
      "rows": [
        { "id": "15", "label": "Costo y gasto UNITARIO", "calculationMethod": "FORMULA", "totalFormula": "ref('12') / quantity" }
      ]
    },
    {
      "id": "s16",
      "label": "Sección 16: VENTA UNITARIA",
      "rows": [
        { "id": "16", "label": "VENTA UNITARIA", "calculationMethod": "FORMULA", "totalFormula": "ref('14') / quantity" }
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
        { "key": "worker_count", "label": "Cant" },
        { "key": "total", "label": "Total", "formula": "time_norm * hourly_rate * worker_count" }
      ],
      "data": [
        { "description": "Operador de Mezclado", "time_norm": 40, "hourly_rate": 250, "worker_count": 1 },
        { "description": "Químico de Control", "time_norm": 10, "hourly_rate": 450, "worker_count": 1 },
        { "description": "Auxiliar de Envasado", "time_norm": 20, "hourly_rate": 150, "worker_count": 1 }
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
  "version": "2.0.0",
  "metadata": {
    "author": "Jules",
    "description": "Ficha completa de 16 secciones para producción industrial a gran escala."
  }
};

export default template;
