# Evaluacion de Impacto de Proteccion de Datos (EIPD)

**Data Protection Impact Assessment (DPIA) — GDPR Article 35**

| **Campo** | **Valor** |
|---|---|
| **Documento ID** | DPIA-CP-001 |
| **Version** | 1.0 |
| **Fecha** | 1 de mayo de 2026 |
| **Clasificacion** | Interno — Confidencial |
| **Responsable del Tratamiento** | CostPro Team |
| **Delegado de Proteccion de Datos (DPO)** | privacidad@costpro.app |
| **Autoridad de Control Principal** | AEPD (Agencia Espanola de Proteccion de Datos) |

---

## 1. Informacion del Proyecto

### 1.1 Datos Generales

| **Aspecto** | **Descripcion** |
|---|---|
| **Nombre del proyecto** | CostPro Enterprise — Plataforma SaaS de Gestion Empresarial |
| **Responsable del Tratamiento (Controller)** | CostPro Team |
| **Encargados del Tratamiento (Processors)** | Supabase Inc. (base de datos), Render.com (hosting de aplicacion), proveedor de LLM (funciones de IA) |
| **DPO** | privacidad@costpro.app |
| **Fecha de realizacion** | 1 de mayo de 2026 |
| **Version** | 1.0 |
| **Estado** | Aprobado — Riesgo residual aceptable |

### 1.2 Descripcion del Sistema

CostPro Enterprise es una plataforma SaaS de gestion empresarial construida como una aplicacion web Next.js que proporciona las siguientes funcionalidades principales:

- **Gestion de inventario:** Control de stock, catalogo de productos, movimientos de inventario, sincronizacion multi-tienda
- **Punto de Venta (POS):** Procesamiento de transacciones, generacion de recibos, metodos de pago mixtos (efectivo/transferencia)
- **Hojas de costo y analisis financiero:** Formulas de costo, calculos de margen, planificacion financiera, optimizacion de precios
- **Cartera (wallet):** Gestion financiera, control de gastos, categorizacion bancaria
- **Funciones de IA:** Chatbot de asistencia, predicciones de costos, recomendaciones inteligentes (Darian)
- **Multi-tienda:** Operaciones sincronizadas entre multiples puntos de venta

### 1.3 Infraestructura Tecnica

| **Componente** | **Proveedor** | **Ubicacion** | **Tipo de dato alojado** |
|---|---|---|---|
| Base de datos PostgreSQL | Supabase Inc. | Estados Unidos | Datos personales, transacciones, configuracion |
| Autenticacion | Supabase Auth | Estados Unidos | Credenciales de usuario, sesiones |
| Hosting de aplicacion | Render.com | Estados Unidos | Logs tecnicos, metadatos HTTP |
| Rate limiting | Upstash Inc. | Estados Unidos | Hash de sesiones, contadores temporales |
| IA/LLM | Proveedor externo | Variable | Consultas de usuario, contexto de hojas de costo |

---

## 2. Descripcion del Tratamiento

### 2.1 Tipos de Tratamientos Realizados

#### 2.1.1 Gestion de Cuentas de Usuario

| **Aspecto** | **Detalle** |
|---|---|
| **Finalidad** | Acceso a la plataforma, identificacion, autorizacion y asignacion multi-tienda |
| **Base legal** | Ejecucion contractual — Art. 6.1.b RGPD |
| **Datos tratados** | Nombre completo, correo electronico, rol (admin, manager, encargado, clerk, warehouse, usuario, costo), asignacion de tienda, preferencias de perfil |
| **Categorias de interesados** | Usuarios comerciales (empleados de negocios cliente) |
| **Destinatarios** | Supabase (auth y BD), Render.com (hosting) |
| **Retencion** | Duracion del contrato + 2 anos |

#### 2.1.2 Transacciones de Venta y POS

| **Aspecto** | **Detalle** |
|---|---|
| **Finalidad** | Procesamiento de transacciones, gestion de ordenes, cumplimiento fiscal, generacion de recibos |
| **Base legal** | Ejecucion contractual (Art. 6.1.b) + Obligacion legal (Art. 6.1.c) RGPD |
| **Datos tratados** | Detalles de producto, cantidad, precio unitario, descuento, monto total, metodo de pago, identificador de cliente, marca temporal, numero de recibo |
| **Categorias de interesados** | Clientes, sujetos de datos de transaccion |
| **Destinatarios** | Supabase (BD), Render.com (hosting) |
| **Retencion** | 6 anos (obligacion fiscal/legal) |

#### 2.1.3 Datos Tecnicos y Seguridad

| **Aspecto** | **Detalle** |
|---|---|
| **Finalidad** | Monitoreo de seguridad, investigacion de incidentes, deteccion de anomalias, auditoria, analisis de rendimiento |
| **Base legal** | Interes legitimo — Art. 6.1.f RGPD (seguridad de la red y la informacion, Art. 32) |
| **Datos tratados** | Direcciones IP, cadenas User-Agent del navegador, logs de acceso API, marcas temporales, logs de error, eventos de autenticacion, metadatos de sesion |
| **Categorias de interesados** | Identificadores tecnicos (todos los usuarios de la plataforma) |
| **Destinatarios** | Render.com (logs de hosting), Supabase (logs de auth) |
| **Retencion** | 12 meses |

