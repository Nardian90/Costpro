# DECISIÓN DEL PROPIETARIO — VALES DE SALIDA EN TIENDAS REALES

**Fecha de la decisión:** 2026-10-21 (mensaje directo del propietario durante la Misión Continua de Resolución del Inventario)
**Registrada por:** Agente de la Misión Continua (documentación de decisión ya tomada — el agente NO decide)
**Alcance:** sub-ítem «vales del propietario» de CP-DATA-001 + regla permanente de operación para ENERVIDA
**Estado:** RATIFICADA POR EL PROPIETARIO (fuente: instrucción directa, no inferida)

---

## 1. Texto de la instrucción (literal)

> «con respecto a lo anterior mientras no afecte enervida me da igual q
> confirmes vales etc, si es en enervida anula los vales si no estan
> confirmados»

## 2. Interpretación aplicada (conservadora, UUID a UUID)

1. **Confirmar vales fuera de ENERVIDA**: los vales manuales del propietario
   en tiendas reales se CONFIRMAN como datos de negocio legítimos — quedan
   EXCLUIDOS permanentemente de toda ruta de limpieza E2E/QA. No se modifica
   su estado: se registran como propiedad confirmada del usuario.
2. **Regla permanente para ENERVIDA**: todo vale de salida en ENERVIDA que no
   esté confirmado (sin respaldo de conciliación/operación real) debe
   ANULARSE por la vía oficial (reversión `reverse_vale_salida`, que devuelve
   stock y deja rastro en `audit_logs`).
3. **Qué NO autoriza esta instrucción** (delimitación explícita): NO cubre
   borrados de tiendas D (6), usuarios D (16), residuos del 9-oct (2 tenants,
   8 tiendas, 4 usuarios) ni ninguna otra entidad de limpieza — esas siguen
   requiriendo autorización por lote con confirmación UUID por UUID (regla de
   oro de E2E-DATA-CLEANUP-INVENTORY). «Confirmar vales etc.» se aplica a los
   VALES, no a las eliminaciones.

## 3. Alcance exacto de los vales confirmados HOY (evidencia documental)

Los 3 vales manuales del propietario identificados el 2026-10-09
(`docs/audits/e2e-contamination-cleanup-20261009.md` §5, excluidos entonces de
toda limpieza a la espera de esta confirmación):

| Vale | Tienda | Estado al corte | Efecto de la decisión |
|---|---|---|---|
| `VS-000001-2026` | Puerto Padre | `reversed` | **CONFIRMADO** — se conserva tal cual; exclusión permanente de limpieza |
| `VS-000002-2026` | Puerto Padre | `reversed` | **CONFIRMADO** — ídem |
| `VS-000023-2026` | TIENDA CENTRAL | `completed` | **CONFIRMADO** — ídem |

- Los tres fueron creados con notas de redacción humana fuera de la ventana
  E2E (00:50–01:20 UTC del 2026-10-09), sin productos de prueba.
- **Ninguno pertenece a ENERVIDA** → aplica la rama benigna (confirmar).
  No se requiere ninguna operación de datos sobre ellos.
- Sus efectos contables ya son consistentes: los `reversed` tienen sus
  movimientos compensatorios; el `completed` de Tienda Central descuenta
  stock de forma permanente y legítima.

## 4. Regla ENERVIDA — estado actual y procedimiento

- **Al corte de esta misión**, todos los vales de ENERVIDA con evidencia
  documental están CONFIRMADOS por conciliación (179/179, CP-RES-006;
  `VS-000185-2026`…`VS-000188-2026` verificados en Kardex por
  `REGISTRO_OPERACIONES_2026-10-16_ENERVIDA`). **No existe hoy una lista
  documental de vales no confirmados en ENERVIDA.**
- La verificación viva (listar vales de ENERVIDA no cubiertos por
  conciliación) requiere credenciales de BD no disponibles en el entorno de
  esta misión. Se entrega el ejecutor preparado:
  `scripts/vales/enervida_vales_no_confirmados.py` —
  por defecto SOLO LISTA (lectura vía Management API); el modo `--apply`
  (reversión oficial por RPC, usuario admin indicado) existe para el entorno
  con credenciales del propietario y exige triple confirmación + reason
  trazable.
- **Vía alternativa sin script:** en la app, `Inicio → Operación → Almacén →
  Vales de Salida`, filtrar por la tienda ENERVIDA, y usar «Devolver» en cada
  vale no confirmado (misma RPC oficial, motivo sugerido:
  «Anulado por no confirmación — instrucción del propietario 2026-10-21»).

## 5. Consecuencias para el inventario

- **CP-DATA-001**: sub-ítem «vales del propietario» → RESUELTO por esta
  decisión. El resto de la tarea (tiendas D, usuarios D, residuos 9-oct)
  SIGUE PENDIENTE DE AUTORIZACIÓN por lote.
- **CP-INV-005** (regularización de artefactos QA por lotes): sin cambio —
  requiere autorización por lote separada.
- Ningún dato fue escrito, borrado ni modificado al registrar esta decisión.
