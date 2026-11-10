// Loader hook para resolver el alias "@/..." de tsconfig cuando se corren scripts sueltos con node.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(process.cwd());
const rootUrl = pathToFileURL(root + '/').href;

export function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const rel = specifier.slice(2);
    const abs = path.join(root, rel);
    let target = rel;
    if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      if (fs.existsSync(abs + '.ts')) target = rel + '.ts';
      else if (fs.existsSync(abs + '.tsx')) target = rel + '.tsx';
      else if (fs.existsSync(path.join(abs, 'index.ts'))) target = rel + '/index.ts';
    }
    return next(rootUrl + target, context);
  }
  // Imports relativos sin extensión dentro de archivos .ts (ej. './costo-receta-pp')
  if (specifier.startsWith('.') && context.parentURL?.endsWith('.ts') && !fs.existsSync(new URL(specifier, context.parentURL))) {
    const url = new URL(specifier, context.parentURL);
    for (const ext of ['.ts', '.tsx']) {
      if (fs.existsSync(new URL(url.href + ext))) return next(url.href + ext, context);
    }
  }
  return next(specifier, context);
}