#### 2.1.4 Procesamiento de IA/ML

| **Aspecto** | **Detalle** |
|---|---|
| **Finalidad** | Funciones asistidas por IA: chatbot de asistencia para hojas de costo, predicciones de costos, recomendaciones inteligentes |
| **Base legal** | Consentimiento (Art. 6.1.a) + Interes legitimo (Art. 6.1.f) RGPD |
| **Datos tratados** | Consultas de usuario (prompts de texto), datos de contexto de hojas de costo enviados al modelo, contenido/respuestas generadas, parametros de prediccion |
| **Categorias de interesados** | Usuarios que interactuan con funciones de IA |
| **Destinatarios** | Proveedor de LLM (inferencia de IA), Supabase (historial), Render.com (hosting) |
| **Retencion** | 12 meses |

### 2.2 Criterios que Obligan a Realizar una EIPD (Art. 35.1 y 35.3 RGPD)

De acuerdo con las Directrices WP29 (wp248rev.01), se ha evaluado si el tratamiento requiere una EIPD. El tratamiento cumple **al menos tres** de los criterios establecidos:

| # | Criterio WP29 | Aplica? | Justificacion |
|---|---|:---:|---|
| 1 | **Evaluacion o puntuacion** (incluyendo perfilado y predicción) | **Si** | Las predicciones de costos de IA constituyen una forma automatizada de evaluacion de datos financieros para generar recomendaciones |
| 2 | **Decision automatizada con efectos juridicos o significativos** | **Si** | Las predicciones de costos de la IA pueden influir en decisiones de precios que afectan significativamente la actividad comercial del interesado |
| 3 | **Monitorizacion sistematica** | **Si** | Se realiza seguimiento sistematico de la actividad del usuario (logs tecnicos, sesiones, patrones de uso) a traves de OpenTelemetry y structured logging |
| 4 | **Datos a gran escala** | **Si** | Plataforma SaaS con potencial de mas de 10.000 interesados (usuarios de multiples negocios cliente) |
| 5 | **Datos sensibles o categorias especiales** | **No** | CostPro no trata categorias especiales de datos (Art. 9 RGPD): origen etnico, opiniones politicas, salud, datos biometricos, orientacion sexual, etc. |
| 6 | **Datos combinados** | **Si** | Se combinan datos personales (nombres, emails) con datos de transacciones (ventas, inventario) y datos financieros (costos, margenes) |
| 7 | **Sujetos vulnerables** | **No** | Los usuarios son profesionales de negocios (empleados/empresarios), no se identifican sujetos especialmente vulnerables |
| 8 | **Uso innovador o tecnologico** | **Si** | Aplicacion de LLM (chatbot Darian) para asistencia en hojas de costo, procesamiento de lenguaje natural en contexto financiero |
| 9 | **Transferencias fuera del EEE** | **Si** | Datos transferidos a Estados Unidos (Supabase, Render.com, proveedor de LLM) |
| 10 | **Bloqueo del ejercicio de derechos** | **No** | Los interesados pueden ejercer sus derechos en cualquier momento (acceso, rectificacion, supresion, portabilidad, oposicion) |

**Resultado:** Se confirman **7 de 10 criterios** como aplicables. La realizacion de esta EIPD es **obligatoria** conforme al Art. 35.1 y 35.3 RGPD.

### 2.3 Transferencias Internacionales de Datos

Todas las transferencias internacionales estan documentadas en `knowledge/compliance/international-transfers.md`. Resumen:

| **Destino** | **Proveedor** | **Mecanismo** | **Estado** |
|---|---|---|---|
| Estados Unidos | Supabase Inc. | DPF (certificado) + SCCs (Modulo 2) + Medidas suplementarias | Mitigado |
| Estados Unidos | Render.com | DPF (pendiente verificacion) + SCCs (Modulo 2) + Medidas suplementarias | Mitigado |
| Estados Unidos | Upstash Inc. | DPF (pendiente verificacion) + TLS 1.3 + Datos seudonimizados | Mitigado |
| Variable | Proveedor de LLM | SCCs + Consentimiento del usuario + Minimizacion de datos | Mitigado |

---

## 3. Necesidad y Proporcionalidad (Art. 35.7.a)

### 3.1 Evaluacion del Interes Legitimo (Art. 6.1.f y Considerando 47 RGPD)

Conforme a la prueba de tres partes del Considerando 47 del RGPD:

#### 3.1.1 Parte 1: Identificacion del Interes Legitimo

| Interes Legitimo | Descripcion |
|---|---|
| **Operacion comercial** | Proporcionar una plataforma de gestion empresarial funcional que permita a los negocios cliente gestionar inventario, ventas y costos |
| **Seguridad de la informacion** | Mantener la integridad y disponibilidad de la plataforma y los datos de los usuarios mediante monitoreo tecnico |
| **Mejora del servicio** | Utilizar IA para ofrecer recomendaciones de costos y asistencia que mejoren la eficiencia operativa de los usuarios |
| **Cumplimiento normativo** | Mantener registros de transacciones conforme a las obligaciones fiscales y legales aplicables |

#### 3.1.2 Parte 2: Prueba de Necesidad

