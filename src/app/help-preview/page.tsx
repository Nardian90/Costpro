import HelpSectionRenderer from '@/components/views/terminal/views/help/HelpSectionRenderer';

// Página temporal pública para auditar el renderizado de tablas en Ayuda.
// Se puede eliminar después de la auditoría.
const SAMPLE_CONTENT = `
## Tabla de Permisos — COSTOS

| Permiso | admin | manager | encargado | clerk | warehouse | usuario | costo |
|---------|:-----:|:-------:|:---------:|:-----:|:---------:|:-------:|:-----:|
| Ver fichas de costo | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| Crear fichas de costo | ✅ | ✅ | — | — | — | — | ✅ |
| Editar fichas de costo | ✅ | ✅ | — | — | — | — | ✅ |
| Eliminar fichas de costo | ✅ | ✅ | — | — | — | — | ✅ |
| Usar KPI Tablero / Solver | ✅ | ✅ | ✅ | — | — | ✅ | ✅ |
| Generador masivo | ✅ | ✅ | — | — | — | — | — |
| Explorador de plantillas | ✅ | ✅ | ✅ | — | — | ✅ | ✅ |
| Asistente IA (Darian) | ✅ | ✅ | ✅ | — | — | ✅ | ✅ |
| Modo Auditoría | ✅ | ✅ | ✅ | — | — | — | — |
| Exportar PDF / Excel | ✅ | ✅ | ✅ | — | — | ✅ | ✅ |
| Importar / Exportar JSON | ✅ | ✅ | — | — | — | — | — |

> **Tip:** Los permisos son acumulativos dentro de la cadena principal (admin → manager → encargado → clerk → warehouse → usuario). El rol **costo** es una vía de acceso independiente.

> **Importante:** El rol **costo** no hereda de la cadena principal ni de ella heredan.

## Tabla Genérica — Jerarquía de Roles

| Nivel | Rol | Descripción |
|-------|-----|-------------|
| 1 | **admin** | Acceso total al sistema. Administración completa de tiendas, usuarios, roles y configuración. |
| 2 | **manager** | Gerencia operativa. Supervisión de tiendas, reportes y gestión de equipos. |
| 3 | **encargado** | Responsable de tienda. Gestión operativa completa de una tienda asignada. |
| 4 | **clerk** | Cajero. Operaciones de venta y consulta de inventario. |
| 5 | **warehouse** | Gestión de almacén. Recepciones, transferencias, conteos y ajustes. |
| 6 | **usuario** | Acceso de consulta. Solo lectura de la información asignada. |
| 7 | **costo** | Acceso exclusivo al módulo de costos. Sin acceso a POS, inventario ni configuración. |

## Permisos MULTI-TIENDA

| Permiso | admin | manager | encargado | clerk | warehouse | usuario | costo |
|---------|:-----:|:-------:|:---------:|:-----:|:---------:|:-------:|:-----:|
| Dashboard KPI | ✅ | ✅ | ✅ | — | — | ✅ | — |
| Terminal POS | ✅ | ✅ | ✅ | ✅ | — | — | — |
| Historial de ventas | ✅ | ✅ | ✅ | ✅ (propias) | — | — | — |
| Cierre de caja | ✅ | ✅ | ✅ | ✅ | — | — | — |
| Catálogo de productos | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Inventario | ✅ | ✅ | ✅ | ✅ (lectura) | ✅ | ✅ (lectura) | — |
`;

export default function HelpPreviewPage() {
  return (
    <div className="min-h-screen bg-background text-foreground p-4 sm:p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-black mb-8">Auditoría Tablas Help</h1>
      <HelpSectionRenderer content={SAMPLE_CONTENT} />
    </div>
  );
}
