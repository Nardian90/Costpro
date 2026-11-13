# F2 — MATRIZ DE SALDOS INICIALES POR TIENDA (preparación, sin registro)

**Estado:** plantilla de trabajo en modo exclusivamente lectura. Sin importes registrables, sin filas `draft`, sin creación de asientos de apertura. La decisión sobre importes y su registro es posterior y requiere autorización independiente por tienda.

## A. Fechas de corte exactas (primer documento postable por tienda, verificado contra la BD)

| Tienda | store_id | Corte propuesto (un día antes del primer doc) | Primer doc postable | Tipos con histórico |
|---|---|---|---|---|
| ENERVIDA-VITALLCONS | `5e6fe821-5465-48b1-b3f1-3aa3182edc38` | **2026-06-30** | RECEPCIÓN 2026-07-01 | RECEPCIÓN, VENTA, VALE, DEVOLUCIÓN, COMISIÓN, SERVICIO, FLUJO |
| PUERTO PADRE | `899d2503-d000-41d2-89f0-0827f4ac37ab` | **2026-10-09** | RECEPCIÓN 2026-10-10 | RECEPCIÓN, VENTA, VALE, SERVICIO |
| COSTPRO (Prueba) | `43a4dabc-b8b4-4b66-82b3-0c75335ca5d1` | — | (RECEPCIÓN 2026-05-01) | EXCLUIDA del alcance (tienda de pruebas) |

**Sin solapamiento garantizado por construcción:** la apertura se contabiliza con fecha ≤ corte y el backfill solo toma documentos postables con fecha > corte (condición de elegibilidad verificada en el dry-run F1: el primer documento elegible de ENERVIDA es 2026-07-01 y el de PUERTO PADRE 2026-10-10; ningún documento del backfill tiene fecha anterior a su corte).

## B. Inventario inicial: reconstrucción verificada (no supuesta)

| Tienda | Productos con kardex | Cuadran stock_current = Σmovimientos | Δ total | Movimientos previos al corte | Conclusión |
|---|---:|---:|---:|---:|---|
| ENERVIDA | 166 | 166 (100%) | 0,0 | 0 | Inventario inicial en el corte = **0 unidades** por reconstrucción completa del kardex (el primer movimiento es la recepción del 2026-07-01) |
| PUERTO PADRE | 56 | 56 (100%) | 0,0 | 0 | Inventario inicial en el corte = **0 unidades** por reconstrucción completa (primer movimiento: recepción 2026-10-10) |

La afirmación "inventario inicial cero" NO es una suposición: el kardex reproduce `stock_current` de cada producto exactamente y no existe ningún movimiento anterior al primer documento disponible. No se detectaron existencias procedentes de períodos anteriores.

## C. Matriz por tienda: categorías, fuentes y datos pendientes

### ENERVIDA-VITALLCONS (corte 2026-06-30) — alcance inicial recomendado

| Categoría (PCG) | Estado del dato | Fuente documental | Dato pendiente de aportar |
|---|---|---|---|
| ACT_INVENTARIO (existencias al corte) | **Verificado: 0 unidades** | Kardex `stock_movements` (166/166 productos cuadran) + `products.stock_current` | Valoración: 0 unidades → importe 0; solo requiere confirmación del propietario |
| ACT_EFECTIVO_CUP (caja al corte) | Sin dato | Arqueo de caja físico a la fecha de corte | **Arqueo firmado al 2026-06-30** (importe y responsable) |
| ACT_BANCOS (cuenta BPA 0664 4340 0002 6710) | Sin dato | Estado de cuenta bancario (BPA) al corte | **Extracto bancario** al 2026-06-30 o certificación de saldo |
| ACT_ACTIVOS_FIJOS (equipos, transporte) | Sin dato | Facturas de activos + depreciación acumulada | **Inventario de activos fijos** con fecha de adquisición y valor |
| ACT_CxC (clientes al corte) | Sin dato | Facturas pendientes de cobro pre-corte | **Relación de CxC vencidas/no vencidas** al corte |
| PAS_CxP_PROV (proveedores al corte) | Sin dato | Facturas de proveedores pendientes pre-corte | **Relación de CxP** al corte (incluye servicios) |
| PAS_SERV_PEND | Sin dato | Servicios recibidos pendientes de pago pre-corte | **Detalle de servicios pendientes** (ninguno figura en la BD: primer servicio 2026-10-22 > corte) |
| PAS_NOMINA_PEND | Sin dato | Nóminas pendientes pre-corte | **Certificación de salarios por pagar** al corte |
| PAT_CAPITAL | Sin dato | Declaración jurada / escritura del propietario | **Aporte de capital declarado** (documento, NO cuenta de ajuste) |
| PAT_UTILIDADES_ACUM | Sin dato | Estado de resultados histórico pre-corte | **Resultado acumulado certificado** (o documento contable externo) |

### PUERTO PADRE (corte 2026-10-09) — fase posterior, autorización independiente

| Categoría (PCG) | Estado del dato | Fuente documental | Dato pendiente de aportar |
|---|---|---|---|
| ACT_INVENTARIO | **Verificado: 0 unidades** (56/56 cuadran) | Kardex `stock_movements` + `products.stock_current` | ⚠️ **Valoración dudosa**: `cost_average` = 1,00 para todos los productos con stock — requiere verificación documental de costos (facturas de las recepciones 2026-10-10) |
| ACT_EFECTIVO_CUP | Sin dato | Arqueo de caja físico | **Arqueo firmado al 2026-10-09** |
| ACT_BANCOS | Sin dato | — (sin cuenta bancaria registrada en el perfil) | Declarar si existe cuenta; si no, documentar la omisión |
| ACT_ACTIVOS_FIJOS | Sin dato | Facturas de activos | **Inventario de activos fijos** |
| ACT_CxC | Sin dato | Facturas pendientes pre-corte | **Relación de CxC** al corte |
| PAS_CxP_PROV | Sin dato | Facturas de proveedores pendientes | **Relación de CxP** al corte |
| PAT_CAPITAL | Sin dato | Declaración del propietario | **Aporte de capital declarado** (documento) |

### Tiendas sin histórico contable (cero documentos postables)

FERROCARRIL VITALLCONS (`8eb56fa3`), SHADDAI (`bc94e3d0`), QA UI Icons Store (`6691b866`) y QA-Release-1593-Plantillas (`30c3a373`) no tienen documentos postables. FERROCARRIL y SHADDAI quedan **fuera del alcance** hasta que registren operaciones reales; su apertura solo requeriría saldos declarados cuando existan.

## D. Reglas acordadas para la apertura (cuando se autorice)

1. **Cero PAT_CAPITAL como ajuste:** cualquier diferencia activos−pasivos−patrimonio se explica con soporte documental por partida; no se usa PAT_CAPITAL para cuadrar. Si una partida no tiene soporte, no se registra y se lista como pendiente.
2. **Sin solapamiento:** asientos de apertura con fecha ≤ corte; backfill con documentos > corte (verificado en F1: sin documentos elegibles anteriores a los cortes propuestos).
3. **Valoración de inventario** al costo medio verificado (`cost_average`) con revisión documental (PUERTO PADRE requiere revisión por cost_average=1,00 uniforme).
4. **Sin filas draft:** la plantilla no crea registros en BD; solo esta matriz. El registro será una transacción única por tienda (fin_apply_opening_balance) con autorización explícita y trazabilidad completa.

