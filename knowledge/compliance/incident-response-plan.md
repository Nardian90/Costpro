# Plan de Respuesta a Incidentes de Seguridad

**CostPro Enterprise**  
**Framework:** NIST SP 800-61 Rev. 2 — Computer Security Incident Handling Guide  
**Versión:** 1.0  
**Fecha de vigencia:** Enero 2025  
**Revisión:** Trimestral

---

## 1. Propósito y Alcance

### 1.1 Propósito

Este Plan de Respuesta a Incidentes establece los procedimientos, roles y responsabilidades para detectar, responder, contener, erradicar y recuperarse de incidentes de seguridad de la información que afecten a los sistemas, datos y servicios de CostPro Enterprise.

El objetivo principal es:

- **Proteger los datos personales** de usuarios, clientes y empleados frente a brechas de seguridad.
- **Minimizar el impacto operativo** y financiero derivado de incidentes de seguridad.
- **Garantizar el cumplimiento normativo**, incluyendo la notificación a la AEPD en el plazo de 72 horas establecido por el RGPD (Art. 33).
- **Preservar la evidencia** para acciones legales y auditorías posteriores.

### 1.2 Alcance

Este plan aplica a:

- Todos los sistemas de producción de CostPro Enterprise (aplicación web, API, bases de datos).
- Infraestructura alojada en **Render.com** (servicios web, workers, bases de datos).
- Datos almacenados en **Supabase** (autenticación, base de datos PostgreSQL, almacenamiento).
- Todo el personal con acceso a sistemas de CostPro, incluyendo empleados, contratistas y proveedores.
- Datos procesados tanto en entornos de producción como de staging.

### 1.3 Exclusiones

- Incidentes de seguridad física en las oficinas (cubiertos por planes separados).
- Ataques de denegación de servicio (DoS) a nivel de red gestionados por el proveedor de infraestructura.

---

## 2. Roles y Responsabilidades

### 2.1 Incident Commander — CTO

| Responsabilidad | Detalle |
|---|---|
| Coordinación general | Lidera la respuesta al incidente, toma decisiones estratégicas |
| Escalamiento | Decide cuándo escalar a autoridades, reguladores o terceros |
| Comunicación ejecutiva | Informa a la dirección y stakeholders clave |
| Aprobación de recursos | Autoriza gastos, personal adicional y herramientas de respuesta |
| Declaración de cierre | Aprueba el cierre formal del incidente |

### 2.2 Technical Lead — Lead Developer

| Responsabilidad | Detalle |
|---|---|
| Análisis técnico | Investiga la causa raíz, evalúa el alcance técnico del incidente |
| Contención | Ejecuta acciones de contención técnica (aislamiento, bloqueo, parches) |
| Erradicación | Elimina la amenaza, aplica parches de seguridad |
| Recuperación | Restaura servicios, verifica integridad de datos |
| Documentación técnica | Registra todas las acciones técnicas realizadas |

### 2.3 Communications — Equipo de Soporte

| Responsabilidad | Detalle |
|---|---|
| Notificación a usuarios | Prepara y envía comunicados a usuarios afectados |
| Comunicación interna | Coordina la información entre equipos |
| Relaciones públicas | Gestiona la comunicación externa si el incidente es público |
| Actualización de estado | Mantiene informados a los stakeholders sobre el progreso |

### 2.4 Delegado de Protección de Datos (DPO)

| Contacto | privacy@costpro.app |

| Responsabilidad | Detalle |
|---|---|
| Evaluación RGPD | Determina si el incidente constituye una violación de datos personales |
| Notificación AEPD | Prepara y envía la notificación a la Agencia Española de Protección de Datos |
| Comunicación a afectados | Determina si se requiere notificación individual (Art. 34) |
| Documentación | Asegura el registro documentado de todas las violaciones de datos |
| Asesoría legal | Coordina con asesores legales en caso de litigio |

### 2.5 Matriz de Escalamiento

