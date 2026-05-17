const { app, BrowserWindow, Menu, ipcMain, shell, dialog, Tray } = require("electron");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");
const { pathToFileURL } = require("url");

const APP_PORT = 8000;
const APP_URL = `http://127.0.0.1:${APP_PORT}`;
const HEALTH_URL = `${APP_URL}/api/health`;
const HEALTH_TIMEOUT_MS = 30000;
const HEALTH_INTERVAL_MS = 100;
const SERVER_STOP_TIMEOUT_MS = 5000;
const APP_ICON_PATH = path.join(__dirname, "assets", "icon.ico");
const APP_ID = "com.monitoringhub.desktop";
const APP_NAME = "Monitoring Hub";
const DESKTOP_IPC_PIPE = "\\\\.\\pipe\\monitoring-hub-desktop-ipc";
const DESKTOP_IPC_SHOW_DEBOUNCE_MS = 250;
const EXPECTED_DESKTOP_IPC_ERROR_CODES = new Set(["EPIPE", "ECONNRESET", "ECONNREFUSED", "ENOENT"]);
const CLOCK_IMAGE_WIDTH = 1920;
const CLOCK_IMAGE_MAX_HEIGHT = 30000;

// O single instance lock do Electron usa dados da aplicacao. Em portable,
// fixe o userData antes do lock para evitar locks separados por extracao temp.
app.setName(APP_NAME);
app.setAppUserModelId(APP_ID);
app.setPath("userData", path.join(app.getPath("appData"), APP_NAME));

const startupStartedAt = Date.now();
const startupEvents = [];
let mainWindow = null;
let splashWindow = null;
let serverModule = null;
let serverInstance = null;
let tray = null;
let appPreferences = null;
let desktopIpcServer = null;
let pendingShowFromSecondInstance = false;
let lastShowMainWindowAt = 0;
let isQuitting = false;
let stopServerPromise = null;
let isExplicitQuit = false;

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
}

function isExpectedDesktopIpcError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return (
    EXPECTED_DESKTOP_IPC_ERROR_CODES.has(code) ||
    message.includes("pipe") ||
    message.includes("socket") ||
    message.includes("disconnected")
  );
}

function logDesktopIpcError(event, error) {
  const payload = sanitizeErrorForLog(error);
  if (isExpectedDesktopIpcError(error)) {
    startupLog(event, { handled: true, ...payload });
    return;
  }

  console.error(event, payload);
}

function notifyExistingDesktopInstance() {
  return new Promise((resolve) => {
    const client = net.createConnection(DESKTOP_IPC_PIPE);
    let finished = false;

    const finish = (notified) => {
      if (finished) {
        return;
      }
      finished = true;
      client.destroy();
      resolve(notified);
    };

    client.once("connect", () => {
      if (client.destroyed || !client.writable) {
        startupLog("desktop_ipc_client_not_writable");
        finish(false);
        return;
      }

      startupLog("desktop_ipc_client_connected");
      try {
        client.write("show", () => {
          startupLog("desktop_ipc_notification_sent");
          finish(true);
        });
      } catch (error) {
        logDesktopIpcError("desktop_ipc_client_write_error", error);
        finish(false);
      }
    });

    client.once("error", (error) => {
      logDesktopIpcError("desktop_ipc_client_error", error);
      finish(false);
    });
    client.once("close", () => {
      if (!finished) {
        startupLog("desktop_ipc_client_closed_before_finish");
        finish(false);
      }
    });
    client.setTimeout(700, () => {
      startupLog("desktop_ipc_client_timeout");
      finish(false);
    });
  });
}

function startDesktopIpcServer() {
  if (desktopIpcServer) {
    return;
  }

  desktopIpcServer = net.createServer((socket) => {
    socket.setEncoding("utf8");
    socket.setTimeout(1000);

    const replyAndClose = () => {
      if (socket.destroyed || !socket.writable) {
        startupLog("desktop_ipc_socket_not_writable");
        return;
      }

      try {
        socket.end("ok", () => {
          startupLog("desktop_ipc_socket_replied");
        });
      } catch (error) {
        logDesktopIpcError("desktop_ipc_socket_write_error", error);
        socket.destroy();
      }
    };

    socket.on("error", (error) => {
      logDesktopIpcError("desktop_ipc_socket_error", error);
    });
    socket.on("timeout", () => {
      startupLog("desktop_ipc_socket_timeout");
      socket.destroy();
    });
    socket.on("close", (hadError) => {
      if (hadError) {
        startupLog("desktop_ipc_socket_closed_after_error");
      }
    });

    socket.on("data", (message) => {
      if (String(message || "").trim() === "show") {
        startupLog("desktop_ipc_show_requested");
        showMainWindow();
      }
      replyAndClose();
    });
  });

  desktopIpcServer.on("error", (error) => {
    logDesktopIpcError("desktop_ipc_server_error", error);
  });

  desktopIpcServer.listen(DESKTOP_IPC_PIPE, () => {
    startupLog("desktop_ipc_server_started");
  });
}

function stopDesktopIpcServer() {
  return new Promise((resolve) => {
    if (!desktopIpcServer) {
      resolve();
      return;
    }

    desktopIpcServer.close(() => {
      desktopIpcServer = null;
      resolve();
    });
  });
}