| Tratamiento | Es necesario? | Justificacion |
|---|:---:|---|
| Gestion de cuentas de usuario | **Si** | Es esencial para la ejecucion del contrato de prestacion de servicios SaaS. Sin identificacion y autorizacion, no es posible proporcionar el servicio |
| Procesamiento de transacciones POS | **Si** | Constituye el nucleo del servicio contratado. Los datos de transaccion son necesarios para la funcionalidad de punto de venta y el cumplimiento fiscal |
| Datos tecnicos (logs) | **Si** | Necesarios para la seguridad de la plataforma (Art. 32 RGPD). No existe una alternativa menos intrusiva que proporcione el mismo nivel de proteccion |
| Cookies de preferencias | **Parcial** | Las cookies estrictamente necesarias son imprescindibles. Las cookies de preferencias y analiticas requieren consentimiento explicito (ya implementado) |
| Funciones de IA/ML | **Parcial** | Las funciones de IA son opcionales para el usuario y requieren consentimiento explicito. No son necesarias para la prestacion del servicio base |
| Datos financieros (hojas de costo) | **Si** | Constituyen la funcionalidad principal del servicio contratado. El usuario proporciona estos datos voluntariamente para el analisis de costos |

**Conclusion de necesidad:** Todos los tratamientos principales son **necesarios** para la prestacion del servicio. Los tratamientos opcionales (IA, cookies no esenciales) cuentan con mecanismos de consentimiento.

#### 3.1.3 Parte 3: Prueba de Equilibrio (Balancing Test)

Se evalua si los intereses del responsable prevalecen sobre los derechos y libertades de los interesados:

| Factor | A favor del responsable | A favor del interesado | Resultado |
|---|---|---|---|
| **Expectativa del interesado** | Los usuarios empresariales esperan que sus datos sean procesados para la prestacion del servicio SaaS | Los usuarios esperan un nivel adecuado de proteccion de sus datos personales | **Equilibrado** — Las expectativas son razonables y proporcionadas |
| **Relacion contractual** | Existe un contrato directo que define el ambito del tratamiento | El interesado puede negociar terminos y ejercer derechos | **A favor del responsable** — Relacion contractual clara y consentimiento explicito |
| **Naturaleza de los datos** | Los datos son proporcionados voluntariamente por el usuario para el servicio | Los datos personales (nombre, email) merecen proteccion | **Equilibrado** — Datos proporcionados en contexto contractual |
| **Impacto potencial** | El procesamiento es necesario para la funcionalidad del servicio | Riesgo limitado: los datos se usan dentro del contexto del servicio contratado | **A favor del responsable** — Impacto limitado y contextualizado |
| **Medidas de seguridad** | Cifrado, RBAC, RLS, audit logs | El interesado se beneficia de estas medidas de proteccion | **A favor del responsable** — Las medidas benefician a ambas partes |
| **Derechos del interesado** | Se respetan todos los derechos ARSULIPO (acceso, rectificacion, supresion, limitacion, portabilidad, oposicion) | El interesado puede ejercer derechos en cualquier momento | **A favor del interesado** — Derechos plenamente garantizados |
| **Transparencia** | Politica de privacidad clara, consentimiento informado para funciones opcionales | El interesado comprende como se usan sus datos | **Equilibrado** — Transparencia adecuada |
| **Transferencias internacionales** | Infraestructura en EE.UU. con DPF y SCCs | El interesado podria esperar datos en la UE | **A favor del interesado** — Se mitiga con salvaguardas adecuadas |

**Resultado del equilibrio:** Los intereses del responsable **prevalecen** sobre los derechos de los interesados en todos los tratamientos principales, dado que:
1. Existe una relacion contractual directa y explicita
2. Los datos se procesan dentro del ambito del servicio contratado
3. Las medidas de seguridad son robustas y benefician al interesado
4. Los derechos ARSULIPO se garantizan plenamente
5. El tratamiento es proporcionado al servicio prestado

### 3.2 Conclusion de Proporcionalidad

| Criterio | Evaluacion | Resultado |
|---|---|---|
| **Finalidad legitima** | Definida, explicita y licita | Cumple |
| **Adecuacion** | El tratamiento es adecuado para lograr la finalidad | Cumple |
| **Necesidad** | No existe una alternativa menos intrusiva con igual eficacia | Cumple |
| **Proporcionalidad en sentido estricto** | Los beneficios superan los riesgos para los derechos de los interesados | Cumple |

**Resultado final:** El tratamiento de datos personales por CostPro Enterprise es **necesario y proporcional** conforme a los requisitos del Art. 35.7.a RGPD.

---

## 4. Evaluacion de Riesgos para Derechos y Libertades (Art. 35.7.d)

### 4.1 Metodologia de Evaluacion de Riesgos

Conforme a las Directrices WP29 sobre la EIPD (wp248rev.01), se utiliza la siguiente metodologia:

- **Probabilidad:** Baja / Media / Alta
- **Severidad:** Baja (limitada) / Media (significativa) / Alta (maxima)
- **Nivel de riesgo:** Calculado como la combinacion de probabilidad y severidad

**Matriz de riesgos:**

| | Severidad Baja | Severidad Media | Severidad Alta |
|---|:---:|:---:|:---:|
| **Probabilidad Alta** | MEDIUM | HIGH | **HIGH** |
| **Probabilidad Media** | LOW | MEDIUM | HIGH |
| **Probabilidad Baja** | LOW | LOW | MEDIUM |

### 4.2 Identificacion y Evaluacion de Riesgos

