# Informe de Errores y Mejoras - CostPro

Este documento detalla 10 errores y violaciones de estándares encontrados en la aplicación, junto con sus respectivas soluciones aplicadas.

## 1. Uso de confirm() nativo en CatalogTable.tsx
- **Descripción**: El componente utiliza `confirm()` nativo para acciones críticas, lo cual bloquea el hilo principal y rompe la estética de la aplicación.
- **Impacto**: UX inconsistente y bloqueante.
- **Solución**: Reemplazar por un sistema de confirmación basado en modales (BaseModal) o Toast con acción.

## 2. Uso de confirm() nativo en IPVReportView.tsx
- **Descripción**: Se detectaron múltiples llamadas a `confirm()` para generar, anular o eliminar reportes.
- **Impacto**: UX inconsistente.
- **Solución**: Implementar confirmación no bloqueante.

## 3. Uso de confirm() nativo en TransactionTable.tsx
- **Descripción**: Acciones como eliminar transacciones o reiniciar conciliación usan `confirm()` nativo.
- **Impacto**: UX inconsistente.
- **Solución**: Implementar confirmación no bloqueante.

## 4. Uso de confirm() nativo en BankIngestion.tsx
- **Descripción**: El borrado total del historial bancario usa `confirm()` nativo.
- **Impacto**: Riesgo de ejecución accidental y UX pobre.
- **Solución**: Implementar confirmación no bloqueante.

## 5. Tipografía Responsiva: Falta de clamp() en Título Principal de IPVView
- **Descripción**: El encabezado "IPV Builder" usa clases estáticas `text-2xl sm:text-3xl` en lugar del estándar `text-[clamp(2rem,8vw,3rem)]`.
- **Impacto**: Legibilidad subóptima en dispositivos intermedios.
- **Solución**: Aplicar `clamp()` según los estándares de mantenimiento quirúrgico.

## 6. Tipografía Responsiva: Falta de clamp() en Valores de Dashboard (StatsCards)
- **Descripción**: Los valores numéricos de los KPIs en `IPVView.tsx` no usan tipografía fluida.
- **Impacto**: Escalamiento visual pobre en móviles.
- **Solución**: Aplicar `text-[clamp(2.5rem,10vw,3.5rem)]` a los valores principales.

## 7. Objetivos de Toque (Touch Targets): Botones de Acción en IPVView
- **Descripción**: Varios botones de acción tienen una altura de `h-10` (40px), incumpliendo el estándar de accesibilidad de 44px (`h-11`).
- **Impacto**: Dificultad de interacción en dispositivos táctiles.
- **Solución**: Incrementar altura a `h-11` (44px).

## 8. Manejo de Errores Incompleto en CloseSessionPage
- **Descripción**: Existe un `// TODO: Show error message to user` en las capturas de errores de las llamadas a API.
- **Impacto**: El usuario no recibe retroalimentación si falla el cierre de caja.
- **Solución**: Implementar notificaciones `toast.error`.

## 9. Lógica de Stock Incompleta en IPV (utils.ts)
- **Descripción**: La función `calculateCurrentStock` solo resta ventas, ignorando entradas o ajustes (`// TODO: En el futuro sumar entradas`).
- **Impacto**: Cálculo de existencia inexacto en el módulo IPV.
- **Solución**: Ampliar la lógica para contemplar otros movimientos si están disponibles.

## 10. Mapeo de Vistas Incompleto en TerminalShell.tsx
- **Descripción**: El shell principal tiene un `// TODO: Map remaining views` que indica que algunas rutas podrían estar desatendidas.
- **Impacto**: Posibles errores de navegación o vistas inaccesibles.
- **Solución**: Verificar y completar el mapeo de rutas en el `STRUCTURE` del Terminal.
