const { app, BrowserWindow, Tray, Menu, nativeImage, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store');

const store = new Store();

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

let workspace = store.get("workspace-directory")

require("./server")

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600
  });

  // and load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  

  // Open the DevTools.
  mainWindow.webContents.openDevTools();

};

app.on('window-all-closed', e => e.preventDefault() )

const startApp = () => {
  let icon = nativeImage.createFromPath("assets/window.png")
  let tray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
    {label: "Set workspace", type: "normal", click: () => {
      dialog.showOpenDialog({
        properties: ['openDirectory']
      }).then((result) => {
        if (result && result.filePaths.length > 0) {
          workspace = result.filePaths[0]
          store.set("workspace-directory", workspace)
        }
      })
      
    }},
    {label: 'Exit', type: 'normal', click: app.exit}
  ])

  tray.setToolTip('ExtWin')
  tray.setContextMenu(contextMenu)
  
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', startApp);


// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
