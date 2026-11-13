/**
 * Helios Outpost — desktop shell.
 *
 * Wraps the single-file game build in its own window so it runs as a normal program:
 * full screen, no browser chrome, saves kept in the user's profile, works offline.
 * The page gets no Node.js access; it talks to this process through three narrow
 * messages (quit, toggle full screen, full-screen state).
 */
const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const SMOKE = process.env.HELIOS_SMOKE; // path of a screenshot to write, then exit (automated check)
const WINDOWED = process.argv.includes('--windowed') || !!SMOKE;

// Prefer the discrete GPU on laptops and do not let a driver blocklist switch WebGL off.
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
if (SMOKE) {
  app.commandLine.appendSwitch('use-angle', 'swiftshader');
  app.commandLine.appendSwitch('enable-unsafe-swiftshader');
}

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0a0c0f',
    title: 'Helios Outpost',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    show: false,
    fullscreen: !WINDOWED,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  Menu.setApplicationMenu(null);

  const query = SMOKE ? { q: 'low', fixedres: '1' } : {};
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { query });
  win.once('ready-to-show', () => win.show());

  // the game never navigates away or opens windows; links (if any) go to the real browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  const sendFullscreen = () => win && !win.isDestroyed() && win.webContents.send('helios:fullscreen', win.isFullScreen());
  win.on('enter-full-screen', sendFullscreen);
  win.on('leave-full-screen', sendFullscreen);
  win.webContents.on('did-finish-load', sendFullscreen);
  win.on('closed', () => (win = null));

  if (SMOKE) smokeTest();
}

/** Automated check: wait for the title screen, save a screenshot, report, quit. */
async function smokeTest() {
  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3) errors.push(message.slice(0, 200));
  });
  const deadline = Date.now() + 180000;
  let state = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      state = await win.webContents.executeJavaScript(
        '({ ready: !!window.__ready, phase: window.game ? window.game.phase : null, desktop: !!window.heliosApp, view: [innerWidth, innerHeight], canvas: (function (c) { return c ? [c.width, c.height] : null; })(document.querySelector("canvas")), text: document.body.innerText.slice(0, 80).replace(/\\s+/g, " ") })',
      );
    } catch (err) {
      errors.push(String(err).slice(0, 200));
    }
    if (state && state.ready) break;
  }
  await new Promise((r) => setTimeout(r, 2500));
  const image = await win.webContents.capturePage();
  fs.writeFileSync(SMOKE, image.toPNG());
  console.log(JSON.stringify({ state, errors }));
  app.exit(state && state.ready && state.phase === 'menu' ? 0 : 1);
}

ipcMain.on('helios:quit', () => app.quit());
ipcMain.on('helios:toggle-fullscreen', () => {
  if (win) win.setFullScreen(!win.isFullScreen());
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
