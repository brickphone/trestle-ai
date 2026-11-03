import { readFile, readdir } from "node:fs/promises";

// Grep the shipped JS/CSS rather than package names alone: dependencies may be transitive.
const forbidden = /\bInter\b|lucide(?:-react)?/i;
async function scan(directory) {
  let count = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) count += await scan(path);
    else if (/\.(js|css)$/.test(entry.name)) {
      if (forbidden.test(await readFile(path, "utf8")))
        throw new Error(`Forbidden font or icon family in build: ${path}`);
      count++;
    }
  }
  return count;
}
const files = (await scan(".next/static")) + (await scan(".next/server"));
console.log(`Visual build check: ${files} JS/CSS files scanned; no Inter or Lucide.`);
