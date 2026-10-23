# Cómo Hacer: Inventario Físico

> **Necesita esto cuando**: va a contar la mercancía real de la tienda (todo el catálogo, una categoría o una selección de productos) y necesita formalizar el corte, conciliar las diferencias y volcar los ajustes al inventario con trazabilidad completa.

## ¿Para qué sirve?

El **Inventario Físico** es el proceso formal de conteo de mercancía. A diferencia de un ajuste manual, es un **documento controlado por estados** que congela el stock teórico en un momento del tiempo (corte), permite contar con o sin conocer las cantidades del sistema (conteo ciego), conciliar las diferencias y generar los **Ajustes Documentales** oficiales de faltantes y sobrantes.

Cada inventario recibe un número **IF-AAAA-NNNNN** y todo su ciclo queda en auditoría.

## ¿Dónde encontrarlo?

- **Escritorio**: Inicio → **OPERACIÓN** → **Almacén** → **Inventario Físico**.
- **Búsqueda global**: `Ctrl/Cmd + K` y escriba «inventario físico», «conteo» o «corte».

## Antes de comenzar

- **Crear, conciliar, autorizar y cerrar**: admin, manager o encargado de la tienda.
- **Contar**: también puede hacerlo el rol warehouse y el clerk.
- Elija bien la **fecha y hora de corte**: los movimientos posteriores al corte se reportan aparte en la conciliación, no se mezclan con las diferencias.
- Si el conteo será realizado por personal que no debe ver el stock teórico, decida usar el **conteo ciego**.

## Cómo crear el inventario físico

1. Vaya a **OPERACIÓN → Almacén → Inventario Físico**.
2. Haga clic en **Nuevo Inventario Físico** y complete:
   - **Fecha y hora de corte**: el instante que fija el stock teórico.
   - **Descripción / motivo**: ej. «Corte mensual octubre».
   - **Responsable del conteo**: quién dirigirá el conteo.
   - **Alcance**: **Catálogo completo**, **Por categoría** o **Selección de productos**.
   - **Conteo ciego** (opcional): oculta las cantidades teóricas y las diferencias a quien cuenta — en la vista, en el PDF y en el Excel. Solo admin/manager/encargado las ven al conciliar.
   - **Observaciones** (opcional).
3. Guarde. El documento queda en estado **Borrador**.

> ⚠️ **El stock teórico se fija al Preparar el conteo, no al abrir la vista**: si entran mercancía o ventas después de la hora de corte, no afectan la base del conteo; quedan como movimientos post-corte visibles en la conciliación.

## Cómo ejecutar el conteo

1. Con el documento creado, pulse **Preparar conteo**: el sistema congela las cantidades teóricas del alcance definido y el documento pasa a **Preparado**.
2. Pulse **Iniciar conteo** (estado **En conteo**).
3. Descargue la **Hoja de conteo en PDF** (incluye campos de firma) para contar en papel, o capture directamente en la pantalla: el sistema guarda automáticamente lo que escribe (autosave).
4. Filtre la captura entre **Todas / Pendientes / Contadas** para avanzar sin saltar productos.
5. Si el conteo se hace en papel, cargue los resultados con **Importar Excel** o transcríbalos a mano.
6. Al terminar, pulse **Completar conteo** (estado **Conteo completado**).

## Cómo conciliar y cerrar

1. Pulse **Enviar a conciliación** (estado **En conciliación**).
2. Revise el comparativo: **teórico vs. contado**, diferencia en unidades y su **valor**, y los **movimientos post-corte** del período.
3. Revise los totales del corte: productos cuadrados, faltantes, sobrantes y desvío.
4. Si su flujo exige una segunda mirada, pulse **Enviar a autorización** (estado **Pendiente de autorización**); quien autoriza puede **Generar ajustes documentales** o **Devolver a conciliación**.
5. Pulse **Generar ajustes documentales**: el sistema crea los Ajustes de faltante y sobrante, **enlazados a este inventario** (badge IF-… en los ajustes).
6. Pulse **Cerrar inventario** (estado **Cerrado**). El ciclo queda sellado.
7. Si el documento debe abandonarse, use **Anular** indicando el motivo (estado **Anulado**), disponible según el estado del ciclo.