function sanitizeErrorForLog(error) {
  return {
    name: error?.name || "Error",
    message: String(error?.message || "Erro sem mensagem."),
    code: error?.code,
  };
}

function getStartupElapsedMs() {
  return Date.now() - startupStartedAt;
}

function appendStartupLogLine(line) {
  const logPath = process.env.PAINEL_STARTUP_LOG_PATH;
  if (!logPath) {
    return;
  }

  try {
    fs.appendFileSync(logPath, `${line}\n`, "utf8");
  } catch {
    // Falha de log nao pode impedir a abertura do aplicativo.
  }
}

function startupLog(event, details = {}) {
  const payload = {
    scope: "electron",
    event,
    elapsed_ms: getStartupElapsedMs(),
    ...details,
  };
  const line = `[startup] ${JSON.stringify(payload)}`;
  startupEvents.push(line);
  console.log(line);
  appendStartupLogLine(line);
}

startupLog("electron_process_started");

function showStartupError(message) {
  dialog.showErrorBox("Erro ao iniciar", message);
}

function getRuntimeRoot() {
  if (app.isPackaged) {
    // Mantem o backend e dependencias em um diretorio fisico fora do app.asar.
    // Isso evita travar o require com node_modules dentro do asar e tambem
    // preserva lazy requires como axios/xlsx no portable.
    return path.join(process.resourcesPath, "runtime");
  }
  return path.resolve(__dirname, "..");
}

function configureLocalDataDir() {
  if (process.env.PAINEL_MONITORIA_DATA_DIR) {
    return;
  }

  // Mantem o executavel limpo: os dados do usuario ficam no perfil Windows.
  const dataDir = path.join(app.getPath("appData"), APP_NAME);
  process.env.PAINEL_MONITORIA_DATA_DIR = dataDir;
  process.env.PAINEL_STARTUP_LOG_PATH = path.join(dataDir, "startup.log");

  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(process.env.PAINEL_STARTUP_LOG_PATH, "", "utf8");
    startupEvents.forEach((line) => appendStartupLogLine(line));
  } catch {
    // Diagnostico de startup e opcional.
  }
}

function getPreferencesPath() {
  return path.join(app.getPath("userData"), "preferences.json");
}

function getLegacyPreferencesPath() {
  return path.join(app.getPath("appData"), "painel-monitoria-electron", "preferences.json");
}

function getDefaultPreferences() {
  return {
    startWithWindows: false,
    minimizeToTray: false,
  };
}

function normalizePreferences(value) {
  return {
    ...getDefaultPreferences(),
    ...(value && typeof value === "object" ? value : {}),
  };
}

function loadPreferences() {
  if (appPreferences) {
    return appPreferences;
  }

  try {
    const preferencesPath = getPreferencesPath();
    const legacyPreferencesPath = getLegacyPreferencesPath();
    const sourcePath = fs.existsSync(preferencesPath) ? preferencesPath : legacyPreferencesPath;
    const raw = fs.readFileSync(sourcePath, "utf8");
    appPreferences = normalizePreferences(JSON.parse(raw));
    if (sourcePath === legacyPreferencesPath && !fs.existsSync(preferencesPath)) {
      savePreferences();
    }
  } catch {
    appPreferences = getDefaultPreferences();
  }

  return appPreferences;
}

function savePreferences() {
  try {
    fs.mkdirSync(path.dirname(getPreferencesPath()), { recursive: true });
    fs.writeFileSync(getPreferencesPath(), JSON.stringify(loadPreferences(), null, 2), "utf8");
  } catch (error) {
    console.error("Falha ao salvar preferencias locais:", sanitizeErrorForLog(error));
  }
}

function getPortableExecutablePath() {
  // O template portable.nsi do electron-builder define PORTABLE_EXECUTABLE_FILE.
  return process.env.PORTABLE_EXECUTABLE_FILE || app.getPath("exe");
}

function getLoginItemStatus() {
  const settings = app.getLoginItemSettings({
    path: getPortableExecutablePath(),
    args: ["--hidden"],
  });
  return Boolean(settings.openAtLogin);
}

function syncLoginItemSettings(enabled) {
  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled),
    path: getPortableExecutablePath(),
    args: ["--hidden"],
  });
}

function getPublicPreferences() {
  const preferences = loadPreferences();
  return {
    ...preferences,
    startWithWindows: getLoginItemStatus(),
  };
}

function isHiddenStartup() {
  return process.argv.includes("--hidden");
}

function showMainWindow() {
  if (!mainWindow) {
    pendingShowFromSecondInstance = true;
    return;
  }

  const now = Date.now();
  if (now - lastShowMainWindowAt < DESKTOP_IPC_SHOW_DEBOUNCE_MS) {
    startupLog("tray_show_window_debounced");
    return;
  }
  lastShowMainWindowAt = now;

  startupLog("tray_show_window");
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
  pendingShowFromSecondInstance = false;
}

function hideMainWindow() {
  startupLog("tray_hide_window");
  mainWindow?.hide();
}

function quitApplication() {
  startupLog("tray_quit_application");
  isExplicitQuit = true;
  isQuitting = false;
  app.quit();
}

