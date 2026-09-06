# W9.5 — B-10b-OBS-2 · 14-repair-decision.md
# Decisión de reparación (GATE 14/18)

```text
STATUS: BLOCKED — HUMAN DECISION REQUIRED
```

## Decisión tomada en esta fase

**NINGUNA.** Conforme al mandato (§18 GATE de decisión humana; §2 regla absoluta;
§25 criterios), esta fase NO ejecuta ningún modelo de reparación. La fase completa fue
READ-ONLY (verificado en 15-zero-mutation-verification.md).

## Qué se decide fuera de esta fase (menú en 13-repair-options.md)

1. **Modelo B + C(restringido)** — RECOMMENDED: reconciliación formal de apertura para
   los 108 huérfanos vivos de d1c4ba0e + descarte/reclasificación de los 10 productos
   Test. Requiere: aprobación del dueño del negocio (consagrar 6.553 u / 21,93 M
   ESTIMATED como apertura), confirmación de tratamiento de los 4 productos G2
   (delta 08-04..08-17 no reconstruible 1:1) y de los 16 productos con stock=0.
2. **Modelo A** — replay del ledger desde el payload 08-02 + apertura del delta:
   alternativa con historial más fiel, mayor costo/riesgo.
3. **No hacer nada** — la tienda activa sigue con catálogo no vendible por el pipeline
   canónico (riesgo de bloqueo por `prevent_negative_inventory` en ventas de esos
   productos) y el detector permanente (GATE 16) seguirá reportando los huérfanos.

## Datos para la decisión (resumen ejecutivo)

- El stock es REAL (respaldado por backup 08-02 con ledger consistente y por auditoría
  de operaciones), NO corrupto y NO test (excepto 10 productos Test = 126 u).
- ROOT CAUSE identificado: purge SQL directo post-08-17 sin tocar products
  (11-root-cause.md). Actor: UNKNOWN/HISTORICAL (irrecuperable, no inventado).
- Impacto de NO reparar: operación POS comprometida para 108 productos de la tienda
  central; telemetría (low stock, ABC, reportes) sin base.
- Impacto de reparar (B): cero riesgo financiero/WAC (invariantes exigibles);
  riesgo técnico bajo; reversible.

## Firma de la decisión humana (a completar en fase de ejecución)

```text
Decidido por: ____________________  Fecha: ________
Modelo elegido: [ ] A   [ ] B+C (recomendado)   [ ] C total   [ ] No reparar
Alcance: [ ] 108 vivos   [ ] +10 Test   [ ] +residuos (z_reports/reservations/etc.)
Notas:
```
