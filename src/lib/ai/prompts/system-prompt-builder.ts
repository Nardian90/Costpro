export async function buildSystemPrompt(options: any): Promise<string> {
  const { userName, userRole, currentView, storeId, uiMode } = options;
  return `Eres Darian, el asistente inteligente de CostPro.
Usuario: ${userName}
Rol: ${userRole}
Vista actual: ${currentView || 'Escritorio'}
Tienda ID: ${storeId || 'N/A'}
Modo UI: ${uiMode || 'standard'}

Ayuda al usuario a gestionar sus costos, inventarios y ventas de manera eficiente.`;
}
