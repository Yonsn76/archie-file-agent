# Archie File Agent

TypeScript CLI agent for file operations using Ollama LLM.

## Structure

| File | Description |
|------|-------------|
| `src/index.ts` | Entry point, readline loop, key listener |
| `src/agent.ts` | LLM integration, tool execution loop, cancellation support |
| `src/config.ts` | Environment configuration |
| `src/tools/index.ts` | Tool definitions with Zod schemas |
| `src/ui.ts` | Terminal UI (ora spinners, chalk colors) |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OLLAMA_BASE_URL` | Yes | Ollama server URL |
| `OLLAMA_MODEL` | Yes | Model name |
| `ARCHIE_BASE_DIR` | Yes | Working directory (read/write) |
| `EXTRA_READ_DIR` | No | Additional directory (read-only) |

## Tools

| Tool | Params | Action |
|------|--------|--------|
| listar_archivos | directorio, patron | List files |
| leer_archivo | archivo | Read file |
| crear_archivo | nombre, contenido | Create file |
| mover_archivo | origen, destino | Move/rename |
| crear_carpeta | ruta | Create directory |
| eliminar_archivo | ruta, confirmar | Delete |
| buscar_en_archivos | texto, patron | Search in files |
| info_archivo | archivo | File metadata |
| listar_directorio_extra | patron, limite | List EXTRA_READ_DIR |
| copiar_desde_extra | archivo, destino | Copy from extra |
| ejecutar_comando | comando, directorio | Shell (limited) |
| descargar_archivo | url, nombre | Download URL |

## Tool Format

```
[TOOL: tool_name]
param1: value1
param2: value2
[/TOOL]
```

## Agent Loop

1. User input -> conversationHistory
2. LLM call with system prompt + history
3. Parse response for `[TOOL:...]`
4. If tool found: execute, add result to history, continue loop
5. If no tool: return response to user
6. Supports cancellation via AbortController

## Security

- `securePath()` validates all paths stay within ARCHIE_BASE_DIR
- Shell commands limited to: dir, ls, type, cat, find, where, echo, curl, wget
- Parameter validation before tool execution

## Build

```bash
npm install
npm run build
npm run dev
```

## Configuration

Use `configurar.bat` for interactive setup or edit `.env` manually.
