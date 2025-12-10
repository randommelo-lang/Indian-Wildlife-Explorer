const { contextBridge, ipcRenderer, shell } = require("electron");


contextBridge.exposeInMainWorld("storageAPI", {
    // Read, Write & Delete storage
    read: (type) => ipcRenderer.invoke("read-storage", type),
    write: (type, data) => ipcRenderer.invoke("write-storage", type, data),
    delete: (type, docId) => ipcRenderer.invoke("delete-storage", type, docId),

    // Save local MP4 / MKV
    saveLocalVideo: (path) => ipcRenderer.invoke("save-local-video", path),

    // Save file to Cloud Storage
    saveCloudFile: (path) => ipcRenderer.invoke("save-cloud-file", path),

    // Auto-fetch news metadata
    fetchNewsMetadata: (url) => ipcRenderer.invoke("fetch-news-metadata", url),

    // Open external URLs (for YouTube fallback)
    openExternal: (url) => ipcRenderer.invoke("open-external", url),

    getPublicUrl: (gsPath) => ipcRenderer.invoke("get-public-url", gsPath),


});