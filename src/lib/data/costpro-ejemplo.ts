
import { CostSheetDataContract } from '@/contracts/cost-sheet';

const template: CostSheetDataContract = {
  "header": {
    "resolution": "Res 148/2023",
    "code": "",
    "name": "Paquete de Pan de 8 Bolas",
    "date": "2026-02-18",
    "quantity": 1,
    "currency": "CUP",
    "category": "",
    "type": "EMPRESA",
    "unit": "Paquete",
    "product_code": "",
    "company": "",
    "organism": "",
    "union": "",
    "destination": "",
    "production_level": "562",
    "capacity_utilization": 0.18,
    "sale_price": 8929.6,
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
      "id": "I",
      "title": "I - DESGLOSE DE MATERIAS PRIMAS Y MATERIALES FUNDAMENTALES",
      "columns": [
        {
          "key": "no",
          "label": "NO"
        },
        {
          "key": "classification",
          "label": "Clasificación"
        },
        {
          "key": "code",
          "label": "Código"
        },
        {
          "key": "description",
          "label": "Descripción de la Mat. Prima"
        },
        {
          "key": "um",
          "label": "UM"
        },
        {
          "key": "consumption_norm",
          "label": "Norma de Consumo"
        },
        {
          "key": "price",
          "label": "Precio Unitario"
        },
        {
          "key": "total",
          "label": "Total",
          "formula": "consumption_norm * price"
        }
      ],
      "data": [
        {
          "no": 0,
          "classification": "1.1.1 - De ello: - Insumos (MP)",
          "code": "",
          "description": "Harina de Trigo",
          "um": "Kg",
          "consumption_norm": 0.28,
          "price": 150,
          "total": 0
        },
        {
          "no": 0,
          "classification": "1.1.1 - De ello: - Insumos (MP)",
          "code": "",
          "description": "Agua",
          "um": "Lt",
          "consumption_norm": 0.16,
          "price": 15,
          "total": 0
        },
        {
          "no": 0,
          "classification": "1.1.1 - De ello: - Insumos (MP)",
          "code": "",
          "description": "Levadura",
          "um": "Kg",
          "consumption_norm": 0.008,
          "price": 200,
          "total": 0
        },
        {
          "no": 0,
          "classification": "1.1.1 - De ello: - Insumos (MP)",
          "code": "",
          "description": "Sal",
          "um": "Kg",
          "consumption_norm": 0.004,
          "price": 40,
          "total": 0
        },
        {
          "no": 0,
          "classification": "1.1.1 - De ello: - Insumos (MP)",
          "code": "",
          "description": "Azúcar",
          "um": "Kg",
          "consumption_norm": 0.012,
          "price": 120,
          "total": 0
        }
      ]
    },
    {
      "id": "II",
      "title": "II - DESGLOSE DE LOS GASTOS DE SALARIO DE LOS OBREROS",
      "columns": [
        {
          "key": "no",
          "label": "NO"
        },
        {
          "key": "classification",
          "label": "Clasificación"
        },
        {
          "key": "description",
          "label": "Descripción del Puesto"
        },
        {
          "key": "time_norm",
          "label": "Horas por Paquete"
        },
        {
          "key": "hourly_rate",
          "label": "Tarifa $/h"
        },
        {
          "key": "worker_count",
          "label": "Cant. Obreros"
        },
        {
          "key": "total",
          "label": "Total",
          "formula": "time_norm * hourly_rate * worker_count"
        }
      ],
      "data": [
        {
          "no": 0,
          "classification": "2.1.1 - De ello: Salarios",
          "description": "Panadero (Mezcla, formado, horneado)",
          "time_norm": 0.15,
          "hourly_rate": 45,
          "worker_count": 1,
          "total": 0
        }
      ]
    },
    {
      "id": "III",
      "title": "III - ANEXO DE DEPRECIACIÓN DE EQUIPOS",
      "columns": [
        {
          "key": "classification",
          "label": "Clasif."
        },
        {
          "key": "code",
          "label": "Código"
        },
        {
          "key": "name",
          "label": "Descripción del Equipo"
        },
        {
          "key": "initial_value",
          "label": "Valor de Compra"
        },
        {
          "key": "useful_life",
          "label": "% Deprec. Anual"
        },
        {
          "key": "quantity",
          "label": "Meses Vida Útil"
        },
        {
          "key": "depreciation_cost",
          "label": "Deprec. Mensual",
          "formula": "(initial_value * (useful_life / 100)) / quantity"
        }
      ],
      "data": [
        {
          "classification": "3.1.4 - -Maquinas y eq. productivos",
          "code": "",
          "name": "Horno Industrial (asignación proporcional)",
          "initial_value": 500000,
          "useful_life": 10,
          "quantity": 12,
          "depreciation_cost": 0
        },
        {
          "classification": "3.1.4 - -Maquinas y eq. productivos",
          "code": "",
          "name": "Amasadora (asignación proporcional)",
          "initial_value": 150000,
          "useful_life": 10,
          "quantity": 12,
          "depreciation_cost": 0
        }
      ]
    },
    {
      "id": "IV",
      "title": "IV - ANEXO DE OTROS GASTOS DIRECTOS",
      "columns": [
        {
          "key": "classification",
          "label": "Clasificación"
        },
        {
          "key": "code",
          "label": "Código"
        },
        {
          "key": "description",
          "label": "Descripción"
        },
        {
          "key": "amount",
          "label": "Importe por Paquete"
        }
      ],
      "data": [
        {
          "classification": "3.1 - OTROS GASTOS DIRECTOS",
          "code": "",
          "description": "Gas/Energía (horneado proporcional)",
          "amount": 25
        },
        {
          "classification": "3.1 - OTROS GASTOS DIRECTOS",
          "code": "",
          "description": "Empaque/Bolsa para 8 bolas",
          "amount": 5
        }
      ]
    },
    {
      "id": "V",
      "title": "V - ANEXO DE DIETAS DE TRABAJADORES",
      "columns": [
        {
          "key": "classification",
          "label": "Clasificación"
        },
        {
          "key": "code",
          "label": "Código"
        },
        {
          "key": "worker_name",
          "label": "Nombre del Trabajador"
        },
        {
          "key": "daily_allowance",
          "label": "Gasto de Dieta Diario"
        },
        {
          "key": "days",
          "label": "Días"
        },
        {
          "key": "total",
          "label": "Total",
          "formula": "daily_allowance * days"
        }
      ],
      "data": [
        {
          "classification": "",
          "code": "",
          "worker_name": "",
          "daily_allowance": "",
          "days": "",
          "total": 0
        }
      ]
    }
  ],
  "signature": {
    "prepared_by": "Elaborado por:",
    "approved_by": "Aprobado por:"
  },
  "id": "costpro-ejemplo",
  "name": "Producción de Paquete de Pan de 8 Bolas",
  "version": "5.7.25",
  "metadata": {
    "author": "Eli - Senior Specialist",
    "description": "Ficha de costos para panadería - lote unitario de 8 bolas de pan."
  },
  "footer": "FIN DEL DOCUMENTO • GENERADO AUTOMÁTICAMENTE POR COSTPRO "
};
export default template;
