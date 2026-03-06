import os

path = 'src/services/bot-service.ts'
with open(path, 'r') as f:
    lines = f.readlines()

new_lines = []
for i, line in enumerate(lines):
    if 'const result = await executeTool(' in line:
        # We found the line. Now we wrap it.
        new_lines.append("        const startTime = Date.now();\n")
        new_lines.append("        let status = 'success';\n")
        new_lines.append("        let errorMessage = null;\n")
        new_lines.append("\n")
        new_lines.append(line)
        # We need to skip the next few lines of the old call
        j = i + 1
        while j < len(lines) and '{ supabase, userId, userRole, storeId }' not in lines[j]:
            new_lines.append(lines[j])
            j += 1
        new_lines.append(lines[j]) # the context line
        new_lines.append("        );\n")

        # Now add the logging logic AFTER the result
        new_lines.append("\n")
        new_lines.append("        if (result.error) {\n")
        new_lines.append("          status = 'error';\n")
        new_lines.append("          errorMessage = result.error;\n")
        new_lines.append("        }\n")
        new_lines.append("\n")
        new_lines.append("        toolLogs.push({\n")
        new_lines.append("          tool_name: toolCall.function.name,\n")
        new_lines.append("          parameters: toolCall.function.arguments,\n")
        new_lines.append("          duration_ms: Date.now() - startTime,\n")
        new_lines.append("          status,\n")
        new_lines.append("          error_message: errorMessage,\n")
        new_lines.append("          timestamp: new Date().toISOString()\n")
        new_lines.append("        });\n")

        # Skip the original ');' line if it exists (my script above added one)
        # In the original file it looks like:
        # { supabase, userId, userRole, storeId }
        # );
        # So we skip the next line after context if it's just ');'
        if lines[j+1].strip() == ');':
            i = j + 1
        else:
            i = j
    else:
        new_lines.append(line)

# This naive approach needs better indexing control.
# Let's rewrite with a state machine or just use a simpler find/replace if possible.