#### Riesgo 1: Acceso no autorizado a datos personales

| **Aspecto** | **Evaluacion** |
|---|---|
| **Descripcion** | Un atacante externo o interno obtiene acceso no autorizado a datos personales (nombres, emails, datos de transacciones) almacenados en Supabase o en transito |
| **Derechos y libertades afectados** | Derecho a la privacidad (Art. 7), derecho a la proteccion de datos (Art. 8 CDFUE), derecho a la confidencialidad de las comunicaciones |
| **Probabilidad** | Media — La plataforma esta expuesta a internet; las amenazas de acceso no autorizado son persistentes |
| **Severidad** | Alta — El acceso a datos personales y financieros de multiples negocios podria causar danos significativos (suplantacion, fraude, dano reputacional) |
| **Nivel de riesgo** | **ALTO** |
| **Medidas de mitigacion existentes** | RBAC con 7 niveles de rol, autenticacion JWT con tokens encriptados y rotacion de refresh, Row Level Security (RLS) en PostgreSQL, CSP headers, rate limiting (30 req/min), CORS restrictions |
| **Riesgo residual** | **MEDIO** — La combinacion de RBAC, JWT y RLS reduce significativamente la superficie de ataque. El riesgo residual se debe a la exposicion inherent a internet |

#### Riesgo 2: Violacion de datos durante la transferencia a EE.UU.

| **Aspecto** | **Evaluacion** |
|---|---|
| **Descripcion** | Interceptacion o acceso indebido a datos personales durante su transferencia desde la aplicacion a los servidores de Supabase o Render.com en EE.UU. |
| **Derechos y libertades afectados** | Derecho a la proteccion de datos (Art. 8 CDFUE), derecho a la privacidad (Art. 7 CDFUE) |
| **Probabilidad** | Baja — El cifrado TLS 1.3 es robusto y la interceptacion activa de trafico cifrado es compleja |
| **Severidad** | Alta — Una brecha en la transferencia podria exponer datos en bruto |
| **Nivel de riesgo** | **MEDIO** |
| **Medidas de mitigacion existentes** | Cifrado TLS 1.3 en todas las comunicaciones, EU-US Data Privacy Framework (DPF) para Supabase (certificado), Standard Contractual Clauses (SCCs) Modulo 2 para todos los procesadores, Transfer Impact Assessment (TIA) completado, medidas suplementarias (cifrado, minimizacion, seudonimizacion) |
| **Riesgo residual** | **BAJO** — El DPF y las SCCs proporcionan un marco legal robusto; el TLS 1.3 mitiga el riesgo tecnico |

#### Riesgo 3: Perdida de integridad de los datos

| **Aspecto** | **Evaluacion** |
|---|---|
| **Descripcion** | Modificacion no autorizada, corrupcion o perdida de datos personales y de transacciones almacenados en la base de datos |
| **Derechos y libertades afectados** | Derecho a la exactitud de los datos (Art. 16 RGPD), derecho a la proteccion de datos (Art. 8 CDFUE) |
| **Probabilidad** | Baja — Los controles de integridad de la base de datos y los backups reducen este riesgo |
| **Severidad** | Alta — La corrupcion de datos financieros o de transacciones podria tener consecuencias economicas significativas |
| **Nivel de riesgo** | **MEDIO** |
| **Medidas de mitigacion existentes** | Cifrado AES-256 en reposo (gestionado por Supabase Vault), backups automatizados diarios con retencion de 30 dias, validaciones de integridad de datos en la capa de aplicacion (validations.ts), RLS que previene escrituras no autorizadas |
| **Riesgo residual** | **BAJO** — Los backups y el cifrado proporcionan redundancia y proteccion contra corrupcion |

#### Riesgo 4: Retencion excesiva de datos

| **Aspecto** | **Evaluacion** |
|---|---|
| **Descripcion** | Almacenamiento de datos personales mas alla del periodo necesario para la finalidad del tratamiento |
| **Derechos y libertades afectados** | Derecho a la supresion (Art. 17 RGPD), derecho a la proteccion de datos (Art. 8 CDFUE) |
| **Probabilidad** | Media — Sin mecanismos automaticos de eliminacion, los datos podrian acumularse indefinidamente |
| **Severidad** | Media — La retencion excesiva aumenta la superficie de ataque y el impacto potencial de una brecha |
| **Nivel de riesgo** | **MEDIO** |
| **Medidas de mitigacion existentes** | Politicas de retencion definidas por tipo de dato (12 meses a 6 anos), mecanismos de auto-eliminacion implementados donde sea posible, procedimiento de supresion tras terminacion de contrato (anonimizacion o eliminacion en 30 dias) |
| **Riesgo residual** | **BAJO** — Las politicas de retencion estan definidas y documentadas; se recomienda fortalecer la automatizacion |

#### Riesgo 5: Sesgo en las predicciones de costos de la IA

