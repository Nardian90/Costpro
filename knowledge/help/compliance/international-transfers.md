# Transferencias Internacionales de Datos Personales

**CostPro Enterprise — Documento de Cumplimiento**
**Versión:** 1.0  
**Fecha de vigencia:** 24 de enero de 2025  
**Clasificación:** Interno — Confidencial  
**Responsable:** Delegado de Protección de Datos (privacy@costpro.app)

---

## 1. Introducción

### 1.1 Propósito

El presente documento tiene como finalidad establecer el marco normativo, las garantías y los procedimientos que CostPro Enterprise (en adelante, "CostPro" o "el Responsable") aplica para las transferencias internacionales de datos personales. Este documento cumple con las obligaciones derivadas del **Reglamento General de Protección de Datos (UE) 2016/679 (RGPD)**, específicamente los **artículos 44 a 49**, así como con la **Ley Orgánica 3/2018 de Protección de Datos Personales y garantía de los derechos digitales (LOPDGDD)**.

### 1.2 Alcance

Este documento aplica a toda transferencia de datos personales que:
- Tenga su origen en un Estado miembro de la Unión Europea o del Espacio Económico Europeo (EEE).
- Sea realizada por CostPro Enterprise en calidad de **Responsable del Tratamiento** (controller).
- Tenga como destino un país tercero u organización internacional fuera del EEE.

### 1.3 Base Legal

| Artículo RGPD | Descripción |
|---|---|
| **Art. 44** | Principio general: las transferencias solo se realizarán si se cumplen las condiciones del capítulo V |
| **Art. 45** | Transferencias basadas en una decisión de adecuación |
| **Art. 46** | Transferencias sujetas a garantías adecuadas (SCCs, BCRs, cláusulas contractuales) |
| **Art. 47** | Reglas corporativas vinculantes (BCRs) |
| **Art. 48** | Transferencias no autorizadas por el derecho de la UE |
| **Art. 49** | Derogaciones para situaciones específicas (consentimiento explícito, contrato, etc.) |

---

## 2. Mapa de Transferencias

CostPro utiliza servicios de infraestructura en la nube hospedados en Estados Unidos. A continuación, se detalla el mapa completo de transferencias internacionales de datos personales:

| # | Responsable → Encargado | Destino | Finalidad | Categorías de datos transferidos |
|---|---|---|---|---|
| 1 | CostPro Team (Responsable) → Supabase Inc. | **Estados Unidos** | Hospedaje de base de datos PostgreSQL, autenticación de usuarios, almacenamiento de datos de la aplicación | Identificadores personales (nombre, email, ID de usuario), datos de transacciones (ventas, compras, inventario), registros técnicos (logs de aplicación, sesiones de usuario), datos de configuración de la cuenta |
| 2 | CostPro Team (Responsable) → Render.com | **Estados Unidos** | Hospedaje de la aplicación web Next.js, ejecución del servidor de producción, despliegue de la infraestructura | Registros técnicos (logs de servidor, métricas de rendimiento), identificadores de sesión, metadatos de solicitudes HTTP |
| 3 | CostPro Team (Responsable) → Upstash Inc. | **Estados Unidos** | Servicio de rate limiting distribuido (Redis), gestión de limitación de solicitudes API | Identificadores de sesión/IP (hash), contadores de tasa de solicitudes, metadatos temporales de tráfico |

### 2.1 Tipología de datos transferidos

| Categoría | Ejemplos | Base legal del tratamiento |
|---|---|---|
| **Identificadores personales** | Nombre completo, correo electrónico, ID de usuario, foto de perfil | Art. 6.1.b (ejecución contractual) |
| **Datos de transacciones** | Ventas, compras, ajustes de inventario, cierres de caja, transferencias entre tiendas | Art. 6.1.b (ejecución contractual) |
| **Registros técnicos** | Logs de aplicación, sesiones de usuario, métricas de rendimiento, errores | Art. 6.1.f (interés legítimo) |
| **Datos de configuración** | Preferencias de usuario, roles y permisos, configuración de tienda | Art. 6.1.b (ejecución contractual) |

---

## 3. Evaluación de Transferencias (Transfer Impact Assessment — TIA)

