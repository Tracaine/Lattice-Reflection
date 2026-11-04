import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const dist = new URL("./dist/", import.meta.url);
await mkdir(dist, { recursive: true });
const workingDir = fileURLToPath(new URL(".", import.meta.url));
await Promise.all([
  build({
    absWorkingDir: workingDir,
    entryPoints: { main: "src/main.ts", broker: "src/broker.ts", preload: "src/preload.ts" },
    outdir: "dist", outExtension: { ".js": ".cjs" }, bundle: true, platform: "node",
    target: "node24", external: ["electron", "better-sqlite3"],
  }),
  build({
    absWorkingDir: workingDir, entryPoints: ["src/renderer.tsx"], outfile: "dist/renderer.js",
    bundle: true, platform: "browser", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
  }),
  ...["index.html", "style.css"].map(name => copyFile(new URL("src/" + name, import.meta.url), new URL(name, dist))),
]);
