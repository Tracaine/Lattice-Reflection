import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const desktop = resolve(fileURLToPath(new URL("../../apps/desktop/", import.meta.url)));
const requireDesktop = createRequire(new URL("../../apps/desktop/package.json", import.meta.url));

test("streams a scripted reply, persists it across restart, and makes no web requests", async () => {
  const dir = await mkdtemp(join(tmpdir(), "open-companion-desktop-"));
  const audit = join(dir, "network.log");
  const launch = () => electron.launch({
    executablePath: requireDesktop("electron") as string,
    args: [desktop],
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
      OPEN_COMPANION_TEST_DATA: dir, OPEN_COMPANION_NETWORK_AUDIT: audit,
    },
  });
  try {
    let app = await launch();
    try {
      const page = await app.firstWindow();
      const message = page.getByRole("textbox", { name: "Message" });
      await page.getByRole("heading", { name: "Open Companion" }).waitFor();
      await page.evaluate(() => {
        const transcript = document.querySelector("ol");
        if (!transcript) throw new Error("Transcript missing");
        const observer = new MutationObserver(() => {
          if (transcript.lastElementChild?.querySelector("p")?.textContent === "Hello. ") {
            transcript.dataset.sawPartial = "true";
          }
        });
        observer.observe(transcript, { childList: true, characterData: true, subtree: true });
      });
      await message.fill("Test offline conversation");
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByText("Hello. This is an offline mock reply.")).toBeVisible();
      await expect(page.locator("ol")).toHaveAttribute("data-saw-partial", "true");
    } finally {
      await app.close();
    }
    app = await launch();
    try {
      const page = await app.firstWindow();
      await expect(page.getByText("Test offline conversation")).toBeVisible();
      await expect(page.getByText("Hello. This is an offline mock reply.")).toBeVisible();
      expect(await readFile(audit, "utf8")).toBe("");
    } finally {
      await app.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