### 3.1 Marco legal del país destino — Estados Unidos

#### 3.1.1 Legislación aplicable

| Norma | Descripción | Impacto en los datos transferidos |
|---|---|---|
| **CLOUD Act** (Clarifying Lawful Overseas Use of Data Act, 2018) | Permite a las autoridades estadounidenses solicitar datos a proveedores de servicios cloud, independientemente de dónde se almacenen los datos. | Riesgo **medio**: las autoridades US podrían solicitar acceso a datos almacenados en Supabase/Render. Supabase y Render están obligados a notificar al cliente cuando sea legalmente posible. |
| **CCPA/CPRA** (California Consumer Privacy Act / California Privacy Rights Act) | Protege los datos de los residentes de California. Aplica a Supabase Inc. y Render.com como empresas con sede en California. | Riesgo **bajo**: la CCPA ofrece derechos complementarios a los del RGPD. No hay conflicto con las obligaciones de CostPro. |
| **EO 12333** (Executive Order — Foreign Intelligence Surveillance) | Autoriza la vigilancia de comunicaciones extranjeras por parte de agencias de inteligencia US. | Riesgo **medio**: posible interceptación de datos en tránsito. Mitigado por cifrado TLS 1.3. |
| **FISA Section 702** | Permite la recopilación de inteligencia de comunicaciones extranjeras. | Riesgo **medio**: renovationes periódicas del programa con supervisión del FISC (Foreign Intelligence Surveillance Court). |

#### 3.1.2 Evaluación del nivel de protección

El marco legal de Estados Unidos **no ofrece un nivel de protección equiparable** al del RGPD en los siguientes aspectos:
- No existe una autoridad de protección de datos independiente con poderes coercitivos equivalentes.
- Los derechos de los interesados no son tan amplios como los del RGPD.
- Existe un riesgo de acceso gubernamental a datos sin notificación al afectado.

**Sin embargo**, la **Decisión de Adecuación UE-EEUU (Data Privacy Framework — DPF)** del 10 de julio de 2023 establece que Estados Unidos proporciona un nivel de protección adecuado para las transferencias de datos personales a organizaciones auto-certificadas.

### 3.2 Decisión de Adecuación: EU-US Data Privacy Framework (DPF)

