════════════════════════════════════════════════════════════════════
W9.5 — B-2 · 05-authorization-matrix.md
GATE 5 — Matriz de autorización REAL (cada celda con probe/evidencia)
════════════════════════════════════════════════════════════════════
Llenada SOLO con resultados de probes live (06/07/08) y lectura del cuerpo —
no por teoría. Fixture sintético prefijo b2c0ffee (tienda A, tienda B).

Actor                    | Misma tienda | Otra tienda | Propia transacción | Transacción ajena (misma tienda)
-------------------------|-------------|-------------|--------------------|----------------------------------
usuario con membresía ACTIVA (rol 'costo', frontend canVoid=false) | ALLOWED (P1: SUCCESS, tx voided, +1 movement, audit) | DENIED (P7: ERR_UNAUTHORIZED) | ALLOWED (P1: seller=caller) | ALLOWED (P13: SUCCESS — NO existe chequeo de propiedad; audit atribuye al caller real)
usuario autenticado SIN membresía en la tienda objetivo | DENIED (P2: ERR_UNAUTHORIZED) | DENIED (P2/P7, simétrico) | — (no aplica) | DENIED (P2)
admin (role='admin', sin membership) | ALLOWED (P4: SUCCESS — bypass por diseño de has_store_access_as) | ALLOWED (P4: voidó TX_B de tienda B sin membership) | ALLOWED | ALLOWED
forged user ID (p_user_id forjado) | sin efecto (P3b': SUCCESS pero audit/movement = UID REAL del caller) | DENIED (P3a: ERR_UNAUTHORIZED — el id forjado NO concede acceso) | sin efecto | sin efecto (identidad real prevalece)
anon (PostgREST real, clave anon) | DENIED (P5: HTTP 400 P0001 ERR_UNAUTHORIZED) | DENIED | DENIED | DENIED
service_role (PostgREST real) | ALLOWED con p_user_id de miembro (P6c: HTTP 200 SUCCESS) | ALLOWED con p_user_id de miembro de ESA tienda (contrato /api/reverse) | ALLOWED | ALLOWED
service_role SIN p_user_id | DENIED (P12: HTTP 400 ERR_UNAUTHORIZED) | DENIED | DENIED | DENIED

Dimensiones de ROL dentro de la misma tienda (contrato DB actual):
  admin        → ALLOWED (bypass global)
  encargado    → ALLOWED si membresía activa (no hay chequeo de rol; P-hermano: familia completa usa has_store_access_as)
  clerk/usuario/costo/warehouse → ALLOWED si membresía activa (P1 lo PRUEBA con rol 'costo')
  ⇒ El gating de rol (canVoidTransactions: admin/encargado/manager=true;
     usuario/clerk/warehouse/costo=false) existe SOLO en el frontend
     (src/types/index.ts ROLE_PERMISSIONS + useSalesHistoryView canVoid).
     Server-side NO se re-evalúa — ni en void_transaction NI en la ruta canónica
     /api/reverse → reverse_transaction_v2 (mismo has_store_access_as).
     → REGISTRADO COMO BACKLOG B-8 (decisión de política, fix sistémico).

Dimensiones sin cubrir por el contrato (probadas):
  - Propiedad de la transacción (seller_id): NO se valida (P13).
  - Antigüedad/ventana temporal: NO se valida (fixture con NOW()-10min; el cuerpo
    no contiene ninguna cláusula temporal).
  - Status ≠ completed: voidable (P11) — BACKLOG B-9.
