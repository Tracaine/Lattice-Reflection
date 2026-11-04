import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("companionHost", {
  connect() {
    ipcRenderer.once("companion:port", event => {
      window.postMessage("companion:port", "companion://app", event.ports);
    });
    ipcRenderer.once("companion:lost", () => {
      window.postMessage("companion:lost", "companion://app");
    });
    ipcRenderer.send("companion:connect");
  },
});
