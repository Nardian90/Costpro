const template = {
  "id": "costpro-full-v1",
  "name": "Ficha de Costo Completa (Cargada Dinámicamente)",
  "version": "1.0.0",
  "metadata": { "author": "CostPro" },
  "sections": [
    {
      "id": "s1",
      "label": "▪ Gasto Material",
      "rows": [
        { "id": "1", "fila": "1", "code": "gasto_material_total", "label": "Gasto Material", "path": "gastos/material/total", "readonly": true, "formula": "=sum(ref('1.1'), ref('1.2'), ref('1.3'), ref('1.4'))", "format": "money", "tags": ["total", "major"] },
        { "id": "1.1", "fila": "1.1", "code": "gasto_material_insumos", "label": "De ello: - Insumos (MP)", "path": "gastos/material/insumos", "format": "money", "tags": ["calculated"], "coefficient": 0, "base": "Anexo1", "calculationBases": [{ "label": "Anexo1", "ref": "Anexo1" }] },
        { "id": "1.2", "fila": "1.2", "code": "gasto_material_combustibles", "label": "- Combustibles y lubricantes", "path": "gastos/material/combustibles", "format": "money", "tags": ["calculated"], "coefficient": 0, "base": "1.1", "calculationBases": [{ "label": "Anexo1", "ref": "Anexo1" }, { "label": "Insumos Principales", "ref": "1.1" }, { "label": "Salario Directo", "ref": "2.1" }, { "label": "Cantidad", "ref": "cantidad" }, { "label": "Ajustar", "ref": "ajustar" }, { "label": "Libre", "ref": "libre" }] },
        { "id": "1.3", "fila": "1.3", "code": "gasto_material_energia", "label": "- Energía", "path": "gastos/material/energia", "format": "money", "tags": ["calculated"], "coefficient": 0, "base": "1.1", "calculationBases": [{ "label": "Anexo1", "ref": "Anexo1" }, { "label": "Insumos Principales", "ref": "1.1" }, { "label": "Salario Directo", "ref": "2.1" }, { "label": "Cantidad", "ref": "cantidad" }, { "label": "Ajustar", "ref": "ajustar" }, { "label": "Libre", "ref": "libre" }] },
        { "id": "1.4", "fila": "1.4", "code": "gasto_material_agua", "label": "- Agua", "path": "gastos/material/agua", "format": "money", "tags": ["calculated"], "coefficient": 0, "base": "1.1", "calculationBases": [{ "label": "Anexo1", "ref": "Anexo1" }, { "label": "Insumos Principales", "ref": "1.1" }, { "label": "Salario Directo", "ref": "2.1" }, { "label": "Cantidad", "ref": "cantidad" }, { "label": "Ajustar", "ref": "ajustar" }, { "label": "Libre", "ref": "libre" }] }
      ]
    },
    {
      "id": "s2",
      "label": "▪ Salario Directo",
      "rows": [
        { "id": "2", "fila": "2", "code": "salario_directo_total", "label": "Salario Directo", "path": "salarios/directo/total", "readonly": true, "formula": "=sum(ref('2.1'), ref('2.2'))", "format": "money", "tags": ["total", "major"] },
        { "id": "2.1", "fila": "2.1", "code": "salario_directo_salarios", "label": "De ello: Salarios", "path": "salarios/directo/salarios", "format": "money", "tags": ["calculated"], "coefficient": 0, "base": "Anexo2", "calculationBases": [{ "label": "Anexo2", "ref": "Anexo2" }] },
        { "id": "2.2", "fila": "2.2", "code": "salario_directo_vacaciones", "label": "Vacaciones", "path": "salarios/directo/vacaciones", "readonly": true, "formula": "=round2(pct(ref('2.1'), 9.09))", "format": "money", "tags": ["calculated"] }
      ]
    },
     {
      "id": "s3",
      "label": "▪ Otros Gastos Directos",
      "rows": [
        { "id": "3", "fila": "3", "code": "otros_gastos_directos_total", "label": "Otros Gastos Directos", "path": "gastos/directos/total", "readonly": true, "formula": "=sum(ref('3.1'), ref('3.2'), ref('3.3'), ref('3.4'), ref('3.5'), ref('3.6'), ref('3.7'))", "format": "money", "tags": ["total", "major"] },
        { "id": "3.1", "fila": "3.1", "code": "otros_gastos_directos_depreciacion_total", "label": "De ello: - Depreciación (Total)", "path": "gastos/directos/depreciacion/total", "readonly": true, "formula": "=sum(ref('3.1.1'), ref('3.1.2'), ref('3.1.3'), ref('3.1.4'), ref('3.1.5'))", "format": "money", "tags": ["subtotal"] },
        { "id": "3.1.1", "fila": "3.1.1", "code": "otros_gastos_directos_depreciacion_edificios", "label": "--Edificios", "path": "gastos/directos/depreciacion/edificios", "format": "money", "tags": ["calculated"], "coefficient": 0, "base": "Anexo3", "clasificacion": "edificios", "calculationBases": [{ "label": "Anexo3", "ref": "Anexo3" }, { "label": "Insumos Principales", "ref": "1.1" }, { "label": "Salario Directo", "ref": "2.1" }, { "label": "Cantidad", "ref": "cantidad" }, { "label": "Ajustar", "ref": "ajustar" }, { "label": "Libre", "ref": "libre" }] },
        { "id": "3.1.2", "fila": "3.1.2", "code": "otros_gastos_directos_depreciacion_otras", "label": "--Otras Construcciones", "path": "gastos/directos/depreciacion/otras", "format": "money", "tags": ["calculated"], "coefficient": 0, "base": "Anexo3", "clasificacion": "otras_construcciones", "calculationBases": [{ "label": "Anexo3", "ref": "Anexo3" }, { "label": "Insumos Principales", "ref": "1.1" }, { "label": "Salario Directo", "ref": "2.1" }, { "label": "Cantidad", "ref": "cantidad" }, { "label": "Ajustar", "ref": "ajustar" }, { "label": "Libre", "ref": "libre" }] },
        { "id": "3.1.3", "fila": "3.1.3", "code": "otros_gastos_directos_depreciacion_maquinas_energeticos", "label": "--Maquinas y eq. energéticos", "path": "gastos/directos/depreciacion/maquinas_energeticos", "format": "money", "tags": ["calculated"], "coefficient": 0, "base": "Anexo3", "clasificacion": "maquinaria_energetica", "calculationBases": [{ "label": "Anexo3", "ref": "Anexo3" }, { "label": "Insumos Principales", "ref": "1.1" }, { "label": "Salario Directo", "ref": "2.1" }, { "label": "Cantidad", "ref": "cantidad" }, { "label": "Ajustar", "ref": "ajustar" }, { "label": "Libre", "ref": "libre" }] },
        { "id": "3.1.4", "fila": "3.1.4", "code": "otros_gastos_directos_depreciacion_maquinas_productivos", "label": "--Maquinas y eq. productivos", "path": "gastos/directos/depreciacion/maquinas_productivos", "format": "money", "tags": ["calculated"], "coefficient": 0, "base": "Anexo3", "clasificacion": "maquinaria_productiva", "calculationBases": [{ "label": "Anexo3", "ref": "Anexo3" }, { "label": "Insumos Principales", "ref": "1.1" }, { "label": "Salario Directo", "ref": "2.1" }, { "label": "Cantidad", "ref": "cantidad" }, { "label": "Ajustar", "ref": "ajustar" }, { "label": "Libre", "ref": "libre" }] },
        { "id": "3.1.5", "fila": "3.1.5", "code": "otros_gastos_directos_depreciacion_aparatos_tecnicos", "label": "--Aparatos y eq. Técnicos", "path": "gastos/directos/depreciacion/aparatos_tecnicos", "format": "money", "tags": ["calculated"], "coefficient": 0, "base": "Anexo3", "clasificacion": "equipos_tecnicos", "calculationBases": [{ "label": "Anexo3", "ref": "Anexo3" }, { "label": "Insumos Principales", "ref": "1.1" }, { "label": "Salario Directo", "ref": "2.1" }, { "label": "Cantidad", "ref": "cantidad" }, { "label": "Ajustar", "ref": "ajustar" }, { "label": "Libre", "ref": "libre" }] },
        { "id": "3.2", "fila": "3.2", "code": "otros_gastos_directos_mantenimiento", "label": "-Mantenimiento", "path": "gastos/directos/mantenimiento", "format": "money", "tags": ["calculated"], "coefficient": 0, "base": "Anexo4", "calculationBases": [{ "label": "Anexo4", "ref": "Anexo4" }, { "label": "Insumos Principales", "ref": "1.1" }, { "label": "Salario Directo", "ref": "2.1" }, { "label": "Cantidad", "ref": "cantidad" }, { "label": "Ajustar", "ref": "ajustar" }, { "label": "Libre", "ref": "libre" }] },
        { "id": "3.3", "fila": "3.3", "code": "otros_gastos_directos_servicios", "label": "-Servicios contratados", "path": "gastos/directos/servicios", "format": "money", "tags": ["calculated"], "coefficient": 0, "base": "Anexo4", "calculationBases": [{ "label": "Anexo4", "ref": "Anexo4" }, { "label": "Insumos Principales", "ref": "1.1" }, { "label": "Salario Directo", "ref": "2.1" }, { "label": "Cantidad", "ref": "cantidad" }, { "label": "Ajustar", "ref": "ajustar" }, { "label": "Libre", "ref": "libre" }] },
        { "id": "3.4", "fila": "3.4", "code": "otros_gastos_directos_proteccion", "label": "-Medios de protección", "path": "gastos/directos/proteccion", "format": "money", "tags": ["calculated"], "coefficient": 0, "base": "Anexo4", "calculationBases": [{ "label": "Anexo4", "ref": "Anexo4" }, { "label": "Insumos Principales", "ref": "1.1" }, { "label": "Salario Directo", "ref": "2.1" }, { "label": "Cantidad", "ref": "cantidad" }, { "label": "Ajustar", "ref": "ajustar" }, { "label": "Libre", "ref": "libre" }] },
        { "id": "3.5", "fila": "3.5", "code": "otros_gastos_directos_alquiler", "label": "-Alquiler_locales", "path": "gastos/directos/alquiler", "format": "money", "tags": ["calculated"], "coefficient": 0, "base": "Anexo4", "calculationBases": [{ "label": "Anexo4", "ref": "Anexo4" }, { "label": "Insumos Principales", "ref": "1.1" }, { "label": "Salario Directo", "ref": "2.1" }, { "label": "Cantidad", "ref": "cantidad" }, { "label": "Ajustar", "ref": "ajustar" }, { "label": "Libre", "ref": "libre" }] },
        { "id": "3.6", "fila": "3.6", "code": "otros_gastos_directos_alimentacion", "label": "-Alimentacion", "path": "gastos/directos/alimentacion", "format": "money", "tags": ["calculated"], "coefficient": 0, "base": "Anexo4", "calculationBases": [{ "label": "Anexo4", "ref": "Anexo4" }, { "label": "Insumos Principales", "ref": "1.1" }, { "label": "Salario Directo", "ref": "2.1" }, { "label": "Cantidad", "ref": "cantidad" }, { "label": "Ajustar", "ref": "ajustar" }, { "label": "Libre", "ref": "libre" }] },
        { "id": "3.7", "fila": "3.7", "code": "otros_gastos_directos_dietas", "label": "-Dietas", "path": "gastos/directos/dietas", "format": "money", "tags": ["calculated"], "coefficient": 0, "base": "Anexo5", "calculationBases": [{ "label": "Anexo5", "ref": "Anexo5" }, { "label": "Insumos Principales", "ref": "1.1" }, { "label": "Salario Directo", "ref": "2.1" }, { "label": "Cantidad", "ref": "cantidad" }, { "label": "Ajustar", "ref": "ajustar" }, { "label": "Libre", "ref": "libre" }] }
      ]
    },
    {
      "id": "s4",
      "label": "● Gastos Asociados Prod.",
      "rows": [
        { "id": "4", "fila": "4", "code": "gastos_asociados_prod_total", "label": "Gastos Asociados Prod.", "path": "gastos/asociados_prod/total", "readonly": true, "formula": "=sum(ref('4.1'), ref('4.2'))", "format": "money", "tags": ["total", "major"] },
        { "id": "4.1", "fila": "4.1", "code": "gastos_asociados_prod_salarios", "label": "De ello: Salarios", "path": "gastos/asociados_prod/salarios", "format": "money", "tags": ["calculated"], "coefficient": 0, "base": "1.1", "calculationBases": [{ "label": "Insumos Principales", "ref": "1.1" }, { "label": "Salario Directo", "ref": "2.1" }, { "label": "Cantidad", "ref": "cantidad" }, { "label": "Ajustar", "ref": "ajustar" }, { "label": "Libre", "ref": "libre" }] },
        { "id": "4.2", "fila": "4.2", "code": "gastos_asociados_prod_otros", "label": "-Otros gastos", "path": "gastos/asociados_prod/otros", "format": "money", "tags": ["calculated"], "coefficient": 0, "base": "1.1", "calculationBases": [{ "label": "Insumos Principales", "ref": "1.1" }, { "label": "Salario Directo", "ref": "2.1" }, { "label": "Cantidad", "ref": "cantidad" }, { "label": "Ajustar", "ref": "ajustar" }, { "label": "Libre", "ref": "libre" }] }
      ]
    },
    {
      "id": "s5",
      "label": "● COSTO TOTAL",
      "rows": [
        { "id": "5", "fila": "5", "code": "costo_total", "label": "COSTO TOTAL (1+2+3+4)", "path": "costos/total", "readonly": true, "formula": "=sum(ref('1'), ref('2'), ref('3'), ref('4'))", "format": "money", "tags": ["total", "major"] }
      ]
    },
    {
      "id": "s6",
      "label": "● Gtos. Grales y Admón.",
      "rows": [
        { "id": "6", "fila": "6", "code": "gtos_grales_admon_total", "label": "Gtos. Grales y Admón.", "path": "gastos/generales_admon/total", "readonly": true, "formula": "=sum(ref('6.1'), ref('6.2'), ref('6.3'), ref('6.4'), ref('6.5'))", "format": "money", "tags": ["total", "major"] },
        { "id": "6.1", "fila": "6.1", "code": "gtos_grales_admon_salarios", "label": "De ello: Salarios", "path": "gastos/generales_admon/salarios", "format": "money", "tags": ["calculated"], "coefficient": 0, "base": "1.1", "calculationBases": [{ "label": "Insumos Principales", "ref": "1.1" }, { "label": "Salario Directo", "ref": "2.1" }, { "label": "Cantidad", "ref": "cantidad" }, { "label": "Ajustar", "ref": "ajustar" }, { "label": "Libre", "ref": "libre" }] },
        { "id": "6.2", "fila": "6.2", "code": "gtos_grales_admon_comunicacion", "label": "-Comunicación", "path": "gastos/generales_admon/comunicacion", "format": "money", "tags": ["calculated"], "coefficient": 0, "base": "1.1", "calculationBases": [{ "label": "Insumos Principales", "ref": "1.1" }, { "label": "Salario Directo", "ref": "2.1" }, { "label": "Cantidad", "ref": "cantidad" }, { "label": "Ajustar", "ref": "ajustar" }, { "label": "Libre", "ref": "libre" }] },
        { "id": "6.3", "fila": "6.3", "code": "gtos_grales_admon_depreciacion", "label": "-Depreciacion", "path": "gastos/generales_admon/depreciacion", "format": "money", "tags": ["calculated"], "coefficient": 0, "base": "1.1", "calculationBases": [{ "label": "Insumos Principales", "ref": "1.1" }, { "label": "Salario Directo", "ref": "2.1" }, { "label": "Cantidad", "ref": "cantidad" }, { "label": "Ajustar", "ref": "ajustar" }, { "label": "Libre", "ref": "libre" }] },
        { "id": "6.4", "fila": "6.4", "code": "gtos_grales_admon_energia", "label": "-Energia", "path": "gastos/generales_admon/energia", "format": "money", "tags": ["calculated"], "coefficient": 0, "base": "1.1", "calculationBases": [{ "label": "Insumos Principales", "ref": "1.1" }, { "label": "Salario Directo", "ref": "2.1" }, { "label": "Cantidad", "ref": "cantidad" }, { "label": "Ajustar", "ref": "ajustar" }, { "label": "Libre", "ref": "libre" }] },
        { "id": "6.5", "fila": "6.5", "code": "gtos_grales_admon_otros", "label": "-Otros Gastos Admin.", "path": "gastos/generales_admon/otros", "format": "money", "tags": ["calculated"], "coefficient": 0, "base": "1.1", "calculationBases": [{ "label": "Insumos Principales", "ref": "1.1" }, { "label": "Salario Directo", "ref": "2.1" }, { "label": "Cantidad", "ref": "cantidad" }, { "label": "Ajustar", "ref": "ajustar" }, { "label": "Libre", "ref": "libre" }] }
      ]
    },
    {
      "id": "s7",
      "label": "● Gtos. Dist. y Venta",
      "rows": [
        { "id": "7", "fila": "7", "code": "gtos_dist_venta_total", "label": "Gtos. Dist. y Venta", "path": "gastos/distribucion_venta/total", "readonly": true, "formula": "=sum(ref('7.1'), ref('7.2'))", "format": "money", "tags": ["total", "major"] },
        { "id": "7.1", "fila": "7.1", "code": "gtos_dist_venta_salarios", "label": "De ello: Salarios", "path": "gastos/distribucion_venta/salarios", "format": "money", "tags": ["calculated"], "coefficient": 0, "base": "1.1", "calculationBases": [{ "label": "Insumos Principales", "ref": "1.1" }, { "label": "Salario Directo", "ref": "2.1" }, { "label": "Cantidad", "ref": "cantidad" }, { "label": "Ajustar", "ref": "ajustar" }, { "label": "Libre", "ref": "libre" }] },
        { "id": "7.2", "fila": "7.2", "code": "gtos_dist_venta_otros", "label": "-Otros gastos", "path": "gastos/distribucion_venta/otros", "format": "money", "tags": ["calculated"], "coefficient": 0, "base": "1.1", "calculationBases": [{ "label": "Insumos Principales", "ref": "1.1" }, { "label": "Salario Directo", "ref": "2.1" }, { "label": "Cantidad", "ref": "cantidad" }, { "label": "Ajustar", "ref": "ajustar" }, { "label": "Libre", "ref": "libre" }] }
      ]
    },
    {
      "id": "s8",
      "label": "● Gastos Financieros",
      "rows": [
        { "id": "8", "fila": "8", "code": "gastos_financieros_total", "label": "Gastos Financieros", "path": "gastos/financieros/total", "readonly": true, "formula": "=sum(ref('8.1'), ref('8.2'))", "format": "money", "tags": ["total", "major"] },
        { "id": "8.1", "fila": "8.1", "code": "gastos_financieros_intereses", "label": "De ello: Intereses y comisiones", "path": "gastos/financieros/intereses", "format": "money", "tags": ["calculated"], "coefficient": 0, "base": "1.1", "calculationBases": [{ "label": "Insumos Principales", "ref": "1.1" }, { "label": "Salario Directo", "ref": "2.1" }, { "label": "Cantidad", "ref": "cantidad" }, { "label": "Ajustar", "ref": "ajustar" }, { "label": "Libre", "ref": "libre" }] },
        { "id": "8.2", "fila": "8.2", "code": "gastos_financieros_otros", "label": "-Otros Gastos Financ.", "path": "gastos/financieros/otros", "format": "money", "tags": ["calculated"], "coefficient": 0, "base": "1.1", "calculationBases": [{ "label": "Insumos Principales", "ref": "1.1" }, { "label": "Salario Directo", "ref": "2.1" }, { "label": "Cantidad", "ref": "cantidad" }, { "label": "Ajustar", "ref": "ajustar" }, { "label": "Libre", "ref": "libre" }] }
      ]
    },
    {
      "id": "s9",
      "label": "● Gasto Financ. OSDE",
      "rows": [
        { "id": "9", "fila": "9", "code": "gasto_financ_osde", "label": "Gasto Financ. OSDE", "path": "gastos/financ_osde", "format": "money", "tags": ["calculated"], "coefficient": 0, "base": "1.1", "calculationBases": [{ "label": "Insumos Principales", "ref": "1.1" }, { "label": "Salario Directo", "ref": "2.1" }, { "label": "Cantidad", "ref": "cantidad" }, { "label": "Ajustar", "ref": "ajustar" }, { "label": "Libre", "ref": "libre" }] }
      ]
    },
    {
      "id": "s10",
      "label": "● Gastos Tributarios",
      "rows": [
        { "id": "10", "fila": "10", "code": "gastos_tributarios_total", "label": "Gastos Tributarios", "path": "tributos/total", "readonly": true, "formula": "=sum(ref('10.1'), ref('10.2'))", "format": "money", "tags": ["total", "major"] },
        { "id": "10.1", "fila": "10.1", "code": "gastos_tributarios_seg_social", "label": "De ello: -Contrib. Seg. Social (14%)", "path": "tributos/seg_social", "readonly": true, "formula": "=pct(sum(ref('2'), ref('4.1'), ref('6.1'), ref('7.1')), 14)", "format": "money", "tags": ["calculated"] },
        { "id": "10.2", "fila": "10.2", "code": "gastos_tributarios_fuerza_trabajo", "label": "-Imp. Fuerza Trabajo (5%)", "path": "tributos/fuerza_trabajo", "readonly": true, "formula": "=pct(sum(ref('2'), ref('4.1'), ref('6.1'), ref('7.1')), 5)", "format": "money", "tags": ["calculated"] }
      ]
    },
    {
      "id": "s11",
      "label": "● TOTAL DE GASTOS",
      "rows": [
        { "id": "11", "fila": "11", "code": "total_gastos", "label": "TOTAL DE GASTOS (6+7+8+9+10)", "path": "gastos/total", "readonly": true, "formula": "=sum(ref('6'), ref('7'), ref('8'), ref('9'), ref('10'))", "format": "money", "tags": ["total", "major"] }
      ]
    },
    {
      "id": "s12",
      "label": "● TOTAL COSTOS Y GASTOS",
      "rows": [
        { "id": "12", "fila": "12", "code": "total_costos_gastos", "label": "TOTAL COSTOS Y GASTOS (5+11)", "path": "resultado/total_costos_gastos", "readonly": true, "formula": "=sum(ref('5'), ref('11'))", "format": "money", "tags": ["total", "major", "base"] }
      ]
    },
    {
      "id": "s13",
      "label": "● RESULTADO FINAL",
      "rows": [
        { "id": "13", "fila": "13", "code": "resultado_utilidad", "label": "Utilidad", "path": "resultado/utilidad", "tags": ["calculated"], "coefficient": 30, "base": "12", "calculationBases": [{ "label": "Costo y Gasto", "ref": "12" }, { "label": "Costo Elab", "ref": "costo_elab" }, { "label": "Libre", "ref": "libre" }] },
        { "id": "13.1", "fila": "13.1", "code": "resultado_precio_antes_imp", "label": "Precio antes de Impuesto", "path": "resultado/precio_antes_imp", "readonly": true, "formula": "=sum(ref('12'), ref('13'))", "format": "money", "tags": ["total", "base"] },
        { "id": "13.2", "fila": "13.2", "code": "resultado_impuesto_ventas", "label": "Imp s/Ventas y Serv", "path": "resultado/impuesto_ventas", "tags": ["calculated"], "coefficient": 10, "base": "precio_s_imp", "calculationBases": [
          { "label": "Precio s/Imp", "ref": "precio_s_imp", "formula": "=(ref('13.1') / (1 - ref('historico')/100)) - ref('13.1')" },
          { "label": "Precio a/Imp", "ref": "13.1", "formula": "=ref('13.1') * (ref('historico') / 100)" },
          { "label": "Libre", "ref": "libre", "formula": "=ref('historico')" }
        ], "defaultValue": 10 },
        { "id": "14", "fila": "14", "code": "resultado_final", "label": "Precio o Tarifa Final", "path": "resultado/final", "readonly": true, "formula": "=sum(ref('13.1'), ref('13.2'))", "format": "money", "tags": ["total", "major", "final"] }
      ]
    },
    {
      "id": "s14",
      "label": "● UNITARIOS",
      "rows": [
        { "id": "15", "fila": "15", "code": "costo_unitario", "label": "Costo y gasto UNITARIO", "path": "resultado/costo_unitario", "readonly": true, "format": "money", "tags": ["total", "major"] },
        { "id": "16", "fila": "16", "code": "venta_unitaria", "label": "VENTA UNITARIA", "path": "resultado/venta_unitaria", "readonly": true, "format": "money", "tags": ["total", "major", "final"] }
      ]
    }
  ]
};
export default template;
