import { app, BrowserWindow, shell } from "electron";
import path from "node:path";
import { existsSync } from "node:fs";
import { DESKTOP_AUTH_CSS } from "./auth-styles";

const DEFAULT_APP_URL = "https://omnichat.wtf/";
const APP_URL = (process.env.OMNICHAT_APP_URL ?? DEFAULT_APP_URL).trim();

function appIconPath(): string | undefined {
  const ico = path.join(__dirname, "..", "resources", "icon.ico");
  const png = path.join(__dirname, "..", "resources", "icon.png");
  if (existsSync(ico)) return ico;
  if (existsSync(png)) return png;
  return undefined;
}

/** Hostnames that may navigate inside the app window (OAuth + app). */
const IN_APP_HOSTS = new Set([
  "omnichat.wtf",
  "www.omnichat.wtf",
  "localhost",
  "127.0.0.1",
  "id.twitch.tv",
  "www.twitch.tv",
  "twitch.tv",
  "kick.com",
  "www.kick.com",
  "twitter.com",
  "www.twitter.com",
  "x.com",
  "www.x.com",
  "accounts.google.com",
]);

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function staysInApp(url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  if (IN_APP_HOSTS.has(host)) return true;
  if (host.endsWith(".vercel.app")) return true;
  return false;
}

function injectDesktopStyles(win: BrowserWindow): void {
  void win.webContents.insertCSS(DESKTOP_AUTH_CSS);
}

function createWindow(): BrowserWindow {
  const icon = appIconPath();
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "OMnichat",
    icon,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (staysInApp(url)) {
      return { action: "allow" };
    }
    void shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (!staysInApp(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  win.webContents.on("did-finish-load", () => {
    injectDesktopStyles(win);
  });

  void win.loadURL(APP_URL);
  return win;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    if (process.platform === "win32") {
      app.setAppUserModelId("wtf.omnichat.app");
    }
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