function createTray() {
  if (tray) {
    return tray;
  }

  tray = new Tray(APP_ICON_PATH);
  tray.setToolTip(APP_NAME);
  tray.on("double-click", showMainWindow);
  updateTrayMenu();
  startupLog("tray_created");
  return tray;
}

function updateTrayMenu() {
  if (!tray) {
    return;
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Abrir Monitoring Hub",
      click: () => {
        startupLog("tray_menu_open_clicked");
        showMainWindow();
      },
    },
    {
      label: "Ocultar",
      click: () => {
        startupLog("tray_menu_hide_clicked");
        hideMainWindow();
      },
    },
    { type: "separator" },
    {
      label: "Sair",
      click: () => {
        startupLog("tray_menu_quit_clicked");
        quitApplication();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);
}

function getServerModule() {
  if (!serverModule) {
    const startedAt = Date.now();
    startupLog("server_module_require_started");
    serverModule = require(path.join(getRuntimeRoot(), "server.js"));
    startupLog("server_module_require_finished", { duration_ms: Date.now() - startedAt });
  }
  return serverModule;
}

function startLocalServer() {
  if (serverInstance) {
    return Promise.resolve();
  }

  startupLog("start_server_started");
  const { startServer } = getServerModule();
  serverInstance = startServer(APP_PORT);

  const listeningPromise = new Promise((resolve, reject) => {
    serverInstance.once("listening", () => {
      startupLog("start_server_finished");
      resolve();
    });

    serverInstance.once("error", reject);
  });

  serverInstance.on("error", (error) => {
    console.error("Falha ao iniciar servidor local:", sanitizeErrorForLog(error));
    showStartupError("Nao foi possivel iniciar o servidor local do aplicativo.");
    app.quit();
  });

  return listeningPromise;
}

function stopLocalServer() {
  if (!serverModule?.stopServer) {
    return Promise.resolve();
  }

  if (!stopServerPromise) {
    stopServerPromise = Promise.race([
      serverModule.stopServer(),
      new Promise((resolve) => setTimeout(resolve, SERVER_STOP_TIMEOUT_MS)),
    ]).finally(() => {
      stopServerPromise = null;
      serverInstance = null;
    });
  }

  return stopServerPromise;
}

function requestHealth() {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const request = http.get(HEALTH_URL, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode !== 200) {
          resolve({
            ok: false,
            duration_ms: Date.now() - startedAt,
            status_code: response.statusCode,
          });
          return;
        }
        try {
          const payload = JSON.parse(body);
          resolve({
            ok: payload.status === "ok",
            duration_ms: Date.now() - startedAt,
            status_code: response.statusCode,
          });
        } catch {
          resolve({
            ok: false,
            duration_ms: Date.now() - startedAt,
            status_code: response.statusCode,
          });
        }
      });
    });

    request.on("error", () => resolve({ ok: false, duration_ms: Date.now() - startedAt }));
    request.setTimeout(2000, () => {
      request.destroy();
      resolve({ ok: false, duration_ms: Date.now() - startedAt, timeout: true });
    });
  });
}

async function waitForServer() {
  const startedAt = Date.now();
  let attempts = 0;
  startupLog("health_check_started");

  while (Date.now() - startedAt < HEALTH_TIMEOUT_MS) {
    attempts += 1;
    const result = await requestHealth();
    if (result.ok) {
      startupLog("health_check_succeeded", {
        attempts,
        duration_ms: Date.now() - startedAt,
        last_request_ms: result.duration_ms,
      });
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, HEALTH_INTERVAL_MS));
  }
  startupLog("health_check_failed", { attempts, duration_ms: Date.now() - startedAt });
  return false;
}

function createSplashWindow() {
  const startedAt = Date.now();
  startupLog("splash_create_started");
  splashWindow = new BrowserWindow({
    title: APP_NAME,
    width: 460,
    height: 280,
    frame: false,
    resizable: false,
    show: true,
    center: true,
    transparent: false,
    backgroundColor: "#020817",
    icon: APP_ICON_PATH,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  splashWindow.loadFile(path.join(__dirname, "splash.html"));
  startupLog("splash_create_finished", { duration_ms: Date.now() - startedAt });
}

function createMainWindow() {
  const startedAt = Date.now();
  startupLog("main_window_create_started");
  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: 1366,
    height: 768,
    minWidth: 1200,
    minHeight: 700,
    frame: false,
    transparent: false,
    show: false,
    resizable: true,
    titleBarStyle: "hidden",
    backgroundColor: "#020817",
    icon: APP_ICON_PATH,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.join(__dirname, "preload.js"),
      devTools: !app.isPackaged,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternalUrl(url)) {
      return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isInternalUrl(url)) {
      return;
    }
    event.preventDefault();
    shell.openExternal(url);
  });

  mainWindow.webContents.on("before-input-event", (event, input) => {
    const key = String(input.key || "").toLowerCase();
    const isReload = input.key === "F5" || ((input.control || input.meta) && key === "r");
    const isDevTools = input.key === "F12";

    if (app.isPackaged && (isReload || isDevTools)) {
      event.preventDefault();
      return;
    }

    if (!app.isPackaged && isDevTools && input.type === "keyDown") {
      event.preventDefault();
      mainWindow.webContents.toggleDevTools();
    }
  });

  mainWindow.once("ready-to-show", async () => {
    startupLog("main_window_ready_to_show");
    await injectDesktopUi();
    splashWindow?.close();
    splashWindow = null;
    if (isHiddenStartup() && !pendingShowFromSecondInstance) {
      mainWindow.hide();
      startupLog("app_ready_hidden", { total_ms: getStartupElapsedMs() });
      return;
    }

    mainWindow.show();
    startupLog("app_ready", { total_ms: getStartupElapsedMs() });
  });

  mainWindow.on("close", (event) => {
    if (isExplicitQuit || isQuitting || !loadPreferences().minimizeToTray) {
      return;
    }

    event.preventDefault();
    startupLog("window_close_intercepted_minimize_to_tray");
    hideMainWindow();
  });

  mainWindow.loadURL(APP_URL);
  startupLog("main_window_create_finished", { duration_ms: Date.now() - startedAt });
}

