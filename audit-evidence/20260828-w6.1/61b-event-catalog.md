> ┌─────────────────────────────────────────────────────────────────────────────┐
> │ [W6.1 REVISION 61b — DERIVED FROM: 61-event-catalog.md]                     │
> │ original document hash (RECONSTRUCTED 61):                                  │
> │   04e1d2be8fa9db9142a17ec5d1fa0058599ec105fbcd580cb2fa010ccda9bd77          │
> │ reason for amendment: integrar la evidencia ejecutada W6.0-A–F (estado real │
> │   desplegado por evento), la doctrina de bloqueos R-6 (CR-W6-1), las ALTER  │
> │   reales de D-05(i) (CR-W6-4) y las condiciones de aceptación W7 por evento.│
> │ changes vs original: bloques [ESTADO DESPLEGADO W6.1] y [ACEPTACIÓN W7]     │
> │   añadidos por evento; doctrina store_credit en E-D; texto base SUBSISTE en │
> │   el original 61 (esta revisión declara diffs; no lo repite íntegro).       │
> │ no production mutation: CONFIRMADO — documento puro.                         │
> └─────────────────────────────────────────────────────────────────────────────┘

# W6 · 61b — Catálogo canónico de eventos (revisión W6.1 con estado desplegado)

## E-R · RECEPCIÓN

Base (61 E-R) subsiste. Adiciones:

```text
[ESTADO DESPLEGADO W6.1]
  ✔ La vía canónica pending→confirm (confirm_pending_reception) YA implementa el blend D-01
    EXACTO (A–F caso B: 133.333333 exacto; caso A: WAC inicial = unit_cost).
  ✖ El trigger trg_update_product_wac sigue VIVO y sobrescribe por INSERT de receipt_items
    (aunque la recepción esté pendiente): caso D.3 (150→137.5). PR-1 no implementado.
  ✖ fn_process_receipt (legacy) crea receipts 'active' directamente → motor histórico sin blend.

[ACEPTACIÓN W7]
  1. trigger eliminado o guard pasivo; fn_recalc_wac único escritor (PR-1 + lista de 14 rutas).
  2. Regresión permanente = casos A y B del harness (idénticos, deterministas).
```

## E-V · VENTA

Base (61 E-V) subsiste. Adiciones:

```text
[ESTADO DESPLEGADO W6.1]
  ✖ create_sale_v2 usa COALESCE(cost_at_sale, cost, 0) DEL CLIENTE (C.1=7777, C.2=0).
  ✖ El POS del repo ENVÍA el costo: checkout route mapea «cost → cost_at_sale» (comentario
    literal); sync/batch llama v2 con payload igual. create_sale v1: no usado (assert en tests).
  ✔ Paridad item↔movement existe (mismo v_cost) — pero de datos contaminados (INV-07 no basta).
  ✔ Protección server-side del TOTAL existe (ERR_TOTAL_MISMATCH) — contraste: el costo NO está
    protegido y NO existe overload server-side para ventas (a diferencia de producción).

[ACEPTACIÓN W7]
  1. RPC impone COGS = units × WAC_prev con snapshot FOR UPDATE (R-4/R-6); request ignorado.
  2. checkout route deja de enviar cost_at_sale/cost (cambio de app en alcance) + deprecación API.
  3. Regresión permanente = caso C del harness (ataques 7777 y sin-costo deben dar 100).
  4. INV-07 con join agregado por (txn, product) para certificación (CR-W6-10).
```

## E-D · DEVOLUCIÓN

Base (61 E-D) subsiste. Adiciones:

