import { app, BrowserWindow, ipcMain, MessageChannelMain, net, protocol, session, utilityProcess } from "electron";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const origin = "companion://app";
const auditPath = process.env.OPEN_COMPANION_NETWORK_AUDIT;
if (process.env.OPEN_COMPANION_TEST_DATA) app.setPath("userData", process.env.OPEN_COMPANION_TEST_DATA);
app.commandLine.appendSwitch("disable-background-networking");
protocol.registerSchemesAsPrivileged([{ scheme: "companion", privileges: { standard: true, secure: true } }]);

if (!app.requestSingleInstanceLock()) app.quit();
else void app.whenReady().then(() => {
  protocol.handle("companion", request => {
    const path = new URL(request.url).pathname;
    if (!["/index.html", "/renderer.js", "/style.css"].includes(path)) return new Response(null, { status: 404 });
    return net.fetch(pathToFileURL(join(__dirname, path.slice(1))).href);
  });
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, respond) => respond(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] }, (request, callback) => {
    if (auditPath) appendFileSync(auditPath, request.method + " " + new URL(request.url).origin + "\n");
    callback({ cancel: true });
  });
  if (auditPath) appendFileSync(auditPath, "");
  const window = new BrowserWindow({
    width: 900, height: 700,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, preload: join(__dirname, "preload.cjs") },
  });
  const broker = utilityProcess.fork(join(__dirname, "broker.cjs"), [join(app.getPath("userData"), "companion.sqlite")]);
  window.webContents.on("will-navigate", event => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  let connected = false;
  ipcMain.on("companion:connect", event => {
    if (connected || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame ||
      event.senderFrame?.url !== origin + "/index.html") return;
    connected = true;
    const { port1, port2 } = new MessageChannelMain();
    broker.postMessage("connect", [port1]);
    window.webContents.postMessage("companion:port", null, [port2]);
  });
  broker.on("exit", () => { if (!window.isDestroyed()) window.webContents.send("companion:lost"); });
  window.on("closed", () => { broker.kill(); });
  void window.loadURL(origin + "/index.html");
});
app.on("window-all-closed", () => app.quit());