```
P1 (CRITICAL) → Incident Commander inmediato + DPO + Legal
P2 (HIGH)     → Technical Lead + Incident Commander (informado)
P3 (MEDIUM)   → Technical Lead
P4 (LOW)      → Technical Lead (revisión programada)
```

---

## 3. Clasificación de Incidentes

### 3.1 Nivel P1 — CRITICAL

**Respuesta requerida:** Inmediata (dentro de 15 minutos)  
**Comunicación:** Incident Commander + DPO + Dirección

| Tipo | Ejemplos |
|---|---|
| Brecha de datos | Acceso no autorizado a datos personales de usuarios o clientes |
| Ransomware | Cifrado de datos o sistemas por software malicioso |
| Acceso no autorizado | Compromiso de cuentas administrativas o de base de datos |
| Exfiltración de datos | Copia o transferencia no autorizada de datos sensibles |
| Compromiso de credenciales | Filtración masiva de contraseñas o tokens de autenticación |

### 3.2 Nivel P2 — HIGH

**Respuesta requerida:** Dentro de 1 hora  
**Comunicación:** Technical Lead + Incident Commander

| Tipo | Ejemplos |
|---|---|
| DDoS | Ataque de denegación de servicio distribuido que afecta la disponibilidad |
| Bypass de autenticación | Vulnerabilidad que permite eludir mecanismos de autenticación |
| Escalada de privilegios | Usuario sin privilegios obtiene acceso administrativo |
| Vulnerabilidad explotada | CVE activo siendo explotado en sistemas de producción |
| Inyección de código | SQL injection, XSS o inyección de comandos exitosa |

### 3.3 Nivel P3 — MEDIUM

**Respuesta requerida:** Dentro de 4 horas  
**Comunicación:** Technical Lead

| Tipo | Ejemplos |
|---|---|
| Picos de login fallidos | Múltiples intentos de inicio de sesión fallidos desde una fuente |
| Actividad sospechosa | Comportamiento anómalo de usuarios o cuentas |
| Misconfiguración | Configuración de seguridad incorrecta que requiere corrección |
| Dependencia vulnerable | Dependencia con vulnerabilidad conocida (sin explotación activa) |

### 3.4 Nivel P4 — LOW

**Respuesta requerida:** Dentro de 24 horas  
**Comunicación:** Registro y revisión programada

| Tipo | Ejemplos |
|---|---|
| Intentos de escaneo | Escaneo de puertos o vulnerabilidades bloqueado por防火墙 |
| Alertas informativas | Detección de patrones que no constituyen una amenaza activa |
| Logs inusuales | Eventos de logging que requieren investigación menor |

---

## 4. Procedimiento de Respuesta (6 Fases)

### Fase 1: Preparación

**Objetivo:** Asegurar que el equipo está preparado para responder ante incidentes.

| Acción | Responsable | Frecuencia |
|---|---|---|
| Herramientas de monitoreo configuradas (OpenTelemetry, logs) | Technical Lead | Continuo |
| Capacitación del equipo en respuesta a incidentes | Incident Commander | Trimestral |
| Plantillas de comunicación pre-aprobadas | Communications + DPO | Trimestral |
| Lista de contactos de emergencia actualizada | Incident Commander | Mensual |
| Copias de seguridad verificadas y testeadas | Technical Lead | Semanal |
| Simulacros y ejercicios de mesa | Todo el equipo | Trimestral |
| Revisión y actualización de este plan | DPO + Incident Commander | Trimestral |

**Herramientas de preparación:**
- Monitoreo: OpenTelemetry, métricas de aplicación, alertas automáticas
- Logs: Centralizados con retención mínima de 90 días
- Comunicación: Canal dedicado de emergencia (Slack/Teams)
- Playbooks: Documentación de escenarios comunes de respuesta

### Fase 2: Detección y Análisis

**Objetivo:** Identificar y clasificar el incidente rápidamente.

