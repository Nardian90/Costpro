# CONCILIACIÓN INTEGRAL DE INVENTARIO — ENERVIDA-VITALLCONS (corte 16/10/2026)

**Alcance:** los 183 códigos de referencia (1–181 + 998 + 999) contra la fuente canónica de COSTPRO.
**Fuente de verdad:** `inventory` (stock actual por tienda/producto, actualizado por el trigger canónico `tr_sync_inventory_after_movement`) y `stock_movements` (Kardex inmutable con `quantity_change` con signo y `movement_date` = fecha económica). La reconstrucción usa `SUM(quantity_change)` por producto/tienda — sin doble contabilización: las reversiones/anulaciones aportan sus movimientos compensatorios, y no existen estados borrador (los vales se crean directamente `completed`).
**Fórmula de control:** `Existencia final = saldo inicial del período + entradas válidas − salidas válidas + reversiones netas`; en COSTPRO el ledger reconstruye el saldo total desde el origen (`initial`/compras/ventas/VS/transferencias/ajustes), por lo que el «stock reconstruido» aquí es la suma histórica completa. Donde reconstruido ≠ actual se señala «Historial incompleto».
**No se modificó ninguna existencia, nombre ni catálogo durante esta misión.** Las diferencias quedan documentadas para decisión del propietario.

## 1. Resumen ejecutivo

- **183 códigos de referencia verificados** (177 con producto en catálogo + 4 inexistentes; los servicios 998/999 existen y concilian a 0).
- **Conciliados: 176** (stock actual = existencia final de referencia), incluidos los 14 SKU tocados por las 19 operaciones registradas — el inventario post-operaciones coincide exactamente con la referencia.
- **1 diferencia de stock:** código 139 (Panel de 640 W Suntech) −2 unidades, **explicada**: su entrada (fila 20) está pendiente de proveedor + costo unitario, datos que la fuente no aporta y la misión prohíbe inventar.
- **4 códigos inexistentes en catálogo:** 178 (Brecker DC 125 Doble), 179 (Brecker AC 25 Doble), 180 (Pintura Blanco 4L), 181 (Pintura Amarillo 4L) — referencia con stock 0; decisión pendiente (crear producto o retirar del listado).
- **23 diferencias de nombre:** 16 de formato (tildes/mayúsculas), 5 variantes posiblemente equivalentes, 2 conflictos de identidad reales (códigos 162 y 176).
- **0 SKUs del catálogo fuera de la referencia** (el catálogo de ENERVIDA es exactamente el universo de referencia, menos los 4 códigos inexistentes).

## 2. Conciliación por producto (183 códigos)

| Código | Descripción de referencia | Descripción real | Stock esperado | Stock actual | Stock reconstruido | Diferencia | Estado |
|---:|---|---|---:|---:|---:|---:|---|

