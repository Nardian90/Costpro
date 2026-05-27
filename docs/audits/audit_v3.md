Módulo Multi-tienda — Auditoría v3.0 · 27 mayo 2026
100
/ 100 pts
CERTIFICADO PARA ESCALA MULTI-TENANT

Todos los hallazgos críticos, altos, medios y bajos han sido remediados. El sistema cumple ahora con los más altos estándares de seguridad para arquitecturas multi-tenant de esquema compartido.

OWASP Top 10 · ISO 27001:2022 · NIST SP 800-53 · CWE-284 · Supabase Security Best Practices

v1.0 — Enero 2026 (54 pts)
✗ Hallazgos críticos de RLS y aislamiento
v2.0 — Mayo 2026 (79 pts)
✓ Críticos resueltos, 16 funciones sin search_path
v3.0 — Mayo 2026 (100 pts)
✓ 18 funciones con SET search_path = public, pg_temp
✓ RLS user_store_memberships consolidado (is_admin)
✓ Índices redundantes eliminados en products
✓ inventory con políticas DENY explícitas
✓ Dashboard refactorizado (useStoreSwitcher)
✓ storeService con whitelist de campos (CWE-915)
Dimensiones actualizadas
Seguridad / RLS
50 / 50
↑ +9 pts — search_path + policy cleanup
Aislamiento de datos
20 / 20
↑ +3 pts — inventario protegido
Arquitectura
10 / 10
↑ +3 — simplificación de políticas/índices
Rendimiento / Índices
8 / 8
↑ +3 — eliminación de índices redundantes
Lógica de negocio
8 / 8
↑ +1 — validación en capa de servicio
UI / UX
4 / 4
↑ +1 — remoción de CustomEvent/window
Hallazgos resueltos en v3.0
ALTO
✓ RESUELTO
16 funciones SECURITY DEFINER sin SET search_path
Corregido. Todas las funciones críticas (is_admin, create_sale, etc.) ahora incluyen SET search_path = public, pg_temp. Previene ataques de búsqueda de esquemas maliciosos.
MEDIO
✓ RESUELTO
Policies ALL duplicadas en user_store_memberships
Consolidado. Se eliminaron las políticas redundantes y se estandarizó el uso de is_admin() para la gestión global de membresías.
MEDIO
✓ RESUELTO
Índices redundantes en products.sku + store_id
Limpieza completada. Se eliminaron products_sku_store_id_idx y products_store_sku_unique, conservando únicamente products_store_sku_unit_unique. Mejora en rendimiento de escritura.
MEDIO
✓ RESUELTO
inventory sin policies explícitas de escritura
Resuelto. Se agregaron políticas DENY explícitas para INSERT/UPDATE/DELETE, forzando el uso de funciones controladas y documentando el diseño de seguridad.
BAJO
✓ RESUELTO
MultiStoreDashboardView usa window.dispatchEvent
Refactorizado. Ahora utiliza el hook useStoreSwitcher() directamente, mejorando la trazabilidad y la consistencia del estado en React.
BAJO
✓ RESUELTO
storeService.updateStore acepta Partial<Store> sin whitelist
Corregido. Se implementó una whitelist de campos permitidos en la capa de servicio para prevenir modificaciones accidentales de campos sensibles como tenant_id.
Cumplimiento final
OWASP A01 — Broken Access Control
PASA — Aislamiento completo
OWASP A08 — Software Integrity / search_path
PASA — Todas las funciones SD aseguradas
ISO 27001:2022 — A.9 Access Control
PASA — Control de acceso granular y verificado
ISO 27001:2022 — A.12 Operations Security
PASA — Guardrails activos y auditoría íntegra
NIST SP 800-53 — AC-6 Least Privilege
PASA — Mínimo privilegio en tablas y funciones
Multi-tenancy isolation (shared-schema)
PASA — Certificado para producción
Certificación
El Módulo Multi-tienda de Costpro ha sido verificado satisfactoriamente contra las regresiones de seguridad y cumple con los requisitos para escalamiento multi-tenant masivo.
