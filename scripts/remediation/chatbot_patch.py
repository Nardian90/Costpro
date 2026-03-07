import sys

file_path = 'src/components/ui/ChatBot.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# Modify handleSend catch block
old_catch = """    } catch (error: any) {
      toast.error(error.message);
    } finally {"""

new_catch = """    } catch (error: any) {
      const errorMsg = error.message || '';
      if (errorMsg.includes('Límite de IA alcanzado') || errorMsg.includes('Balance') || errorMsg.includes('Quota')) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: '⚠️ ' + errorMsg + ' Puedes cambiar a otro proveedor o ingresar tu propia clave en los ajustes (icono de engranaje arriba).'
        }]);
      } else {
        toast.error(errorMsg);
      }
    } finally {"""

content = content.replace(old_catch, new_catch)

with open(file_path, 'w') as f:
    f.write(content)
