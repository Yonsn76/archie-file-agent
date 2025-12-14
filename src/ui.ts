import chalk from 'chalk';
import ora, { Ora } from 'ora';

// Iconos de texto (sin emojis)
const icons = {
  folder: '[DIR]',
  file: '[FILE]',
  check: '[OK]',
  cross: '[X]',
  arrow: '->',
  bullet: '*',
  tool: '[TOOL]',
  thinking: '[...]',
  user: '>',
  bot: 'Archie:',
  info: '[i]',
  warn: '[!]',
  error: '[ERR]',
};

// Colores del tema
const theme = {
  primary: chalk.cyan,
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  muted: chalk.gray,
  tool: chalk.magenta,
  user: chalk.blue,
  assistant: chalk.greenBright,
  highlight: chalk.white.bold,
};

// Spinner global
let currentSpinner: Ora | null = null;

// Logo ASCII minimalista
export function printLogo() {
  console.log(theme.primary(`
    _             _     _      
   / \\   _ __ ___| |__ (_) ___ 
  / _ \\ | '__/ __| '_ \\| |/ _ \\
 / ___ \\| | | (__| | | | |  __/
/_/   \\_\\_|  \\___|_| |_|_|\\___|
`));
  console.log(theme.muted('  File Assistant v1.0\n'));
}

// Mostrar configuración
export function printConfig(baseDir: string, model: string, extraDir?: string) {
  const line = theme.muted('-'.repeat(50));
  console.log(line);
  console.log(`  ${theme.muted(icons.folder)} Base: ${theme.highlight(baseDir)}`);
  console.log(`  ${theme.muted(icons.info)} Model: ${theme.highlight(model)}`);
  if (extraDir) {
    console.log(`  ${theme.muted(icons.folder)} Extra: ${theme.highlight(extraDir)}`);
  }
  console.log(line);
  console.log(theme.muted('  Type "exit" to quit | "clear" to reset\n'));
}

// Iniciar spinner de pensamiento
export function startThinking(message: string = 'Thinking') {
  stopSpinner();
  currentSpinner = ora({
    text: theme.muted(message),
    spinner: 'dots',
    color: 'cyan',
  }).start();
}

// Actualizar spinner
export function updateSpinner(text: string) {
  if (currentSpinner) {
    currentSpinner.text = theme.muted(text);
  }
}

// Mostrar que se está ejecutando una herramienta
export function startToolExecution(toolName: string, params?: Record<string, string>) {
  stopSpinner();
  
  // Mostrar herramienta con parámetros
  let paramStr = '';
  if (params && Object.keys(params).length > 0) {
    const shortParams = Object.entries(params)
      .map(([k, v]) => `${k}=${v.length > 20 ? v.slice(0, 20) + '...' : v}`)
      .join(', ');
    paramStr = theme.muted(` (${shortParams})`);
  }
  
  currentSpinner = ora({
    text: `${theme.tool(icons.tool)} ${theme.tool(toolName)}${paramStr}`,
    spinner: 'dots2',
    color: 'magenta',
  }).start();
}

// Herramienta completada
export function toolComplete(toolName: string, success: boolean = true, duration?: number) {
  if (currentSpinner) {
    const durationStr = duration ? theme.muted(` (${duration}ms)`) : '';
    if (success) {
      currentSpinner.succeed(`${theme.tool(toolName)} ${theme.success(icons.check)}${durationStr}`);
    } else {
      currentSpinner.fail(`${theme.tool(toolName)} ${theme.error(icons.cross)}${durationStr}`);
    }
    currentSpinner = null;
  }
}

// Detener spinner
export function stopSpinner() {
  if (currentSpinner) {
    currentSpinner.stop();
    currentSpinner = null;
  }
}

// Mostrar resultado de herramienta
export function printToolResult(toolName: string, result: string, collapsed: boolean = true) {
  const lines = result.split('\n');
  const maxLines = collapsed ? 8 : lines.length;
  
  console.log(theme.muted(`  |`));
  lines.slice(0, maxLines).forEach(line => {
    console.log(theme.muted(`  | `) + line);
  });
  
  if (lines.length > maxLines) {
    console.log(theme.muted(`  | ... +${lines.length - maxLines} more lines`));
  }
  console.log(theme.muted(`  |`));
}

// Mostrar respuesta del asistente (streaming simulado)
export function printAssistantMessage(message: string) {
  stopSpinner();
  console.log();
  console.log(theme.assistant(icons.bot));
  
  // Formatear mensaje
  const lines = message.split('\n');
  lines.forEach(line => {
    console.log(`  ${line}`);
  });
  console.log();
}

// Streaming de texto caracter por caracter (para efecto visual)
export async function streamText(text: string, delay: number = 5): Promise<void> {
  for (const char of text) {
    process.stdout.write(char);
    if (delay > 0) {
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// Mostrar error
export function printError(error: string) {
  stopSpinner();
  console.log();
  console.log(`${theme.error(icons.error)} ${theme.error(error)}`);
  console.log();
}

// Prompt del usuario
export function getUserPrompt(): string {
  return `\n${theme.user(icons.user)} `;
}

// Mensaje de despedida
export function printGoodbye() {
  console.log(theme.primary('\n  Goodbye!\n'));
}

// Mostrar paso del proceso
export function printStep(step: string, status: 'start' | 'done' | 'error' = 'start') {
  const statusIcon = status === 'done' ? theme.success(icons.check) 
    : status === 'error' ? theme.error(icons.cross) 
    : theme.muted(icons.arrow);
  console.log(`  ${statusIcon} ${step}`);
}

// Box para información importante
export function printBox(title: string, content: string) {
  const width = 48;
  const line = '-'.repeat(width);
  
  console.log(theme.muted(`  +${line}+`));
  console.log(theme.muted(`  |`) + theme.highlight(` ${title.padEnd(width - 1)}`) + theme.muted(`|`));
  console.log(theme.muted(`  +${line}+`));
  
  content.split('\n').forEach(l => {
    console.log(theme.muted(`  |`) + ` ${l.padEnd(width - 1)}` + theme.muted(`|`));
  });
  
  console.log(theme.muted(`  +${line}+`));
}