| **Aspecto** | **Evaluacion** |
|---|---|
| **Descripcion** | Las predicciones de costos generadas por el modelo de IA podrian contener sesgos que afecten negativamente las decisiones comerciales del usuario |
| **Derechos y libertades afectados** | Derecho a no ser sujeto a decisiones basadas unicamente en el tratamiento automatizado (Art. 22 RGPD) |
| **Probabilidad** | Baja — Las predicciones son asistenciales y el usuario conserva la autoridad de decision final |
| **Severidad** | Media — Decisiones comerciales erroneas podrian causar perdidas economicas |
| **Nivel de riesgo** | **BAJO** |
| **Medidas de mitigacion existentes** | Revision manual disponible para todas las predicciones, transparencia en la generacion de contenido por IA (etiquetado claro), el usuario conserva la autoridad de decision final, no se toman decisiones completamente automatizadas con efectos juridicos |
| **Riesgo residual** | **BAJO** — El caracter asistencial y la revision manual eliminan el riesgo de decisiones automaticas perjudiciales |

#### Riesgo 6: Seguimiento por cookies sin consentimiento

| **Aspecto** | **Evaluacion** |
|---|---|
| **Descripcion** | Deposito o lectura de cookies no esenciales sin el consentimiento previo e informado del usuario |
| **Derechos y libertades afectados** | Derecho a la privacidad (Art. 7 CDFUE), derecho a la proteccion de datos (Art. 8 CDFUE), Directiva ePrivacy |
| **Probabilidad** | Media — Requiere implementacion tecnica correcta del banner de consentimiento y gestion de categorias |
| **Severidad** | Media — El seguimiento no autorizado podria resultar en sanciones regulatorias y dano reputacional |
| **Nivel de riesgo** | **MEDIO** |
| **Medidas de mitigacion existentes** | Banner de consentimiento de cookies implementado, categorizacion de cookies (estrictamente necesarias, preferencias, analiticas), consentimiento granular por categoria, atributos Secure, HttpOnly y SameSite en cookies |
| **Riesgo residual** | **BAJO** — El banner de consentimiento y la categorizacion adecuada mitigan el riesgo |

#### Riesgo 7: Amenaza interna (insider threat)

| **Aspecto** | **Evaluacion** |
|---|---|
| **Descripcion** | Un empleado o persona con acceso autorizado utiliza indebidamente los datos personales a los que tiene acceso |
| **Derechos y libertades afectados** | Derecho a la privacidad (Art. 7 CDFUE), derecho a la proteccion de datos (Art. 8 CDFUE) |
| **Probabilidad** | Baja — El acceso esta restringido por RBAC y los empleados estan sujetos a obligaciones contractuales de confidencialidad |
| **Severidad** | Alta — Un empleado malintencionado con acceso privilegiado podria causar danos significativos |
| **Nivel de riesgo** | **MEDIO** |
| **Medidas de mitigacion existentes** | RBAC estricto con 7 niveles de rol (segregacion de funciones), audit logs de todas las operaciones sobre datos personales, Row Level Security (RLS) que limita el acceso por tienda y usuario, variables de entorno para secretos (nunca en codigo fuente) |
| **Riesgo residual** | **BAJO** — La segregacion de funciones y los audit logs proporcionan deteccion y disuasion |

#### Riesgo 8: Indisponibilidad del servicio

| **Aspecto** | **Evaluacion** |
|---|---|
| **Descripcion** | Caida prolongada de la plataforma que impida el acceso a los datos o el ejercicio de derechos |
| **Derechos y libertades afectados** | Derecho de acceso (Art. 15 RGPD), derechos de los interesados en general |
| **Probabilidad** | Baja — Render.com ofrece alta disponibilidad con redundancia |
| **Severidad** | Media — Una caida prolongada podria impedir temporalmente el ejercicio de derechos |
| **Nivel de riesgo** | **BAJO** |
| **Medidas de mitigacion existentes** | SLA del 99.9% de disponibilidad con Render.com, backups automatizados diarios, monitoreo con health checks, procedimiento de respuesta a incidentes documentado (`knowledge/compliance/incident-response-plan.md`) |
| **Riesgo residual** | **BAJO** — La alta disponibilidad y los backups garantizan continuidad operativa |

### 4.3 Matriz Consolidada de Riesgos

| # | Riesgo | Probabilidad | Severidad | Nivel de Riesgo | Medidas de Mitigacion Existentes | Riesgo Residual |
|---|---|:---:|:---:|:---:|---|:---:|
| 1 | Acceso no autorizado a datos personales | Media | Alta | **ALTO** | RBAC, JWT auth, RLS, CSP, rate limiting | **MEDIO** |
| 2 | Violacion de datos durante transferencia a EE.UU. | Baja | Alta | **MEDIO** | TLS 1.3, DPF, SCCs, TIA, medidas suplementarias | **BAJO** |
| 3 | Perdida de integridad de los datos | Baja | Alta | **MEDIO** | AES-256 en reposo, backups diarios, validaciones | **BAJO** |
| 4 | Retencion excesiva de datos | Media | Media | **MEDIO** | Politicas de retencion, auto-eliminacion | **BAJO** |
| 5 | Sesgo en predicciones de costos de IA | Baja | Media | **BAJO** | Revision manual, transparencia, autoridad del usuario | **BAJO** |
| 6 | Seguimiento por cookies sin consentimiento | Media | Media | **MEDIO** | Banner de consentimiento, categorizacion, atributos seguros | **BAJO** |
| 7 | Amenaza interna (insider threat) | Baja | Alta | **MEDIO** | RBAC, audit logs, RLS, segregacion de funciones | **BAJO** |
| 8 | Indisponibilidad del servicio | Baja | Media | **BAJO** | SLA 99.9%, redundancia, backups, health checks | **BAJO** |

