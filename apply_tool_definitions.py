import sys

content = open('src/lib/ai/tools/definitions.ts', 'r').read()

search_text = """    parameters: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["standard", "expert"], description: "El modo a activar." }
      },
      required: ["mode"]
    }
  }
];"""

replace_text = """    parameters: {
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
  }
];"""

if search_text in content:
    new_content = content.replace(search_text, replace_text)
    with open('src/lib/ai/tools/definitions.ts', 'w') as f:
        f.write(new_content)
    print("Successfully updated definitions.ts")
else:
    print("Search text not found in definitions.ts")
