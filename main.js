const { app, BrowserWindow, shell, ipcMain, session } = require("electron");
const path = require("path");
const https = require("https");
const cheerio = require("cheerio-without-node-native");
const express = require("express");
const fs = require("fs");
require('dotenv').config({ path: path.join(__dirname, '.env') });

// ------------------------------------------------------
// 🟢 1. FIREBASE SETUP
// ------------------------------------------------------
const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs, addDoc, deleteDoc, doc, orderBy, query } = require("firebase/firestore");
const { getStorage, ref, uploadBytes, getDownloadURL } = require("firebase/storage");
const { getAuth, signInAnonymously } = require("firebase/auth");


const firebaseConfig = {
    apiKey: process.env.API_KEY,
    authDomain: process.env.AUTH_DOMAIN,
    projectId: process.env.PROJECT_ID,
    storageBucket: process.env.STORAGE_BUCKET,
    messagingSenderId: process.env.MESSAGING_SENDER_ID,
    appId: process.env.APP_ID,
    measurementId: process.env.MEASUREMENT_ID
};

// 🛡️ SECURITY: Validate Firebase Config
const requiredKeys = ['API_KEY', 'PROJECT_ID', 'APP_ID'];
const missingKeys = requiredKeys.filter(key => !process.env[key]);

if (missingKeys.length > 0) {
    const { dialog } = require("electron");
    app.whenReady().then(() => {
        dialog.showErrorBox(
            "Configuration Error",
            `Missing required environment variables: ${missingKeys.join(", ")}.\n\nPlease ensure your .env file is present and contains these values.`
        );
        app.quit();
    });
}

// Initialize Cloud DB
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);
const auth = getAuth(firebaseApp);

// 🛡️ AUTHENTICATION: Track auth state
let isAuthenticated = false;

// 🛡️ AUTHENTICATION: Sign in with retry logic
const signInWithRetry = async (retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            await signInAnonymously(auth);
            console.log("✅ Firebase authentication successful");
            return true;
        } catch (error) {
            console.error(`❌ Auth attempt ${i + 1}/${retries} failed:`, error.code, error.message);
            if (i < retries - 1) {
                const delay = 1000 * (i + 1); // Exponential backoff: 1s, 2s, 3s
                console.log(`⏳ Retrying in ${delay / 1000}s...`);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }
    console.error("❌ All authentication attempts failed");
    return false;
};

// 🛡️ AUTHENTICATION: Listen for auth state changes
auth.onAuthStateChanged((user) => {
    if (user) {
        isAuthenticated = true;
        console.log("✅ User authenticated:", user.uid);
    } else {
        isAuthenticated = false;
        console.log("⚠️ User signed out, re-authenticating...");
        signInWithRetry();
    }
});

// Initial authentication
signInWithRetry();

// ------------------------------------------------------
// 🟢 2. LOCAL SERVER SETUP
// ------------------------------------------------------
const server = express();

// 🛡️ SECURITY: Serve only necessary assets (not the whole root)
server.get("/", (req, res) => res.sendFile(path.join(__dirname, "Index.html")));
server.get("/Index.html", (req, res) => res.sendFile(path.join(__dirname, "Index.html")));
server.get("/style.css", (req, res) => res.sendFile(path.join(__dirname, "style.css")));
server.get("/renderer.js", (req, res) => res.sendFile(path.join(__dirname, "renderer.js")));
server.get("/data.json", (req, res) => res.sendFile(path.join(__dirname, "data.json")));
server.get("/icon.ico", (req, res) => res.sendFile(path.join(__dirname, "icon.ico")));

// Serve specific directories
server.use("/Image", express.static(path.join(__dirname, "Image")));
server.use("/videos", express.static(path.join(__dirname, "videos")));
server.use("/PDF", express.static(path.join(__dirname, "PDF")));
server.use("/lib", express.static(path.join(__dirname, "lib")));

let serverInstance;
let myPort;

// 🛡️ SECURITY: Allowlist of valid Firestore collection names
const VALID_COLLECTION_TYPES = ['news', 'videos', 'articles'];

// 🛡️ SECURITY: Validate collection type against allowlist
function isValidCollectionType(type) {
    return typeof type === 'string' && VALID_COLLECTION_TYPES.includes(type);
}

// 🛡️ SECURITY: Validate and sanitize file paths
function isValidFilePath(filePath) {
    if (typeof filePath !== 'string') return false;
    // Prevent path traversal attacks
    const normalizedPath = path.normalize(filePath);
    if (normalizedPath.includes('..') || normalizedPath.includes('~')) return false;
    // Block access to sensitive files
    const lowerPath = normalizedPath.toLowerCase();
    if (lowerPath.includes('.env') || lowerPath.includes('config') || lowerPath.includes('secret')) return false;
    return true;
}

// 🛡️ SECURITY: List of allowed URL patterns for external opening
const ALLOWED_URL_PATTERNS = [
    /^https:\/\/(www\.)?youtube\.com\//,
    /^https:\/\/(www\.)?youtu\.be\//,
    /^https:\/\/(www\.)?reddit\.com\//,
    /^https:\/\/(www\.)?nyburs\.com\//,
    /^https:\/\/(www\.)?firebasestorage\.googleapis\.com\//
];

