# Informe de Auditoría de Sincronización - Pick 3

## 1. Resumen Ejecutivo
Se ha detectado una ruptura en el pipeline de sincronización de resultados de Pick 3 a partir del **29 de marzo de 2026**. Mientras que el PDF de control de Florida Lottery contiene datos hasta el **07 de abril de 2026**, la base de datos operativa se detuvo en el lote previo al "Pick 3 / tercer corte".

## 2. Comparativa ANTES vs DESPUÉS del Corte

| Característica | ANTES (Pre-29/03) | DESPUÉS (Post-29/03) |
|---|---|---|
| **Última Fecha Sincronizada** | 28/03/2026 | 07/04/2026 (Tras intervención manual) |
| **Fuente Operativa** | Web Scraper (JSON/HTML) | PDF Pipeline (Python) |
| **Esquema de Datos** | Básico (Fecha, Hora, Resultado) | Enriquecido (Fireball, Raw Text, Sync Method) |
| **Estado del Pipeline** | Funcional (datos ligeros) | **ROTO** (dependencias faltantes) |

## 3. Hallazgos Críticos (Causa Raíz)
1. **Falta de Dependencias en Producción**: El proceso de sincronización "robusto" migró a un script de Python (`scripts/pick3_pdf_parser.py`) que requiere `pdfplumber` y `supabase`. Estas librerías **no estaban incluidas** en el `requirements.txt` del proyecto, lo que provocó fallos silenciosos en el entorno de Render/CI.
2. **Fragilidad de la Fuente Web**: El scraper de la Web oficial de Florida Lottery dejó de proveer datos útiles para el nuevo esquema, haciendo que el sistema dependiera exclusivamente del proceso PDF, el cual estaba roto.
3. **Manejo Silencioso de Errores**: El endpoint `/api/pick3/sync` devuelve un estado `success: true` incluso si la sincronización del PDF falla, siempre que no ocurra un error de ejecución total en el servidor.

## 4. Diagnóstico de Datos
* **¿Pérdida de Datos?**: NO. Los datos existen en la fuente (PDF).
* **¿Fallo de Base de Datos?**: NO. Las restricciones `UNIQUE` y de esquema funcionan correctamente.
* **¿Error de Lógica?**: SÍ. El pipeline asume un entorno Python configurado que no existe en el build process actual.

## 5. Acciones Realizadas (Remediación)
1. **Backfill Manual**: Se ejecutó exitosamente el parser localmente, recuperando **20,387 registros** y actualizando el historial hasta el **07/04/2026**.
2. **Actualización de Dependencias**: Se han añadido `pdfplumber` y `supabase` al archivo `requirements.txt`.

## 6. Recomendaciones de Próximos Pasos
* **Monitoreo de Pipeline**: Ajustar el endpoint `/api/pick3/sync` para que lance alertas si el conteo de registros nuevos del PDF es 0 durante más de 24 horas.
* **Resiliencia de Build**: Asegurar que el paso `postinstall.sh` verifique la instalación exitosa de las herramientas de parsing.
* **Detección de Gaps**: Implementar un check automático en el dashboard que compare `MAX(draw_date)` contra `CURRENT_DATE`.

---
**Auditoría finalizada el 08/04/2026.**