**Fuentes de detección:**
- Alertas automatizadas del sistema de monitoreo
- Reportes de usuarios (soporte@costpro.app)
- Endpoint de registro de incidentes: `POST /api/legal/incidents`
- Análisis de logs y métricas
- Inteligencia de amenazas externa

**Proceso de triaje:**

```
1. Recibir alerta o reporte
2. Confirmar que es un incidente real (descartar falsos positivos)
3. Evaluar el alcance: ¿cuántos sistemas/usuarios están afectados?
4. Evaluar el impacto: ¿datos personales comprometidos? ¿servicios caídos?
5. Clasificar severidad (P1-P4) usando la matriz de la Sección 3
6. Asignar responsables según nivel de severidad
7. Iniciar el registro del incidente (ID: INC-YYYYMMDD-XXXX)
8. Notificar al Incident Commander si P1 o P2
```

### Fase 3: Contención

**Objetivo:** Limitar el daño y evitar la propagación del incidente.

**Contención a corto plazo (inmediata):**
- Aislar sistemas comprometidos (desconectar de red, desactivar servicios)
- Bloquear IPs o cuentas comprometidas
- Rotar credenciales afectadas
- Habilitar modo mantenimiento si es necesario
- Preservar evidencia (logs, memoria, disco) antes de modificar sistemas

**Contención a largo plazo (tras análisis):**
- Aplicar parches de seguridad
- Rotar todas las credenciales potencialmente comprometidas
- Implementar controles adicionales temporales
- Verificar que la amenaza no puede propagarse a otros sistemas

> **Nota importante:** No destruir evidencia durante la contención. Realizar copias forenses antes de aplicar cambios.

### Fase 4: Erradicación

**Objetivo:** Eliminar completamente la amenaza del entorno.

| Acción | Detalle |
|---|---|
| Eliminación de malware | Análisis y limpieza de sistemas comprometidos |
| Parcheo de vulnerabilidades | Aplicar actualizaciones de seguridad a todos los sistemas afectados |
| Cierre de vectores de ataque | Eliminar la vulnerabilidad que permitió el incidente |
| Rotación completa de credenciales | Todos los secrets, tokens y contraseñas potencialmente comprometidos |
| Verificación | Confirmar mediante análisis y pruebas que la amenaza ha sido eliminada |

### Fase 5: Recuperación

**Objetivo:** Restaurar los servicios a su estado operativo normal.

| Acción | Detalle |
|---|---|
| Restauración de sistemas | Reintegrar sistemas aislados de forma gradual y verificada |
| Restauración de datos | Restaurar desde copias de seguridad si los datos fueron alterados |
| Monitoreo intensivo | Vigilar sistemas recuperados con mayor frecuencia durante 72 horas |
| Verificación de integridad | Confirmar que los datos y servicios están en estado limpio y operativo |
| Retirada de controles temporales | Eliminar medidas de contención excepcionales una vez verificado el estado |

### Fase 6: Post-Incidente

**Objetivo:** Aprender del incidente y mejorar las defensas.

**Plazo:** Revisión post-incidente dentro de los **5 días hábiles** siguientes al cierre.

| Acción | Responsable |
|---|---|
| Reunión post-incidente (post-mortem) | Incident Commander |
| Documentación de lecciones aprendidas | Technical Lead |
| Actualización de procedimientos | Todo el equipo |
| Actualización de este plan si es necesario | DPO + Incident Commander |
| Implementación de mejoras detectadas | Technical Lead |
| Cierre formal del incidente en el registro | Incident Commander |

**Plantilla de post-mortem:**
```
- ID del incidente: INC-YYYYMMDD-XXXX
- Resumen ejecutivo: [2-3 líneas]
- Línea temporal detallada: [detección → contención → erradicación → recuperación]
- Causa raíz: [análisis]
- Impacto total: [usuarios afectados, datos, tiempo de inactividad]
- Qué funcionó bien: [procesos efectivos]
- Qué se puede mejorar: [áreas de mejora]
- Acciones correctivas: [con plazos y responsables]
```