function isInternalUrl(url) {
  return url === APP_URL || url.startsWith(`${APP_URL}/`) || url.startsWith("blob:");
}

function readInjectionFile(fileName) {
  return fs.readFileSync(path.join(__dirname, fileName), "utf8");
}

async function injectDesktopUi() {
  const overlayHtml = JSON.stringify(readInjectionFile("titlebar-overlay.html"));
  const scrollbarScript = readInjectionFile("global-styles-injection.js");

  await mainWindow.webContents.executeJavaScript(scrollbarScript);
  await mainWindow.webContents.executeJavaScript(`
    (() => {
      if (document.getElementById("electron-titlebar-overlay")) return;

      document.body.insertAdjacentHTML("afterbegin", ${overlayHtml});

      const minimizeButton = document.getElementById("electron-minimize-button");
      const maximizeButton = document.getElementById("electron-maximize-button");
      const closeButton = document.getElementById("electron-close-button");

      minimizeButton?.addEventListener("click", () => window.electronAPI?.minimize());
      maximizeButton?.addEventListener("click", () => window.electronAPI?.maximizeRestore());
      closeButton?.addEventListener("click", () => window.electronAPI?.close());
    })();
  `);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeFileNamePart(value) {
  const text = String(value || "Empresa")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (text || "Empresa").slice(0, 120);
}

function padDatePart(value) {
  return String(value).padStart(2, "0");
}

function formatFileTimestamp(date = new Date()) {
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join("-") + " " + [
    padDatePart(date.getHours()),
    padDatePart(date.getMinutes()),
    padDatePart(date.getSeconds()),
  ].join("-");
}

function formatExportGeneratedAt(date = new Date()) {
  return date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour12: false,
  });
}

function normalizeClockImagePayload(payload) {
  const layout = payload?.layout === "compact" ? "compact" : "normal";
  const clocks = Array.isArray(payload?.clocks) ? payload.clocks : [];

  return {
    softwareName: "Clock Monitoring Hub",
    layout,
    filterLabel: String(payload?.filter?.label || "Todos"),
    generatedAt: formatExportGeneratedAt(),
    company: {
      name: String(payload?.company?.name || "Empresa"),
      identifier: String(payload?.company?.identifier || "-"),
      activeClockCount: Number(payload?.company?.activeClockCount) || 0,
      updatedAt: String(payload?.company?.updatedAt || "-"),
    },
    clocks: clocks.map((clock) => ({
      name: String(clock?.name || "-"),
      code: String(clock?.code ?? "-"),
      fabricationNumber: String(clock?.fabricationNumber || "-"),
      ip: String(clock?.ip || "-"),
      lastCollectionBrt: String(clock?.lastCollectionBrt || "-"),
      isCommunicating: Boolean(clock?.isCommunicating),
      statusLabel: Boolean(clock?.isCommunicating) ? "OK" : "Falha",
    })),
  };
}

function getUniqueExportPath(fileName) {
  const downloadsPath = app.getPath("downloads");
  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension);
  let candidate = path.join(downloadsPath, fileName);
  let index = 2;

  while (fs.existsSync(candidate)) {
    candidate = path.join(downloadsPath, `${baseName} - ${index}${extension}`);
    index += 1;
  }

  return candidate;
}

function getExportFontFaceCss() {
  const fontsPath = path.join(getRuntimeRoot(), "public", "fonts");
  const fontFiles = [
    ["SF Pro Text", "SF-Pro-Text-Regular.otf", 400],
    ["SF Pro Text", "SF-Pro-Text-Medium.otf", 500],
    ["SF Pro Text", "SF-Pro-Text-Semibold.otf", 600],
    ["SF Pro Text", "SF-Pro-Text-Bold.otf", 700],
    ["SF Pro Display", "SF-Pro-Display-Semibold.otf", 600],
    ["SF Pro Display", "SF-Pro-Display-Bold.otf", 700],
  ];

  return fontFiles
    .filter(([, fileName]) => fs.existsSync(path.join(fontsPath, fileName)))
    .map(([family, fileName, weight]) => {
      const url = pathToFileURL(path.join(fontsPath, fileName)).href;
      return `
        @font-face {
          font-family: "${family}";
          src: url("${url}") format("opentype");
          font-weight: ${weight};
          font-style: normal;
          font-display: swap;
        }
      `;
    })
    .join("\n");
}

