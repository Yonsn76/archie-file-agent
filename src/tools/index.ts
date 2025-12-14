import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { promises as fs } from 'node:fs';
import { resolve, join, relative, basename, dirname } from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { glob } from 'glob';
import { CONFIG } from '../config.js';

const execAsync = promisify(exec);

// Utilidad de seguridad: verificar que el path está dentro del directorio permitido
function securePath(inputPath: string): string {
  // Validar que inputPath sea un string válido
  if (inputPath === undefined || inputPath === null || typeof inputPath !== 'string') {
    throw new Error(`Ruta inválida: se esperaba un string pero se recibió ${typeof inputPath}`);
  }
  
  // Normalizar path vacío a directorio actual
  const normalizedPath = inputPath.trim() || '.';
  
  const resolved = resolve(CONFIG.baseDir, normalizedPath);
  if (!resolved.startsWith(CONFIG.baseDir)) {
    throw new Error(`Acceso denegado: ${inputPath} está fuera del directorio permitido`);
  }
  return resolved;
}

// Tool 1: Listar archivos
export const listFilesTool = new DynamicStructuredTool({
  name: 'listar_archivos',
  description: 'Lista archivos y carpetas en un directorio. Usa patron glob para filtrar.',
  schema: z.object({
    directorio: z.string().default('.').describe('Directorio a listar'),
    patron: z.string().default('*').describe('Patron glob (ej: *.txt, **/*.pdf)'),
  }),
  func: async ({ directorio, patron }) => {
    const dir = securePath(directorio || '.');
    
    try {
      // Usar readdir directamente para mayor compatibilidad con Windows
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      // Filtrar por patrón si no es *
      const filteredEntries = patron === '*' || !patron
        ? entries
        : entries.filter(e => {
            const ext = patron.replace('*', '');
            return e.name.endsWith(ext) || e.name.includes(patron.replace('*', ''));
          });
      
      const results = await Promise.all(
        filteredEntries.map(async (entry) => {
          const fullPath = join(dir, entry.name);
          const stat = await fs.stat(fullPath);
          return {
            nombre: entry.name,
            tipo: entry.isDirectory() ? 'DIR' : 'FILE',
            tamaño: entry.isDirectory() ? '-' : `${(stat.size / 1024).toFixed(1)}KB`,
          };
        })
      );
      
      if (results.length === 0) {
        return 'Directorio vacio';
      }
      
      // Formato claro: [TIPO] nombre (tamaño)
      return results.map(r => `[${r.tipo}] ${r.nombre} ${r.tipo === 'FILE' ? `(${r.tamaño})` : ''}`).join('\n');
    } catch (error) {
      return `Error listando directorio: ${(error as Error).message}`;
    }
  },
});

// Tool 2: Leer archivo
export const readFileTool = new DynamicStructuredTool({
  name: 'leer_archivo',
  description: 'Lee el contenido de un archivo de texto',
  schema: z.object({
    archivo: z.string().describe('Ruta del archivo a leer'),
  }),
  func: async ({ archivo }) => {
    const path = securePath(archivo);
    const content = await fs.readFile(path, 'utf-8');
    return content.length > 5000 
      ? content.slice(0, 5000) + '\n... [contenido truncado]'
      : content;
  },
});

// Tool 3: Buscar en archivos
export const searchFilesTool = new DynamicStructuredTool({
  name: 'buscar_en_archivos',
  description: 'Busca texto dentro de archivos. Retorna archivos que contienen el texto.',
  schema: z.object({
    texto: z.string().describe('Texto a buscar'),
    patron: z.string().default('**/*').describe('Patron glob de archivos donde buscar'),
  }),
  func: async ({ texto, patron }) => {
    const pattern = join(CONFIG.baseDir, patron);
    const files = await glob(pattern, { nodir: true });
    const results: { archivo: string; linea: number; contenido: string }[] = [];
    
    for (const file of files.slice(0, 50)) { // Limitar a 50 archivos
      try {
        const content = await fs.readFile(file, 'utf-8');
        const lines = content.split('\n');
        
        lines.forEach((line, idx) => {
          if (line.toLowerCase().includes(texto.toLowerCase())) {
            results.push({
              archivo: relative(CONFIG.baseDir, file),
              linea: idx + 1,
              contenido: line.trim().slice(0, 100),
            });
          }
        });
      } catch {
        // Ignorar archivos binarios o sin permisos
      }
    }
    
    return results.length > 0
      ? JSON.stringify(results.slice(0, 20), null, 2)
      : 'No se encontraron coincidencias';
  },
});