---

## 5. Notificación a la AEPD (RGPD Art. 33)

### 5.1 Plazo

La notificación a la Agencia Española de Protección de Datos (AEPD) debe realizarse **en el plazo de 72 horas** desde el momento en que se tiene conocimiento de la violación de datos personales.

### 5.2 Cuándo notificar

Se debe notificar **siempre** que se produzca una violación de datos personales, a menos que se cumplan las condiciones del Art. 33.1:
- La violación es improbable que constituya un riesgo para los derechos y libertades de las personas.
- En caso de duda, se debe notificar.

### 5.3 Contenido de la notificación

La notificación a la AEPD debe incluir, como mínimo:

1. **Naturaleza de la violación:** Descripción del incidente (tipo, alcance, causas).
2. **Categorías y número aproximado de interesados afectados:** Tipos de datos personales y cuántas personas están afectadas.
3. **Categorías y número aproximado de registros:** Tipos de datos y volumen comprometido.
4. **Nombre y datos de contacto del DPO:** privacy@costpro.app
5. **Consecuencias probables:** Evaluación del riesgo para los derechos y libertades de los afectados.
6. **Medidas adoptadas o propuestas:** Acciones de contención, mitigación y prevención.

### 5.4 Plantilla de Notificación a la AEPD

```
ASUNTO: Notificación de violación de datos personales — CostPro Enterprise S.L.

Fecha de conocimiento: [DD/MM/AAAA, HH:MM]
Fecha de notificación: [DD/MM/AAAA, HH:MM]

1. DATOS DEL RESPONSABLE DEL TRATAMIENTO
   - Razón social: CostPro Enterprise S.L.
   - DPO: privacy@costpro.app
   - NIF: [NIF de la empresa]

2. NATURALEZA DE LA VIOLACIÓN
   - Tipo de incidente: [ej. Acceso no autorizado, exfiltración de datos, ransomware]
   - Fecha y hora del incidente: [DD/MM/AAAA, HH:MM]
   - Fecha y hora de detección: [DD/MM/AAAA, HH:MM]
   - Descripción detallada: [Descripción completa de lo sucedido]

3. CATEGORÍAS DE INTERESADOS AFECTADOS
   - [ ] Usuarios registrados
   - [ ] Clientes
   - [ ] Empleados
   - [ ] Otros: _______________
   - Número aproximado de afectados: [cantidad]

4. CATEGORÍAS DE DATOS AFECTADOS
   - [ ] Datos identificativos (nombre, email, dirección)
   - [ ] Datos financieros
   - [ ] Datos de navegación
   - [ ] Contraseñas / Credenciales
   - [ ] Otros: _______________
   - Número aproximado de registros: [cantidad]

5. CONSECUENCIAS PROBABLES
   - [ ] Riesgo de identidad falsa
   - [ ] Riesgo de fraude financiero
   - [ ] Pérdida de confidencialidad
   - [ ] Daño reputacional
   - [ ] Otros: _______________

6. MEDIDAS ADOPTADAS O PROPUESTAS
   - Contención: [descripción de medidas de contención]
   - Erradicación: [descripción de medidas de erradicación]
   - Notificación a afectados: [Sí/No, en qué plazo]
   - Medidas preventivas adicionales: [descripción]

7. DOCUMENTACIÓN ADJUNTA
   - Registro del incidente: INC-YYYYMMDD-XXXX
   - Evidencia técnica: [archivos adjuntos]

Atentamente,
[Nombre del DPO o representante legal]
Delegado de Protección de Datos — CostPro Enterprise S.L.
Contacto: privacy@costpro.app
```

### 5.5 Canal de notificación