### 4.4 Resumen del Nivel de Riesgo

| **Metrica** | **Valor** |
|---|---|
| Riesgos identificados | 8 |
| Riesgos altos (pre-mitigacion) | 1 |
| Riesgos medios (pre-mitigacion) | 5 |
| Riesgos bajos (pre-mitigacion) | 2 |
| Riesgos altos residuales | **0** |
| Riesgos medios residuales | **1** (acceso no autorizado) |
| Riesgos bajos residuales | **7** |

---

## 5. Medidas Tecnicas y Organizativas (Art. 35.7.d)

### 5.1 Medidas de Cifrado

| **Medida** | **Descripcion** | **Alcance** |
|---|---|---|
| **TLS 1.3** | Cifrado de extremo a extremo para todas las comunicaciones en transito. Version minima TLS 1.2, con preferencia TLS 1.3 | Todas las conexiones cliente-servidor y servidor-proveedor |
| **AES-256** | Cifrado de datos en reposo con algoritmo AES-256. Gestion de claves mediante Supabase Vault | Base de datos PostgreSQL, almacenamiento de archivos |
| **JWT encriptado** | Tokens de autenticacion firmados y encriptados con caducidad corta y rotacion de refresh tokens | Autenticacion de todas las sesiones de usuario |
| **Secure cookies** | Atributos Secure, HttpOnly y SameSite en todas las cookies de la aplicacion | Todas las cookies de sesion y preferencias |

### 5.2 Control de Acceso

| **Medida** | **Descripcion** | **Alcance** |
|---|---|---|
| **RBAC** | Control de acceso basado en roles con 7 niveles (admin, manager, encargado, clerk, warehouse, usuario, costo). Cada rol tiene permisos especificos definidos | Acceso a funcionalidades, datos de la aplicacion y API |
| **JWT Authentication** | Autenticacion mediante tokens JWT con verificacion de firma en cada solicitud | Todas las rutas protegidas de la aplicacion y API |
| **Session Management** | Gestion de sesiones con caducidad configurable, revocacion de tokens y limpieza de sesiones inactivas | Todas las sesiones de usuario activas |
| **Row Level Security (RLS)** | Politicas de seguridad a nivel de fila en PostgreSQL (Supabase) que aseguran el aislamiento de datos por tienda y usuario | Todas las tablas con datos personales y de negocio |

### 5.3 Seguridad de Red

| **Medida** | **Descripcion** | **Alcance** |
|---|---|---|
| **CSP Headers** | Content-Security-Policy que mitiga ataques XSS e inyeccion de contenido malicioso | Todas las respuestas HTTP de la aplicacion CostPro |
| **Rate Limiting** | Limitacion de solicitudes API (30 req/min) para prevenir ataques de fuerza bruta y abuso | Todas las rutas API |
| **CORS Restrictions** | Restricciones de origen cruzado para prevenir solicitudes no autorizadas desde dominios externos | Todas las respuestas HTTP |
| **Environment Isolation** | Secretos gestionados mediante variables de entorno; nunca comprometidos en el control de codigo fuente | Toda la configuracion sensible de la aplicacion |

### 5.4 Monitoreo y Registro

| **Medida** | **Descripcion** | **Alcance** |
|---|---|---|
| **OpenTelemetry Tracing** | Trazas distribuidas para la observabilidad del rendimiento y la deteccion de anomalias | Todas las solicitudes de la aplicacion |
| **Structured Logging** | Registros estructurados con informacion de contexto para investigacion de incidentes | Todas las operaciones de la aplicacion |
| **Health Checks** | Monitoreo continuo de la disponibilidad y el rendimiento del servicio | Todos los servicios criticos de la aplicacion |
| **Audit Logging** | Registro completo de accesos y operaciones sobre datos personales | Todas las operaciones de lectura/escritura en datos personales |

### 5.5 Respaldo y Recuperacion

| **Medida** | **Descripcion** | **Alcance** |
|---|---|---|
| **Backups automatizados** | Copias de seguridad automatizadas con frecuencia diaria | Base de datos completa de Supabase PostgreSQL |
| **Retencion de backups** | Retencion de 30 dias para copias de seguridad | Todas las copias de seguridad almacenadas |
| **Procedimiento de restauracion** | Procedimiento documentado para restauracion de datos en caso de perdida o corrupcion | Base de datos y configuracion de la aplicacion |

### 5.6 Seguridad Fisica

| **Medida** | **Descripcion** | **Alcance** |
|---|---|---|
| **Render.com Data Centers** | Centros de datos con certificacion SOC 2 Type II, control de acceso fisico, redundancia de alimentacion y conectividad | Infraestructura de hosting de la aplicacion |
| **Supabase Infrastructure** | Infraestructura alojada en AWS con controles de seguridad fisicos y certificaciones de cumplimiento | Base de datos, autenticacion y almacenamiento |

### 5.7 Medidas Organizativas

