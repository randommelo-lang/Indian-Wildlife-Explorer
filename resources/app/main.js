const { app, BrowserWindow, shell, ipcMain, session } = require("electron");
const path = require("path");
const https = require("https");
const cheerio = require("cheerio-without-node-native");
const express = require("express");
const fs = require("fs");

// ------------------------------------------------------
// 🟢 1. FIREBASE SETUP
// ------------------------------------------------------
const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs, addDoc, deleteDoc, doc, orderBy, query } = require("firebase/firestore");
const { getStorage, ref, uploadBytes, getDownloadURL } = require("firebase/storage");
const { getAuth, signInAnonymously } = require("firebase/auth");

// 🔴 PASTE YOUR FIREBASE KEYS HERE
const firebaseConfig = {
    apiKey: "AIzaSyBru1EdFHWMuXozUyaoVI5YH7yWcH_39cs",
    authDomain: "indian-wildlife-417cf.firebaseapp.com",
    projectId: "indian-wildlife-417cf",
    storageBucket: "indian-wildlife-417cf.firebasestorage.app",
    messagingSenderId: "278003071862",
    appId: "1:278003071862:web:21d15970def595663d9857",
    measurementId: "G-FFJJQCT48T"
};

// Initialize Cloud DB
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);
const auth = getAuth(firebaseApp);

// Sign in anonymously to allow storage access
signInAnonymously(auth).catch(console.error);

// ------------------------------------------------------
// 🟢 2. LOCAL SERVER SETUP
// ------------------------------------------------------
const server = express();
server.use(express.static(__dirname));
let serverInstance;
let myPort;

// ------------------------------------------------------
// 🟢 3. CLOUD HANDLERS
// ------------------------------------------------------
ipcMain.handle("read-storage", async (_, type) => {
    try {
        const q = query(collection(db, type), orderBy("date", "desc"));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        console.error("Cloud Read Error:", e);
        return [];
    }
});

ipcMain.handle("write-storage", async (_, type, dataList) => {
    try {
        if (!dataList || dataList.length === 0) return false;
        const newItem = dataList[0];

        // Clean data (Firestore hates 'undefined')
        const cleanItem = {
            title: newItem.title || "Untitled",
            desc: newItem.desc || "",
            link: newItem.link || "",
            date: newItem.date || Date.now(),
            youtubeId: newItem.youtubeId || null,
            localPath: newItem.localPath || null,
            checklist: newItem.checklist || null,
            coverPhoto: newItem.coverPhoto || null,
            thumbnail: newItem.thumbnail || null
        };

        await addDoc(collection(db, type), cleanItem);
        return true;
    } catch (e) {
        console.error("Cloud Write Error:", e);
        return false;
    }
});

// Delete document from Firestore
ipcMain.handle("delete-storage", async (_, type, docId) => {
    try {
        if (!docId) return false;
        await deleteDoc(doc(db, type, docId));
        console.log(`✅ Deleted ${type} document:`, docId);
        return true;
    } catch (e) {
        console.error("Cloud Delete Error:", e);
        return false;
    }
});

// Metadata Fetcher
ipcMain.handle("fetch-news-metadata", async (_, url) => {
    return new Promise((resolve) => {
        try {
            const options = { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } };
            https.get(url, options, (res) => {
                let html = "";
                res.on("data", chunk => (html += chunk));
                res.on("end", () => {
                    try {
                        const $ = cheerio.load(html);
                        const title = $('meta[property="og:title"]').attr("content") || $("title").text() || "No Title";
                        const desc = $('meta[property="og:description"]').attr("content") || "";
                        const thumb = $('meta[property="og:image"]').attr("content") || "";
                        resolve({ title, desc, thumb });
                    } catch { resolve({ title: "", desc: "", thumb: "" }); }
                });
            }).on("error", () => resolve({ title: "", desc: "", thumb: "" }));
        } catch { resolve({ title: "", desc: "", thumb: "" }); }
    });
});