- **Electrónica:** A través del portal electrónico de la AEPD (https://www.aepd.es)
- **Contacto AEPD:** C/ Jorge Juan, 6, 28001 Madrid. Tel: 901 100 099 / 91 766 01 01

---

## 6. Comunicación con Afectados (RGPD Art. 34)

### 6.1 Cuándo comunicar

Se debe comunicar directamente a los interesados **sin demora injustificada** cuando la violación sea probable que **implique un alto riesgo para los derechos y libertades** de las personas físicas.

**Criterios de alto riesgo:**
- Datos personales que podrían permitir la suplantación de identidad o el fraude.
- Datos financieros (tarjetas, cuentas bancarias).
- Contraseñas en texto plano o con hashing débil.
- Datos sensibles (salud, origen étnico, opiniones políticas).
- Datos que, combinados, permiten identificar a menores de edad.

### 6.2 Canales de comunicación

1. **Email directo:** Notificación individual al email registrado de cada afectado.
2. **Notificación in-app:** Banner o modal dentro de la aplicación CostPro.
3. **Página de estado:** Información general en una página pública de estado del servicio.

### 6.3 Plantilla de Notificación a Afectados

```
ASUNTO: [Importante] Notificación de incidente de seguridad en CostPro

Estimado/a [Nombre del usuario],

Le contactamos para informarle de un incidente de seguridad que ha afectado 
a los sistemas de CostPro Enterprise.

¿QUÉ HA SUCEDIDO?
El [DD/MM/AAAA] detectamos [descripción clara y concisa del incidente]. 
Inmediatamente activamos nuestro protocolo de respuesta a incidentes.

QUÉ DATOS PUEDEN HABERSE VISTO AFECTADOS
[Descripción de las categorías de datos potencialmente afectados]

QUÉ ESTAMOS HACIENDO
- Hemos contenido el incidente y asegurado los sistemas afectados.
- Hemos notificado a la Agencia Española de Protección de Datos (AEPD).
- [Otras medidas específicas adoptadas]

QUÉ PUEDE HACER USTED
Recomendamos las siguientes medidas precautorias:
1. [Ej: Cambie su contraseña en CostPro y en otros servicios si utiliza la misma]
2. [Ej: Revise sus cuentas bancarias en busca de movimientos inusuales]
3. [Ej: Active la autenticación de dos factores si no la tiene activada]

RECURSOS Y APOYO
Si tiene preguntas o necesita más información, puede contactarnos en:
- Email: privacidad@costpro.app
- Delegado de Protección de Datos: privacy@costpro.app

Lamentamos sinceramente las molestias que esto pueda ocasionar.
La seguridad de sus datos es nuestra máxima prioridad.

Atentamente,
El equipo de CostPro Enterprise
```

---

## 7. Registro de Incidentes

Todo incidente de seguridad, independientemente de su nivel de severidad, debe ser registrado documentalmente con la siguiente información:

### 7.1 Campos del Registro

| Campo | Descripción |
|---|---|
| **ID del incidente** | Formato: INC-YYYYMMDD-XXXX (ej. INC-20250124-0001) |
| **Fecha/hora de detección** | Momento en que se identificó el incidente |
| **Fecha/hora de ocurrencia** | Momento estimado en que ocurrió el incidente (si es diferente) |
| **Clasificación** | Severidad: P1 (Critical), P2 (High), P3 (Medium), P4 (Low) |
| **Tipo** | Categoría: breach, ddos, malware, unauthorized_access, misconfiguration, etc. |
| **Descripción** | Resumen detallado del incidente |
| **Reporter** | Persona que reportó el incidente (puede ser anónimo) |
| **Sistemas afectados** | Lista de sistemas, servicios o componentes comprometidos |
| **Datos afectados** | Tipos de datos personales comprometidos (si aplica) |
| **Número de afectados** | Cantidad estimada de personas afectadas |
| **Acciones tomadas** | Cronología de acciones de respuesta |
| **Estado** | open → containing → eradicated → recovering → closed |
| **Resolución** | Descripción de cómo se resolvió el incidente |
| **Lecciones aprendidas** | Hallazgos del post-mortem |
| **Fecha/hora de cierre** | Momento en que se cerró formalmente el incidente |
| **Timeline completa** | Registro cronológico de todos los eventos y acciones |

### 7.2 Almacenamiento

- Los registros se almacenan en `data/incidents.json` y se sincronizan con el sistema de documentación.
- Los registros de incidentes que impliquen violaciones de datos personales se conservan durante un mínimo de **5 años**, conforme al RGPD.
- El acceso a los registros está restringido al Incident Commander, Technical Lead y DPO.

### 7.3 Endpoint de Registro

Los incidentes pueden reportarse a través del endpoint:

```
POST /api/legal/incidents
Content-Type: application/json

{
  "title": "Descripción breve del incidente",
  "description": "Descripción detallada del incidente",
  "severity": "critical|high|medium|low",
  "reporter": "Nombre opcional (puede omitirse para reportes anónimos)"
}
```

---

## 8. Ejercicios y Tests

### 8.1 Ejercicios de Mesa (Tabletop Exercises)

**Frecuencia:** Trimestral  
**Participantes:** Incident Commander, Technical Lead, Communications, DPO

**Escenarios de ejemplo:**
- Simulación de breach de datos con filtración de credenciales de usuarios
- Simulación de ataque ransomware a servidores de producción
- Simulación de acceso no autorizado a la base de datos de Supabase
- Simulación de DDoS prolongado durante período de alta demanda

**Formato:**
1. Presentación del escenario (15 minutos)
2. Discusión de respuesta por roles (45 minutos)
3. Evaluación de brechas en procedimientos (15 minutos)
4. Documentación de mejoras identificadas (15 minutos)

### 8.2 Simulación Completa Anual

**Frecuencia:** Anual  
**Duración:** 4-8 horas  
**Participantes:** Todo el equipo técnico + DPO + Communications

**Incluye:**
- Simulación técnica real (en entorno de staging)
- Activación completa del protocolo de respuesta
- Ejercicio de comunicación con afectados simulados
- Ejercicio de notificación a la AEPD (simulada)
- Revisión completa de herramientas y procesos

### 8.3 Métricas de Evaluación

| Métrica | Objetivo |
|---|---|
| Tiempo de detección (MTTD) | < 30 minutos para P1, < 2 horas para P2 |
| Tiempo de respuesta (MTTR) | < 4 horas para P1, < 24 horas para P2 |
| Ejercicios completados | 4 ejercicios de mesa + 1 simulación anual |
| Actualizaciones del plan | Mínimo 1 revisión trimestral |
| Capacitación del personal | 100% del equipo técnico capacitado anualmente |

---

## Anexos

### A. Contactos de Emergencia

| Rol | Nombre | Contacto |
|---|---|---|
| Incident Commander (CTO) | [Nombre] | [Email/Teléfono] |
| Technical Lead | [Nombre] | [Email/Teléfono] |
| Communications | [Equipo Soporte] | soporte@costpro.app |
| DPO | — | privacy@costpro.app |
| Proveedor de infraestructura (Render.com) | — | Soporte Render |
| Proveedor de base de datos (Supabase) | — | Soporte Supabase |
| Asesoría legal | [Firma] | [Contacto] |

### B. Herramientas de Monitoreo

| Herramienta | Propósito |
|---|---|
| OpenTelemetry | Observabilidad distribuida, trazas, métricas |
| Logs de aplicación | Detección de anomalías, auditoría |
| Render.com Dashboard | Estado de servicios, despliegues |
| Supabase Dashboard | Estado de base de datos, autenticación |
| Endpoint `/api/legal/incidents` | Registro de incidentes reportados |

### C. Historial de Revisiones

| Versión | Fecha | Cambios | Autor |
|---|---|---|---|
| 1.0 | Enero 2025 | Versión inicial | DPO + CTO |
