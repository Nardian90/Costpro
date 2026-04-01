# Plan de Reorganización de Documentación - CostPro v9.0
**Calidad Objetivo:** 9/10 | **Estándar:** Enterprise Ready

## 1. Mapeo de Movimientos (De -> A)

### 1.1 Raíz (Limpieza Crítica)
| Archivo Original | Nueva Ubicación | Razón |
| :--- | :--- | :--- |
| `PICK3_AUDIT_REPORT.md` | `docs/audits/reports/pick3_audit.md` | Centralización |
| `MVT_EXPORT_EVALUATION.md` | `docs/audits/reports/mvt_export_evaluation.md` | Centralización |
| `AUDIT_CUSTOMER_VIEW.md` | `docs/audits/reports/customer_view_audit.md` | Centralización |
| `IPV_IMPROVEMENTS_CHECKLIST.md` | `docs/audits/reports/ipv_improvements.md` | Centralización |
| `p3.pdf` | `assets/historical/p3.pdf` | Limpieza de raíz |
| `flalottery_pick3.html` | `assets/historical/lottery_capture.html` | Limpieza de raíz |
| `flalottery_pick3_full.html` | `assets/historical/lottery_capture_full.html` | Limpieza de raíz |
| `pick3_new.html` | `assets/historical/pick3_new.html` | Limpieza de raíz |
| `winning_numbers_pick3.html` | `assets/historical/winning_numbers.html` | Limpieza de raíz |
| `pick3_data.json` | `assets/data/pick3_data.json` | Limpieza de raíz |
| `pick3_data_direct.json` | `assets/data/pick3_data_direct.json` | Limpieza de raíz |
| `PICK3_INTEGRITY_REPORT.json` | `docs/audits/health/pick3_integrity.json` | Salud del sistema |
| `PICK3_PDF_AUDIT.json` | `docs/audits/health/pick3_pdf_audit.json` | Salud del sistema |
| `build_output.log` | `logs/build_output.log` | Higiene de logs |
| `dev_output.log` | `logs/dev_output.log` | Higiene de logs |
| `server_output.log` | `logs/server_output.log` | Higiene de logs |
| `evaluation.md` | `docs/audits/archive/evaluation_march.md` | Histórico |
| `current_changes_summary.txt` | `logs/changes_summary.txt` | Histórico |

### 1.2 Auditoría y Salud (Centralización)
| Archivo | Nueva Ubicación | Razón |
| :--- | :--- | :--- |
| `public/architecture_audit.json` | `docs/audits/health/architecture_audit.json` | Privacidad Interna |
| `public/system_health.json` | `docs/audits/health/system_health.json` | Privacidad Interna |
| `public/INTEGRITY_REPORT.md` | `docs/audits/reports/integrity_report.md` | Centralización |
| `public/PIPELINE_IMPROVEMENTS.md` | `docs/audits/reports/pipeline_improvements.md` | Gobernanza |

### 1.3 Arquitectura y Conocimiento (Fuerza IA)
| Archivo | Nueva Ubicación | Razón |
| :--- | :--- | :--- |
| `public/system_architecture.json` | `knowledge/architecture/system_architecture.json` | Refugio Seguro |
| `public/architecture_graph.json` | `knowledge/architecture/architecture_graph.json` | Refugio Seguro |
| `public/architecture_manifest.json` | `knowledge/architecture/architecture_manifest.json` | Refugio Seguro |
| `public/architecture_metrics.json` | `knowledge/architecture/architecture_metrics.json` | Refugio Seguro |
| `public/architecture_changes.json` | `knowledge/architecture/architecture_changes.json` | Refugio Seguro |
| `public/_meta/` | `knowledge/architecture/_meta/` | Reubicación Jerárquica |
| `public/_archive/` | `knowledge/architecture/_archive/` | Reubicación Jerárquica |

### 1.4 Diátaxis (Clasificación)
| Archivo | Nueva Ubicación | Categoría |
| :--- | :--- | :--- |
| `docs/BUSINESS_LOGIC_REFERENCE.md` | `knowledge/docs/reference/business_logic.md` | Reference |
| `docs/mapa_vistas.md` | `knowledge/docs/reference/view_map.md` | Reference |
| `docs/pick3_audit_report.md` | `docs/audits/reports/pick3_audit_tech.md` | Audit |
| `docs/pick3_user_workflow.md` | `knowledge/docs/how-to/pick3_workflow.md` | How-to |
| `docs/wallet_integrity_evaluation.md` | `docs/audits/reports/wallet_integrity.md` | Audit |

---

## 2. Acciones del Pipeline
- El Pipeline v9.0 escribirá directamente en `knowledge/architecture/` y `docs/audits/health/`.
- El script `commit_artifact.py` se actualizará para usar estas nuevas rutas.

## 3. Resultado Esperado
Un repositorio de "Calidad 9/10" donde la raíz contiene solo el código fuente y la configuración, y toda la inteligencia está centralizada y clasificada para humanos e IA.