| **Medida** | **Descripcion** | **Referencia** |
|---|---|---|
| **DPO designado** | Delegado de Proteccion de Datos designado (privacidad@costpro.app) | `ropa.md` |
| **ROPA** | Registro de Actividades de Tratamiento mantenido conforme al Art. 30 RGPD | `knowledge/compliance/ropa.md` |
| **Politica de retencion** | Politicas de retencion de datos definidas por tipo de dato (12 meses a 6 anos) | `ropa.md` Seccion 9 |
| **Plan de respuesta a incidentes** | Procedimiento documentado para deteccion, notificacion y respuesta a violaciones de datos | `knowledge/compliance/incident-response-plan.md` |
| **Transferencias internacionales** | Marco de transferencias con DPF, SCCs y TIA completo | `knowledge/compliance/international-transfers.md` |
| **Capacitacion** | Personal informado sobre obligaciones de proteccion de datos | Procedimiento interno |

---

## 6. Evaluacion de Transferencias Internacionales

### 6.1 Marco de Referencia

Las transferencias internacionales de datos personales estan completamente documentadas y evaluadas en el siguiente documento de cumplimiento:

> **Documento:** `knowledge/compliance/international-transfers.md`
> **Version:** 1.0
> **Fecha:** 24 de enero de 2025
> **Contenido:** Mapa de transferencias, Transfer Impact Assessment (TIA), salvaguardas implementadas, procedimientos de aprobacion

### 6.2 Resumen de Salvaguardas Aplicadas

| **Mecanismo** | **Descripcion** | **Proveedores** |
|---|---|---|
| **EU-US Data Privacy Framework (DPF)** | Decision de adecuacion de la UE (Reglamento 2023/1795). Supabase Inc. certificado; Render.com y Upstash pendiente de verificacion | Supabase, Render.com, Upstash |
| **Standard Contractual Clauses (SCCs)** | Clausulas Contractuales Tipo adoptadas por la Decision 2021/914. Modulo 2 (Controller to Processor) incorporado a contratos | Supabase, Render.com, proveedor de LLM |
| **Transfer Impact Assessment (TIA)** | Evaluacion de impacto completa que analiza la legislacion del pais destino (EE.UU.) e identifica medidas suplementarias | Todas las transferencias |
| **Medidas suplementarias** | TLS 1.3, AES-256, minimizacion de datos, seudonimizacion, RBAC, audit logs | Todas las transferencias |

### 6.3 Conclusión sobre Transferencias

La combinacion del DPF, las SCCs y las medidas suplementarias tecnicas garantizan un nivel de proteccion **esencialmente equivalente** al del RGPD para todas las transferencias internacionales realizadas por CostPro Enterprise. No se identifican riesgos inaceptables que no puedan mitigarse con las medidas actuales.

---

## 7. Consulta con el DPO

### 7.1 Dictamen del Delegado de Proteccion de Datos

Conforme al Art. 35.2 RGPD y las Directrices WP29, el DPO ha sido consultado durante la realizacion de la presente EIPD.

**Fecha de consulta:** 1 de mayo de 2026
**DPO:** privacidad@costpro.app

### 7.2 Opinión del DPO

Tras la revision integral de la Evaluacion de Impacto de Proteccion de Datos de CostPro Enterprise, el DPO emite la siguiente opinion:

1. **Obligatoriedad confirmada:** La EIPD es obligatoria conforme al Art. 35.1 y 35.3 RGPD, dado que el tratamiento cumple multiples criterios de las Directrices WP29 (monitorizacion sistematica, tratamiento a gran escala, decision automatizada, transferencias fuera del EEE).

2. **Necesidad y proporcionalidad:** El DPO considera que el tratamiento de datos es necesario y proporcional para las finalidades declaradas. Las bases legales identificadas (Art. 6.1.b, 6.1.c, 6.1.f) son adecuadas y el test de equilibrio favorable al responsable esta correctamente justificado.

3. **Evaluacion de riesgos:** El DPO considera que la identificacion y evaluacion de riesgos es completa y adecuada. Los 8 riesgos identificados cubren las principales amenazas para los derechos y libertades de los interesados.

4. **Medidas de mitigacion:** Las medidas tecnicas y organizativas implementadas son robustas y proporcionadas al nivel de riesgo identificado. El cifrado TLS 1.3/AES-256, el RBAC con 7 niveles y el RLS constituyen un modelo de seguridad adecuado.

5. **Transferencias internacionales:** El marco de transferencias (DPF + SCCs + medidas suplementarias) proporciona un nivel de proteccion adecuado. No obstante, el DPO recomienda verificar la certificacion DPF de Render.com y Upstash con mayor urgencia.

6. **Riesgo residual:** Ningun riesgo residual alcanza el nivel ALTO, lo cual es un resultado satisfactorio. El unico riesgo residual MEDIO (acceso no autorizado) esta siendo gestionado con medidas adecuadas.

### 7.3 Recomendaciones del DPO

| # | Recomendacion | Prioridad | Plazo |
|---|---|:---:|---|
| 1 | Completar la verificacion de la certificacion DPF de Render.com y Upstash Inc. | **Alta** | 30 dias |
| 2 | Implementar automatizacion de eliminacion de datos al vencer los periodos de retencion | **Alta** | 90 dias |
| 3 | Evaluar la implementacion de BYOK (Bring Your Own Key) para el cifrado en reposo de Supabase | **Media** | 6 meses |
| 4 | Realizar una prueba de penetracion (pentest) periodica de la aplicacion | **Media** | 6 meses |
| 5 | Evaluar opciones de hosting dentro del EEE como alternativa a Render.com | **Baja** | 12 meses |
| 6 | Documentar y publicar una politica especifica de uso de IA transparente para los usuarios | **Media** | 60 dias |
| 7 | Establecer un programa de capacitacion periodica en proteccion de datos para todo el personal | **Media** | 90 dias |