```text
[ESTADO DESPLEGADO W6.1]
  ✖ SIN tope acumulado ni lock (F.3: 6>5 aceptado; F7 race: 8>5 aceptado concurrente, stock 13>10).
  ✔ v2 usa cost_at_sale original (F.1=100) y WAC intacto (F.2, A1) — doctrina correcta donde vive.
  ✖ La app usa create_devolution_v2 SOLO si USE_V2_REVERSE (default FALSE); por defecto usa v1:
      · v1-62746: kardex devolution_in uc = v_price (PRECIO DE VENTA como costo);
      · v1-62776: BLEND de cost_average en la devolución (anti-A1).
    ⇒ TRES semánticas contables coexisten por flag/firma (sin fuente de verdad única).
  ✖ Sin contra-asiento financiero (F.5=0); payment_transactions_ref_type_check SIN 'devolution'
    → D-05(i) exige: ALTER constraint ref_type + CHECK análoga (ref_type='devolution' ⇒
    ref_id=devolution_id) + política store_credit (los métodos de payment_transactions no la
    registran hoy) [CR-W6-4 y CR-W6-7 CONFIRMADOS contra esquema real].

[ACEPTACIÓN W7]
  1. Tope acumulado + advisory lock por original_transaction_id ANTES de leer el acumulado (R-6).
  2. Flag USE_V2_REVERSE → default ON o v1 extinguida (decisión del dueño — D-04).
  3. Contra-asiento D-05(i) con las 2 ALTER declaradas y decisión store_credit (INV-10 desbloquea).
  4. Regresión permanente = caso F + F7 (races) del harness.
```

## E-T · TRANSFERENCIA

Base subsiste. `Estado desplegado: SIN VERIFICACIÓN EJECUTIVA (fuera de los casos A–F); caso canónico
E-T pendiente en W7 — declarado para que la ratificación no lo presuma corregido (WAC-DF-06).`

## E-A · AJUSTE

Base subsiste. `Estado desplegado: perform_inventory_adjustment confirmado como escritor de
cost_average (inventario W6.1); sin caso A–F directo — caso canónico E-A pendiente en W7 (D-06).`

## E-P · PRODUCCIÓN

Base (61 E-P) subsiste. Adiciones:

```text
[ESTADO DESPLEGADO W6.1]
  ✖ Overload LEGACY 6-arg acepta p_unit_cost del cliente (E.1: 0 aceptado → production_out uc=0)
    y TRUNCA cantidades a entero (::integer). El route de la app hace «p_unit_cost: unit_cost || 0».
  ✔ Overload ENDURECIDA 9-arg (server_side=true): impone WAC FOR UPDATE sin fallback (E.1b=50;
    NULL → ERR_PRODUCT_COST_UNAVAILABLE) y sin truncamiento («fix #3») — DESPLEGADA PERO NO USADA
    por la app; su coexistencia con la legacy rompe la resolución de 6 args (WAC-DF-09, PGRST203).
  ✖ close_production_order_v2 con p_idempotency_key → ERROR uuid=text (audit_logs.record_id es uuid;
    línea 18) — la app SIEMPRE envía key → cierre vía app ROTO (E.7; orden queda in_progress).
  ✖ receive_production_output: cost_average = v_new_cost Y cost_price = v_new_cost (espejo cp vivo,
    contradice D-02) y valúa PT = Σ(qty × uc del cliente) → PT a costo 0 (E.2) y contaminación por
    blend (E.4: 25≠50) — el cierre PERPETÚA la contaminación, no la corrige.

[ACEPTACIÓN W7]
  1. server_side=true FORZADO (false → error, como prescribe la base); overload legacy extinguida
     o renombrada (decisión de desambiguación del dueño — arrastra D-07).
  2. Route deja de enviar unit_cost; cierre con idempotencia funcional (fix uuid/text) o key NULL
     como workaround RATIFICADO por el dueño mientras tanto (WAC-DF-08).
  3. PT rechaza materiales uc NULL/0 salvo bandera approve_zero_cost_material auditada (INV-13 con
     probe cast record_id::uuid).
  4. cp deja de espejarse (D-02): eliminar asignación + INV-12.
  5. Regresión permanente = caso E del harness (incluye E.1b=50 y PT limpio=50).
```

## ER · REVERSAS GENÉRICAS

Base subsiste. Adición:

```text
[ESTADO DESPLEGADO W6.1] Superficie real ≥6 rutinas de reversa/void (reverse_receipt_v2 con
aritmética propia — «estilo 3» de la revisión 67—, reverse_production_order,
void_closed_production_order, void_reception_with_reversal, cancel_reception, reverse_devolution).
PR-1 debe absorberlas TODAS; enum sin *_reverse para devolución/ajuste/transferencia (CR-W6-4).
```

## Matriz evento × columna

La del original 61 subsiste íntegra; única corrección de estado: fila «Devolución» → contra-asiento
pasa de «**reembolso (nuevo)**» a «reembolso (nuevo; requiere 2 ALTER + decisión store_credit — D-05)».
