# Diagrama de Flujo de Usuario: Módulo Pick 3 (v8.1)

## Escenario 1: Onboarding (Primer Inicio)
1. **Acceso**: El usuario entra al módulo Pick 3.
2. **Wizard Step 1**: Visualiza Disclaimer Ético y Advertencia de Riesgo. Debe "Aceptar" para continuar.
3. **Wizard Step 2**: Ingresa "Presupuesto Inicial" (Bankroll). El sistema valida que sea un monto numérico positivo.
4. **Wizard Step 3**: Confirmación. Al hacer clic en "Comenzar", se dispara una transacción `initial_deposit` en el Ledger de Supabase y se marca `onboarding_completed: true`.
5. **Redirección**: El usuario es llevado al Dashboard Principal.

## Escenario 2: Operativa Diaria
1. **Sincronización**: El usuario hace clic en "Sincronizar" para descargar los últimos resultados oficiales (Verdad Absoluta).
2. **Consulta**: Navega a la pestaña "Predicciones" para ver las 10 mejores líneas sugeridas por el motor estadístico (filtradas por Ley del Tercio).
3. **Registro de Apuesta**:
   - Clic en "Registrar Apuesta".
   - Ingresa combinación (3 dígitos), fecha, turno y monto.
   - El sistema verifica si ya existe un resultado oficial para esa fecha.
4. **Procesamiento**:
   - Se ejecuta el RPC `process_pick3_transaction` (Tipo: `bet`).
   - Se descuenta el monto del capital actual en tiempo real.
   - Si el número ya salió y es ganador, se ejecuta automáticamente otra transacción (Tipo: `win`) sumando el premio (Monto x 500).
5. **Visualización**: El usuario ve el impacto inmediato en su "Equity Curve" y en el historial del Ledger en el Dashboard.

## Escenario 3: Análisis y Auditoría
1. **Análisis**: El usuario revisa la pestaña "Análisis" para ver la distribución de Frecuencia, Gaps y cumplimiento de la Ley del Tercio.
2. **Histórico**: Revisa el "Historial de Libro Mayor" para auditar cada centavo apostado y ganado.