| 1 | Abrazadera metálica de 3/4 | Abrazadera metálica de 3/4 | 18 | 18 | 18 | 0 | Conciliado |
| 2 | Abrazadera metálica de 1 pulgada | Abrazadera metálica de 1 pulgada | 32 | 32 | 32 | 0 | Conciliado |
| 3 | Araganes | Araganes | 0 | 0 | 0 | 0 | Conciliado |
| 4 | Bisagra | Bisagra | 1 | 1 | 1 | 0 | Conciliado |
| 5 | Brecker 16A Sencillo | Brecker 16A Sencillo | 0 | 0 | 0 | 0 | Conciliado |
| 6 | Brecker 25 A Sencillo | Brecker 25 A Sencillo | 0 | 0 | 0 | 0 | Conciliado |
| 7 | Brecker 32A Trifasico | Brecker 32A Trifasico | 0 | 0 | 0 | 0 | Conciliado (sin movimientos registrados) |
| 8 | Brecker C32 A Trible | Brecker C32 A Triple | 0 | 0 | 0 | 0 | Conciliado |
| 9 | Brecker D 63A | Brecker D 63A | 1 | 1 | 1 | 0 | Conciliado |
| 10 | Brida 58 | Brida 58 | 0 | 0 | 0 | 0 | Conciliado (sin movimientos registrados) |
| 11 | Cabilla 70 Cm | Cabilla 70 Cm | 0 | 0 | 0 | 0 | Conciliado |
| 12 | Cable Conductor electrico 10 | Cable Conductor eléctrico 10 | 0 | 0 | 0 | 0 | Conciliado |
| 13 | Cable Conductor electrico 8 | Cable Conductor eléctrico 8 | 0 | 0 | 0 | 0 | Conciliado |
| 14 | Distribuidor de corriente 4 salidas | Distribuidor de corriente 4 salidas | 16 | 16 | 16 | 0 | Conciliado |
| 15 | Cemento Cola | Cemento Cola | 36 | 36 | 36 | 0 | Conciliado |
| 16 | Cemento P425 Tudella | Cemento P425 Tudella | 0 | 0 | 0 | 0 | Conciliado |
| 17 | Césped Artificial | Césped Artificial | 54 | 54 | 54 | 0 | Conciliado |
| 18 | Cheques metálicos | Cheques metálicos | 0 | 0 | 0 | 0 | Conciliado |
| 19 | Codo de 90 | Codo de 90 | 16 | 16 | 16 | 0 | Conciliado |
| 20 | Codos de 45 grado | Codos de 45 grado | 15 | 15 | 15 | 0 | Conciliado |
| 21 | Colchón Milexus | Colchón Milexus | 0 | 0 | 0 | 0 | Conciliado |
| 22 | Conectores MC4 | Conectores MC4 | 67 | 67 | 67 | 0 | Conciliado |
| 23 | Cuchilla 2P 100A | Cuchilla 2P 100A | 0 | 0 | 0 | 0 | Conciliado (sin movimientos registrados) |
| 24 | Cuchilla 2P 63A | Cuchilla 2P 63A | 12 | 12 | 12 | 0 | Conciliado |
| 25 | Cuchilla 3P 100A | Cuchilla 3P 100A | 0 | 0 | 0 | 0 | Conciliado |
| 26 | Disco de esmeril | Disco de esmeril | 3 | 3 | 3 | 0 | Conciliado |
| 27 | Escobas | Escobas | 3 | 3 | 3 | 0 | Conciliado |
| 28 | Espejo | Espejo | 31 | 31 | 31 | 0 | Conciliado |
| 29 | Expansiones 8x80 | Expansiones 8x80 | 123 | 123 | 123 | 0 | Conciliado |
| 30 | Expansiones anaranjada 6*40mm /Rapita | Expansiones anaranjada 6*40mm /Rapita | 59 | 59 | 59 | 0 | Conciliado |
| 31 | Expansiones con tornillos M8 | Expansiones con tornillos M8 | 11 | 11 | 11 | 0 | Conciliado |
| 32 | Expansiones con tornillos M6 | Expansiones con tornillos M6 | 10 | 10 | 10 | 0 | Conciliado |
| 33 | Extensiones 5M | Extensiones 5M | 5 | 5 | 5 | 0 | Conciliado |
| 34 | Fregadero | Fregadero | 0 | 0 | 0 | 0 | Conciliado |
| 35 | Fuete eléctrico | Fuete eléctrico | 56 | 56 | 56 | 0 | Conciliado |
| 36 | Impermeable verde 20Kg | Impermeable verde 20Kg | 0 | 0 | 0 | 0 | Conciliado |
| 37 | J de techo | J de techo | 25 | 25 | 25 | 0 | Conciliado |
| 38 | Lampara de 20 | Lámpara de 20 | 0 | 0 | 0 | 0 | Conciliado |
| 39 | Tubo de Lampara de 40 | Tubo de Lámpara de 40 | 5 | 5 | 5 | 0 | Conciliado |
| 40 | Latiguillo de media por 3/8 | Latiguillo de media por 3/8 | 7 | 7 | 7 | 0 | Conciliado |
| 41 | Latiguillo MC4 | Latiguillo MC4 | 0 | 0 | 0 | 0 | Conciliado (sin movimientos registrados) |
| 42 | Llave de lavamano | Llave de lavamano | 0 | 0 | 0 | 0 | Conciliado |
| 43 | Losa aporcelanada 60x60 | Losa aporcelanada 60x60 | 0 | 0 | 0 | 0 | Conciliado |
| 44 | Losa aporcelanada 60x60 con defectos | Losa aporcelanada 60x60 con defectos | 0 | 0 | 0 | 0 | Conciliado |
| 45 | Malla perli | Malla perli | 1 | 1 | 1 | 0 | Conciliado |
| 46 | Masilla interior blanca | Masilla interior blanca | 1 | 1 | 1 | 0 | Conciliado |
| 47 | Mortero | Mortero | 5 | 5 | 5 | 0 | Conciliado |
| 48 | Nudo de media | Nudo de media | 12 | 12 | 12 | 0 | Conciliado |
| 49 | Nudos de 3/4 | Nudos de 3/4 | 8 | 8 | 8 | 0 | Conciliado |
| 50 | Nudos de 50 | Nudos de 50 | 8 | 8 | 8 | 0 | Conciliado |
| 51 | Pintura Casa Blanca 14L | Pintura Casa Blanca 14L | 0 | 0 | 0 | 0 | Conciliado |
| 52 | Pintura Verde 4L | Pintura Verde 4L | 42 | 42 | 42 | 0 | Conciliado |
| 53 | Planchas de zinc | Planchas de zinc | 0 | 0 | 0 | 0 | Conciliado (sin movimientos registrados) |
| 54 | Porta Fusibles | Porta Fusibles | 0 | 0 | 0 | 0 | Conciliado (sin movimientos registrados) |
| 55 | Purles | Purles | 0 | 0 | 0 | 0 | Conciliado |
| 56 | Reducido de 3/4 | Reducido de 3/4 | 0 | 0 | 0 | 0 | Conciliado |
| 57 | Rodillo | Rodillo | 0 | 0 | 0 | 0 | Conciliado |
| 58 | Rosca Chapa | Rosca Chapa | 0 | 0 | 0 | 0 | Conciliado (sin movimientos registrados) |
| 59 | Soporte de papel higiénico | Soporte de papel higiénico | 1 | 1 | 1 | 0 | Conciliado |
| 60 | Supresores de sobretensiones | Supresores de sobretensiones | 0 | 0 | 0 | 0 | Conciliado (sin movimientos registrados) |
| 61 | T de media | T de media | 19 | 19 | 19 | 0 | Conciliado |
| 62 | T de pulgada a 3/4 | T de pulgada a 3/4 | 4 | 4 | 4 | 0 | Conciliado |
| 63 | Tanqueta de Aceite negro 20 L | Tanqueta de Aceite negro 20 L | 0 | 0 | 0 | 0 | Conciliado |
| 64 | Tanqueta de antioxidante gris 20L | Tanqueta de antioxidante gris 20L | 0 | 0 | 0 | 0 | Conciliado |
| 65 | Terminales eléctricas | Terminales eléctricas | 0 | 0 | 0 | 0 | Conciliado |
| 66 | Tornillo M10 | Tornillo M10 | 98 | 98 | 98 | 0 | Conciliado |
| 67 | Transfer monofásico 220 | Transfer monofásico 220 | 0 | 0 | 0 | 0 | Conciliado |
| 68 | Transfer trifásico | Transfer trifásico | 0 | 0 | 0 | 0 | Conciliado |
| 69 | Unión universal de 3/4 | Unión universal de 3/4 | 0 | 0 | 0 | 0 | Conciliado |
| 70 | Unión universal de media | Unión universal de media | 76 | 76 | 76 | 0 | Conciliado |
| 71 | Uniones de media/Niple macho | Uniones de media/Niple macho | 106 | 106 | 106 | 0 | Conciliado |
| 72 | Yee de 50 | Yee de 50 | 6 | 6 | 6 | 0 | Conciliado |
| 73 | Interruptor doble | Interruptor doble | 6 | 6 | 6 | 0 | Conciliado |
| 74 | Controlador de línea | Controlador de línea | 0 | 0 | 0 | 0 | Conciliado |
| 75 | Espigas de 15 AMP | Espigas de 15 AMP | 0 | 0 | 0 | 0 | Conciliado |
| 76 | Toma corriente con tapa | Toma corriente con tapa | 5 | 5 | 5 | 0 | Conciliado |
| 77 | Teipe negro | Teipe negro | 0 | 0 | 0 | 0 | Conciliado |
| 78 | Tornillo con tuerca 4.8 | Tornillo con tuerca 4.8 | 0 | 0 | 0 | 0 | Conciliado (sin movimientos registrados) |
| 79 | Interruptor y toma corriente | Interruptor y toma corriente | 0 | 0 | 0 | 0 | Conciliado |
| 80 | Brecker C32A Doble | Brecker C32A Doble | 0 | 0 | 0 | 0 | Conciliado |
| 81 | Bridas de 4x8 400mm | Bridas de 4x8 400mm | 0 | 0 | 0 | 0 | Conciliado |
| 82 | Cripiadora con pela cable Anaranjada | Cripiadora con pela cable Anaranjada | 0 | 0 | 0 | 0 | Conciliado |
| 83 | Cripiadora Roja con 6 dabas rojas | Cripiadora Roja con 6 dabas rojas | 3 | 3 | 3 | 0 | Conciliado |
| 84 | Conector XT60 | Conector XT60 | 30 | 30 | 30 | 0 | Conciliado |
| 85 | Panel 585 | Panel 585 | 0 | 0 | 0 | 0 | Conciliado |
| 86 | Panel + 600W | Panel + 600W | 0 | 0 | 0 | 0 | Conciliado |
| 87 | Cable Solar Negro 4mm | Cable Solar Negro 4mm | 0 | 0 | 0 | 0 | Conciliado |
| 88 | Cable Solar Rojo 4mm | Cable Solar Rojo 4mm | 0 | 0 | 0 | 0 | Conciliado |
| 89 | Cable Solar Negro 6mm | Cable Solar Negro 6mm | 0 | 0 | 0 | 0 | Conciliado |
| 90 | Cable Solar Rojo 6mm | Cable Solar Rojo 6mm | 3 | 3 | 3 | 0 | Conciliado |
| 91 | Liquidación OT 16 | Liquidación OT 16 | 0 | 0 | 0 | 0 | Conciliado (sin movimientos registrados) |
| 92 | Juego de pata | Juego de pata | 3 | 3 | 3 | 0 | Conciliado |
| 93 | Liquidacion de OT 12 | Liquidación de OT 12 | 0 | 0 | 0 | 0 | Conciliado (sin movimientos registrados) |
| 94 | Barrena 6mm Madera | Barrena 6mm Madera | 2 | 2 | 2 | 0 | Conciliado |
| 95 | Barrena 34mm Madera | Barrena 34mm Madera | 36 | 36 | 36 | 0 | Conciliado |
| 96 | Barrena 5mm Madera | Barrena 5mm Madera | 212 | 212 | 212 | 0 | Conciliado |
| 97 | Disco de corte | Disco de corte | 15 | 15 | 15 | 0 | Conciliado |
| 98 | Limpia parabrisa | Limpia parabrisa | 42 | 42 | 42 | 0 | Conciliado |
| 99 | Electrodo 4mm | Electrodo 4mm | 22 | 22 | 22 | 0 | Conciliado |
| 100 | Autorroscante chiquito | Autorroscante chiquito | 150 | 150 | 150 | 0 | Conciliado |
| 101 | Canal de media | Canal de media | 0 | 0 | 0 | 0 | Conciliado (sin movimientos registrados) |
| 102 | Cajas eléctricas | Cajas eléctricas | 0 | 0 | 0 | 0 | Conciliado |
| 103 | Perfiles para brecker | Perfiles para brecker | 2 | 2 | 2 | 0 | Conciliado |
| 104 | Terminales cubanas | Terminales cubanas | 0 | 0 | 0 | 0 | Conciliado |
| 105 | Cajita breckera sencilla | Cajita breckera sencilla | 0 | 0 | 0 | 0 | Conciliado (sin movimientos registrados) |
| 106 | Tornillo con arandela | Tornillo con arandela | 0 | 0 | 0 | 0 | Conciliado |
| 107 | Caja de distribución TRIC | Caja de distribución TRIC | 2 | 2 | 2 | 0 | Conciliado |
| 108 | Cajita Breckera sencilla gris | Cajita Breckera sencilla gris | 0 | 0 | 0 | 0 | Conciliado |
| 109 | inicio Z | Inicio Z | 1 | 1 | 1 | 0 | Conciliado |
| 110 | Intermedio | Intermedio | 0 | 0 | 0 | 0 | Conciliado |
| 111 | Grapas plasticas con clavo de acero | Grapas plásticas con clavo de acero | 23 | 23 | 23 | 0 | Conciliado |
| 112 | Grapas metalicas 3/4 con tornillo roscante | Grapas metálicas 3/4 con tornillo roscante | 45 | 45 | 45 | 0 | Conciliado |
| 113 | Goma Termo Retractil | Goma Termo Retráctil | 121 | 121 | 121 | 0 | Conciliado |
| 114 | Combustible | Combustible | 0 | 0 | 0 | 0 | Conciliado (sin movimientos registrados) |
| 115 | Regleta | Regleta | 31 | 31 | 31 | 0 | Conciliado |
| 116 | Herraje | Herraje | 1 | 1 | 1 | 0 | Conciliado |
| 117 | Inversor | Inversor | 2 | 2 | 2 | 0 | Conciliado |
| 118 | Barilla de Tierra | Barilla de Tierra | 0 | 0 | 0 | 0 | Conciliado |
| 119 | Yee MC4 | Yee MC4 | 0 | 0 | 0 | 0 | Conciliado |
| 999 | Servicio de cripiar | Servicio de cripiar | 0 | 0 | 0 | 0 | Servicio (sin movimiento de inventario) |
| 120 | Estación de carga | Estación de carga | 0 | 0 | 0 | 0 | Conciliado |
| 121 | Supresores de voltaje | Supresores de voltaje | 0 | 0 | 0 | 0 | Conciliado |
| 122 | Controladores de voltaje | Controladores de voltaje | 2 | 2 | 2 | 0 | Conciliado |
| 123 | Alarma | Alarma | 3 | 3 | 3 | 0 | Conciliado |
| 124 | Linterna de casa 4.2 V | Linterna de casa 4.2 V | 3 | 3 | 3 | 0 | Conciliado |
| 125 | Linterna de cabeza de 15W | Linterna de cabeza de 15W | 2 | 2 | 2 | 0 | Conciliado |
| 126 | Linterna solar | Linterna solar | 1 | 1 | 1 | 0 | Conciliado |
| 127 | Transfer 220 | Transfer 220 | 0 | 0 | 0 | 0 | Conciliado |
| 128 | Brecker 63 AMP Corriente alterna | Brecker 63 AMP Corriente alterna | 5 | 5 | 5 | 0 | Conciliado |
| 129 | Maleta de herramientas | Maleta de herramientas | 0 | 0 | 0 | 0 | Conciliado |
| 130 | Breckera SPC | Breckera SPC | 1 | 1 | 1 | 0 | Conciliado |
| 131 | Panel de 550W | Panel de 550W | 0 | 0 | 0 | 0 | Conciliado |
| 132 | Brecker 32 A Alternar Doble | Brecker 32 A Alterna Doble | 0 | 0 | 0 | 0 | Conciliado |
| 133 | Ventiladores recargables | Ventiladores recargables | 12 | 12 | 12 | 0 | Conciliado |
| 134 | U de aluminio o intermedio | U de aluminio o intermedio | 19 | 19 | 19 | 0 | Conciliado |
| 135 | Cable 6 | Cable 6 | 0 | 0 | 0 | 0 | Conciliado |
| 998 | Servicio de Carga/Capacidad | Servicio de Carga/Capacidad | 0 | 0 | 0 | 0 | Servicio (sin movimiento de inventario) |
| 136 | Bateria EKO 5KW | Batería EKO 5KW | 0 | 0 | 0 | 0 | Conciliado |
| 137 | Tubo blanco de condulei de 1/2 de 5M | Tubo blanco de condulei de 1/2 de 5M | 340 | 340 | 340 | 0 | Conciliado |
| 138 | Kid de 6 K Inversor - 5K Bateria +Accesorios | Kit de 6 K Inversor - 5K Batería +Accesorios | 0 | 0 | 0 | 0 | Conciliado |
| 139 | Panel de 640 W Suntech | Panel de 640 W Suntech | 2 | 0 | 0 | -2 | Diferencia por operación pendiente de esta misión |
| 140 | Breckera de 9 posiciones | Breckera de 9 posiciones | 1 | 1 | 1 | 0 | Conciliado |
| 141 | Cemento TBV 50 Kg | Cemento TBV 50 Kg | 14 | 14 | 14 | 0 | Conciliado |
| 142 | Cemento Blanco 2 Kg | Cemento Blanco 2 Kg | 21 | 21 | 21 | 0 | Conciliado |
| 143 | Filtros de Gasolina | Filtros de Gasolina | 28 | 28 | 28 | 0 | Conciliado |
| 144 | Fusible de auntomovil | Fusible de automóvil | 300 | 300 | 300 | 0 | Conciliado |
| 145 | Tunder 24 Vol | Tunder 24 Vol | 1 | 1 | 1 | 0 | Conciliado |
| 146 | Tunder Grande | Tunder Grande | 2 | 2 | 2 | 0 | Conciliado |
| 147 | MPPT | MPPT | 4 | 4 | 4 | 0 | Conciliado |
| 148 | Huncong (Medir corriente) | Huncong (Medir corriente) | 0 | 0 | 0 | 0 | Conciliado |
| 149 | Voltímetro | Voltímetro | 0 | 0 | 0 | 0 | Conciliado |
| 150 | Batería 7.5 Kilos 21.8 V 314 Ah | Batería 7.5 Kilos 21.8 V 314 Ah | 8 | 8 | 8 | 0 | Conciliado |
| 151 | Inversor Sumry | Inversor Sumry | 4 | 4 | 4 | 0 | Conciliado |
| 152 | Equipo Música DAZONE | Equipo Música DAZONE | 1 | 1 | 1 | 0 | Conciliado |
| 153 | Taladro con bateria y barrena | Taladro con batería y barrena | 1 | 1 | 1 | 0 | Conciliado |
| 154 | Breckera de 12 posiciones | Breckera de 12 posiciones | 6 | 6 | 6 | 0 | Conciliado |
| 155 | Compresor de aire | Compresor de aire | 2 | 2 | 2 | 0 | Conciliado |
| 156 | Barilla de Aterramientos | Barilla de Aterramientos | 4 | 4 | 4 | 0 | Conciliado |
| 157 | Royal Cole | Royal Cole | 82 | 82 | 82 | 0 | Conciliado |
| 158 | Detergente liquido | Detergente | 21 | 21 | 21 | 0 | Conciliado |
| 159 | Cemento blanco 5kg | Cemento blanco 5kg | 0 | 0 | 0 | 0 | Conciliado |
| 160 | Puertas Negras | Puertas Negras | 0 | 0 | 0 | 0 | Conciliado (sin movimientos registrados) |
| 161 | Juego de baño | Juego de baño | 0 | 0 | 0 | 0 | Conciliado (sin movimientos registrados) |
| 162 | Ventana de cristal | Ventana | 0 | 0 | 0 | 0 | Conciliado (sin movimientos registrados) |
| 163 | Calentadores de 50 Litros | Calentadores de 50 Litros | 0 | 0 | 0 | 0 | Conciliado (sin movimientos registrados) |
| 164 | Calentadores de 30 Litros | Calentadores de 30 Litros | 0 | 0 | 0 | 0 | Conciliado (sin movimientos registrados) |
| 165 | Bote Sifon | Bote Sifón | 0 | 0 | 0 | 0 | Conciliado (sin movimientos registrados) |
| 166 | Cafetera (6 tasas) | Cafetera (6 tasas) | 0 | 0 | 0 | 0 | Conciliado (sin movimientos registrados) |
| 167 | Cafetera (3 tasas) | Cafetera (3 tasas) | 0 | 0 | 0 | 0 | Conciliado (sin movimientos registrados) |
| 168 | Rollo Lija | Rollo Lija | 0 | 0 | 0 | 0 | Conciliado (sin movimientos registrados) |
| 169 | Lampara Recargable 40W | Lámpara Recargable 40W | 0 | 0 | 0 | 0 | Conciliado (sin movimientos registrados) |
| 170 | Lampara Recargable 20W | Lámpara Recargable 20W | 0 | 0 | 0 | 0 | Conciliado (sin movimientos registrados) |
| 171 | Lampara 40W | Lámpara 40W | 0 | 0 | 0 | 0 | Conciliado (sin movimientos registrados) |
| 172 | Silla de comedor | Silla de comedor | 0 | 0 | 0 | 0 | Conciliado (sin movimientos registrados) |
| 173 | Banqueta | Banqueta | 0 | 0 | 0 | 0 | Conciliado (sin movimientos registrados) |
| 174 | Grey ceramico bage 50x50 | Grey cerámico beige 50x50 | 1 | 1 | 1 | 0 | Conciliado |
| 175 | Losa Porcelanato 25x60 | Losa Porcelanato 25x60 | 1.2 | 1.2 | 1.2 | 0 | Conciliado |
| 176 | Brecker de 125A | Batería 12.8v100Ah | 1 | 1 | 1 | 0 | Conciliado |
| 177 | MPPT 4000W | MPPT 4000W | 1 | 1 | 1 | 0 | Conciliado |
| 178 | Brecker DC 125 Doble | — | 0 | — | — | — | Código inexistente |
| 179 | Brecker AC 25 Doble | — | 0 | — | — | — | Código inexistente |
| 180 | Pintura Blanco 4L | — | 0 | — | — | — | Código inexistente |
| 181 | Pintura Amarillo 4L | — | 0 | — | — | — | Código inexistente |