// Open External URL Handler
ipcMain.handle("open-external", async (_, url) => {
    if (url && (url.startsWith("http:") || url.startsWith("https:"))) {
        await shell.openExternal(url);
    }
});

// Handle File Uploads to Firebase Storage (PDFs & Images)
ipcMain.handle("save-cloud-file", async (_, data) => {
    try {
        let fileName, fileBuffer;

        if (typeof data === 'string') {
            // It's a path
            fileName = Date.now() + "-" + path.basename(data);
            fileBuffer = fs.readFileSync(data);
        } else if (data && data.name && data.buffer) {
            // It's a buffer object
            fileName = Date.now() + "-" + data.name;
            fileBuffer = Buffer.from(data.buffer);
        } else {
            throw new Error("Invalid file data");
        }

        // Create a reference in Firebase Storage
        const storageRef = ref(storage, "uploads/" + fileName);

        // Upload the file
        const snapshot = await uploadBytes(storageRef, fileBuffer);

        // Get the public URL
        const downloadURL = await getDownloadURL(snapshot.ref);
        return downloadURL;
    } catch (e) {
        console.error("Cloud Upload Error:", e);
        return null;
    }
});

ipcMain.handle("get-public-url", async (event, gsPath) => {
    const storage = getStorage();
    const fileRef = ref(storage, gsPath);
    return await getDownloadURL(fileRef);
});

// ------------------------------------------------------
// 🟢 4. CREATE WINDOW & FIX ERROR 153
// ------------------------------------------------------
function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            webSecurity: false,
            plugins: true
        }
    });

    // Start Server after window is created
    serverInstance = server.listen(0, () => {
        myPort = serverInstance.address().port;
        console.log(`Server running on http://localhost:${myPort}`);
        win.loadURL(`http://localhost:${myPort}/Index.html`);
    });

    win.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: "deny" };
    });

    // 🔴 THE FIX FOR ERROR 153 🔴
    // Even though we are on localhost, we spoof the Origin to satisfy YouTube
    session.defaultSession.webRequest.onBeforeSendHeaders(
        { urls: ["*://*.youtube.com/*", "*://*.googlevideo.com/*", "*://*.youtube-nocookie.com/*"] },
        (details, callback) => {
            details.requestHeaders['Referer'] = 'https://www.youtube.com/';
            details.requestHeaders['Origin'] = 'https://www.youtube.com';
            details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
            callback({ cancel: false, requestHeaders: details.requestHeaders });
        }
    );

    // 🟢 FIX IMAGE 403 ERRORS (Strip Referer for images)
    session.defaultSession.webRequest.onBeforeSendHeaders(
        { urls: ["*://*/*"] },
        (details, callback) => {
            const url = details.url.toLowerCase();
            if (url.match(/\.(jpg|jpeg|png|gif|webp|svg)$/) || url.includes('natureinfocus.in')) {
                delete details.requestHeaders['Referer'];
                details.requestHeaders['Sec-Fetch-Dest'] = 'image';
                details.requestHeaders['Sec-Fetch-Mode'] = 'no-cors';
                details.requestHeaders['Sec-Fetch-Site'] = 'cross-site';
            }
            callback({ cancel: false, requestHeaders: details.requestHeaders });
        }
    );

    // 🟢 ALLOW EMBEDDING EXTERNAL SITES (Strip X-Frame-Options & CSP)
    session.defaultSession.webRequest.onHeadersReceived(
        { urls: ['*://*/*'] },
        (details, callback) => {
            const responseHeaders = details.responseHeaders ? Object.assign({}, details.responseHeaders) : {};

            Object.keys(responseHeaders).forEach((header) => {
                const lowerHeader = header.toLowerCase();
                if (['x-frame-options', 'content-security-policy', 'frame-options'].includes(lowerHeader)) {
                    delete responseHeaders[header];
                }
            });

            callback({ cancel: false, responseHeaders: responseHeaders });
        }
    );
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
    if (serverInstance) serverInstance.close();
});