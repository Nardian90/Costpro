# Auditoría de Documentación y Arquitectura de Información - CostPro v8.1
**Estado:** CRÍTICO | **Calidad Actual:** 4/10 | **Objetivo:** 9/10 (Enterprise Ready)

## 1. Análisis Crítico de la "Entropía de Información"

El proyecto sufre de un fenómeno de **"Documentación por Acumulación"**. En lugar de seguir una arquitectura de información deliberada, los archivos se han depositado en la raíz y en carpetas ad-hoc según la necesidad del momento. Esto crea un "ruido" que degrada tanto la productividad humana como la precisión de los agentes de IA.

### 1.1 El Root como "Vertedero" (Gravedad: Extrema)
La raíz contiene 36 archivos, de los cuales **el 60% son basura técnica o ruido**:
- **Artefactos de sesión:** `build_output.log`, `dev_output.log`, `server_output.log`, `current_changes_summary.txt`.
- **Capturas de estado (Lottery):** `flalottery_pick3.html`, `flalottery_pick3_full.html`, `pick3_new.html`, `winning_numbers_pick3.html`, `p3.pdf`.
- **Data sin clasificar:** `pick3_data.json`, `pick3_data_direct.json`, `PICK3_INTEGRITY_REPORT.json`, `PICK3_PDF_AUDIT.json`.
- **Scripts de utilidad única:** `fix_css.py`, `check_types.py`.

**Impacto:** Un desarrollador tarda más en encontrar `package.json` o `next.config.ts` porque debe filtrar visualmente decenas de archivos irrelevantes.

### 1.2 Fragmentación de la "Fuente de Verdad" (Gravedad: Alta)
La información sobre el sistema está dispersa en tres pilares que compiten entre sí:
1. **`docs/`**: Contiene lógica de negocio (`BUSINESS_LOGIC_REFERENCE.md`) mezclada con auditorías pasadas.
2. **`knowledge/`**: Intenta ser la base de la IA, pero está incompleta y desconectada de los reportes reales.
3. **`public/`**: Está contaminada con archivos de gobernanza (`review_queue.json`, `architecture_audit.json`). **Nunca** se deben exponer metadatos de arquitectura interna en la carpeta pública del servidor web.

### 1.3 Incumplimiento de Estándares (Gravedad: Media)
- **ISO/IEC 26514:** No existe un manual de usuario consolidado; solo fragmentos en `knowledge/iso_manual/` que nadie lee.
- **Diátaxis:** La carpeta `knowledge/docs/` existe pero está vacía de contenido real, mientras que la documentación útil está en la raíz de `docs/` sin categoría.

## 2. Auditoría por Directorio

| Directorio | Estado | Problema Principal |
| :--- | :--- | :--- |
| `/` (Root) | 🔴 Crítico | Saturación de archivos temporales y capturas. |
| `docs/` | 🟡 Pobre | Falta de jerarquía. Mezcla de manuales con reportes técnicos. |
| `knowledge/` | 🟡 Incompleto | Estructura correcta pero sin contenido migrado. |
| `public/` | 🟠 Riesgoso | Exposición de secretos de arquitectura (`review_queue.json`). |
| `scripts/` | 🟢 Bueno | Es la parte más organizada, pero sus rutas de salida son inconsistentes. |

## 3. Diagnóstico de Calidad (Métricas 1-10)

- **Organización Estructural (3/10):** No hay un lugar claro para cada cosa.
- **Claridad de Rutas (2/10):** Las rutas de los artefactos (`public/_meta`, `public/_archive`) son confusas para un humano.
- **Mantenibilidad (4/10):** Limpiar el proyecto hoy requiere un esfuerzo manual considerable.
- **Seguridad de Información (5/10):** Riesgo de filtrar estructura interna en el build de producción (`public/`).

## 4. Conclusión
El proyecto tiene un "cerebro" (scripts) potente pero una "memoria" (archivos) desastrosa. Para alcanzar el **9/10**, no basta con mover archivos; se requiere redefinir el contrato de rutas del Pipeline de IA para que trabaje **con** el humano, no **contra** la limpieza del proyecto.
