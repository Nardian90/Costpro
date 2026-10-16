# MISIÓN — CORRECCIÓN Y VERIFICACIÓN E2E: REPORTE ENTREGA DE COMISIONES (15/10/2026)

**Fecha:** 16/10/2026 · **Rama:** `fix/reporte-entrega-comisiones-1510` (desde `77f1448ad`, base `main` @ `b3ae40261` + adendas documentales) · **PR de protección:** este

## Problema

En `Inicio → OPERACIÓN → Ventas → Reporte Entrega`, al consultar el rango exclusivo **16/10/2026** aparece una comisión que, según la operación realizada, corresponde al día **15/10/2026**.

## Hipótesis a discriminar con evidencia (sin presuponer)

1. Pago registrado erróneamente con fecha 16/10.
2. Fecha almacenada correcta pero el reporte usa otro campo de fecha.
3. Defecto de límites / zona horaria / conversión local↔UTC en el filtro.
4. La consulta incluye registros de días anteriores.
5. Otro defecto en la lógica de comisiones o su asociación con la entrega.

## Reglas de seguridad asumidas

- No modificar `main`, no desplegar ni fusionar sin autorización.
- No alterar comisiones de otras tiendas.
- No cambiar `created_at` ni marcas de auditoría para "cuadrar".
- No borrar/recrear/duplicar el pago.
- Sin SQL directo ni `service_role` para corregir datos operativos (solo lectura para investigar).
- Evidencia del registro original antes de cualquier escritura; si no hay vía segura autorizada, dejar el dato sin modificar y documentar.

## Fases

- **A.** Reproducir en la interfaz: filtros 15|15, 16|16, 15–16 con capturas y totales originales.
- **B.** Rastrear la comisión al origen: ficha de evidencia (ID real del pago, fechas con TZ, campo exacto del filtro, endpoint/RPC, archivos frontend).
- **C.** Causa raíz: selector → estado → parámetros → API/RPC → consulta → datos → render (9 comprobaciones obligatorias).
- **D.** Corregir solo lo demostrado (Caso 1 fecha mal almacenada / Caso 2 filtro / Caso 3 bloqueo).
- **E.** Pruebas unitarias + integración + E2E (días 15/16, rango 15–16) con el framework existente + capturas reales.
- **F.** Verificación de integridad posterior (sin duplicados, totales coherentes, otras tiendas intactas).

## Entregable

Informe en `docs/audits/` con: causa raíz demostrada, ficha del pago, campo exacto, archivos modificados, pruebas ejecutadas, capturas de los 3 rangos, totales, integridad, rama/commit y bloqueos si los hay. Estado final: **CORREGIDA Y VERIFICADA** o **BLOQUEADA**.
