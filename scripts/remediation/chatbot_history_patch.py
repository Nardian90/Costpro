import sys

file_path = 'src/components/ui/ChatBot.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# Limit the message history in the state to avoid memory bloat
# and ensure we don't send too much back to the server even if botService already trims it.
# Let's add a trimming step to newMessages in handleSend.

old_msg_handling = """    const userMessage: Message = { role: 'user', content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);"""

new_msg_handling = """    const userMessage: Message = { role: 'user', content: input };
    // Mantener solo los últimos 10 mensajes en el historial para optimizar tokens
    const newMessages = [...messages, userMessage].slice(-10);
    setMessages(newMessages);"""

content = content.replace(old_msg_handling, new_msg_handling)

with open(file_path, 'w') as f:
    f.write(content)