// Tool 4: Mover/Renombrar archivo
export const moveFileTool = new DynamicStructuredTool({
  name: 'mover_archivo',
  description: 'Mueve o renombra un archivo o carpeta',
  schema: z.object({
    origen: z.string().describe('Ruta actual del archivo'),
    destino: z.string().describe('Nueva ruta del archivo'),
  }),
  func: async ({ origen, destino }) => {
    const from = securePath(origen);
    const to = securePath(destino);
    
    // Crear directorio destino si no existe
    await fs.mkdir(dirname(to), { recursive: true });
    await fs.rename(from, to);
    
    return `Movido: ${origen} → ${destino}`;
  },
});

// Tool 5: Crear carpeta
export const createFolderTool = new DynamicStructuredTool({
  name: 'crear_carpeta',
  description: 'Crea una nueva carpeta',
  schema: z.object({
    ruta: z.string().describe('Ruta de la carpeta a crear'),
  }),
  func: async ({ ruta }) => {
    const path = securePath(ruta);
    await fs.mkdir(path, { recursive: true });
    return `Carpeta creada: ${ruta}`;
  },
});

// Tool 6: Eliminar archivo
export const deleteFileTool = new DynamicStructuredTool({
  name: 'eliminar_archivo',
  description: 'Elimina un archivo o carpeta vacía. USAR CON CUIDADO.',
  schema: z.object({
    ruta: z.string().describe('Ruta del archivo a eliminar'),
    confirmar: z.boolean().describe('Debe ser true para confirmar eliminación'),
  }),
  func: async ({ ruta, confirmar }) => {
    if (!confirmar) {
      return 'Eliminación cancelada. Debes confirmar con confirmar=true';
    }
    
    const path = securePath(ruta);
    const stat = await fs.stat(path);
    
    if (stat.isDirectory()) {
      await fs.rmdir(path); // Solo carpetas vacías
    } else {
      await fs.unlink(path);
    }
    
    return `Eliminado: ${ruta}`;
  },
});

// Tool 7: Info del archivo
export const fileInfoTool = new DynamicStructuredTool({
  name: 'info_archivo',
  description: 'Obtiene información detallada de un archivo',
  schema: z.object({
    archivo: z.string().describe('Ruta del archivo'),
  }),
  func: async ({ archivo }) => {
    const path = securePath(archivo);
    const stat = await fs.stat(path);
    
    return JSON.stringify({
      nombre: basename(path),
      ruta: relative(CONFIG.baseDir, path),
      tipo: stat.isDirectory() ? 'carpeta' : 'archivo',
      tamaño: `${(stat.size / 1024).toFixed(2)} KB`,
      creado: stat.birthtime.toISOString(),
      modificado: stat.mtime.toISOString(),
      permisos: stat.mode.toString(8),
    }, null, 2);
  },
});

// Tool 8: Listar directorio extra
export const listExtraDirTool = new DynamicStructuredTool({
  name: 'listar_directorio_extra',
  description: 'Lista archivos en el directorio extra configurado (EXTRA_READ_DIR)',
  schema: z.object({
    patron: z.string().default('*').describe('Patron glob (ej: *.pdf, *.zip)'),
    limite: z.number().default(20).describe('Número máximo de archivos a mostrar'),
  }),
  func: async ({ patron, limite }) => {
    if (!CONFIG.extraReadDir) {
      return 'No hay directorio extra configurado. Configura EXTRA_READ_DIR en .env';
    }
    
    const pattern = join(CONFIG.extraReadDir, patron);
    const files = await glob(pattern, { nodir: true });
    
    const results = await Promise.all(
      files.slice(0, limite).map(async (file) => {
        const stat = await fs.stat(file);
        return {
          nombre: basename(file),
          tamaño: `${(stat.size / 1024 / 1024).toFixed(2)} MB`,
          modificado: stat.mtime.toLocaleDateString(),
        };
      })
    );
    
    // Ordenar por fecha de modificación (más recientes primero)
    results.sort((a, b) => new Date(b.modificado).getTime() - new Date(a.modificado).getTime());
    
    return JSON.stringify(results, null, 2);
  },
});

