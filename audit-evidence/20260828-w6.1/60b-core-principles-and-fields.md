> ┌─────────────────────────────────────────────────────────────────────────────┐
> │ [W6.1 REVISION 60b — DERIVED FROM: 60-core-principles-and-fields.md]        │
> │ original document hash (RECONSTRUCTED 60):                                  │
> │   bfe8fc03a896ceefa7ede35618ce04222b727af5a959367cb1829de252289570          │
> │ reason for amendment: resolver bloqueantes CR-W6-1 (matriz de bloqueos) y   │
> │   CR-W6-8/§4 (superficie real de escritores/reversas), integrando la        │
> │   evidencia ejecutada W6.0-A–F (commits f628e5e7/b125152d).                 │
> │ changes vs original: §1 PR-1 con lista real de 14 escritores; §2 nota       │
> │   D.3; R-4 ampliado a MATRIZ DE BLOQUEOS por evento (nuevo R-6); notas      │
> │   [AMEND-W6.1] inline. Texto no marcado = literal del original.             │
> │ no production mutation: CONFIRMADO — documento puro.                         │
> └─────────────────────────────────────────────────────────────────────────────┘

# W6 · 60b — Principios rectores y semántica de campos (revisión W6.1)

Estado: ESPECIFICACIÓN DE DISEÑO — sin modificación de código ni de datos. Base forense: commit `e9f466b1`
+ hallazgos W0–W5 + **evidencia ejecutada W6.0-A–F**. Entra en vigor SOLO tras ratificación del dueño
y demostración íntegra en el Audit Harness (W7–W8).

## 1. Principios rectores (P-*, verificables)

| # | Principio | Consecuencia operativa |
|---|---|---|
| PR-1 | **Un solo escritor por estado derivado** | `products.cost_average` tiene UNA única rutina de recálculo (`fn_recalc_wac`) invocada por eventos autorizados; el trigger heterodoxo `trg_update_product_wac` se elimina o se convierte en guard pasivo. Cierra DF-01. |
| [AMEND-W6.1] | — | **Superficie real inventariada (W6.1, v2≡prod S1=0): ≥14 escritores de `cost_average`**: update_product_wac (trigger), confirm_pending_reception, fn_process_receipt ×2, cancel_reception, reverse_receipt_v2 (aritmética propia), perform_inventory_adjustment, receive_production_output ×2, create_devolution 62776 (blend en devolución), reverse_production_order, void_closed_production_order, void_reception_with_reversal, reset_store_data. **La conversión de esta lista completa es alcance OBLIGATORIO de W7** (no opcional, no parcial). |
| PR-2 | **El servidor determina todo costo** | Ningún evento económico acepta costos del cliente como autoridad (`cost_at_sale`, `unit_cost` de vale/producción ya server-side). Cierra DF-02 y reabre WF06-corrección. |
| [AMEND-W6.1] | — | Evidencia A–F: ventas aceptan costo del cliente (C.1/C.2) y **el POS lo envía** (checkout mapea `cost → cost_at_sale`); producción tiene la variante server-side desplegada PERO la app usa la legacy con fallback `unit_cost || 0`. PR-2 exige cambio en RPC **Y en capa app**. |
| PR-3 | **El ledger no se muta; se compensa** | Toda corrección es un movimiento inverso apendizado que referencia al original; historia intacta y auditable. |
| PR-4 | **Todo evento económico tiene contra-asiento financiero cuando toca dinero o su reversión lo toca** | Venta↔pagos (existe), devolución↔reembolsos (por construir, DF-03), resto según matriz §3. |
| PR-5 | **Valoración única**: Valor(t)=Σ(stock×WAC) | Solo una semántica WAC declarada lo sostiene; reportes usan esa, nunca mezclas. |
| [AMEND-W6.1] | — | Caso D demostró ejecutivamente que el motor B (trigger) SOBRESCRIBE la valoración A: 150→137.5 (D.3). PR-5 es hoy violable en producción por simple creación de una recepción pendiente. |
| PR-6 | **Idempotencia universal en RPCs económicas** | clave + hash de parámetros + retorno almacenado (infra ya existente; hecho 59). |
| [AMEND-W6.1] | — | Tres mecanismos coexisten (registry / únicos DB / audit_logs). El de close_production_order_v2 (audit_logs) está ROTO (uuid=text, WAC-DF-08) — ver 61b E-P. |
| PR-7 | **Matemática en unidades base** | Variantes expandidas al entrar al cálculo; unidades de presentación preservadas. |
| [AMEND-W6.1] | — | withdraw legacy trunca a entero (`::integer`) — a extinguir con la overload (WAC-DF-09). |
| PR-8 | **Historia no se corrige en silencio** | Capa WAC reparable de forma determinista SOLO con job aprobado (doc 62); capa COGS pre-canon irrecuperable ⇒ etiquetada, no fingida. |

## 2. La decisión raíz D-01 — ¿Qué es contablemente `cost_average`? (RESERVADA AL DUEÑO)

**[AMEND-W6.1]** Evidencia ejecutiva añadida al expediente de ratificación:
- La identidad A se cumple EXACTA en la vía canónica confirm_pending_reception (caso B: 133.333333 exacto).
- El motor B (trigger) sobrescribe A en producción por mera creación de recepción pendiente (caso D.3).
- Recomendación técnica MANTENIDA SIN CAMBIOS: **D-01 = A**, B como `avg_acquisition_price` analítica.
- Opción B rompe PR-5 ante salidas (demostración numérica del original + validación A–F).

(§2 Opción A / Opción B / recomendación: texto íntegro del original 60 §2 queda SUBSISTIENDO; esta
revisión NO lo repite para evitar divergencias — ver 60 original para el texto base.)

## 3. Declaración oficial de campos

Íntegra la del original 60 §3, con esta adición:

| Adición [AMEND-W6.1] | Declaración |
|---|---|
| `production_order_items.actual_unit_cost` | costo unitario REAL de consumo MP impuesto por el servidor (WAC al momento del retiro, FOR UPDATE). El valor provisto por el cliente se ignora en la ruta canónica; la ruta legacy (6-arg) queda DEPRECATED y su coexistencia con la 9-arg es defecto de superficie (WAC-DF-09). |

## 4. Reglas transversales R-*

R-1..R-5: texto íntegro del original 60 §4 subsiste. Se AÑADE:

```text
[AMEND-W6.1] R-6 — MATRIZ DE BLOQUEOS POR EVENTO (cierra CR-W6-1; condición de aceptación W7):
  E-V (venta)         : advisory lock por (tienda) o FOR UPDATE de filas de productos — ya definido.
  E-D (devolución)    : advisory lock por original_transaction_id (o lock de las filas
                        transaction_items originales) ANTES de leer el acumulado devuelto.
  E-T (transferencia) : lock por (tienda, producto) en ambas patas dentro de la misma TX.
  E-P (producción)    : lock por (orden, ítem) — ya existe FOR UPDATE en withdraw endurecido —
                        y lock (tienda, producto) para el blend de salida PT.
  E-A (ajuste)        : lock por (tienda, producto) antes de leer (stock, WAC).
  Ningún acumulado se lee sin lock previo del recurso compartido. Un «CHECK-FUNC» solo es
  seguro si bloquea antes de computar.
```
