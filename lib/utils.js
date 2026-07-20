import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export async function ensureDir(filePath) {
  await mkdir(dirname(filePath), { recursive: true });
}

export async function writeToFile(filePath, content) {
  await ensureDir(filePath);
  await writeFile(filePath, content, 'utf-8');
}

/** True if a file or directory already exists at filePath. */
export async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function relativePath(base, filePath) {
  return filePath.replace(base + '/', '');
}

export function formatTree(base, files) {
  const sorted = [...files].sort();
  const lines = [];
  for (let i = 0; i < sorted.length; i++) {
    const isLast = i === sorted.length - 1;
    const rel = relativePath(base, sorted[i]);
    const prefix = isLast ? '  └─ ' : '  ├─ ';
    lines.push(prefix + rel);
  }
  return lines.join('\n');
}
