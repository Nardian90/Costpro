# Referencia: Roles y Permisos del Sistema

> ⚠️ **DOCUMENTO HISTÓRICO — SUPERSEDADO (2026-09-05, W9.5 B-8).**
> La política vigente de anulación/reversión de ventas es el **MODELO C**
> descrito en `knowledge/help/04-configuracion/roles-y-permisos.md`
> (`canUndoSales` POS Undo 30s venta propia; `canReverseSales` reversión
> administrativa admin/manager/encargado). La ventana de 24h y la regla
> ">24h SOLO admin" de este documento NUNCA llegaron a implementarse
> server-side y quedan **supersesadas**. Este archivo se conserva como
> referencia histórica del diseño original de 6 roles.

> **Use esta tabla** cuando quiera saber qué puede hacer cada tipo de usuario.

## Los 6 roles del sistema

CostPro tiene **6 roles jerárquicos**. Los permisos son **acumulativos**: un rol superior puede hacer todo lo que puede hacer un rol inferior, más cosas adicionales.

| Rol | Nivel | Descripción |
|-----|-------|-------------|
| **admin** | 6 (máximo) | Administrador del sistema. Puede hacer todo. |
| **manager** | 5 | Gerente. Administra tiendas y usuarios. |
| **encargado** | 4 | Encargado de tienda. Supervisa operaciones. |
| **clerk** | 3 | Cajero / Vendedor. Atiende clientes. |
| **almacen** | 2 | Almacenista. Maneja inventario, no atiende público. |
| **usuario** | 1 (mínimo) | Usuario básico. Solo lectura. |

## Tabla de permisos por rol

| Acción | usuario | almacen | clerk | encargado | manager | admin |
|--------|---------|---------|-------|-----------|---------|-------|
| Ver Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Hacer ventas (POS) | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Ver Historial propio | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Ver Historial de otros | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Recibir mercancía | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Crear OC | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Ajustar inventario | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Ajuste con autorización especial | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Crear transferencias | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Confirmar transferencias recibidas | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Cerrar caja (propia) | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Cerrar caja (de otros) | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Anular ventas (< 24h) | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Anular ventas (> 24h) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Aplicar descuento < 20% | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Aplicar descuento 20-50% | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Aplicar descuento > 50% | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Ver reportes de tienda | ❌ | ✅ | Solo propios | ✅ | ✅ | ✅ |
| Ver reportes de todas las tiendas | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Crear / editar productos del catálogo | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Crear / editar tiendas | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Crear / editar usuarios | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Ver auditoría | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Ver monitoreo de uso | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Cambiar configuración global | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Cambiar tasa de cambio | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Pagar comisiones | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |

> ✅ = Puede hacer. ❌ = No puede hacer.

## Detalle de cada rol

### admin (Administrador)
- Acceso total a todo.
- Puede crear, editar, eliminar tiendas, usuarios, configuración.
- Único que puede cambiar la configuración global.
- Normalmente es el dueño o el gerente general.

### manager (Gerente)
- Administra una o varias tiendas.
- Puede crear usuarios pero no cambiar configuración global.
- Ve reportes de todas las tiendas a su cargo.
- Autoriza operaciones especiales (descuentos grandes, ajustes grandes).

### encargado
- Supervisa UNA tienda.
- Ve reportes de su tienda.
- Autoriza descuentos hasta 50%.
- Puede ajustar inventario y anular ventas de cualquier cajero de su tienda.
- No crea usuarios.

### clerk (Cajero)
- Atiende la terminal POS.
- Ve solo sus propias ventas.
- Puede anular sus ventas dentro de 24h.
- Aplica descuentos hasta 20%.

### almacen (Almacenista)
- Maneja el inventario físico.
- Recibe mercancía, hace ajustes, hace transferencias.
- No atiende público.
- Ve reportes de inventario y recepciones.

### usuario (básico)
- Solo lectura.
- No hace transacciones.
- Útil para auditores externos o consultores que solo necesitan ver información.

## Cómo cambiar el rol de un usuario

1. Solo **admin** o **manager** pueden cambiar roles.
2. Vaya a **Configuración → Usuarios**.
3. Haga clic en el usuario.
4. En el campo **"Rol"**, elija el nuevo.
5. Haga clic en **"Guardar"**.

> ⚠️ **Importante**: El cambio de rol queda registrado en la auditoría. Si le quita permisos a un empleado, deje constancia del motivo.

## Preguntas frecuentes

**¿Un usuario puede tener diferentes roles en diferentes tiendas?**
- Sí. Por ejemplo: encargado en la tienda A, pero clerk en la tienda B.
- Se configura en Configuración → Usuarios → Memberships.

**¿Qué rol debo dar a un cajero nuevo?**
- **clerk**. Es el rol mínimo para poder vender.

**¿Qué rol debo dar al contador?**
- **manager** con permisos de reportes y auditoría.
- O un rol personalizado si solo necesita ver ciertas cosas.

**¿Puedo crear roles personalizados?**
- Sí, pero requiere configuración avanzada. Consulte al administrador técnico.

**¿Cómo revoco el acceso de un empleado que se va?**
- No elimine el usuario (pierde el historial).
- En su lugar, cambie el estado a **"Inactivo"**.
- El usuario ya no podrá entrar, pero sus ventas y acciones quedan en la auditoría.