// Tool 9: Copiar desde directorio extra
export const copyFromExtraDirTool = new DynamicStructuredTool({
  name: 'copiar_desde_extra',
  description: 'Copia un archivo desde el directorio extra al directorio de trabajo',
  schema: z.object({
    archivo: z.string().describe('Nombre del archivo en el directorio extra'),
    destino: z.string().default('.').describe('Carpeta destino en el sandbox'),
  }),
  func: async ({ archivo, destino }) => {
    if (!CONFIG.extraReadDir) {
      return 'No hay directorio extra configurado. Configura EXTRA_READ_DIR en .env';
    }
    
    const source = join(CONFIG.extraReadDir, archivo);
    const dest = securePath(join(destino, archivo));
    
    // Verificar que el archivo existe
    await fs.access(source);
    
    // Crear directorio destino si no existe
    await fs.mkdir(dirname(dest), { recursive: true });
    
    // Copiar archivo
    await fs.copyFile(source, dest);
    
    return `Copiado: ${archivo} → ${relative(CONFIG.baseDir, dest)}`;
  },
});

// Tool 10: Ejecutar comando shell (limitado)
export const shellCommandTool = new DynamicStructuredTool({
  name: 'ejecutar_comando',
  description: `Ejecuta un comando shell seguro. Comandos permitidos: ${CONFIG.allowedCommands.join(', ')}`,
  schema: z.object({
    comando: z.string().describe('Comando a ejecutar'),
    directorio: z.string().default('.').describe('Directorio donde ejecutar'),
  }),
  func: async ({ comando, directorio }) => {
    // Extraer el comando base
    const baseCommand = comando.split(' ')[0].toLowerCase();
    
    // Verificar que el comando está permitido
    if (!CONFIG.allowedCommands.includes(baseCommand)) {
      return `Comando no permitido: ${baseCommand}. Permitidos: ${CONFIG.allowedCommands.join(', ')}`;
    }
    
    const cwd = securePath(directorio);
    
    try {
      const { stdout, stderr } = await execAsync(comando, { 
        cwd,
        timeout: 30000, // 30 segundos máximo
        maxBuffer: 1024 * 1024, // 1MB máximo de output
      });
      
      const output = stdout || stderr;
      return output.length > 3000 
        ? output.slice(0, 3000) + '\n... [output truncado]'
        : output || 'Comando ejecutado sin output';
    } catch (error) {
      return `Error: ${(error as Error).message}`;
    }
  },
});

// Tool 11: Crear archivo
export const createFileTool = new DynamicStructuredTool({
  name: 'crear_archivo',
  description: 'Crea un nuevo archivo con el contenido especificado',
  schema: z.object({
    nombre: z.string().describe('Nombre del archivo (ej: notas.txt, documento.md)'),
    contenido: z.string().describe('Contenido del archivo'),
  }),
  func: async ({ nombre, contenido }) => {
    const path = securePath(nombre);
    
    // Crear directorio si no existe
    await fs.mkdir(dirname(path), { recursive: true });
    
    // Escribir archivo
    await fs.writeFile(path, contenido, 'utf-8');
    
    const stat = await fs.stat(path);
    return `Archivo creado: ${nombre} (${(stat.size / 1024).toFixed(1)} KB)`;
  },
});

// Tool 12: Descargar archivo desde URL
export const downloadFileTool = new DynamicStructuredTool({
  name: 'descargar_archivo',
  description: 'Descarga un archivo desde una URL al directorio de trabajo',
  schema: z.object({
    url: z.string().url().describe('URL del archivo a descargar'),
    nombre: z.string().optional().describe('Nombre para guardar el archivo (opcional)'),
  }),
  func: async ({ url, nombre }) => {
    // Extraer nombre del archivo de la URL si no se proporciona
    const fileName = nombre || basename(new URL(url).pathname) || 'descarga';
    const destPath = securePath(fileName);
    
    try {
      // Usar fetch nativo de Node.js 18+
      const response = await fetch(url);
      
      if (!response.ok) {
        return `Error: HTTP ${response.status} - ${response.statusText}`;
      }
      
      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(destPath, buffer);
      
      const stat = await fs.stat(destPath);
      return `Descargado: ${fileName} (${(stat.size / 1024).toFixed(1)} KB)`;
    } catch (error) {
      return `Error descargando: ${(error as Error).message}`;
    }
  },
});

// Exportar todas las tools
export const allTools = [
  listFilesTool,
  readFileTool,
  searchFilesTool,
  moveFileTool,
  createFolderTool,
  createFileTool,
  deleteFileTool,
  fileInfoTool,
  listExtraDirTool,
  copyFromExtraDirTool,
  shellCommandTool,
  downloadFileTool,
];