## Estados y resultados

| Estado | Qué significa |
|--------|---------------|
| **Borrador** | Documento creado; aún congela nada. |
| **Preparado** | Stock teórico congelado al corte; listo para contar. |
| **En conteo** | Captura de cantidades en curso (con autosave). |
| **Conteo completado** | Todas las líneas del alcance están contadas. |
| **En conciliación** | Comparando teórico vs. contado y revisando diferencias. |
| **Pendiente de autorización** | Esperando el visto bueno de un rol de gestión. |
| **Conciliado** | Diferencias aceptadas y ajustes generados. |
| **Cerrado** | Ciclo finalizado; el inventario queda como registro histórico. |
| **Anulado** | Proceso abandonado con motivo. |

## Restricciones importantes

- El corte **congela la teórica al preparar**: planifique la hora de corte en un momento sin movimiento o asuma que las diferencias se leerán junto a los movimientos post-corte.
- Con **conteo ciego** activado, quien cuenta no ve teóricas ni diferencias; solo la conciliación las revela.
- Los ajustes se generan **solo desde la conciliación**: no ajuste a mano los mismos productos mientras el inventario está en curso.
- No hay dos inventarios físicos abiertos que se pisen: coordine el corte con la operación.
- Los ajustes generados son Ajustes Documentales normales: por eso heredan sus reglas (motivo obligatorio, reversión por gestión).

## Errores frecuentes

| Síntoma | Causa | Solución |
|---------|-------|----------|
| Las diferencias no cuadran con lo que esperaba | Hubo ventas/recepciones después del corte. | Revise la sección de movimientos post-corte en la conciliación. |
| El conteo se perdió a mitad de camino | Corte de energía o cierre de sesión. | El autosave conserva lo capturado; reabra y continúe. |
| No puedo pasar a conciliación | Faltan líneas por contar. | Compruebe el filtro «Pendientes» y complételas. |
| No veo el botón de autorización | Su rol no es de gestión. | Pida a admin/manager/encargado que autorice. |
| Generé los ajustes y hay una línea mal | El ajuste documental ya existe. | Revierta el ajuste correspondiente desde Ajustes Documentales y corrija; el inventario cerrado no se reabre. |

## Preguntas frecuentes

**¿Puedo contar solo una categoría?**
Sí: al crear, elija el alcance **Por categoría** o **Selección de productos**. No necesita contar toda la tienda.

**¿Qué es el conteo ciego y cuándo conviene?**
Es contar sin ver el stock del sistema, para evitar sesgos. Conviene cuando quien cuenta no debe influirse por la teórica (ej. personal nuevo o conteos de auditoría).

**¿Dónde quedan los ajustes del conteo?**
En **Ajustes Documentales**, con motivo de faltante o sobrante de conteo y el badge IF-… del inventario que los generó. El Kardex de cada producto registra el movimiento.

**¿Puedo importar el conteo desde Excel?**
Sí: use **Importar Excel** durante el conteo para cargar las cantidades contadas en bloque.

**¿Puedo cancelar un inventario a mitad del conteo?**
Sí, con **Anular** y su motivo, según el estado del ciclo. Los datos capturados quedan como evidencia en auditoría.

## Información relacionada

- **Cómo ajustar el inventario** — los Ajustes Documentales que este módulo genera.
- **Causas y motivos de ajuste** — los motivos oficiales de faltante y sobrante.
- **Gestión del Inventario** — la pestaña Stock Actual donde se ve el resultado.
- **Kardex y trazabilidad** — los movimientos que generan los ajustes.
