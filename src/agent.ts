import { ChatOllama } from '@langchain/ollama';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { CONFIG } from './config.js';
import { allTools } from './tools/index.js';

// Tipos para el sistema de mensajes
interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolName?: string;
  toolResult?: string;
}

// Eventos del agente
export type AgentEvent =
  | { type: 'thinking'; message?: string }
  | { type: 'tool_start'; tool: string; params: Record<string, string> }
  | { type: 'tool_end'; tool: string; result: string; success: boolean; duration: number }
  | { type: 'response'; content: string }
  | { type: 'error'; message: string };

// Prompt del sistema
function getSystemPrompt(): string {
  const toolDescriptions = allTools
    .map(t => `- ${t.name}: ${t.description}`)
    .join('\n');

  return `Eres Archie, un asistente inteligente de archivos. Responde siempre en español.

DIRECTORIO DE TRABAJO: ${CONFIG.baseDir}
DIRECTORIO EXTRA (solo lectura): ${CONFIG.extraReadDir || 'No configurado'}

HERRAMIENTAS DISPONIBLES:
${toolDescriptions}

INSTRUCCIONES:
1. Si necesitas usar una herramienta, responde EXACTAMENTE asi:
   [TOOL: nombre_herramienta]
   param1: valor1
   param2: valor2
   [/TOOL]

2. Puedes usar MULTIPLES herramientas en secuencia. Despues de cada resultado, puedes usar otra herramienta si es necesario.

3. Cuando hayas completado TODAS las tareas, responde al usuario sin usar herramientas.

4. Si el usuario pide varias cosas (ej: renombrar Y escribir contenido), usa las herramientas necesarias una por una.

EJEMPLOS:
- Para listar archivos:
  [TOOL: listar_archivos]
  directorio: .
  patron: *
  [/TOOL]

- Para crear un archivo:
  [TOOL: crear_archivo]
  nombre: mi_archivo.txt
  contenido: Este es el contenido del archivo
  [/TOOL]

- Para responder directamente:
  ¡Hola! Soy Archie, tu asistente de archivos. ¿En qué puedo ayudarte?`;
}

// Parser de tool calls desde el texto del modelo
function parseToolCall(text: string): { tool: string; params: Record<string, string> } | null {
  const toolMatch = text.match(/\[TOOL:\s*(\w+)\]([\s\S]*?)\[\/TOOL\]/i);
  if (!toolMatch) return null;

  const toolName = toolMatch[1].trim();
  const paramsText = toolMatch[2].trim();
  const params: Record<string, string> = {};

  const lines = paramsText.split('\n');
  let currentKey = '';
  let currentValue = '';

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0 && !line.startsWith(' ') && !line.startsWith('\t')) {
      if (currentKey) {
        const trimmedValue = currentValue.trim();
        // Solo agregar si el valor no está vacío
        if (trimmedValue) {
          params[currentKey] = trimmedValue;
        }
      }
      currentKey = line.slice(0, colonIndex).trim();
      currentValue = line.slice(colonIndex + 1);
    } else if (currentKey) {
      currentValue += '\n' + line;
    }
  }

  if (currentKey) {
    const trimmedValue = currentValue.trim();
    // Solo agregar si el valor no está vacío
    if (trimmedValue) {
      params[currentKey] = trimmedValue;
    }
  }

  return { tool: toolName, params };
}

// Ejecutar una herramienta
async function executeTool(
  toolName: string,
  params: Record<string, string>
): Promise<{ result: string; success: boolean }> {
  const tool = allTools.find(t => t.name === toolName);
  if (!tool) {
    return { result: `Herramienta "${toolName}" no encontrada`, success: false };
  }

  try {
    // Obtener los campos requeridos del schema de la herramienta
    const schema = tool.schema;
    const schemaShape = schema._def?.shape?.() || {};
    
    // Validar parámetros requeridos
    for (const [key, fieldSchema] of Object.entries(schemaShape)) {
      const field = fieldSchema as { _def?: { defaultValue?: unknown } };
      const hasDefault = field._def?.defaultValue !== undefined;
      const isOptional = (fieldSchema as { isOptional?: () => boolean }).isOptional?.() ?? false;
      
      if (!hasDefault && !isOptional && (!params[key] || params[key].trim() === '')) {
        return { 
          result: `Error: Parámetro requerido "${key}" no proporcionado o vacío`, 
          success: false 
        };
      }
    }

    const processedParams: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params)) {
      if (value === 'true') processedParams[key] = true;
      else if (value === 'false') processedParams[key] = false;
      else if (!isNaN(Number(value)) && value !== '') processedParams[key] = Number(value);
      else processedParams[key] = value;
    }

    const result = await tool.func(processedParams as never);
    return { result: String(result), success: true };
  } catch (error) {
    return { result: `Error: ${(error as Error).message}`, success: false };
  }
}

