import { contextBridge } from "electron";

document.documentElement.dataset.omnichatApp = "desktop";

contextBridge.exposeInMainWorld("omnichatDesktop", { platform: process.platform });
