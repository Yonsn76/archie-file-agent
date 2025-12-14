import 'dotenv/config';
import { resolve } from 'node:path';

export const CONFIG = {
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL!,
    model: process.env.OLLAMA_MODEL!,
  },
  baseDir: resolve(process.env.ARCHIE_BASE_DIR!),
  extraReadDir: process.env.EXTRA_READ_DIR || '',
  allowedCommands: ['dir', 'ls', 'type', 'cat', 'find', 'where', 'echo', 'curl', 'wget'],
};
