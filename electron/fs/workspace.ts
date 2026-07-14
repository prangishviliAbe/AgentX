import {
  readdir,
  readFile,
  writeFile,
  stat,
  mkdir,
} from "node:fs/promises";
import path from "node:path";

const IGNORE = new Set([
  "node_modules",
  ".git",
  "dist",
  "dist-electron",
  "release",
  ".next",
  "coverage",
  ".cache",
  "__pycache__",
  ".turbo",
  ".venv",
  "venv",
]);

export type FileNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
};

export async function listTree(
  root: string,
  maxDepth = 6,
  currentDepth = 0,
): Promise<FileNode[]> {
  if (currentDepth >= maxDepth) return [];

  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const nodes: FileNode[] = [];

  const sorted = entries
    .filter((e) => !IGNORE.has(e.name) && !e.name.startsWith("."))
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  for (const entry of sorted) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const children = await listTree(full, maxDepth, currentDepth + 1);
      nodes.push({
        name: entry.name,
        path: full,
        type: "directory",
        children,
      });
    } else if (entry.isFile()) {
      nodes.push({
        name: entry.name,
        path: full,
        type: "file",
      });
    }
  }

  return nodes;
}

export async function readTextFile(filePath: string): Promise<string> {
  const buf = await readFile(filePath);
  // Guard huge files in editor
  if (buf.byteLength > 2_000_000) {
    throw new Error("File too large to open in editor (>2MB)");
  }
  return buf.toString("utf8");
}

export async function writeTextFile(
  filePath: string,
  content: string,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}
