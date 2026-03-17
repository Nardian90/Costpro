import sys

file_path = 'src/components/views/terminal/views/ipv/MatchingRulesEditor.tsx'
with open(file_path, 'r') as f:
    content = f.read()

search_text = """  const toggleCopiloto = async (active: boolean) => {
    const exists = await db.ipv_settings.get("current");
    if (!exists) {
      await db.ipv_settings.put({
        id: 'current',
        updated_at: new Date().toISOString(),
        paper_size: 'LETTER',
        entidad_nombre: 'ENTIDAD POR DEFECTO',
        entidad_codigo: '0000',
        persona_entrega: 'RESPONSABLE',
        consecutivo_inicio: 1,
        agrupacion_modo: 'GLOBAL',
        desglose_modo: 'TRANSACCION',
        copiloto_activo: active
      });
    } else {

    }

    toast.success(active ? "Copiloto activado: El sistema usará la lógica optimizada (>90% mismatch)." : "Copiloto desactivado: Se aplicará su configuración manual.");
  };"""

replace_text = """  const toggleCopiloto = async (active: boolean) => {
    const exists = await db.ipv_settings.get("current");
    if (!exists) {
      await db.ipv_settings.put({
        id: 'current',
        updated_at: new Date().toISOString(),
        paper_size: 'LETTER',
        entidad_nombre: 'ENTIDAD POR DEFECTO',
        entidad_codigo: '0000',
        persona_entrega: 'RESPONSABLE',
        consecutivo_inicio: 1,
        agrupacion_modo: 'GLOBAL',
        desglose_modo: 'TRANSACCION',
        copiloto_activo: active
      });
    } else {
      await db.ipv_settings.update("current", { copiloto_activo: active });
    }
    toast.success(active ? "Copiloto activado: El sistema usará la lógica optimizada (>90% mismatch)." : "Copiloto desactivado: Se aplicará su configuración manual.");
  };"""

if search_text in content:
    new_content = content.replace(search_text, replace_text)
    with open(file_path, 'w') as f:
        f.write(new_content)
    print("Successfully updated.")
else:
    # Try another search pattern if previous failed or slightly different
    print("Search text not found exactly. Manual adjustment needed.")
    # Check what is there
    start_idx = content.find("const toggleCopiloto = async (active: boolean) => {")
    end_idx = content.find("};", start_idx) + 2
    if start_idx != -1:
        print("Found toggleCopiloto at", start_idx)
        print("Current content slice:")
        print(content[start_idx:end_idx])
