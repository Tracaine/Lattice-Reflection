import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

for (const [file, allowed] of Object.entries({
  companion: ["./common", "./avatar-speech"],
  inference: ["./common"],
  common: [],
  "avatar-speech": ["./common"],
  backend: ["./common", "./avatar-speech"],
})) {
  const source = readFileSync(new URL(`../packages/contracts/${file}.ts`, import.meta.url), "utf8");
  const imports = ts.preProcessFile(source, true, true).importedFiles;
  for (const { fileName } of imports) assert(allowed.includes(fileName), `${file} imports ${fileName}`);
}
const chat = readFileSync(new URL("../packages/ui/chat/Chat.tsx", import.meta.url), "utf8");
const allowedUi = ["react", "../../contracts/companion", "../../contracts/common", "../../contracts/validation"];
for (const { fileName } of ts.preProcessFile(chat, true, true).importedFiles) {
  assert(allowedUi.includes(fileName), `Chat UI imports ${fileName}`);
}
console.log("Contract and chat UI import boundaries passed");