function isAllowedExternalUrl(url) {
    if (!url || typeof url !== 'string') return false;
    // Must be HTTPS (no HTTP for security)
    if (!url.startsWith('https://')) return false;
    // Check against allowlist
    return ALLOWED_URL_PATTERNS.some(pattern => pattern.test(url));
}

// ------------------------------------------------------
// 🛡️ SECURITY: RATE LIMITING
// ------------------------------------------------------
const lastActionTimes = new Map();
const RATE_LIMIT_MS = 10000; // 10 seconds between writes

function isRateLimited(action) {
    const now = Date.now();
    const lastTime = lastActionTimes.get(action) || 0;
    if (now - lastTime < RATE_LIMIT_MS) {
        return true;
    }
    lastActionTimes.set(action, now);
    return false;
}

// ------------------------------------------------------
// 🟢 3. CLOUD HANDLERS
// ------------------------------------------------------
ipcMain.handle("read-storage", async (_, type) => {
    try {
        // 🛡️ SECURITY: Validate collection type
        if (!isValidCollectionType(type)) {
            console.error("Security: Invalid collection type requested:", type);
            return [];
        }
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
        // 🛡️ SECURITY: Validate collection type
        if (!isValidCollectionType(type)) {
            console.error("Security: Invalid collection type for write:", type);
            return false;
        }
        // 🛡️ SECURITY: Rate limiting
        if (isRateLimited("write-storage")) {
            console.warn("Security: IPC Write Rate limit exceeded");
            return false;
        }

        if (!dataList || dataList.length === 0) return false;
        const newItem = dataList[0];

        // 🛡️ SECURITY: Sanitize string inputs to prevent injection
        const sanitizeString = (str) => {
            if (typeof str !== 'string') return str;
            return str.replace(/<script[^>]*>.*?<\/script>/gi, '')
                .replace(/javascript:/gi, '')
                .substring(0, 10000); // Limit length
        };

        // Clean data (Firestore hates 'undefined')
        const cleanItem = {
            title: sanitizeString(newItem.title) || "Untitled",
            desc: sanitizeString(newItem.desc) || "",
            link: sanitizeString(newItem.link) || "",
            date: newItem.date || Date.now(),
            youtubeId: sanitizeString(newItem.youtubeId) || null,
            localPath: sanitizeString(newItem.localPath) || null,
            checklist: sanitizeString(newItem.checklist) || null,
            coverPhoto: sanitizeString(newItem.coverPhoto) || null,
            thumbnail: sanitizeString(newItem.thumbnail) || null
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
        // 🛡️ SECURITY: Validate collection type
        if (!isValidCollectionType(type)) {
            console.error("Security: Invalid collection type for delete:", type);
            return false;
        }
        // 🛡️ SECURITY: Validate document ID format
        if (!docId || typeof docId !== 'string' || docId.length > 100) {
            console.error("Security: Invalid document ID:", docId);
            return false;
        }
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
    // 🛡️ SECURITY: Strict URL validation with allowlist
    if (isAllowedExternalUrl(url)) {
        await shell.openExternal(url);
        return true;
    } else {
        console.warn("Security: Blocked external URL:", url);
        return false;
    }
});

// Handle File Uploads to Firebase Storage (PDFs & Images)
ipcMain.handle("save-cloud-file", async (_, data) => {
    try {
        // 🛡️ SECURITY: Rate limiting
        if (isRateLimited("save-cloud-file")) {
            console.warn("Security: IPC Upload Rate limit exceeded");
            return null;
        }

        let fileName, fileBuffer;

        // 🛡️ SECURITY: Allowed file extensions
        const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.gif', '.webp'];

        if (typeof data === 'string') {
            // 🛡️ SECURITY: Validate file path
            if (!isValidFilePath(data)) {
                console.error("Security: Invalid file path blocked:", data);
                return null;
            }
            const ext = path.extname(data).toLowerCase();
            if (!ALLOWED_EXTENSIONS.includes(ext)) {
                console.error("Security: Invalid file extension:", ext);
                return null;
            }
            fileName = Date.now() + "-" + path.basename(data);
            fileBuffer = fs.readFileSync(data);
        } else if (data && data.name && data.buffer) {
            // 🛡️ SECURITY: Validate file name
            const sanitizedName = path.basename(data.name).replace(/[^a-zA-Z0-9._-]/g, '_');
            const ext = path.extname(sanitizedName).toLowerCase();
            if (!ALLOWED_EXTENSIONS.includes(ext)) {
                console.error("Security: Invalid file extension:", ext);
                return null;
            }
            fileName = Date.now() + "-" + sanitizedName;
            fileBuffer = Buffer.from(data.buffer);
        } else {
            throw new Error("Invalid file data");
        }

        // 🛡️ SECURITY: Limit file size (100MB max)
        const MAX_FILE_SIZE = 100 * 1024 * 1024;
        if (fileBuffer.length > MAX_FILE_SIZE) {
            console.error("Security: File too large:", fileBuffer.length);
            return null;
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
        icon: path.join(__dirname, "icon.ico"),
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
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

app.whenReady().then(() => {
    if (missingKeys.length === 0) {
        createWindow();
    }
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
    if (serverInstance) serverInstance.close();
});