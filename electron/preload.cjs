/** The only bridge between the game page and the desktop shell. */
const { contextBridge, ipcRenderer } = require('electron');

let fullscreen = false;
ipcRenderer.on('helios:fullscreen', (_event, value) => {
  fullscreen = !!value;
});

contextBridge.exposeInMainWorld('heliosApp', {
  quit: () => ipcRenderer.send('helios:quit'),
  toggleFullscreen: () => ipcRenderer.send('helios:toggle-fullscreen'),
  isFullscreen: () => fullscreen,
});
