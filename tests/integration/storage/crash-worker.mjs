import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (error.code !== "ERR_MODULE_NOT_FOUND" && error.code !== "ERR_UNSUPPORTED_DIR_IMPORT") throw error;
      if (!specifier.startsWith(".")) throw error;
      return next(specifier.endsWith("/storage") ? specifier + "/index.ts" : specifier + ".ts", context);
    }
  },
});
const { input, seeded } = await import("./fixture.ts");
const [, , path, crash] = process.argv;
const kill = () => process.kill(process.pid, "SIGKILL");
const store = seeded(path, point => {
  if (crash === "before-" + point) kill();
});
const accepted = store.accept(input);
if (crash === "after-accept") kill();
store.checkpoint(accepted.turnId, 1, "Partial.");
if (crash === "after-checkpoint") kill();
throw new Error("Crash point was not reached");
