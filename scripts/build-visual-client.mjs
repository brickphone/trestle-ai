import { build } from "vite";
import { fileURLToPath } from "node:url";

// Reuse the installed test bundler. This entry is never served by the application.
await build({
  configFile: false,
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  define: { "process.env.NODE_ENV": JSON.stringify("production"), "process.env": "{}" },
  esbuild: { jsx: "automatic" },
  build: {
    outDir: ".visual/client",
    emptyOutDir: true,
    rolldownOptions: {
      input: "e2e/visual-client.tsx",
      output: { entryFileNames: "entry.js", codeSplitting: false },
    },
  },
  logLevel: "error",
});