---

## 8. Conclusion

### 8.1 Resultado de la EIPD

| **Aspecto** | **Resultado** |
|---|---|
| **Nivel de riesgo global** | **MEDIO** (aceptable con las medidas de mitigacion actuales) |
| **Riesgos altos residuales** | **0** — Ningun riesgo residual alcanza el nivel alto |
| **Riesgos medios residuales** | **1** — Acceso no autorizado (gestionado con medidas existentes) |
| **Tratamiento necesario y proporcional** | **Si** — Conforme al Art. 35.7.a RGPD |
| **Medidas tecnicas y organizativas adecuadas** | **Si** — Conforme al Art. 35.7.d RGPD |
| **Transferencias internacionales mitigadas** | **Si** — DPF + SCCs + medidas suplementarias |
| **Derechos de los interesados garantizados** | **Si** — Todos los derechos ARSULIPO implementados |

### 8.2 Decision

Conforme al Art. 35.7.e RGPD, el resultado de la EIPD indica que el tratamiento **puede realizarse** con las medidas de mitigacion implementadas. Los riesgos residuales son **aceptables** y no se identifican riesgos altos que no puedan mitigarse.

**Condiciones para el tratamiento:**

1. Implementar las recomendaciones del DPO en los plazos indicados.
2. Mantener actualizada la documentacion de transferencias internacionales.
3. Realizar una revision periodica de la EIPD (minimo anual o ante cambios significativos).
4. Mantener el ROPA actualizado con cualquier cambio en las actividades de tratamiento.
5. Notificar a la AEPD si se identifican riesgos altos residuales que no puedan mitigarse.

### 8.3 Plan de Revision

| **Actividad** | **Frecuencia** | **Responsable** |
|---|---|---|
| Revision completa de la EIPD | **Anual** o ante cambios significativos en el tratamiento | DPO |
| Reevaluacion de la matriz de riesgos | **Anual** | DPO + Equipo de Seguridad |
| Verificacion de certificaciones DPF | **Trimestral** | DPO |
| Auditoria de medidas tecnicas | **Anual** | Equipo de Seguridad |
| Revision de politicas de retencion | **Anual** | DPO + Equipo Tecnico |
| Actualizacion del ROPA | **Continua** (ante cambios) | DPO |
| Prueba de respuesta a incidentes | **Anual** | DPO + Equipo de Seguridad |
| Consulta de renovacion con proveedores | **Anual** | DPO + Legal |

**Proxima revision completa programada:** 1 de mayo de 2027

---

## 9. Aprobacion

### 9.1 Firmas de Aprobacion

La presente Evaluacion de Impacto de Proteccion de Datos ha sido revisada y aprobada por:

| **Rol** | **Nombre / Organismo** | **Firma** | **Fecha** |
|---|---|---|---|
| **Responsable del Tratamiento** | CostPro Team | _________________________ | ___/___/______ |
| **Delegado de Proteccion de Datos (DPO)** | DPO — privacidad@costpro.app | _________________________ | ___/___/______ |

### 9.2 Declaracion

Al firmar este documento, el Responsable del Tratamiento y el Delegado de Proteccion de Datos confirman que:

1. La EIPD ha sido realizada conforme a los requisitos del Art. 35 RGPD y las Directrices WP29 (wp248rev.01).
2. Los riesgos han sido identificados, evaluados y mitigados con medidas tecnicas y organizativas adecuadas.
3. Se ha consultado al DPO conforme al Art. 35.2 RGPD.
4. No se identifican riesgos altos residuales que no puedan mitigarse con las medidas propuestas.
5. El tratamiento puede proseguir con las condiciones establecidas en la Seccion 8.2.

---

## 10. Documentos de Referencia

| **Documento** | **Ubicacion** | **Version** |
|---|---|---|
| Registro de Actividades de Tratamiento (ROPA) | `knowledge/compliance/ropa.md` | 1.0 |
| Transferencias Internacionales de Datos | `knowledge/compliance/international-transfers.md` | 1.0 |
| Plan de Respuesta a Incidentes | `knowledge/compliance/incident-response-plan.md` | 1.0 |
| Directrices WP29 sobre EIPD | WP29 wp248rev.01 | 2017 (actualizado) |
| Reglamento General de Proteccion de Datos | RGPD (UE) 2016/679 | 2016 |
| LOPDGDD | Ley Organica 3/2018 | 2018 |
| Decision de Adecuacion DPF | Reglamento (UE) 2023/1795 | 2023 |
| SCCs (Decision 2021/914) | Decision de Ejecucion (UE) 2021/914 | 2021 |

---

## 11. Historial de Versiones

| **Version** | **Fecha** | **Descripcion del cambio** | **Autor** |
|---|---|---|---|
| 1.0 | 2026-05-01 | Version inicial de la EIPD — Evaluacion completa conforme al Art. 35 RGPD | DPO — CostPro Enterprise |

---

*Este documento sera revisado y actualizado con una frecuencia minima anual, o antes si se producen cambios significativos en el tratamiento de datos, la infraestructura tecnologica, la legislacion aplicable o si se identifican nuevos riesgos que requieran evaluacion.*