function normalizeExportFilterLabel(value) {
  // Compara rotulos com ou sem acento para manter compatibilidade com o frontend atual.
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function renderExportFilterPills(activeFilterLabel) {
  const filters = [
    { label: "Comunicando", tone: "ok" },
    { label: "Sem comunicação", tone: "error" },
  ];
  const normalizedActive = normalizeExportFilterLabel(activeFilterLabel || "Todos");

  return filters
    .map(({ label, tone }) => {
      const normalizedLabel = normalizeExportFilterLabel(label);
      const isActive = normalizedActive === normalizedLabel;
      return `<span class="filter-pill ${tone} ${isActive ? "active" : ""}">${escapeHtml(label)}</span>`;
    })
    .join("");
}

function renderCompactExportClock(clock) {
  const statusClass = clock.isCommunicating ? "ok" : "error";
  return `
    <article class="clock-card compact ${statusClass}">
      <div class="compact-top">
        <h2>${escapeHtml(clock.name)}</h2>
        <span class="code-badge">#${escapeHtml(clock.code)}</span>
      </div>
      <div class="compact-bottom">
        <span>${escapeHtml(clock.lastCollectionBrt)}</span>
        <strong class="status-pill ${statusClass}">${escapeHtml(clock.statusLabel)}</strong>
      </div>
    </article>
  `;
}

function renderNormalExportClock(clock) {
  const statusClass = clock.isCommunicating ? "ok" : "error";
  return `
    <article class="clock-card normal ${statusClass}">
      <header>
        <h2>${escapeHtml(clock.name)}</h2>
      </header>
      <dl>
        <div><dt>Codigo</dt><dd>${escapeHtml(clock.code)}</dd></div>
        <div><dt>Numero Fabricacao</dt><dd>${escapeHtml(clock.fabricationNumber)}</dd></div>
        <div><dt>IP</dt><dd>${escapeHtml(clock.ip)}</dd></div>
        <div><dt>Ultima Coleta (BRT)</dt><dd>${escapeHtml(clock.lastCollectionBrt)}</dd></div>
      </dl>
      <footer>
        <strong class="status-pill ${statusClass}">${escapeHtml(clock.statusLabel)}</strong>
      </footer>
    </article>
  `;
}

function buildClockImageHtml(payload) {
  const isCompact = payload.layout === "compact";
  const cards = payload.clocks.length
    ? payload.clocks.map((clock) => (isCompact ? renderCompactExportClock(clock) : renderNormalExportClock(clock))).join("")
    : `<p class="empty-state">Nenhum relogio encontrado para o filtro selecionado.</p>`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <style>
    ${getExportFontFaceCss()}
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      width: ${CLOCK_IMAGE_WIDTH}px;
      min-height: 100%;
      overflow-x: hidden;
      background:
        radial-gradient(circle at 14% 8%, rgba(27, 152, 255, 0.5), transparent 31%),
        radial-gradient(circle at 86% 6%, rgba(0, 188, 242, 0.34), transparent 30%),
        radial-gradient(circle at 62% 102%, rgba(45, 209, 125, 0.16), transparent 32%),
        linear-gradient(150deg, #020817 6%, #031436 38%, #073579 100%);
      color: #f0f8ff;
      font-family: "SF Pro Text", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
      font-variant-numeric: tabular-nums;
    }
    body { padding: 46px; }
    .page {
      position: relative;
      width: 100%;
      max-width: 100%;
      border: 1px solid rgba(140, 210, 255, 0.44);
      border-radius: 24px;
      background:
        linear-gradient(125deg, rgba(255, 255, 255, 0.075), rgba(255, 255, 255, 0.015) 42%),
        radial-gradient(circle at 84% 0%, rgba(0, 188, 242, 0.26), rgba(0, 188, 242, 0) 46%),
        radial-gradient(circle at 7% 12%, rgba(42, 153, 255, 0.2), transparent 36%),
        linear-gradient(140deg, rgba(3, 14, 42, 0.95), rgba(4, 51, 113, 0.86));
      box-shadow:
        0 24px 66px rgba(0, 7, 20, 0.62),
        0 0 46px rgba(20, 147, 255, 0.2),
        0 0 92px rgba(0, 188, 242, 0.1),
        inset 0 1px 0 rgba(255, 255, 255, 0.18),
        inset 0 0 52px rgba(120, 188, 255, 0.07);
      overflow: hidden;
      backdrop-filter: blur(26px) saturate(190%) brightness(1.04);
      -webkit-backdrop-filter: blur(26px) saturate(190%) brightness(1.04);
      filter: saturate(1.14) contrast(1.05);
    }
    .page::before {
      content: "";
      position: absolute;
      inset: 1px;
      border-radius: 23px;
      pointer-events: none;
      background:
        linear-gradient(118deg, rgba(255, 255, 255, 0.16), transparent 26%, transparent 68%, rgba(120, 220, 255, 0.1)),
        radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.12), transparent 38%);
      mix-blend-mode: screen;
      opacity: 0.72;
      z-index: 0;
    }
    .page > * {
      position: relative;
      z-index: 1;
    }
    .export-header {
      padding: 26px 30px 20px;
      border-bottom: 1px solid transparent;
      background:
        linear-gradient(90deg, rgba(120, 188, 255, 0.16), rgba(120, 188, 255, 0.48), rgba(120, 188, 255, 0.16)) 0 100% / 100% 1px no-repeat,
        radial-gradient(circle at 88% 0%, rgba(0, 188, 242, 0.28), transparent 44%),
        linear-gradient(90deg, rgba(120, 188, 255, 0.1), rgba(120, 188, 255, 0.025));
    }
    .software {
      margin: 0 0 8px;
      color: #9bd8ff;
      font-size: 16px;
      font-weight: 500;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    h1 {
      margin: 0;
      color: #f3f9ff;
      font-family: "SF Pro Display", "SF Pro Text", "Segoe UI Variable", sans-serif;
      font-size: 38px;
      line-height: 1.12;
      font-weight: 700;
      text-shadow:
        0 5px 18px rgba(0, 7, 20, 0.42),
        0 0 22px rgba(120, 188, 255, 0.12);
    }
    .subtitle-line {
      margin: 8px 0 0;
      color: #a7d0f5;
      font-size: 17px;
      font-weight: 400;
    }
    .toolbar {
      padding: 15px 30px 17px;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 18px;
      border-bottom: 1px solid transparent;
      background:
        linear-gradient(90deg, rgba(0, 188, 242, 0.12), rgba(73, 172, 255, 0.44), rgba(0, 188, 242, 0.12)) 0 100% / 100% 1px no-repeat,
        radial-gradient(circle at 20% 0%, rgba(20, 147, 255, 0.16), transparent 36%),
        linear-gradient(180deg, rgba(4, 26, 64, 0.48), rgba(4, 19, 45, 0.18));
    }
    .filter-pills {
      display: flex;
      align-items: center;
      gap: 9px;
    }
    .filter-pill {
      min-height: 38px;
      padding: 0 18px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      color: #f7fffb;
      font-size: 15px;
      font-weight: 600;
      letter-spacing: 0.01em;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.2),
        0 0 20px rgba(120, 188, 255, 0.12);
    }
    .filter-pill.ok {
      border-color: rgba(116, 255, 187, 0.62);
      background:
        linear-gradient(135deg, rgba(23, 156, 90, 0.96), rgba(68, 232, 145, 0.82)),
        radial-gradient(circle at 30% 0%, rgba(255, 255, 255, 0.24), transparent 42%);
      box-shadow:
        0 0 22px rgba(45, 209, 125, 0.34),
        0 8px 20px rgba(45, 209, 125, 0.16),
        inset 0 1px 0 rgba(255, 255, 255, 0.24);
    }
    .filter-pill.error {
      border-color: rgba(255, 137, 160, 0.68);
      background:
        linear-gradient(135deg, rgba(203, 48, 83, 0.96), rgba(255, 94, 126, 0.84)),
        radial-gradient(circle at 30% 0%, rgba(255, 255, 255, 0.22), transparent 42%);
      box-shadow:
        0 0 22px rgba(255, 79, 112, 0.36),
        0 8px 20px rgba(255, 79, 112, 0.16),
        inset 0 1px 0 rgba(255, 255, 255, 0.23);
    }
    .filter-pill.active {
      outline: 2px solid rgba(255, 255, 255, 0.34);
      outline-offset: 2px;
    }
    .clock-grid {
      display: grid;
      gap: 16px;
      padding: 28px 30px 36px;
      width: 100%;
      min-width: 0;
      overflow: hidden;
    }
    .clock-grid.compact {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
    }
    .clock-grid.normal {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 18px;
    }
    .clock-card {
      min-width: 0;
      max-width: 100%;
      border-radius: 18px;
      border: 1px solid rgba(104, 189, 255, 0.4);
      background:
        linear-gradient(125deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.01) 44%),
        radial-gradient(circle at 88% 0%, rgba(20, 147, 255, 0.14), transparent 38%),
        linear-gradient(135deg, rgba(3, 16, 43, 0.95), rgba(5, 43, 96, 0.8));
      box-shadow:
        0 10px 28px rgba(0, 7, 20, 0.38),
        0 0 22px rgba(20, 147, 255, 0.09),
        inset 0 1px 0 rgba(255, 255, 255, 0.12);
      overflow: hidden;
      backdrop-filter: blur(16px) saturate(170%);
      -webkit-backdrop-filter: blur(16px) saturate(170%);
    }
    .clock-card.ok {
      border-color: rgba(45, 209, 125, 0.58);
      box-shadow:
        0 10px 28px rgba(0, 7, 20, 0.38),
        0 0 24px rgba(45, 209, 125, 0.13),
        inset 0 1px 0 rgba(255, 255, 255, 0.12);
    }
    .clock-card.error {
      border-color: rgba(255, 79, 112, 0.62);
      box-shadow:
        0 10px 28px rgba(0, 7, 20, 0.38),
        0 0 24px rgba(255, 79, 112, 0.15),
        inset 0 1px 0 rgba(255, 255, 255, 0.12);
    }
    .clock-card.normal header {
      min-height: 76px;
      padding: 16px 18px;
      border-bottom: 1px solid rgba(120, 188, 255, 0.14);
    }
    .clock-card h2 {
      margin: 0;
      color: #f3f9ff;
      font-size: 20px;
      line-height: 1.22;
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .clock-card.normal dl {
      margin: 0;
      padding: 16px 18px;
      display: grid;
      gap: 13px;
    }
    .clock-card.normal dl div {
      display: flex;
      justify-content: space-between;
      gap: 20px;
    }
    dt {
      color: #a7d0f5;
      font-size: 16px;
      font-weight: 400;
    }
    dd {
      margin: 0;
      color: #f0f8ff;
      font-size: 16px;
      font-weight: 500;
      text-align: right;
      overflow-wrap: anywhere;
    }
    .clock-card.normal footer {
      padding: 14px 18px 16px;
      border-top: 1px solid rgba(120, 188, 255, 0.14);
    }
    .clock-card.compact {
      min-height: 118px;
      padding: 16px;
      display: grid;
      align-content: space-between;
      gap: 14px;
    }
    .compact-top,
    .compact-bottom {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      width: 100%;
      min-width: 0;
    }
    .clock-card.compact h2 {
      min-width: 0;
      flex: 1 1 auto;
      font-size: 18px;
      line-height: 1.18;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .compact-bottom span {
      min-width: 0;
      flex: 1 1 auto;
      color: #a7d0f5;
      font-size: 16px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .code-badge {
      flex: 0 0 auto;
      max-width: none;
      white-space: nowrap;
      padding: 4px 10px;
      border-radius: 999px;
      border: 1px solid rgba(140, 210, 255, 0.48);
      background: linear-gradient(135deg, rgba(6, 35, 78, 0.9), rgba(10, 68, 142, 0.7));
      color: #bfe4ff;
      font-size: 15px;
      font-weight: 500;
      box-shadow: 0 0 12px rgba(20, 147, 255, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.12);
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 1 auto;
      max-width: 46%;
      min-height: 30px;
      padding: 0 14px;
      border-radius: 999px;
      color: #fff;
      font-size: 16px;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .status-pill.ok {
      background: linear-gradient(135deg, rgba(45, 209, 125, 0.95), rgba(87, 236, 156, 0.92));
      box-shadow: 0 6px 18px rgba(45, 209, 125, 0.34);
    }
    .status-pill.error {
      background: linear-gradient(135deg, rgba(255, 79, 112, 0.95), rgba(255, 127, 149, 0.92));
      box-shadow: 0 6px 18px rgba(255, 79, 112, 0.34);
    }
    .empty-state {
      grid-column: 1 / -1;
      margin: 0;
      padding: 22px;
      border-radius: 18px;
      border: 1px solid rgba(120, 188, 255, 0.24);
      background: rgba(6, 27, 56, 0.5);
      color: #a7d0f5;
      font-size: 22px;
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="export-header">
      <p class="software">${escapeHtml(payload.softwareName)}</p>
      <h1>${escapeHtml(payload.company.name)}</h1>
      <p class="subtitle-line">CNPJ ${escapeHtml(payload.company.identifier)} | Ativos: ${escapeHtml(String(payload.company.activeClockCount))} | Atualizado em ${escapeHtml(payload.company.updatedAt)}</p>
    </header>
    <section class="toolbar" aria-label="Controles visuais da exportacao">
      <div class="filter-pills">
        ${renderExportFilterPills(payload.filterLabel)}
      </div>
    </section>
    <section class="clock-grid ${isCompact ? "compact" : "normal"}">
      ${cards}
    </section>
  </main>
</body>
</html>`;
}

async function captureClockImage(payload) {
  const html = buildClockImageHtml(payload);
  const tempDir = fs.mkdtempSync(path.join(app.getPath("temp"), "monitoring-hub-export-"));
  const tempHtmlPath = path.join(tempDir, "clock-export.html");
  fs.writeFileSync(tempHtmlPath, html, "utf8");

  const exportWindow = new BrowserWindow({
    show: false,
    width: CLOCK_IMAGE_WIDTH,
    height: 1000,
    frame: false,
    transparent: false,
    backgroundColor: "#020817",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  try {
    await exportWindow.loadFile(tempHtmlPath);
    await exportWindow.webContents.executeJavaScript(`
      document.fonts ? document.fonts.ready.then(() => true) : true
    `);
    const fontStatus = await exportWindow.webContents.executeJavaScript(`
      document.fonts
        ? ({
            sfProText: document.fonts.check('400 18px "SF Pro Text"'),
            sfProDisplay: document.fonts.check('700 38px "SF Pro Display"'),
            faces: Array.from(document.fonts).map((font) => ({
              family: font.family,
              weight: font.weight,
              status: font.status
            }))
          })
        : { sfProText: false, sfProDisplay: false, faces: [] }
    `);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const dimensions = await exportWindow.webContents.executeJavaScript(`
      ({
        width: Math.ceil(Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)),
        height: Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight))
      })
    `);

    const contentHeight = Math.max(600, Number(dimensions.height) || 1000);
    if (contentHeight > CLOCK_IMAGE_MAX_HEIGHT) {
      throw new Error(`Imagem muito alta para exportacao em PNG unico: ${contentHeight}px.`);
    }

    exportWindow.setContentSize(CLOCK_IMAGE_WIDTH, contentHeight);
    await new Promise((resolve) => setTimeout(resolve, 120));

    const image = await exportWindow.webContents.capturePage({
      x: 0,
      y: 0,
      width: CLOCK_IMAGE_WIDTH,
      height: contentHeight,
    });

    return {
      buffer: image.toPNG(),
      width: CLOCK_IMAGE_WIDTH,
      height: contentHeight,
      fontStatus,
    };
  } finally {
    if (!exportWindow.isDestroyed()) {
      exportWindow.close();
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Arquivo temporario de exportacao nao deve impedir o fluxo principal.
    }
  }
}

async function exportClockImage(payload) {
  const normalizedPayload = normalizeClockImagePayload(payload);
  const timestamp = formatFileTimestamp();
  const companyName = sanitizeFileNamePart(normalizedPayload.company.name);
  const fileName = `Clock Monitoring Hub - ${companyName} - ${timestamp}.png`;
  const filePath = getUniqueExportPath(fileName);
  const image = await captureClockImage(normalizedPayload);

  fs.writeFileSync(filePath, image.buffer);
  startupLog("clock_image_exported", {
    file_name: path.basename(filePath),
    width: image.width,
    height: image.height,
    clocks: normalizedPayload.clocks.length,
    layout: normalizedPayload.layout,
  });

  return {
    ok: true,
    fileName: path.basename(filePath),
    filePath,
    width: image.width,
    height: image.height,
    fonts: image.fontStatus,
  };
}

ipcMain.on("window:minimize", () => {
  mainWindow?.minimize();
});

ipcMain.on("window:maximize-restore", () => {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    return;
  }

  mainWindow.maximize();
});

ipcMain.on("window:close", () => {
  if (loadPreferences().minimizeToTray && !isExplicitQuit) {
    hideMainWindow();
    return;
  }

  quitApplication();
});

ipcMain.handle("preferences:get", () => getPublicPreferences());

ipcMain.handle("preferences:set", (_event, patch) => {
  const preferences = loadPreferences();

  if (Object.prototype.hasOwnProperty.call(patch || {}, "minimizeToTray")) {
    preferences.minimizeToTray = Boolean(patch.minimizeToTray);
  }

  if (Object.prototype.hasOwnProperty.call(patch || {}, "startWithWindows")) {
    const enabled = Boolean(patch.startWithWindows);
    syncLoginItemSettings(enabled);
    preferences.startWithWindows = getLoginItemStatus();
    startupLog("startup_preference_updated", {
      enabled: preferences.startWithWindows,
      executable_path: getPortableExecutablePath(),
      args: ["--hidden"],
      portable_executable_file: Boolean(process.env.PORTABLE_EXECUTABLE_FILE),
    });
  }

  savePreferences();
  updateTrayMenu();
  return getPublicPreferences();
});

ipcMain.handle("clock-image:export", async (_event, payload) => {
  try {
    return await exportClockImage(payload);
  } catch (error) {
    console.error("Falha ao exportar imagem de relogios:", sanitizeErrorForLog(error));
    return {
      ok: false,
      error: "Nao foi possivel gerar a imagem.",
    };
  }
});

app.whenReady().then(async () => {
  startupLog("app_when_ready");
  configureLocalDataDir();

  const notifiedExistingInstance = await notifyExistingDesktopInstance();
  if (notifiedExistingInstance) {
    startupLog("existing_instance_notified");
    app.quit();
    return;
  }

  startDesktopIpcServer();
  loadPreferences();
  Menu.setApplicationMenu(null);
  createTray();

  startupLog("portable_environment", {
    portable_executable_file: Boolean(process.env.PORTABLE_EXECUTABLE_FILE),
    executable_path: getPortableExecutablePath(),
    hidden_startup: isHiddenStartup(),
  });

  if (!isHiddenStartup()) {
    createSplashWindow();
  }

  try {
    await startLocalServer();
  } catch (error) {
    console.error("Falha ao aguardar servidor local:", sanitizeErrorForLog(error));
    showStartupError("Nao foi possivel iniciar o servidor local do aplicativo.");
    app.quit();
    return;
  }

  const isReady = await waitForServer();
  if (!isReady) {
    console.error("Servidor local nao respondeu ao health check dentro do limite.", {
      url: HEALTH_URL,
      timeout_ms: HEALTH_TIMEOUT_MS,
    });
    showStartupError("O servidor local nao respondeu a tempo. Feche o aplicativo e tente novamente.");
    app.quit();
    return;
  }

  createMainWindow();
});

app.on("second-instance", () => {
  startupLog("second_instance_restore_requested");
  showMainWindow();
});

app.on("before-quit", async (event) => {
  if (isQuitting) {
    return;
  }

  event.preventDefault();
  isQuitting = true;

  try {
    await Promise.all([stopLocalServer(), stopDesktopIpcServer()]);
  } catch (error) {
    console.error("Falha ao encerrar servidor local:", sanitizeErrorForLog(error));
  } finally {
    app.exit(0);
  }
});

app.on("window-all-closed", () => {
  app.quit();
});
