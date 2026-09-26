# FASE E-SEC-FINAL — 04 SERVER POLICY (D1 + D2, única regla canónica)

## D1 — Umbral POR LÍNEA

**Ubicación**: `create_sale_v2` (migración `20260927000001`, primera pasada + gate).

- Por cada línea con referencia server-side (variante → `product_variants.price`, base → `products.price`, ambas bajo `FOR UPDATE`, redondeadas a 2dp):
  ```sql
  v_line_pct := ((v_reference_price - v_price) / v_reference_price) * 100;  -- solo si v_price < ref
  IF v_line_pct > v_max_line_pct THEN v_max_line_pct := v_line_pct; END IF;
  ```
- Gate definitivo:
  ```sql
  IF v_effective_discount_pct >= 15 OR v_max_line_pct >= 15 THEN v_gate_triggered := true; END IF;
  ```
- El agregado por ítem (`v_item_discount_pct`) se conserva SOLO como metadato de auditoría (continuidad con E-SEC); **ya no gobierna el gate**.
- Comparación exacta sobre numeric: 500→425 = 15.00% ⇒ gate; 500→424.99 = 15.002% ⇒ gate; 500→425.01 = 14.998% ⇒ sin gate; 500→490 = 2% ⇒ sin gate.
- **Ninguna línea queda exenta por los precios normales de otras líneas**: el caso {A 500→500 + B 300→240} dispara el gate por B aunque el agregado sea 7.5% (demostrado en 08-SECURITY-MATRIX M1/M2).

## D2 — `discount_reason` obligatorio cuando hay autorización

- Viaje: `SupervisorAuthModal` (textarea requerido 1..500) → `supervisor-auth-store` → checkout (`discount_reason`) → route Zod (`z.string().max(500)` passthrough) → RPC `p_discount_reason`.
- Validación **server-side** (única regla canónica), dentro del gate:
  ```sql
  v_reason := btrim(COALESCE(p_discount_reason, ''));
  IF char_length(v_reason) > 500 THEN RAISE 'ERR_DISCOUNT_REASON_INVALID'; END IF;
  ...
  IF v_gate_triggered THEN
    IF p_supervisor_user_id IS NULL THEN RAISE 'ERR_SUPERVISOR_REQUIRED'; END IF;   -- orden: supervisor primero
    IF v_reason = '' THEN RAISE 'ERR_DISCOUNT_REASON_REQUIRED'; END IF;             -- motivo después
  ```
- **No se exige bajo el umbral** (N4 de la matriz: <15% sin motivo = 200).
- Se normaliza con `btrim` (R1: "   cliente frecuente   " → almacenado "cliente frecuente").
- Persistencia: `audit_logs.metadata.discount_reason` + copia en `metadata.lines[]` (asociación inequívoca línea/operación). Sin catálogo de motivos (mandato: texto controlado).

## Flujo server-side completo (mandato §ARQUITECTURA)

```text
UI → cart → checkout → POST /api/pos/checkout (Zod + token HMAC verify)
 → create_sale_v2 (service_role)
    → precio canónico server-side (products/product_variants bajo FOR UPDATE, 2dp)
    → desviación POR LÍNEA (v_max_line_pct)
    → ¿gate? NO → permitir (precio legítimo intacto)
             SÍ → supervisor presente + RC-1 identidad + rol admin/manager
                 → motivo no vacío (≤500)
                 → [service_role] jti único consumido atómicamente + scope cubre cada línea ≥15%
                 → permitir
```

## REGLA CRÍTICA preservada (precio legítimo)

- `500→500`, `500→490`, `500→450`: 200 sin supervisor (matriz N1–N4, browser B1/B2).
- No existe ninguna regla `price_at_sale === product.price`: el precio sigue siendo comercialmente editable; 500→600 (sobrecarga) sigue permitido (desvío negativo no es descuento).