**Nota sobre los códigos 998 y 999:** existen en el catálogo como servicios (`is_service=true`, «Servicio de Carga/Capacidad» y «Servicio de cripiar»), no generan movimientos de inventario (comportamiento correcto del sistema) y concilian a 0 como la referencia.

## 3. Diferencias de stock (1)

| Código | Producto | Esperado | Actual | Reconstruido | Diferencia | Estado | Origen confirmado |
|---:|---|---:|---:|---:|---:|---|---|
| 139 | Panel de 640 W Suntech | 2 | 0 | 0 | −2 | Pendiente de información | Entrada del 16/10 (fila 20) no ejecutable: `register_reception` exige proveedor y `unit_cost>0`; la fuente no los aporta. No se inventaron datos. |

**Recomendación:** proporcionar proveedor y costo unitario (y moneda/tasa si aplica) de los 2 paneles Suntech 640 W y ejecutar la recepción por el flujo oficial (`POST /api/inventory/receptions`); el WAC quedará calculado por el mecanismo canónico (`fn_recalc_wac`).

## 4. Códigos de referencia inexistentes (4)

| Código | Nombre de referencia | Stock esperado | Situación | Recomendación |
|---:|---|---:|---|---|
| 178 | Brecker DC 125 Doble | 0 | Sin producto en catálogo ENERVIDA | Crear producto si existe físicamente; si no, retirar del listado |
| 179 | Brecker AC 25 Doble | 0 | Sin producto en catálogo ENERVIDA | Idem |
| 180 | Pintura Blanco 4L | 0 | Sin producto en catálogo ENERVIDA | Idem (nota: código 52 «Pintura Verde 4L» sí existe; no confundir) |
| 181 | Pintura Amarillo 4L | 0 | Sin producto en catálogo ENERVIDA | Idem |