// Crear el agente con eventos
export async function createArchieAgent() {
  const llm = new ChatOllama({
    baseUrl: CONFIG.ollama.baseUrl,
    model: CONFIG.ollama.model,
    temperature: 0,
  });

  const conversationHistory: Message[] = [];
  let currentAbortController: AbortController | null = null;

  // Construir mensajes para el LLM
  function buildMessages() {
    return [
      new SystemMessage(getSystemPrompt()),
      ...conversationHistory.map(msg => {
        if (msg.role === 'user') return new HumanMessage(msg.content);
        if (msg.role === 'assistant') return new AIMessage(msg.content);
        if (msg.role === 'tool') {
          return new HumanMessage(`[Resultado de ${msg.toolName}]\n${msg.toolResult}`);
        }
        return new HumanMessage(msg.content);
      }),
    ];
  }

  // Generador que emite eventos - con loop para múltiples herramientas
  async function* processInput(input: string, signal?: AbortSignal): AsyncGenerator<AgentEvent> {
    conversationHistory.push({ role: 'user', content: input });

    // Sin límite de iteraciones - el agente continúa hasta completar la tarea
    let iterations = 0;

    while (true) {
      // Verificar si se canceló
      if (signal?.aborted) {
        yield { type: 'error', message: 'Operación cancelada por el usuario' };
        return;
      }

      iterations++;
      
      yield { type: 'thinking', message: iterations === 1 ? 'Processing...' : 'Continuing...' };

      try {
        const response = await llm.invoke(buildMessages(), { signal });
        
        // Verificar cancelación después de la llamada
        if (signal?.aborted) {
          yield { type: 'error', message: 'Operación cancelada por el usuario' };
          return;
        }

        const responseText = typeof response.content === 'string'
          ? response.content
          : JSON.stringify(response.content);

        const toolCall = parseToolCall(responseText);

        if (toolCall) {
          // Emitir evento de inicio de herramienta
          yield { type: 'tool_start', tool: toolCall.tool, params: toolCall.params };

          // Ejecutar herramienta con timing
          const startTime = Date.now();
          const { result, success } = await executeTool(toolCall.tool, toolCall.params);
          const duration = Date.now() - startTime;

          // Emitir evento de fin de herramienta
          yield { type: 'tool_end', tool: toolCall.tool, result, success, duration };

          // Guardar en historial
          conversationHistory.push({ role: 'assistant', content: responseText });
          conversationHistory.push({
            role: 'tool',
            content: result,
            toolName: toolCall.tool,
            toolResult: result,
          });

          // Continuar el loop para ver si necesita más herramientas
          continue;
        } else {
          // No hay tool call, es respuesta final
          conversationHistory.push({ role: 'assistant', content: responseText });
          yield { type: 'response', content: responseText };
          return;
        }
      } catch (error) {
        const errorMsg = (error as Error).message;
        if (errorMsg.includes('aborted') || signal?.aborted) {
          yield { type: 'error', message: 'Operación cancelada por el usuario' };
        } else {
          yield { type: 'error', message: errorMsg };
        }
        return;
      }
    }
  }

  return {
    // Método con eventos (streaming) y soporte para cancelación
    async *stream(input: string): AsyncGenerator<AgentEvent> {
      currentAbortController = new AbortController();
      try {
        yield* processInput(input, currentAbortController.signal);
      } finally {
        currentAbortController = null;
      }
    },

    // Cancelar la operación actual
    cancel() {
      if (currentAbortController) {
        currentAbortController.abort();
        return true;
      }
      return false;
    },

    // Verificar si hay una operación en curso
    isRunning() {
      return currentAbortController !== null;
    },

    // Método simple (compatibilidad)
    async invoke({ input }: { input: string }): Promise<{ output: string }> {
      let output = '';
      for await (const event of this.stream(input)) {
        if (event.type === 'response') {
          output = event.content;
        } else if (event.type === 'error') {
          output = `Error: ${event.message}`;
        }
      }
      return { output };
    },

    clearHistory() {
      conversationHistory.length = 0;
    },
  };
}
