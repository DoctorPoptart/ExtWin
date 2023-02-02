const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
    ipc: (event, callback) => ipcRenderer.on(event, callback)
})