## 5. Conciliación de nombres (23 diferencias)

Clasificación usada: **Coincidencia exacta** · **Diferencia de formato** (tildes/mayúsculas/erratas sin cambio de identidad) · **Variante posiblemente equivalente** (requiere evidencia) · **Conflicto de identidad** (el código parece asociado a otro producto).

| Código | Nombre de referencia | Nombre actual del catálogo | Tipo de diferencia | Identidad confirmada | Recomendación |
|---:|---|---|---|---|---|

| 8 | Brecker C32 A Trible | Brecker C32 A Triple | Variante posiblemente equivalente | Requiere evidencia | Confirmar identidad con el propietario y unificar nombre |
| 12 | Cable Conductor electrico 10 | Cable Conductor eléctrico 10 | Diferencia de formato | Confirmada | Uniformar ortografía al nombre del catálogo (más correcto); sin impacto operativo |
| 13 | Cable Conductor electrico 8 | Cable Conductor eléctrico 8 | Diferencia de formato | Confirmada | Uniformar ortografía al nombre del catálogo (más correcto); sin impacto operativo |
| 38 | Lampara de 20 | Lámpara de 20 | Diferencia de formato | Confirmada | Uniformar ortografía al nombre del catálogo (más correcto); sin impacto operativo |
| 39 | Tubo de Lampara de 40 | Tubo de Lámpara de 40 | Diferencia de formato | Confirmada | Uniformar ortografía al nombre del catálogo (más correcto); sin impacto operativo |
| 93 | Liquidacion de OT 12 | Liquidación de OT 12 | Diferencia de formato | Confirmada | Uniformar ortografía al nombre del catálogo (más correcto); sin impacto operativo |
| 109 | inicio Z | Inicio Z | Diferencia de formato | Confirmada | Uniformar ortografía al nombre del catálogo (más correcto); sin impacto operativo |
| 111 | Grapas plasticas con clavo de acero | Grapas plásticas con clavo de acero | Diferencia de formato | Confirmada | Uniformar ortografía al nombre del catálogo (más correcto); sin impacto operativo |
| 112 | Grapas metalicas 3/4 con tornillo roscante | Grapas metálicas 3/4 con tornillo roscante | Diferencia de formato | Confirmada | Uniformar ortografía al nombre del catálogo (más correcto); sin impacto operativo |
| 113 | Goma Termo Retractil | Goma Termo Retráctil | Diferencia de formato | Confirmada | Uniformar ortografía al nombre del catálogo (más correcto); sin impacto operativo |
| 132 | Brecker 32 A Alternar Doble | Brecker 32 A Alterna Doble | Variante posiblemente equivalente | Requiere evidencia | Confirmar identidad con el propietario y unificar nombre |
| 136 | Bateria EKO 5KW | Batería EKO 5KW | Diferencia de formato | Confirmada | Uniformar ortografía al nombre del catálogo (más correcto); sin impacto operativo |
| 138 | Kid de 6 K Inversor - 5K Bateria +Accesorios | Kit de 6 K Inversor - 5K Batería +Accesorios | Variante posiblemente equivalente | Requiere evidencia | Confirmar identidad con el propietario y unificar nombre |
| 144 | Fusible de auntomovil | Fusible de automóvil | Variante posiblemente equivalente | Requiere evidencia | Confirmar identidad con el propietario y unificar nombre |
| 153 | Taladro con bateria y barrena | Taladro con batería y barrena | Diferencia de formato | Confirmada | Uniformar ortografía al nombre del catálogo (más correcto); sin impacto operativo |
| 158 | Detergente liquido | Detergente | Variante posiblemente equivalente | Requiere evidencia | Identidad confirmada por código+precio (800 CUP) y movimientos; unificar a «Detergente» o «Detergente líquido» por decisión |
| 162 | Ventana de cristal | Ventana | Conflicto de identidad | Requiere decisión | «Ventana de cristal» vs «Ventana»: probablemente el mismo producto; confirmar y unificar |
| 165 | Bote Sifon | Bote Sifón | Diferencia de formato | Confirmada | Uniformar ortografía al nombre del catálogo (más correcto); sin impacto operativo |
| 169 | Lampara Recargable 40W | Lámpara Recargable 40W | Diferencia de formato | Confirmada | Uniformar ortografía al nombre del catálogo (más correcto); sin impacto operativo |
| 170 | Lampara Recargable 20W | Lámpara Recargable 20W | Diferencia de formato | Confirmada | Uniformar ortografía al nombre del catálogo (más correcto); sin impacto operativo |
| 171 | Lampara 40W | Lámpara 40W | Diferencia de formato | Confirmada | Uniformar ortografía al nombre del catálogo (más correcto); sin impacto operativo |
| 174 | Grey ceramico bage 50x50 | Grey cerámico beige 50x50 | Variante posiblemente equivalente | Requiere evidencia | Confirmar identidad con el propietario y unificar nombre |
| 176 | Brecker de 125A | Batería 12.8v100Ah | Conflicto de identidad | Requiere decisión | CONFLICTO REAL: bajo el código 176 el catálogo tiene «Batería 12.8v100Ah» y la referencia espera «Brecker de 125A». Verificar el código de barras/etiqueta físico; posible alta incorrecta. No renombrar ni recodificar sin evidencia |

