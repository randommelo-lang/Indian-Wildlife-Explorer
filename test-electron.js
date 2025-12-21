const electron = require('electron');
console.log('electron module type:', typeof electron);
console.log('electron module keys:', Object.keys(electron));
console.log('ipcMain:', typeof electron.ipcMain);
const { app, ipcMain } = electron;
console.log('ipcMain after destructure:', typeof ipcMain);
if (app) {
    app.whenReady().then(() => {
        console.log('App ready!');
        app.quit();
    });
    app.on('ready', () => console.log('App ready event!'));
} else {
    console.log('app is undefined - Electron not properly loaded');
}
