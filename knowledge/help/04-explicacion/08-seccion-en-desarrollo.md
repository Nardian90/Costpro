# Explicación: ¿Qué es la sección "En desarrollo"?

## La idea

CostPro crece rápido. Algunas capacidades **existen y funcionan**, pero todavía no están lo bastante maduras o integradas como para formar parte del flujo principal del producto. En lugar de esconderlas o presentarlas como terminadas, CostPro las reúne en una sección propia del menú:

```
EN DESARROLLO
├── IPV
├── Pick3
├── Billetera
├── Wiki
├── Academia
├── Marco Legal
└── Conciliación Bancaria
```

## Qué significa estar "en desarrollo"

Una vista en esta sección:

- **Existe**: puede abrirla desde el menú o por enlace directo, sin trucos.
- **No está integrada del todo**: puede faltarle alguna capacidad, cambiar con el tiempo o estar limitada a administradores.
- **Es honesta consigo misma**: si algo aún no funciona completo, la propia vista lo indica.

## Qué hay hoy

| Vista | Qué es | Estado |
|-------|--------|--------|
| **IPV** | Banco de trabajo experimental de conciliación: reportes, extractos, catálogos, procesamiento IA y auditoría (navegación interna por rail). Solo administradores. | Experimental |
| **Pick3** | Gestor de riesgo de inversión: métricas cuantitativas, motores Markov, backtest y gestión de bankroll. Solo administradores. | Experimental |
| **Billetera** | Billetera digital experimental: ingresos por transferencias, pagos digitales e importación de backups de Transfermóvil. Solo administradores. | Experimental |
| **Wiki** | Conocimiento contable cubano: asientos con Debe/Haber, plan de cuentas, normativas NC-29 y ONAT. | En integración |
| **Academia** | Flashcards con repetición espaciada (SRS) para dominar conceptos del sistema; progreso guardado en su cuenta. | En integración |
| **Marco Legal** | Consultor de normativa cubana (fiscal, laboral, mercantil) y generador de formularios oficiales en PDF. | En integración |
| **Conciliación Bancaria** | Vista de extractos y estado de conciliación en **solo lectura**. Sin importación ni matching automático todavía. | Beta — capacidad parcial |

## Cómo debe usarla usted

- **Explore con criterio**: puede usar estas vistas, pero no construya su operación diaria sobre ellas todavía.
- **Los flujos críticos** (vender, recibir mercancía, cerrar caja) viven en **Operación** y están completamente soportados.
- Cuando una vista madure, **se moverá a su sección definitiva** del menú y la documentación se actualizará.

## Por qué es importante esta separación

Documentar una capacidad inmadura como si fuera madura genera desconfianza y errores operativos. Al separar el producto estable de lo experimental, usted sabe exactamente en qué puede apoyarse hoy y qué está por venir.
