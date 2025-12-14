import { createInterface } from 'readline';
import { createArchieAgent } from './agent.js';
import { CONFIG } from './config.js';
import { promises as fs } from 'fs';
import * as ui from './ui.js';

async function ensureSandbox() {
  try {
    await fs.mkdir(CONFIG.baseDir, { recursive: true });
    const files = await fs.readdir(CONFIG.baseDir);
    if (files.length === 0) {
      await fs.writeFile(
        `${CONFIG.baseDir}/bienvenido.txt`,
        'Hola! Este es tu sandbox de Archie.\nPuedes crear, mover y organizar archivos aquí.'
      );
      await fs.mkdir(`${CONFIG.baseDir}/documentos`, { recursive: true });
      await fs.mkdir(`${CONFIG.baseDir}/proyectos`, { recursive: true });
    }
  } catch (error) {
    ui.printError(`Error creando sandbox: ${(error as Error).message}`);
  }
}

// Configurar listener de teclas para cancelar
function setupKeyListener(agent: Awaited<ReturnType<typeof createArchieAgent>>) {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', (key: string) => {
    // Ctrl+C - salir
    if (key === '\u0003') {
      ui.printGoodbye();
      process.exit();
    }
    
    // 'c' o 'C' - cancelar operación actual
    if ((key === 'c' || key === 'C') && agent.isRunning()) {
      const cancelled = agent.cancel();
      if (cancelled) {
        ui.stopSpinner();
        console.log('\n  ⚠ Cancelando operación...\n');
      }
    }
  });
}

// Restaurar modo normal para input
function enableLineMode() {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
}

// Volver a modo raw para escuchar teclas
function enableRawMode() {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
}

async function main() {
  // Mostrar logo y configuración
  ui.printLogo();
  await ensureSandbox();
  ui.printConfig(CONFIG.baseDir, CONFIG.ollama.model, CONFIG.extraReadDir);

  // Crear agente
  ui.startThinking('Initializing agent...');
  
  const agent = await createArchieAgent();
  
  ui.stopSpinner();
  ui.printStep('Agent ready', 'done');
  
  // Mostrar hint de cancelación
  console.log('  💡 Presiona [C] durante una operación para cancelarla\n');

  // Configurar listener de teclas
  setupKeyListener(agent);

  // Función para leer input del usuario
  function question(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      // Cambiar a modo línea para input
      enableLineMode();
      
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question(prompt, (answer) => {
        rl.close();
        // Volver a modo raw para escuchar 'c'
        enableRawMode();
        resolve(answer);
      });
    });
  }

  // Loop principal
  while (true) {
    const input = await question(ui.getUserPrompt());
    const trimmed = input.trim();

    if (!trimmed) {
      continue;
    }

    if (trimmed.toLowerCase() === 'salir' || trimmed.toLowerCase() === 'exit') {
      ui.printGoodbye();
      break;
    }

    if (trimmed.toLowerCase() === 'limpiar' || trimmed.toLowerCase() === 'clear') {
      agent.clearHistory();
      console.log('\n  ✓ Historial limpiado\n');
      continue;
    }

    try {
      // Procesar con streaming de eventos
      for await (const event of agent.stream(trimmed)) {
        switch (event.type) {
          case 'thinking':
            ui.startThinking(event.message || 'Thinking...');
            break;

          case 'tool_start':
            ui.startToolExecution(event.tool, event.params);
            break;

          case 'tool_end':
            ui.toolComplete(event.tool, event.success, event.duration);
            // Mostrar preview del resultado
            if (event.result && event.result.length < 800) {
              ui.printToolResult(event.tool, event.result);
            }
            break;

          case 'response':
            ui.printAssistantMessage(event.content);
            break;

          case 'error':
            ui.printError(event.message);
            break;
        }
      }
    } catch (error) {
      ui.printError((error as Error).message);
    }
  }
  
  process.exit(0);
}

main().catch(error => {
  ui.printError(error.message);
  process.exit(1);
});
