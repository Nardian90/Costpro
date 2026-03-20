# How to Add New AI Tools

1. **Define the Tool**: Add the tool definition to `src/lib/ai/tools/definitions.ts`. Include name, description, parameters, and `allowedRoles`.
2. **Add Validation**: Add a Zod schema to the `schemas` object in `src/lib/ai/tools/registry.ts`.
3. **Implement Handler**: Add a handler function to the `toolHandlers` object in `src/lib/ai/tools/registry.ts`.
4. **Update Frontend (Optional)**: If the tool returns a UI action, handle it in `src/components/ui/ChatBot.tsx` within the `handleAction` function.
