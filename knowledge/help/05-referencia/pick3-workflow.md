# Diagrama de Flujo de Usuario: Módulo Pick 3 (v9.0)

## Contenido

- [1. Descripción del Módulo](#1-descripción-del-módulo)
- [2. Escenario 1: Onboarding (Primer Inicio)](#2-escenario-1-onboarding-primer-inicio)
- [3. Escenario 2: Sincronización de Datos](#3-escenario-2-sincronización-de-datos)
- [4. Escenario 3: Consulta de Predicciones](#4-escenario-3-consulta-de-predicciones)
- [5. Escenario 4: Registro de Apuestas](#5-escenario-4-registro-de-apuestas)
- [6. Escenario 5: Operativa Diaria — Procesamiento](#6-escenario-5-operativa-diaria-procesamiento)
- [7. Escenario 6: Análisis Estadístico](#7-escenario-6-análisis-estadístico)
- [8. Escenario 7: Gestión de Bankroll](#8-escenario-7-gestión-de-bankroll)
- [9. Escenario 8: Auditoría e Historial](#9-escenario-8-auditoría-e-historial)
- [10. Sub-módulos del Sistema](#10-sub-módulos-del-sistema)

---

## 1. Descripción del Módulo

El módulo **Pick 3 Intelligence** es un sistema avanzado de análisis estadístico y gestión de apuestas para el juego Pick 3. La versión 9.0 incorpora un motor estadístico mejorado con análisis de frecuencia, gaps, cumplimiento de la Ley del Tercio, simulación de escenarios, backtesting y gestión integral de bankroll. El sistema se sincroniza con la **Verdad Absoluta** (base de datos de resultados oficiales) para garantizar que todas las operaciones se basen en datos reales y verificados.

> **Advertencia de Riesgo:** Este módulo es una herramienta de análisis estadístico. No garantiza resultados y debe utilizarse de forma responsable. El usuario acepta los términos éticos y de riesgo antes de acceder.

---

## 2. Escenario 1: Onboarding (Primer Inicio)

El proceso de onboarding guía al nuevo usuario a través de la configuración inicial:

1. **Acceso**: El usuario entra al módulo Pick 3 desde la barra lateral (grupo OTROS).
2. **Wizard Step 1**: Visualiza el **Disclaimer Ético y Advertencia de Riesgo**. Debe hacer clic en "Aceptar" para continuar. El contenido incluye la política de juego responsable y los términos de uso del módulo.
3. **Wizard Step 2**: Ingresa el **Presupuesto Inicial (Bankroll)**. El sistema valida que sea un monto numérico positivo y muestra un resumen del plan de gestión sugerido.
4. **Wizard Step 3**: Confirmación de los datos ingresados. Al hacer clic en "Comenzar", se dispara una transacción `initial_deposit` en el Ledger de Supabase y se marca `onboarding_completed: true`.
5. **Redirección**: El usuario es llevado al **Dashboard Principal** con una vista de bienvenida que resume las funcionalidades disponibles.

---

## 3. Escenario 2: Sincronización de Datos

La sincronización es el proceso de descargar los resultados oficiales más recientes:

1. El usuario hace clic en **"Sincronizar"** en el panel superior del dashboard.
2. El sistema consulta la fuente de datos oficial (Verdad Absoluta) y descarga los resultados disponibles.
3. Se muestra un indicador de progreso con la cantidad de resultados descargados.
4. Al completar, el dashboard se actualiza con los datos más recientes y se recalculan todas las métricas estadísticas.
5. Si ya existen datos locales, el sistema realiza una **sincronización incremental** descargando solo los resultados nuevos desde la última sincronización.

> **Tip**: Se recomienda sincronizar al menos una vez al día antes de realizar análisis o registrar apuestas, para asegurarse de que todas las métricas reflejen los resultados más actualizados.

---

## 4. Escenario 3: Consulta de Predicciones

El motor estadístico genera predicciones basadas en análisis de frecuencia, gaps y la Ley del Tercio:

1. Navega a la pestaña **"Predicciones"** en el sidebar del módulo.
2. El sistema muestra las **10 mejores líneas sugeridas** por el motor estadístico.
3. Cada predicción incluye:
   - **Combinación** (3 dígitos)
   - **Puntaje de confianza** (porcentaje calculado por el motor)
   - **Frecuencia histórica** de aparición
   - **Gap actual** (días desde la última aparición)
   - **Cumplimiento de la Ley del Tercio**
4. Las predicciones se filtran automáticamente por la **Ley del Tercio**: se muestran combinaciones de频 Alta, Media y Baja según la distribución estadística esperada.
5. El usuario puede ajustar los filtros para ver más o menos predicciones, o filtrar por rango de confianza.

> **Nota:** Las predicciones son sugerencias basadas en análisis estadístico histórico. No son garantías de resultados futuros.

---

## 5. Escenario 4: Registro de Apuestas

El registro de apuestas permite documentar cada jugada realizada:

1. Haz clic en **"Registrar Apuesta"** desde el dashboard o la sección de transacciones.
2. Completa los campos del formulario:
   - **Combinación**: Ingresa los 3 dígitos de la apuesta.
   - **Fecha**: Selecciona la fecha del sorteo.
   - **Turno**: Selecciona el turno (mañana, tarde, noche).
   - **Monto**: Ingresa la cantidad apostada.
3. El sistema verifica si ya existe un resultado oficial para esa fecha y turno.
4. Si el resultado ya existe, el sistema calcula automáticamente si la apuesta es ganadora (coincidencia exacta de los 3 dígitos) y procesa el premio (Monto × 500).
5. Si el resultado no existe aún, la apuesta queda registrada como **pendiente** y se procesará automáticamente cuando se sincronicen los resultados.

> **Importante:** El registro de apuestas está vinculado al Ledger financiero. Al registrar una apuesta, el monto se descuenta automáticamente del capital actual. Si la apuesta resulta ganadora, el premio se acredita en tiempo real.

---

## 6. Escenario 5: Operativa Diaria — Procesamiento

El flujo de procesamiento automático tras una apuesta:

1. **Registro**: Se ejecuta el RPC `process_pick3_transaction` con tipo `bet`.
2. **Descuento**: Se descuenta el monto apostado del capital actual en tiempo real.
3. **Verificación**: Si el número ya salió y coincide, se ejecuta otra transacción tipo `win` sumando el premio.
4. **Visualización**: El impacto se refleja inmediatamente en:
   - **Equity Curve**: Gráfico de evolución del capital a lo largo del tiempo.
   - **Ledger**: Historial de todas las transacciones (depósitos, apuestas, premios).
   - **KPIs del Dashboard**: Capital actual, ganancias/pérdidas del día, tasa de acierto.

---

## 7. Escenario 6: Análisis Estadístico

El módulo ofrece herramientas avanzadas de análisis estadístico:

1. **Frecuencia**: Distribución de aparición de cada combinación y dígito individual a lo largo del historial.
2. **Gaps**: Análisis de intervalos entre apariciones de cada combinación, identificando las que llevan más tiempo sin aparecer.
3. **Ley del Tercio**: Verificación del cumplimiento de la distribución estadística esperada (1/3 de las combinaciones aparece frecuentemente, 1/3 medianamente, 1/3 raramente).
4. **Backtesting**: Simulación de estrategias de apuesta sobre datos históricos para evaluar su rendimiento hipotético.
5. **Tendencias**: Identificación de patrones y tendencias en los resultados recientes.

---

## 8. Escenario 7: Gestión de Bankroll

La gestión de bankroll permite controlar el capital asignado al módulo:

1. **Depósito inicial**: Definido durante el onboarding, puede incrementarse con depósitos adicionales.
2. **Seguimiento de capital**: El dashboard muestra en tiempo real el capital actual, las ganancias acumuladas y las pérdidas.
3. **Límites**: Configuración de límites de apuesta por turno y por día para controlar el riesgo.
4. **Equity Curve**: Gráfico que traza la evolución del capital a lo largo del tiempo, mostrando la tendencia de ganancias o pérdidas.
5. **Métricas clave**: ROI (Retorno sobre Inversión), tasa de acierto, promedio de ganancia por apuesta ganadora, promedio de pérdida por apuesta perdedora.

---

## 9. Escenario 8: Auditoría e Historial

Todas las operaciones quedan registradas de forma permanente:

1. **Historial del Libro Mayor (Ledger)**: Registro completo de cada centavo apostado y ganado, con marca temporal, tipo de transacción y balance resultante.
2. **Auditoría de transacciones**: Verificación de la integridad de cada apuesta, resultado y premio.
3. **Exportación de datos**: Posibilidad de exportar el historial completo para análisis externo o archivo.
4. **Inmutabilidad**: Los registros del Ledger no pueden ser modificados ni eliminados, garantizando la trazabilidad completa.

---

## 10. Sub-módulos del Sistema

| Sub-módulo | Función |
|------------|----------|
| **Dashboard** | Centro de operaciones con KPIs, equity curve y acceso rápido a todas las funciones |
| **Predicciones** | Motor estadístico con las 10 mejores líneas sugeridas filtradas por Ley del Tercio |
| **Sincronización** | Descarga incremental de resultados oficiales desde la Verdad Absoluta |
| **Registro de Apuestas** | Formulario para documentar y procesar apuestas con verificación automática |
| **Análisis** | Frecuencia, gaps, Ley del Tercio, backtesting y tendencias |
| **Bankroll** | Gestión de capital con límites, equity curve y métricas de rendimiento |
| **Ledger** | Historial completo e inmutable de todas las transacciones financieras |