| Aspecto | Estado |
|---|---|
| **Decisión de adecuación** | Adoptada por la Comisión Europea el 10/07/2023 |
| **Base legal** | Reglamento (UE) 2023/1795 |
| **Órgano de supervisión US** | Data Protection Review Court (DPRC) |
| **Limitaciones a acceso gubernamental** | EO 14086 introduce proporcionalidad y necesidad |
| **Derechos de recurso** | Los ciudadanos de la UE pueden presentar reclamaciones ante el DPRC |
| **Supabase Inc. — Certificación DPF** | **Certificado** (verificado en: https://www.dataprivacyframework.gov/list) |
| **Render.com — Certificación DPF** | **Verificar estado en:** https://www.dataprivacyframework.gov/list |

> **Nota de cumplimiento:** La certificación DPF de Supabase Inc. y Render.com debe ser verificada periódicamente (mínimo anual). Si una organización pierde su certificación, se suspenderán las transferencias hasta que se establezcan garantías alternativas.

### 3.3 Análisis de Medidas Suplementarias

Conforme a las directrices del CTEPD (Comité Europeo de Protección de Datos) y la sentencia **Schrems II** (C-311/18), se han evaluado las siguientes medidas suplementarias para garantizar un nivel de protección esencialmente equivalente:

| Medida suplementaria | Aplicabilidad | Efectividad |
|---|---|---|
| **Cifrado de extremo a extremo (TLS 1.3)** | Tránsito de datos entre cliente y Supabase/Render | **Alta**: incluso con acceso gubernamental, los datos permanecen cifrados |
| **Cifrado en reposo (AES-256)** | Almacenamiento en Supabase PostgreSQL | **Alta**: las claves de cifrado son gestionadas por el proveedor (se recomienda BYOK en el futuro) |
| **Minimización de datos transferidos** | Solo se transfieren los datos estrictamente necesarios | **Media**: reducción de la superficie de exposición |
| **Seudonimización** | Identificadores de usuario son UUIDs, no datos personales directos | **Media**: los datos pueden ser re-identificados con la clave maestra |
| **Acceso RBAC estricto** | Control de acceso basado en roles | **Alta**: limita el acceso interno a los datos |
| **Auditoría y registros de acceso** | Logs de acceso a datos de Supabase | **Media**: permite detección de accesos indebidos |
| **Clausulas Contractuales Tipo (SCCs)** | Vinculan contractualmente a los procesadores | **Alta**: establece obligaciones legales directas |

**Conclusión TIA:** Con la combinación del DPF, las SCCs y las medidas técnicas suplementarias (cifrado, RBAC, auditoría), se considera que el nivel de protección de los datos transferidos es **esencialmente equivalente** al proporcionado por el RGPD.

---

## 4. Salvaguardas Implementadas

### 4.1 EU-US Data Privacy Framework (DPF)

CostPro opera bajo la decisión de adecuación del EU-US Data Privacy Framework. Los procesadores utilizados están certificados bajo este marco:

| Proveedor | Certificación DPF | Enlace de verificación | Última verificación |
|---|---|---|---|
| **Supabase Inc.** | Sí — Certificado | https://www.dataprivacyframework.gov/list | 2025-01-24 |
| **Render.com** | Pendiente de verificación | https://www.dataprivacyframework.gov/list | 2025-01-24 |
| **Upstash Inc.** | Pendiente de verificación | https://www.dataprivacyframework.gov/list | 2025-01-24 |

**Acciones requeridas:**
- [ ] Verificar certificación DPF de Render.com y Upstash (frecuencia: trimestral)
- [ ] Documentar cualquier cambio en el estado de certificación
- [ ] En caso de pérdida de certificación: suspender transferencias y activar SCCs como salvaguarda alternativa

### 4.2 Standard Contractual Clauses (SCCs)

Las **Clausulas Contractuales Tipo** adoptadas por la **Decisión de Ejecución (UE) 2021/914** de la Comisión Europea (de 4 de junio de 2021) se incorporan como cláusulas vinculantes en los contratos con los procesadores.

Se utiliza el **Módulo Dos: Responsable del Tratamiento → Encargado del Tratamiento (Controller to Processor)**, adecuado para la relación entre CostPro (controller) y Supabase/Render (processor).

#### Resumen de Artículos Clave — Módulo Dos (SCCs 2021/914)

**Cláusula 7 — Condiciones Esquema (Docking Clause):**
Permite a otros responsables del tratamiento adherirse a las cláusulas utilizando el mismo encargado. CostPro no permite adherencias sin evaluación previa de la DPO.

**Cláusula 9 — Uso de Sub-encargados:**
- El encargado (Supabase/Render) debe contar con autorización previa y específica de CostPro.
- La lista de sub-encargados está documentada y su inclusión requiere evaluación de impacto.
- El encargado debe garantizar a los sub-encargados las mismas obligaciones de protección de datos.

**Cláusula 11 — Derechos del Interesado:**
- El encargado debe notificar al responsable si recibe solicitudes de interesados y debe cooperar en la respuesta.
- El responsable asume la responsabilidad de responder a las solicitudes de ejercicio de derechos (Art. 15-22 RGPD).

**Cláusula 12 — Seguridad de los Datos (Redundancy with Art. 32 RGPD):**
- Implementación de medidas técnicas y organizativas apropiadas.
- Evaluación periódica de la efectividad de las medidas.
- Cifrado, seudonimización, control de acceso, planes de respuesta a incidentes.

**Cláusula 13 — Notificación de Violación de Datos (Redundancy with Art. 33-34 RGPD):**
- El encargado debe notificar al responsable sin dilación indebida y en cualquier caso en un plazo de **48 horas** tras conocer la violación.
- La notificación debe incluir información detallada sobre la naturaleza de la violación y los datos afectados.

**Cláusula 14 — Responsabilidad y Ejercicio de Derechos:**
- El responsable responde ante el interesado por cualquier incumplimiento de las cláusulas.
- El interesado puede ejercer derechos como tercero beneficiario contra el responsable y, en caso de que el responsable haya desaparecido, contra el encargado.

**Cláusula 15 — Medidas de Remediación y Compensación:**
- Cualquier daño derivado del incumplimiento de las cláusulas debe ser compensado al interesado.
- El responsable y el encargado son solidariamente responsables ante el interesado.

**Cláusula 17 — Leyes Aplicables:**
- Las cláusulas se rigen por la ley de un Estado miembro de la UE (España, LOPDGDD).
- Los tribunales de dicho Estado miembro tienen jurisdicción.

**Cláusula 18 — Opción 1 — Ejercicio de Derechos y Recursos:**
- El interesado puede presentar reclamaciones ante la autoridad de control competente en España (AEPD).
- El interesado puede ejercer derechos de recurso ante los tribunales españoles.

**Cláusula 19 — Suspensión de Transferencias:**
- Si una autoridad judicial o administrativa del país tercero exige transferencias que contravengan las cláusulas, el encargado debe:
  - Informar al responsable de la exigencia legal.
  - No transmitir los datos salvo si la notificación es legalmente válida y se respetan los principios de proporcionalidad.
  - Impugnar la exigencia si es legalmente posible.

### 4.3 Salvaguardas Técnicas

| Medida | Descripción | Aplicable a |
|---|---|---|
| **TLS 1.3** | Cifrado de extremo a extremo para todas las comunicaciones en tránsito | Todas las conexiones cliente-servidor y servidor-proveedor |
| **AES-256** | Cifrado de datos en reposo, gestión de claves por Supabase (Vault) | Base de datos PostgreSQL, almacenamiento de archivos |
| **CSP Headers** | Content-Security-Policy para prevenir inyección de contenido malicioso | Todas las respuestas HTTP de la aplicación CostPro |
| **RBAC (Role-Based Access Control)** | Control de acceso granular basado en roles (admin, manager, encargado, clerk, warehouse, usuario, costo) | Acceso a datos de la aplicación y API |
| **Row Level Security (RLS)** | Políticas de seguridad a nivel de fila en PostgreSQL (Supabase) | Todas las tablas con datos personales |
| **Rate Limiting** | Limitación de solicitudes API (30 req/min) para prevenir abuso | Todas las rutas API |
| **IP Whitelisting** | Restricción de acceso de administrador por IP cuando sea posible | Panel de administración, acceso a base de datos |
| **Audit Logging** | Registro completo de accesos y operaciones sobre datos personales | Todas las operaciones de lectura/escritura |
| **Backup Cifrado** | Copias de seguridad cifradas con retención definida | Base de datos completa |

---

## 5. Resultados de la Evaluación de Impacto de Transferencias (TIA)

### 5.1 Resumen de Niveles de Riesgo

| Transferencia | Proveedor | Nivel de Riesgo | Medidas Suplementarias | Estado |
|---|---|---|---|---|
| DB Hosting | Supabase Inc. (USA) | **Medio** | DPF + SCCs + TLS 1.3 + AES-256 + RLS + RBAC | ✅ Mitigado |
| App Hosting | Render.com (USA) | **Medio** | DPF (pendiente verificación) + SCCs + TLS 1.3 + CSP | ✅ Mitigado |
| Rate Limiting | Upstash Inc. (USA) | **Bajo** | DPF (pendiente verificación) + TLS 1.3 + datos seudonimizados | ✅ Mitigado |

### 5.2 Medidas Suplementarias Aplicadas por Transferencia

**Supabase Inc. (Base de Datos):**
- [x] Certificación DPF verificada
- [x] SCCs Módulo 2 incorporadas al contrato
- [x] Cifrado TLS 1.3 en tránsito
- [x] Cifrado AES-256 en reposo
- [x] Row Level Security (RLS) habilitado
- [x] Acceso RBAC con 7 niveles de rol
- [x] Audit logging activo
- [x] Minimización de datos (solo datos contractuales)
- [ ] Evaluación de BYOK (Bring Your Own Key) para futura implementación

**Render.com (Aplicación):**
- [x] SCCs Módulo 2 incorporadas al contrato
- [x] Cifrado TLS 1.3 en tránsito
- [x] CSP headers implementados
- [x] Rate limiting (30 req/min)
- [x] No se almacenan datos personales en Render (solo logs técnicos seudonimizados)
- [ ] Verificación de certificación DPF
- [ ] Evaluación de hosting dentro del EEE como alternativa

**Upstash Inc. (Rate Limiting):**
- [x] Cifrado TLS 1.3 en tránsito
- [x] Datos seudonimizados (hash de session ID)
- [x] Retención mínima (60 segundos para rate limiting)
- [x] Sin datos personales identificables almacenados
- [ ] Verificación de certificación DPF
- [ ] Evaluación de alternativa en memoria (sin transferencia)

### 5.3 Plan de Reevaluación

| Actividad | Frecuencia | Responsable |
|---|---|---|
| Verificación de certificación DPF de proveedores | Trimestral | DPO |
| Revisión del mapa de transferencias | Semestral | DPO + Equipo Técnico |
| Evaluación de impacto de transferencias (TIA completa) | Anual | DPO |
| Revisión de medidas suplementarias | Anual | DPO + Equipo de Seguridad |
| Prueba de cifrado y controles técnicos | Anual | Equipo de Seguridad |
| Revisión contractual de SCCs | Anual | DPO + Legal |
| Notificación a la AEPD (si aplica) | Cuando haya cambios significativos | DPO |

**Próxima reevaluación completa:** 24 de enero de 2026

---

## 6. Procedimiento para Nuevas Transferencias

### 6.1 Checklist Pre-Transferencia

Antes de iniciar cualquier nueva transferencia internacional de datos personales, se debe completar la siguiente checklist:

| # | Requisito | Responsable | Verificado |
|---|---|---|---|
| 1 | ¿Se ha identificado una base legal para la transferencia (Art. 44-49 RGPD)? | DPO | ☐ |
| 2 | ¿Existe una decisión de adecuación vigente para el país destino? | DPO | ☐ |
| 3 | Si no hay adecuación, ¿se han evaluado garantías adecuadas (SCCs, BCRs)? | DPO | ☐ |
| 4 | ¿Se ha realizado una Transfer Impact Assessment (TIA) para el país destino? | DPO | ☐ |
| 5 | ¿Se han identificado e implementado medidas suplementarias necesarias? | Equipo de Seguridad | ☐ |
| 6 | ¿Se ha documentado el mapa de transferencias actualizado? | DPO | ☐ |
| 7 | ¿Se ha notificado a la AEPD (si el Art. 37 lo requiere)? | DPO | ☐ |
| 8 | ¿Se ha informado a los interesados (si aplica)? | DPO | ☐ |
| 9 | ¿Se han firmado las SCCs con el importador de datos? | Legal | ☐ |
| 10 | ¿Se ha verificado la certificación DPF del proveedor (si aplica)? | DPO | ☐ |

### 6.2 Flujo de Aprobación

```
┌──────────────────────────────────────────────────────────┐
│  Solicitud de nueva transferencia                        │
│  (Solicitante: Equipo Técnico / Gerencia)               │
└──────────────┬───────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────┐
│  PASO 1: Evaluación DPO                                  │
│  - Verificar base legal (Art. 44-49)                    │
│  - Realizar TIA si es necesario                          │
│  - Identificar garantías adecuadas                       │
│  Tiempo máximo: 5 días hábiles                          │
└──────────────┬───────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────┐
│  PASO 2: Revisión de Seguridad                           │
│  - Evaluar medidas técnicas suplementarias               │
│  - Verificar cifrado y controles                         │
│  Tiempo máximo: 3 días hábiles                          │
└──────────────┬───────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────┐
│  PASO 3: Aprobación del Responsable                      │
│  (Gerente / Director de CostPro)                         │
│  - Revisión final del documento                          │
│  - Firma de SCCs si es necesario                         │
│  Tiempo máximo: 5 días hábiles                          │
└──────────────┬───────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────┐
│  PASO 4: Implementación y Registro                       │
│  - Actualizar mapa de transferencias                     │
│  - Incorporar al Registro de Actividades de Tratamiento  │
│  - Notificar a interesados si aplica                     │
│  - Archivar documentación                                │
└──────────────────────────────────────────────────────────┘
```

### 6.3 Criterios de Aprobación

Una nueva transferencia será aprobada **solo si**:
1. Existe una base legal válida conforme al RGPD.
2. El país destino proporciona un nivel de protección adecuado (decisión de adecuación) **o** se han establecido garantías adecuadas (SCCs/BCRs) con medidas suplementarias.
3. La TIA no identifica riesgos inaceptables que no puedan mitigarse.
4. Los derechos de los interesados pueden ejercerse efectivamente.
5. Se han implementado las medidas técnicas y organizativas necesarias.

---

## 7. Registro y Auditoría

### 7.1 Registro de Transferencias

Todas las transferencias internacionales deben estar registradas en el **Registro de Actividades de Tratamiento (Art. 30 RGPD)** con la siguiente información:

- Nombre y datos de contacto del responsable (CostPro Team).
- Nombre y datos de contacto del encargado (Supabase Inc., Render.com, etc.).
- Categorías de datos personales transferidos.
- Destino de la transferencia (país y destinatario).
- Finalidad de la transferencia.
- Base legal (decisión de adecuación, SCCs, etc.).
- Medidas de seguridad implementadas.
- Medidas suplementarias aplicadas.

### 7.2 Auditoría Anual

| Aspecto | Descripción | Frecuencia |
|---|---|---|
| **Verificación DPF** | Comprobar que todos los proveedores mantienen su certificación DPF vigente | Trimestral |
| **Revisión de SCCs** | Verificar que las cláusulas contractuales se mantienen vigentes y se cumplen | Anual |
| **Auditoría técnica** | Verificar que las medidas de cifrado y seguridad están operativas | Anual |
| **Revisión de mapa** | Actualizar el mapa de transferencias con nuevos proveedores o cambios | Semestral |
| **TIA completa** | Reevaluación completa de la evaluación de impacto | Anual |
| **Prueba de respuesta** | Simulación de ejercicio de derechos por parte de interesados en país tercero | Anual |

### 7.3 Notificación de Violaciones de Datos en Transferencias

En caso de que se produzca una violación de datos que afecte a datos transferidos internacionalmente:

1. **Detección:** Identificación inmediata por parte del encargado o del responsable.
2. **Notificación al responsable:** El encargado debe notificar a CostPro en un plazo de **48 horas** (Cláusula 13 SCCs).
3. **Notificación a la AEPD:** CostPro debe notificar a la Agencia Española de Protección de Datos en un plazo de **72 horas** (Art. 33 RGPD).
4. **Notificación a los interesados:** Si la violación implica un alto riesgo para los derechos y libertades de los interesados, se les notificará sin dilación indebida (Art. 34 RGPD).
5. **Cooperación transfronteriza:** Si la violación afecta a interesados de múltiples Estados miembros, se coordinará con las autoridades de control correspondientes.

### 7.4 Documentación Requerida

Los siguientes documentos deben estar disponibles para la supervisión de la AEPD:

| Documento | Ubicación | Responsable de mantenimiento |
|---|---|---|
| Mapa de transferencias | Este documento (Sección 2) | DPO |
| Transfer Impact Assessment (TIA) | Este documento (Secciones 3 y 5) | DPO |
| SCCs firmadas con proveedores | Archivo legal (contratos) | Legal / DPO |
| Certificados DPF de proveedores | Archivo de cumplimiento | DPO |
| Registro de actividades de tratamiento | Sistema de gestión de privacidad | DPO |
| Políticas de retención de datos | `knowledge/compliance/` y sistema automatizado | DPO / Equipo Técnico |
| Plan de respuesta a incidentes | `knowledge/compliance/incident-response-plan.md` | DPO / Equipo de Seguridad |

---

## Historial de Versiones

| Versión | Fecha | Descripción del cambio | Autor |
|---|---|---|---|
| 1.0 | 2025-01-24 | Versión inicial del documento de transferencias internacionales | DPO — CostPro Enterprise |

---

*Este documento será revisado y actualizado con una frecuencia mínima anual, o antes si se producen cambios significativos en la legislación, en los proveedores de servicios o en las transferencias realizadas.*