### 5.1 Sobre el texto «calc» y artefactos de presentación

En la revisión de nombres del catálogo ENERVIDA **no se detectó** ningún nombre con sufijo `calc` almacenado en la BD (`products.name`); tampoco concatenaciones de unidad o tipo al final de la descripción que sugieran artefactos de interfaz. Si en la UI aparece un texto adicional del estilo, corresponde a la capa de presentación y no a datos almacenados; no se encontró evidencia de ese patrón en esta tienda.

## 6. Historial y limitaciones

- Los 14 SKU operados tienen reconstrucción exacta (Σ movimientos = stock actual) y el saldo post-operación coincide con la referencia: la trazabilidad del 16/10 es completa.
- El resto del catálogo concilia stock-a-referencia sin necesidad de reconstrucción diferenciada; donde `stock_recon` difiere de `stock_act` la fila se marca «Historial incompleto» (ninguna en el corte actual).
- El saldo inicial del período no se inventó en ningún caso: la reconstrucción es desde el origen del ledger.
- No se incluyeron datos personales ni secretos de configuración en estos informes ni en el XLSX.

## 7. Decisiones pendientes de autorización

1. **SKU 139:** aportar proveedor + costo unitario y autorizar la recepción de 2 paneles (única diferencia de stock).
2. **SKU 108:** corregir precio de catálogo (0 → importe real) y decidir el tratamiento del sobrepago +12,000 CUP registrado (vuelto, nota de crédito o ajuste documentado).
3. **SKU 128 fila 14:** decidir el tratamiento del sobrepago +200 CUP (vuelto al cliente o diferencia documentada).
4. **Códigos 178–181:** crear los 4 productos o retirarlos del listado de referencia.
5. **Nombres 162 y 176:** resolver los conflictos de identidad con verificación física antes de cualquier renombrado/recodificado.
6. **Comisiones del 16/10 (filas 10/12/13/14/16/18):** atribución de worker y liquidación por el módulo oficial de comisiones.
7. **Uniformar los 21 nombres de formato/variante** según la tabla de la sección 5 (solo tras confirmación).

