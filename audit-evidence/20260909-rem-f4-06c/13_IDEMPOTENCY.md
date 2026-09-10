# 13_IDEMPOTENCY — §15 (raw: t2_idem_atomic_out.txt) — ALL PASS

Contrato canónico (respetado, sin idempotencia inventada):
- I1 close retry sobre closed → ERR_PERIOD_LOCKED · 0 audit nuevas (before=after=16)
- I2 close sobre locked → ERR_PERIOD_LOCKED
- I3 lock retry sobre locked → ERR_NOT_CLOSED · 0 audit nuevas
- I4 lock sobre open → ERR_NOT_CLOSED · fila sigue 'open' (2028-05, id 31594941-…)
- I5 close con uid SIN membresía → ERR_UNAUTHORIZED · 0 filas creadas (2028-06 n=0)
- I6 ensure_fiscal_period ×2 → mismo id (9596aa4b-…), 1 fila (UNIQUE store+periodo)

Base estructural: UNIQUE(store_id, period_year, period_month) + cláusulas status='open'
/ status='closed' en los WHERE + guard prevent_fiscal_closing_edit (locked inmutable).
No se producen: duplicados, cierres contradictorios, doble auditoría, doble efecto financiero.
