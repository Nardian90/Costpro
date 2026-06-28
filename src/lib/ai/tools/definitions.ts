import { ToolDefinition } from '../types';

export const TOOLS: ToolDefinition[] = [
  {
    name: "open_view",
    allowedRoles: ['admin', 'manager', 'vendedor', 'costo'],
    description: "Navega a una vista específica del sistema.",
    parameters: {
      type: "object",
      properties: {
        viewId: { type: "string", description: "El ID de la vista a abrir (ej: dashboard, cost-sheets, inventory)." },
        params: { type: "object", description: "Parámetros opcionales para la vista (ej: id de un registro)." }
      },
      required: ["viewId"]
    }
  },
  {
    name: "explain_view",
    allowedRoles: ['admin', 'manager', 'vendedor', 'costo'],
    description: "Explica el propósito y las acciones disponibles en la vista actual o una específica.",
    parameters: {
      type: "object",
      properties: {
        viewId: { type: "string", description: "ID de la vista a explicar. Si se omite, explica la vista actual." }
      }
    }
  },
  {
    name: "fill_form",
    allowedRoles: ['admin', 'manager', 'vendedor', 'costo'],
    description: "Completa los campos de un formulario sin enviarlo. Útil para que el usuario revise antes de guardar.",
    parameters: {
      type: "object",
      properties: {
        formName: { type: "string", description: "Nombre del formulario (ej: costSheet, product)." },
        data: { type: "object", description: "Objeto con los datos para completar los campos del formulario." }
      },
      required: ["formName", "data"]
    }
  },
  {
    name: "submit_form",
    allowedRoles: ['admin', 'manager'],
    description: "Completa y envía un formulario directamente.",
    parameters: {
      type: "object",
      properties: {
        formName: { type: "string", description: "Nombre del formulario." },
        data: { type: "object", description: "Datos del formulario." }
      },
      required: ["formName", "data"]
    }
  },
  {
    name: "search_entity",
    allowedRoles: ['admin', 'manager', 'vendedor', 'costo'],
    description: "Busca registros en el sistema (productos, fichas de costo, transacciones).",
    parameters: {
      type: "object",
      properties: {
        entity: { type: "string", enum: ["product", "costSheet", "transaction", "supply"], description: "Tipo de entidad a buscar." },
        query: { type: "string", description: "Término de búsqueda." },
        filters: { type: "object", description: "Filtros adicionales." }
      },
      required: ["entity", "query"]
    }
  },
  {
    name: "execute_action",
    allowedRoles: ['admin', 'manager'],
    description: "Ejecuta una acción específica del sistema.",
    parameters: {
      type: "object",
      properties: {
        actionName: { type: "string", description: "Nombre de la acción (ej: recalculate_costs, sync_data)." },
        parameters: { type: "object", description: "Parámetros requeridos para la acción." }
      },
      required: ["actionName"]
    }
  },
  {
    name: "export_document",
    allowedRoles: ['admin', 'manager'],
    description: "Genera y descarga un documento (PDF, Excel).",
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["pdf", "excel"], description: "Formato del documento." },
        entityType: { type: "string", description: "Tipo de entidad a exportar (ej: costSheet, inventory)." },
        entityId: { type: "string", description: "ID del registro a exportar." }
      },
      required: ["type", "entityType", "entityId"]
    }
  },
  {
    name: "set_ui_mode",
    allowedRoles: ['admin', 'manager', 'costo'],
    description: "Cambia el modo de la interfaz de usuario.",
    parameters: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["standard", "expert"], description: "El modo a activar." }
      },
      required: ["mode"]
    }
  },
  {
    name: "run_system_health_check",
    allowedRoles: ['admin', 'manager'],
    description: "Inicia un recorrido automático de todas las vistas del sistema para detectar errores de UI y funcionalidad. Genera capturas de pantalla y registros de salud en Supabase.",
    parameters: {
      type: "object",
      properties: {
        viewIds: { type: "array", items: { type: "string" }, description: "Lista opcional de IDs de vistas a revisar. Si se omite, se revisan todas." }
      }
    }
  },
  {
    name: "get_cost_summary",
    allowedRoles: ['admin', 'manager', 'vendedor', 'costo'],
    description: "Obtiene un resumen agregado de costos para la tienda actual: número de fichas de costo, costo unitario promedio, costo total del inventario, productos con y sin ficha. Útil cuando el usuario pregunta 'muéstrame el resumen de costos', 'cuánto me costó el inventario', 'resumen de fichas de costo'.",
    parameters: {
      type: "object",
      properties: {
        storeId: { type: "string", description: "ID de la tienda. Si se omite, se usa el storeId del contexto de la conversación." }
      }
    }
  }
];
