# REGISTRO DE MANTENIMIENTO CICLICO — MOBILE FIRST

## ESTADO DEL PIPELINE

Última ejecución: 2026-03-14
Siguiente objetivo: SECCION_01_HEADER
Modo: AUTOMATICO
Ciclo actual: 2
Agente responsable: Jules Mobile UI Scheduler

---

# OBJETIVO DEL SISTEMA

Este pipeline mantiene todas las interfaces del sistema optimizadas para **dispositivos móviles entre 320px y 400px**.

El mantenimiento se realiza mediante **micro-ajustes CSS no destructivos**, asegurando:

* ausencia de scroll horizontal
* tipografías adaptativas
* zonas táctiles accesibles
* contenedores flexibles

El diseño visual **no debe alterarse**.

El pipeline es **cíclico y permanente**.

Cuando se complete la última sección el sistema debe **reiniciar desde la primera**.

---

# ROADMAP DE SECCIONES

El agente debe trabajar **una sección por ejecución diaria**.

[ ] SECCION_01_HEADER
Nav principal
Logo
Menú hamburguesa

[ ] SECCION_02_HERO
Banner principal
Títulos H1
CTAs superiores

[ ] SECCION_03_PRODUCTO
Grids de productos
Cards
Precios

[ ] SECCION_04_CONTENIDO
Artículos
Texto largo
Tablas

[ ] SECCION_05_MEDIA
Galerías
Videos
Sliders

[ ] SECCION_06_FORMS
Formularios
Inputs
Checkouts

[ ] SECCION_07_FOOTER
Enlaces legales
Copyright
Redes sociales

---

# REGLAS CSS QUIRÚRGICAS

## 1 Scroll Horizontal Seguro

Si un contenedor produce overflow en <380px:

overflow-x: auto;

Nunca permitir scroll horizontal en:

body
html

---

## 2 Tipografías Adaptativas

Si una tipografía supera 24px en móvil:

font-size: clamp(16px, 4vw, 24px);

---

## 3 Touch Targets

Elementos interactivos deben cumplir:

min-height: 44px;
min-width: 44px;

Aplicar a:

* botones
* links
* iconos interactivos
* inputs

---

## 4 Prohibiciones

El pipeline **NO debe usar**:

display: none
visibility: hidden
overflow: hidden para ocultar contenido

Los problemas deben resolverse con **layout responsivo real**.

---

# PROCESO DE EJECUCIÓN DEL AGENTE

## Paso 1 — Leer estado

Abrir:

/docs/MAINTENANCE_LOG.md

Extraer:

* Última ejecución
* Siguiente objetivo
* Secciones completadas

---

## Paso 2 — Analizar UI

Escanear:

/src/components
/src/styles
/src/views

Detectar:

* contenedores rígidos
* overflow horizontal
* grids no responsivos
* tipografías grandes
* botones pequeños

---

## Paso 3 — Aplicar mejoras

Permitir únicamente cambios de:

* responsividad
* overflow controlado
* tipografía adaptativa
* accesibilidad táctil

Nunca alterar:

* colores
* layout principal
* jerarquía visual

---

## Paso 4 — Actualizar registro

1. Marcar sección como completada

[x] SECCION_ACTUAL

2. Actualizar fecha

Última ejecución: YYYY-MM-DD

3. Avanzar objetivo

Siguiente objetivo: SECCION_SIGUIENTE

---

## Paso 5 — Reinicio del ciclo

Si se completa `SECCION_07_FOOTER`:

1. limpiar checkboxes
2. reiniciar roadmap
3. incrementar ciclo

Nuevo estado:

Siguiente objetivo: SECCION_01_HEADER
Ciclo actual: +1

---

# PRINCIPIO DEL PIPELINE

Este sistema sigue el modelo:

micro-mejoras
incrementales
diarias
seguras

El objetivo es mantener la interfaz **permanentemente optimizada para dispositivos móviles**.
