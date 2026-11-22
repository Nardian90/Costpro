# ADNEGOCIO 2026-11-22 — Evidencia visual: Estados Financieros en 4 pestañas

Capturas contra la BD aislada (tienda demo `CAPTURAS E2E Store`, 19 ventas
reales de oct/nov 2026 contabilizadas por el motor vía `fin_backfill` con las
reglas activas reales — 0 errores, net zero tras teardown). Servidor local con
el head de esta rama.

| Archivo | Qué demuestra |
| --- | --- |
| `dashboard-completo-1920.png` | Dashboard como primera pestaña: Ritmo de ventas (108%), alerta «Configuración contable pendiente» (5 tipos reales sin regla, dinámico) y accesos directos a los tres informes. Cuatro pestañas directas, sin «Análisis» ni pseudo-tab de Configuración. |
| `dashboard-alerta-1920.png` | Zoom de la alerta: conteo dinámico, nombre de cada tipo, situación («Sin regla económica activa») y acceso a Configuración de Documentos. |
| `dashboard-tabla-1920.png` | Tabla «Resumen financiero» (cierre del Dashboard): bloque A Resultados del período (Ingresos, −Costo, =Utilidad bruta, −Gastos, =Resultado neto) y bloque B Situación a la fecha de corte (Efectivo con desglose USD «incluido», Bancos, CxC, CxP, Inventario). Encima, la Evolución acumulada. |
| `situacion-1920.png` | Estado de situación como pestaña directa (informe intacto). |
| `rendimiento-1920.png` | Estado de rendimiento como pestaña directa (informe intacto; los gráficos del antiguo Resumen viven al final de esta pestaña). |
| `conciliacion-1920.png` | Conciliación como pestaña directa (matriz bajo demanda). |
| `dashboard-375.png` | Dashboard responsive en móvil 375px. |

Los importes provienen de consultas reales del motor (RPC fin_get_dashboard /
fin_get_income_statement / fin_get_balance_sheet); nada codificado.
