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
    if (!path.extname(rel)) {
      if (fs.existsSync(abs + '.ts')) target = rel + '.ts';
      else if (fs.existsSync(abs + '.tsx')) target = rel + '.tsx';
      else if (fs.existsSync(path.join(abs, 'index.ts'))) target = rel + '/index.ts';
    }
    return next(rootUrl + target, context);
  }
  return next(specifier, context);
}
