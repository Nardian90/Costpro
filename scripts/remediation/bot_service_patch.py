import sys
import re

file_path = 'src/services/bot-service.ts'
with open(file_path, 'r') as f:
    content = f.read()

# 1. Implement Knowledge Base Caching
knowledge_cache_code = """
let cachedKnowledge: string | null = null;
let lastCacheTime = 0;
const CACHE_TTL = 3600000; // 1 hour

async function getKnowledgeBaseContext(): Promise<string> {
  const now = Date.now();
  if (cachedKnowledge && (now - lastCacheTime < CACHE_TTL)) {
    return cachedKnowledge;
  }

  const dirPath = path.join(process.cwd(), 'docs/knowledge/resolutions');
  if (!fs.existsSync(dirPath)) return '';

  try {
    const files = fs.readdirSync(dirPath);
    let knowledge = '';
    for (const file of files) {
      if (file.endsWith('.md') || file.endsWith('.json') || file.endsWith('.txt')) {
        const fileContent = fs.readFileSync(path.join(dirPath, file), 'utf-8');
        knowledge += `\\n[DOC: ${file}]\\n${fileContent}\\n`;
      }
    }
    cachedKnowledge = knowledge;
    lastCacheTime = now;
    return knowledge;
  } catch (err) {
    console.error('Error reading knowledge base:', err);
    return '';
  }
}
"""

content = re.sub(r'async function getKnowledgeBaseContext\(\): Promise<string> \{.*?\}', knowledge_cache_code, content, flags=re.DOTALL)

# 2. Optimize System Prompt and token usage
# We'll compress the view and form context
prompt_optimization = """
    const knowledgeBase = await getKnowledgeBaseContext();
    // Compact context representation
    const viewsContext = VIEW_REGISTRY.map(v => `${v.id}:${v.description}`).join('|');
    const formsContext = JSON.stringify(AI_FORM_SCHEMAS); // No indentation

    const systemPrompt: Message = {
      role: 'system',
      content: `Darian, AI Controller.
      Capacidades: open_view, ejecutar acciones, llenar formularios, explicar módulos.
      Reglas: Actúa siempre. Seguridad: Tienda ${storeId}.
      Vistas: ${viewsContext}
      Formularios: ${formsContext}
      Contexto: Usuario ${userId}, Tienda ${storeId}, Vista ${botContext?.currentView || 'N/A'}.
      Conocimiento: ${knowledgeBase || 'N/A'}`
    };
"""

# Find the block where variables are defined and systemPrompt is created
# Using a more robust regex or direct replacement if possible.
# I'll just replace the whole section for clarity.

old_block = r'const knowledgeBase = await getKnowledgeBaseContext\(\);.*?knowledgeBase \|\| \'Sin documentos cargados\.\'\}\'`'
content = re.sub(old_block, prompt_optimization, content, flags=re.DOTALL)

# 3. Improve Retry Logic with better delay
old_retry = """const MAX_RETRIES = 3;
    let retryCount = 0;
    let response: any;
    while (retryCount < MAX_RETRIES) {
      try {
        response = await provider.getResponse(currentMessages, { tools: TOOLS });
        break;
      } catch (err: any) {
        retryCount++;
        if (retryCount >= MAX_RETRIES) throw err;
        console.warn(`[BotService] LLM Error (attempt ${retryCount}):`, err.message);
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)); // Exponential backoff
      }
    }"""

new_retry = """const MAX_RETRIES = 3;
    let retryCount = 0;
    let response: any;
    while (retryCount < MAX_RETRIES) {
      try {
        // Reduced max tokens for intermediate steps to save cost
        response = await provider.getResponse(currentMessages, {
          tools: TOOLS,
          maxTokens: iterations < MAX_ITERATIONS - 1 ? 1024 : 2048
        });
        break;
      } catch (err: any) {
        const msg = err.message.toLowerCase();
        // If it's a quota error, wait longer
        const isQuota = msg.includes('429') || msg.includes('quota') || msg.includes('limit');
        retryCount++;
        if (retryCount >= MAX_RETRIES) throw err;

        const delay = isQuota ? 2000 * retryCount : 1000 * retryCount;
        console.warn(`[BotService] LLM Error (attempt ${retryCount}, delay ${delay}ms):`, err.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }"""

content = content.replace(old_retry, new_retry)

with open(file_path, 'w') as f:
    f.write(content)
