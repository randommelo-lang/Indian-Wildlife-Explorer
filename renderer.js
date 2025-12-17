let speciesData = {};

async function loadSpeciesData() {
    try {
        const response = await fetch('data.json');
        const data = await response.json();

        // Group by family
        speciesData = data.reduce((acc, item) => {
            const family = item.family || "Other";
            if (!acc[family]) acc[family] = [];
            acc[family].push(item);
            return acc;
        }, {});

        // Update species count
        const totalCount = Object.values(speciesData).reduce((sum, family) => sum + family.length, 0);
        const countElement = document.getElementById('total-count');
        if (countElement) countElement.innerText = totalCount;

        startSpeciesSystem();
    } catch (error) {
        console.error("Error loading species data:", error);
    }
}

// Extract first page of PDF as image for cover
async function extractPdfFirstPageAsImage(pdfBuffer) {
    return new Promise(async (resolve, reject) => {
        try {
            // Load PDF.js dynamically
            if (!window.pdfjsLib) {
                const script = document.createElement('script');
                script.src = 'PDF/pdf.js';
                script.onload = () => {
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'PDF/pdf.worker.js';
                    processPdf();
                };
                script.onerror = () => reject(new Error("Failed to load PDF.js"));
                document.head.appendChild(script);
            } else {
                processPdf();
            }

            async function processPdf() {
                try {
                    // Convert ArrayBuffer to Uint8Array
                    const typedArray = new Uint8Array(pdfBuffer);

                    // Load the PDF
                    const pdf = await window.pdfjsLib.getDocument({ data: typedArray }).promise;

                    // Get first page
                    const page = await pdf.getPage(1);

                    // Set scale for good quality cover image
                    const scale = 1.5;
                    const viewport = page.getViewport({ scale });

                    // Create canvas
                    const canvas = document.createElement('canvas');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    const ctx = canvas.getContext('2d');

                    // Render page to canvas
                    await page.render({ canvasContext: ctx, viewport }).promise;

                    // Convert canvas to blob
                    canvas.toBlob((blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error("Failed to convert canvas to blob"));
                        }
                    }, 'image/jpeg', 0.85);

                } catch (err) {
                    reject(err);
                }
            }
        } catch (err) {
            reject(err);
        }
    });
}

let chartInstance = null;

/* ============================================================
   🟢 NAVIGATION & UI LOGIC
============================================================ */
function startSpeciesSystem() {
    const families = Object.keys(speciesData);
    const selector = document.getElementById("home-species-selector");
    const label = document.getElementById("selector-label");

    if (!selector) return;

    // Show label
    if (label) label.classList.remove("hidden");

    selector.innerHTML = families.map(f => {
        const firstSpecies = speciesData[f][0];
        const imagePath = firstSpecies.image.startsWith("http") ? firstSpecies.image : `Image/${firstSpecies.image}`;

        return `<button class="species-item" onclick="selectFamily('${f}')">
            <div class="thumb-circle">
                <img src="${imagePath}" alt="${f}">
            </div>
            <span class="species-name">${f}</span>
        </button>`;
    }).join("");
}

function selectFamily(family) {
    // Hide Home Page, Show Species Content
    document.getElementById("home-content").classList.add("hidden");
    document.getElementById("species-content").classList.remove("hidden");

    // Update Details Selector Bar
    const selector = document.getElementById("details-species-selector");
    const label = document.getElementById("details-selector-label");

    if (label) label.classList.remove("hidden");
    if (label) label.innerText = family;

    selector.innerHTML = `
        <button class="species-item" onclick="goBack()">
            <div class="thumb-circle" style="display:flex; align-items:center; justify-content:center; background:#e7e5e4;">
                <span style="font-size:1.5rem;">←</span>
            </div>
            <span class="species-name">Back</span>
        </button>
        ${speciesData[family].map(s => {
        const imagePath = s.image.startsWith("http") ? s.image : `Image/${s.image}`;
        const displayName = s.shortName || s.name; // Use shortName if available

        // Determine status class
        let statusClass = "status-safe";
        if (s.status === "Critically Endangered") statusClass = "status-critically-endangered";
        else if (s.status === "Endangered") statusClass = "status-endangered";
        else if (s.status === "Vulnerable") statusClass = "status-vulnerable";
        else if (s.status === "Near Threatened") statusClass = "status-vulnerable";
        else if (s.status === "Abundant") statusClass = "status-abundant";

        return `<button class="species-item" onclick="selectSpecies('${family}', '${s.name}')">
                <div class="thumb-circle ${statusClass}">
                    <img src="${imagePath}" alt="${s.name}">
                </div>
                <span class="species-name">${displayName}</span>
            </button>`;
    }).join("")}
    `;

    // Select first species by default
    selectSpecies(family, speciesData[family][0].name);
}

function selectSpecies(family, speciesName) {
    const data = speciesData[family].find(s => s.name === speciesName);
    if (!data) return;

    // Store current species data for tab switching
    currentSpeciesData = data;

    // Highlight active button
    document.querySelectorAll(".species-item").forEach(b => {
        const nameSpan = b.querySelector(".species-name");
        if (nameSpan) {
            b.classList.toggle("active", nameSpan.innerText === speciesName);
        }
    });

    // Update UI
    document.getElementById("detail-name").innerText = data.name;
    document.getElementById("detail-scientific").innerText = data.scientific || data.scientificName; // Handle both
    document.getElementById("content-text").innerText = data.overview || data.desc; // Handle both

    // Handle Image Path
    const imagePath = data.image.startsWith("http") ? data.image : `Image/${data.image}`;
    document.getElementById("detail-image").src = imagePath;

    // Update Stats
    document.getElementById("detail-pop").innerText = data.population;
    document.getElementById("detail-diet-type").innerText = data.dietType || data.diet; // Handle both

    // Status Badge Color
    const statusBadge = document.getElementById("detail-status");
    statusBadge.innerText = data.status;

    // Reset classes
    statusBadge.className = "status-badge";

    if (data.status === "Critically Endangered") statusBadge.classList.add("status-critically-endangered");
    else if (data.status === "Endangered") statusBadge.classList.add("status-endangered");
    else if (data.status === "Vulnerable") statusBadge.classList.add("status-vulnerable");
    else if (data.status === "Near Threatened") statusBadge.classList.add("status-vulnerable");
    else if (data.status === "Abundant") statusBadge.classList.add("status-abundant");
    else statusBadge.classList.add("status-safe");

    // Apply status color to the detail name
    const detailName = document.getElementById("detail-name");
    detailName.className = ""; // Reset classes
    if (data.status === "Critically Endangered") detailName.style.color = "#7f1d1d";
    else if (data.status === "Endangered") detailName.style.color = "#dc2626";
    else if (data.status === "Vulnerable") detailName.style.color = "#f59e0b";
    else if (data.status === "Near Threatened") detailName.style.color = "#f59e0b";
    else if (data.status === "Abundant") detailName.style.color = "#3b82f6";
    else detailName.style.color = "#059669";

    updateChart(data);
}

function goBack() {
    document.getElementById("species-content").classList.add("hidden");
    document.getElementById("home-content").classList.remove("hidden");
}

function updateChart(species) {
    const ctx = document.getElementById('traitChart')?.getContext('2d');
    if (!ctx) return;
    if (chartInstance) chartInstance.destroy();

    // Custom Gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(5, 150, 105, 0.5)'); // Emerald-600
    gradient.addColorStop(1, 'rgba(5, 150, 105, 0.1)');

    chartInstance = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['Fearlessness', 'Endurance', 'Stealth', 'Adaptability'],
            datasets: [{
                label: 'Traits',
                data: species.traits,
                fill: true,
                backgroundColor: gradient,
                borderColor: '#059669', // Emerald-600
                pointBackgroundColor: '#fff',
                pointBorderColor: '#059669',
                pointHoverBackgroundColor: '#059669',
                pointHoverBorderColor: '#fff',
                borderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(28, 25, 23, 0.9)', // Stone-900
                    titleFont: { family: 'Inter', size: 13 },
                    bodyFont: { family: 'Inter', size: 13 },
                    padding: 10,
                    cornerRadius: 8,
                    displayColors: false
                }
            },
            scales: {
                r: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        display: false, // Hide numbers
                        stepSize: 20
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)',
                        circular: true
                    },
                    angleLines: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    pointLabels: {
                        font: {
                            family: 'Inter',
                            size: 12,
                            weight: '600'
                        },
                        color: '#57534e' // Stone-600
                    }
                }
            },
            animation: {
                duration: 1000,
                easing: 'easeOutQuart'
            }
        }
    });
}

const uploadBtnArticle = document.getElementById("upload-article-btn");
const uploadBtnNews = document.getElementById("upload-news-btn");
const uploadBtnVideo = document.getElementById("upload-video-btn");
const uploadPanel = document.getElementById("upload-panel");
const uploadCancel = document.getElementById("upload-cancel-btn");
const uploadSave = document.getElementById("upload-save-btn");
const uploadTitle = document.getElementById("upload-panel-title");
const videoField = document.getElementById("video-upload-field");
const articleFields = document.getElementById("article-upload-fields");
const defaultFields = document.getElementById("default-upload-fields");

let uploadMode = "news";

function fixURL(link) {
    if (!link) return "";
    return link.startsWith("http") ? link : "https://" + link;
}

const readFileAsBuffer = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
};

function deduplicateNews(list) {
    const seenLinks = new Set();
    const seenTitles = new Set();

    return list.filter(item => {
        const link = item.link ? item.link.trim() : "";
        const title = item.title ? item.title.trim() : "";

        // If we've seen this link before, it's a duplicate
        if (link && seenLinks.has(link)) return false;
        // If we've seen this title before, it's a duplicate
        if (title && seenTitles.has(title)) return false;

        if (link) seenLinks.add(link);
        if (title) seenTitles.add(title);
        return true;
    });
}

function getYouTubeEmbedID(link) {
    if (!link) return null;
    link = fixURL(link);
    const m = link.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([^\&?\s]+)/);
    return m ? m[1] : null;
}

// Checklist Logic
const checklistInput = document.getElementById("upload-checklist");
const suggestionsBox = document.getElementById("checklist-suggestions");

if (checklistInput) {
    checklistInput.addEventListener("input", async (e) => {
        const val = e.target.value.toLowerCase();
        if (!val) {
            suggestionsBox.classList.add("hidden");
            return;
        }

        const articles = await window.storageAPI.read("articles");
        const checklists = [...new Set(articles.map(a => a.checklist).filter(c => c))];
        const matches = checklists.filter(c => c.toLowerCase().includes(val));

        if (matches.length > 0) {
            suggestionsBox.innerHTML = matches.map(c =>
                `<div class="suggestion-item" onclick="selectChecklist('${c}')">${c}</div>`
            ).join("");
            suggestionsBox.classList.remove("hidden");
        } else {
            suggestionsBox.classList.add("hidden");
        }
    });
}

window.selectChecklist = (val) => {
    checklistInput.value = val;
    suggestionsBox.classList.add("hidden");
};

// Close suggestions on click outside
document.addEventListener("click", (e) => {
    if (checklistInput && !checklistInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
        suggestionsBox.classList.add("hidden");
    }
});


if (uploadBtnNews) {
    uploadBtnNews.addEventListener("click", () => {
        uploadMode = "news";
        uploadTitle.innerText = "Upload News";
        if (videoField) videoField.classList.add("hidden");
        if (articleFields) articleFields.classList.add("hidden");
        if (defaultFields) defaultFields.classList.remove("hidden");
        uploadPanel.classList.remove("hidden");
        uploadPanel.classList.add("show");
        uploadPanel.classList.add("show");
    });
}

// Add thumbnail preview listener
const thumbInput = document.getElementById("upload-thumb");
if (thumbInput) {
    thumbInput.addEventListener("change", async (e) => {
        const preview = document.getElementById("thumbnail-preview");
        if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (e) => {
                preview.src = e.target.result;
                preview.classList.remove("hidden");
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    });
}

if (uploadBtnVideo) {
    uploadBtnVideo.addEventListener("click", () => {
        uploadMode = "videos";
        uploadTitle.innerText = "Upload Documentary";
        if (videoField) videoField.classList.remove("hidden");
        if (articleFields) articleFields.classList.add("hidden");
        if (defaultFields) defaultFields.classList.remove("hidden");
        uploadPanel.classList.remove("hidden");
        uploadPanel.classList.add("show");
    });
}

if (uploadBtnArticle) {
    uploadBtnArticle.addEventListener("click", () => {
        uploadMode = "articles";
        uploadTitle.innerText = "Upload Project Article";
        if (videoField) videoField.classList.add("hidden");
        if (articleFields) articleFields.classList.remove("hidden");
        if (defaultFields) defaultFields.classList.add("hidden");
        uploadPanel.classList.remove("hidden");
        uploadPanel.classList.add("show");
    });
}

if (uploadCancel) {
    uploadCancel.addEventListener("click", () => {
        uploadPanel.classList.remove("show");
        setTimeout(() => uploadPanel.classList.add("hidden"), 300);
    });
}

const fetchBtn = document.getElementById("fetch-metadata-btn");
if (fetchBtn) {
    fetchBtn.addEventListener("click", async () => {
        const linkInput = document.getElementById("upload-link");
        const titleInput = document.getElementById("upload-title");
        const descInput = document.getElementById("upload-description");
        const thumbPreview = document.getElementById("thumbnail-preview");

        const url = fixURL(linkInput.value.trim());
        if (!url) {
            alert("Please enter a URL first.");
            return;
        }

        fetchBtn.innerText = "Fetching...";
        fetchBtn.disabled = true;

        try {
            const data = await window.storageAPI.fetchNewsMetadata(url);
            if (data) {
                if (data.title) titleInput.value = data.title;
                if (data.desc) descInput.value = data.desc;
                if (data.thumb) {
                    thumbPreview.src = data.thumb;
                    thumbPreview.classList.remove("hidden");
                }
            } else {
                alert("Could not fetch metadata.");
            }
        } catch (error) {
            console.error("Fetch error:", error);
            alert("Error fetching metadata.");
        } finally {
            fetchBtn.innerText = "Fetch";
            fetchBtn.disabled = false;
        }
    });
}

if (uploadSave) {
    uploadSave.addEventListener("click", async () => {
        // Disable button to prevent double clicks
        uploadSave.disabled = true;
        const originalText = uploadSave.innerText;
        uploadSave.innerText = "Saving...";

        try {
            const title = document.getElementById("upload-title").value.trim();
            const desc = document.getElementById("upload-description").value.trim();
            let link = fixURL(document.getElementById("upload-link").value.trim());
            const file = document.getElementById("upload-video-file");
            const articleFile = document.getElementById("upload-article-file");
            const checklist = document.getElementById("upload-checklist").value.trim();

            if (uploadMode === "news") {
                let thumbnail = "";
                const thumbInput = document.getElementById("upload-thumb");
                const thumbPreview = document.getElementById("thumbnail-preview");

                // 1. Check for uploaded file
                if (thumbInput && thumbInput.files.length > 0) {
                    const file = thumbInput.files[0];
                    const buffer = await readFileAsBuffer(file);
                    thumbnail = await window.storageAPI.saveCloudFile({ name: file.name, buffer });
                }
                // 2. Check for fetched preview URL (if no upload)
                else if (thumbPreview && thumbPreview.src && !thumbPreview.classList.contains("hidden") && thumbPreview.src.startsWith("http")) {
                    thumbnail = thumbPreview.src;
                }

                // Check if news with same link already exists
                let list = await window.storageAPI.read("news");
                const newLink = link ? link.trim() : "";

                if (newLink) {
                    const exists = list.some(i => {
                        const iLink = i.link ? i.link.trim() : "";
                        return iLink === newLink;
                    });

                    if (exists) {
                        alert("This News Already Exist");
                        return;
                    }
                }

                const item = { title, desc, link, thumbnail, date: Date.now() };
                list.unshift(item);
                await window.storageAPI.write("news", list);
                loadNewsContent();


            } else if (uploadMode === "videos") {
                let localPath = "";
                if (file && file.files.length > 0) {
                    localPath = await window.storageAPI.saveLocalVideo(file.files[0].path);
                }

                const item = {
                    title,
                    desc,
                    link: link || null,
                    youtubeId: getYouTubeEmbedID(link),
                    localPath: localPath || null,
                    date: Date.now()
                };

                const list = await window.storageAPI.read("videos");
                list.unshift(item);
                await window.storageAPI.write("videos", list);
                loadVideosContent();


            } else if (uploadMode === "articles") {
                let localPath = "";
                let coverPhoto = "";
                const coverInput = document.getElementById("upload-article-cover");

                // Check for Title (mandatory field)
                if (!title) {
                    alert("Please enter a Title for the article.");
                    return;
                }

                // 1. Upload Article File (PDF/DOC)
                if (articleFile && articleFile.files.length > 0) {
                    try {
                        uploadSave.innerText = "Uploading File...";
                        const file = articleFile.files[0];
                        const buffer = await readFileAsBuffer(file);
                        localPath = await window.storageAPI.saveCloudFile({ name: file.name, buffer });
                        console.log("✅ Article uploaded:", file.name);
                    } catch (err) {
                        console.error("❌ Article upload failed:", err);
                        alert("Failed to upload article file.");
                        return;
                    }
                }

                // 2. Upload Cover Photo (or extract from PDF first page)
                if (coverInput && coverInput.files.length > 0) {
                    // User provided a cover image manually
                    try {
                        uploadSave.innerText = "Uploading Cover...";
                        const file = coverInput.files[0];
                        const buffer = await readFileAsBuffer(file);
                        coverPhoto = await window.storageAPI.saveCloudFile({ name: file.name, buffer });
                        console.log("✅ Cover uploaded:", file.name);
                    } catch (err) {
                        console.error("❌ Cover upload failed:", err);
                    }
                } else if (articleFile && articleFile.files.length > 0 && articleFile.files[0].name.toLowerCase().endsWith('.pdf')) {
                    // Auto-extract first page from PDF as cover
                    try {
                        uploadSave.innerText = "Generating Cover from PDF...";
                        const pdfFile = articleFile.files[0];
                        const pdfBuffer = await readFileAsBuffer(pdfFile);

                        // Extract first page as image
                        const coverBlob = await extractPdfFirstPageAsImage(pdfBuffer);

                        // Convert blob to buffer for upload
                        const coverArrayBuffer = await coverBlob.arrayBuffer();
                        const coverFileName = pdfFile.name.replace('.pdf', '_cover.jpg');

                        coverPhoto = await window.storageAPI.saveCloudFile({
                            name: coverFileName,
                            buffer: coverArrayBuffer
                        });
                        console.log("✅ Cover auto-generated from PDF first page");
                    } catch (err) {
                        console.error("❌ Auto cover extraction failed:", err);
                        // Continue without cover - not fatal
                    }
                }

                // 3. Prepare and Save Metadata to Firestore
                const item = {
                    title,
                    checklist: checklist || null,
                    localPath, // Firebase URL for PDF/DOC
                    coverPhoto, // Firebase URL for Image
                    date: Date.now()
                };

                const list = await window.storageAPI.read("articles");
                list.unshift(item);
                await window.storageAPI.write("articles", list);

                // 4. Reload Content
                loadArticlesContent();
            }

            uploadPanel.classList.remove("show");
            setTimeout(() => uploadPanel.classList.add("hidden"), 300);
        } catch (error) {
            console.error("Upload failed:", error);
            alert("Upload failed. Please try again.");
        } finally {
            // Re-enable button
            uploadSave.disabled = false;
            uploadSave.innerText = originalText;
        }
    });
}

async function loadNewsContent() {
    const feed = document.getElementById("news-feed");
    if (!feed) return;

    const list = await window.storageAPI.read("news");
    if (!list || list.length === 0) {
        feed.innerHTML = "<p style='color:#78716c; text-align:center; grid-column: 1/-1;'>No news uploaded yet.</p>";
        return;
    }

    // Deduplicate on load
    const uniqueList = deduplicateNews(list);
    if (uniqueList.length !== list.length) {
        console.log("Removed duplicates from news feed");
        await window.storageAPI.write("news", uniqueList);
        // We can continue rendering uniqueList
    }

    // Placeholder images for news
    const defaultImage = "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?q=80&w=600&auto=format&fit=crop";

    feed.innerHTML = list.map((x, index) => {
        const initialImage = x.thumbnail || defaultImage;
        const needsFetch = !x.thumbnail && x.link;

        return `
            <div class="news-card" onclick="openNewsPage('${x.link}')" style="cursor: pointer;">
                <img src="${initialImage}" 
                     alt="${x.title}" 
                     class="news-thumbnail" 
                     id="news-thumb-${index}"
                     data-link="${needsFetch ? x.link : ''}"
                     data-fallback="${defaultImage}"
                     onerror="this.src='${defaultImage}'">
                <div class="news-content">
                    <h3>${x.title}</h3>
                    <p>${x.desc}</p>
                    <span style="color: var(--primary); font-weight: 600; font-size: 0.9rem;">Read more ↗</span>
                </div>
            </div>`;
    }).join("");

    list.forEach((x, index) => {
        if (!x.thumbnail && x.link) {
            fetchMetadata(x.link, index);
        }
    });
}

async function fetchMetadata(url, index) {
    try {
        const response = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`);
        const data = await response.json();
        if (data.status === 'success' && data.data.image && data.data.image.url) {
            const img = document.getElementById(`news-thumb-${index}`);
            if (img) {
                img.src = data.data.image.url;
            }
        }
    } catch (e) {
        console.error("Error fetching metadata for:", url, e);
    }
}

async function loadVideosContent() {
    const feed = document.getElementById("video-feed");
    if (!feed) return;
    const list = await window.storageAPI.read("videos");
    feed.innerHTML = "";

    list.forEach(v => {
        const wrapper = document.createElement("div");
        wrapper.classList.add("video-card");

        // Determine ID or Path
        const id = v.youtubeId || getYouTubeEmbedID(v.link);
        const videoSource = v.localPath || id;

        // Robust thumbnail fallback
        let thumbnail = 'https://images.unsplash.com/photo-1500485035595-cbe6f645feb1?w=800&q=80'; // Default nature

        if (id) {
            thumbnail = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
        } else if (v.link && v.link.includes('youtube')) {
            const tempId = getYouTubeEmbedID(v.link);
            if (tempId) thumbnail = `https://img.youtube.com/vi/${tempId}/hqdefault.jpg`;
        } else if (v.localPath) {
            // For local videos, we could use a specific icon or just the default nature image
            thumbnail = 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=800&q=80'; // Scenic mountain for local video
        }

        wrapper.innerHTML = `
            <div class="video-thumbnail-wrapper" onclick="openVideoModal('${videoSource || ''}')">
                <img src="${thumbnail}" alt="${v.title}" class="video-thumbnail" onerror="this.src='https://images.unsplash.com/photo-1500485035595-cbe6f645feb1?w=800&q=80'">
                <div class="play-overlay">▶</div>
            </div>
            <div class="video-info">
                <h3>${v.title}</h3>
                <p>${v.desc}</p>
                <a href="javascript:void(0)" onclick="openVideoModal('${videoSource || ''}')">Watch Now ↗</a>
            </div>`;
        feed.appendChild(wrapper);
    });
}

/* ────────────────────────────────────────────
   🎬 VIDEO POP-UP PLAYER (YouTube + Local)
──────────────────────────────────────────── */
let currentVideoId = null;
let videoErrorTimer = null;

function openVideoModal(source) {
    if (!source) {
        alert("Invalid video source");
        return;
    }

    const modal = document.getElementById('video-modal');
    const webview = document.getElementById('modal-video-view');
    const videoPlayer = document.getElementById('modal-video-player');
    const overlay = document.getElementById('video-error-overlay');

    if (!webview || !videoPlayer) {
        console.error("Error: Could not find video elements");
        return;
    }

    // Reset state
    currentVideoId = source;
    if (overlay) overlay.classList.add('hidden');
    if (videoErrorTimer) clearTimeout(videoErrorTimer);

    // Check if it's a local file (starts with 'videos/') or a YouTube ID
    if (source.startsWith("videos/")) {
        // Local Video
        webview.style.display = 'none';
        webview.src = ""; // Stop iframe

        videoPlayer.style.display = 'block';
        videoPlayer.src = source;
        videoPlayer.play().catch(e => console.error("Play error:", e));
    } else {
        // YouTube ID
        videoPlayer.style.display = 'none';
        videoPlayer.pause();

        webview.style.display = 'block';
        const embedUrl = `https://www.youtube-nocookie.com/embed/${source}?` +
            `autoplay=1` +
            `&enablejsapi=1` +
            `&origin=${encodeURIComponent(window.location.origin)}` +
            `&rel=0` +
            `&modestbranding=1`;
        webview.src = embedUrl;

        // Only set fallback timer for YouTube videos
        videoErrorTimer = setTimeout(() => {
            if (overlay && !modal.classList.contains('hidden') && webview.style.display !== 'none') {
                overlay.classList.remove('hidden');
            }
        }, 2500);
    }

    modal.classList.remove("hidden");
}

function closeVideoModal() {
    const modal = document.getElementById('video-modal');
    const webview = document.getElementById('modal-video-view');
    const videoPlayer = document.getElementById('modal-video-player');
    const overlay = document.getElementById('video-error-overlay');

    if (videoErrorTimer) clearTimeout(videoErrorTimer);

    if (webview) webview.src = "about:blank";
    if (videoPlayer) {
        videoPlayer.pause();
        videoPlayer.src = "";
    }

    modal.classList.add("hidden");
    if (overlay) overlay.classList.add('hidden');
    currentVideoId = null;
}

function openOnYouTube() {
    if (currentVideoId && !currentVideoId.startsWith("videos/")) {
        const youtubeUrl = `https://www.youtube.com/watch?v=${currentVideoId}`;
        if (window.storageAPI && window.storageAPI.openExternal) {
            window.storageAPI.openExternal(youtubeUrl);
        } else {
            window.open(youtubeUrl, '_blank');
        }
        closeVideoModal();
    }
}

document.getElementById('video-modal')?.addEventListener('click', e => {
    if (e.target.id === 'video-modal') closeVideoModal();
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('video-modal');
    if (modal && !modal.classList.contains('hidden')) {
        if (e.key.toLowerCase() === 'y') openOnYouTube();
        else if (e.key === 'Escape') closeVideoModal();
    }
});

/* ────────────────────────────────────────────
   📰 NEWS SLIDE-UP PAGE
──────────────────────────────────────────── */
function openNewsPage(url) {
    if (!url) return;
    const slidePage = document.getElementById('news-slide-page');
    const iframe = document.getElementById('news-iframe');

    if (!slidePage || !iframe) return;

    iframe.src = url;
    slidePage.classList.add('active');
}

function closeNewsPage() {
    const slidePage = document.getElementById('news-slide-page');
    const iframe = document.getElementById('news-iframe');

    if (slidePage) slidePage.classList.remove('active');

    setTimeout(() => {
        if (iframe) iframe.src = 'about:blank';
    }, 400);
}

// Article Viewer Logic
async function openArticleViewer(path, title) {
    const modal = document.getElementById("article-viewer-modal");
    const modalTitle = document.getElementById("article-viewer-title");
    const iframe = document.getElementById("article-frame");

    modalTitle.innerText = title || "Article Viewer";

    // path is ALWAYS HTTP URL now — no gs:// conversion needed
    const url = String(path).trim();

    console.log("📄 Opening Article Viewer");
    console.log("📎 PDF URL:", url);

    // Check if URL is valid
    if (!url || url === "undefined" || url === "null") {
        console.error("❌ Invalid PDF URL");
        alert("No PDF file available for this article.");
        return;
    }

    iframe.classList.remove("hidden");
    iframe.src = "PDF/viewer.html";

    iframe.onload = () => {
        console.log("✅ Iframe loaded, sending PDF URL...");
        // Small delay to ensure viewer.html script is ready
        setTimeout(() => {
            iframe.contentWindow.postMessage({ fileUrl: url }, "*");
            console.log("📤 PostMessage sent with URL:", url);
        }, 100);
    };

    modal.classList.add("active");
}






function closeArticleViewer() {
    const modal = document.getElementById('article-viewer-modal');
    const iframe = document.getElementById('article-frame');

    if (modal) modal.classList.remove('active');

    setTimeout(() => {
        if (iframe) iframe.src = 'about:blank';
    }, 400);
}

async function loadArticlesContent() {
    const feed = document.getElementById("article-feed");
    if (!feed) return;

    const list = await window.storageAPI.read("articles");

    if (!list || list.length === 0) {
        feed.innerHTML = "<p style='color:#78716c; text-align:center; grid-column: 1/-1;'>No articles uploaded yet.</p>";
        return;
    }

    const defaultImage = "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?q=80&w=600&auto=format&fit=crop";

    feed.innerHTML = list.map((x) => {
        const coverImage = x.coverPhoto || defaultImage;

        // Always open article popup, no matter if link or pdf
        const viewerData = JSON.stringify({
            title: x.title,
            path: x.localPath || x.link || ""
        }).replace(/"/g, "&quot;");

        return `
            <div class="book-card-container">
                <div class="book-card" onclick='openArticleViewerData(${viewerData})'>
                    <div class="book-cover">
                        <img src="${coverImage}" alt="${x.title}">
                        <div class="book-spine"></div>
                    </div>
                </div>
                <div class="book-details">
                    <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom: 0.5rem;">
                        <h3 class="book-title">${x.title}</h3>
                        ${x.checklist ? `<span class="status-badge status-safe" style="font-size:0.65rem; padding: 2px 6px; height: fit-content;">${x.checklist}</span>` : ''}
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span class="book-action" onclick='openArticleViewerData(${viewerData})'>Open Article ↗</span>
                        <button class="delete-article-btn" onclick="event.stopPropagation(); deleteArticle('${x.id}', '${x.title.replace(/'/g, "\\'")}')">🗑️</button>
                    </div>
                </div>
            </div>`;
    }).join("");
}

// Delete article from Firestore
async function deleteArticle(docId, title) {
    if (!docId) {
        alert("Cannot delete: Article ID not found.");
        return;
    }

    const confirmed = confirm(`Are you sure you want to delete "${title}"?`);
    if (!confirmed) return;

    try {
        const result = await window.storageAPI.delete("articles", docId);
        if (result) {
            console.log("✅ Article deleted:", title);
            loadArticlesContent(); // Reload the list
        } else {
            alert("Failed to delete article.");
        }
    } catch (err) {
        console.error("❌ Delete error:", err);
        alert("Error deleting article.");
    }
}

function openArticleViewerData(data) {
    if (!data || (!data.path && !data.title)) return;
    openArticleViewer(data.path, data.title);
}


/* ============================================================
   🔄 TAB SWITCHING LOGIC
============================================================ */
let currentSpeciesData = null;

// Tab switching
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('tab-btn')) {
        const tab = e.target.dataset.tab;

        // Update active tab
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');

        // Update content
        const contentText = document.getElementById('content-text');
        if (currentSpeciesData && contentText) {
            if (tab === 'overview') {
                contentText.innerText = currentSpeciesData.overview || currentSpeciesData.desc || '';
            } else if (tab === 'habitat') {
                contentText.innerText = currentSpeciesData.habitat || 'Habitat information not available.';
            } else if (tab === 'social') {
                contentText.innerText = currentSpeciesData.social || 'Social behavior information not available.';
            }
        }
    }
});




/* ============================================================
   🟢 START EVERYTHING ONCE
============================================================ */
document.addEventListener("DOMContentLoaded", () => {
    loadSpeciesData();        // ← species system (async)
    loadNewsContent();        // ← news system
    loadVideosContent();      // ← video system
    loadArticlesContent();    // ← articles system

    // Button listener
    const ytBtn = document.getElementById('open-youtube-btn');
    if (ytBtn) ytBtn.addEventListener('click', openOnYouTube);

    // Thumbnail Preview Logic
    const uploadThumbInput = document.getElementById('upload-thumb');
    const thumbPreview = document.getElementById('thumbnail-preview');

    if (uploadThumbInput && thumbPreview) {
        uploadThumbInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    thumbPreview.src = e.target.result;
                    thumbPreview.classList.remove('hidden');
                };
                reader.readAsDataURL(file);
            } else {
                thumbPreview.classList.add('hidden');
                thumbPreview.src = '';
            }
        });
    }

    // Article Cover Preview Logic
    const articleCoverInput = document.getElementById('upload-article-cover');
    const articleCoverPreview = document.getElementById('article-cover-preview');

    if (articleCoverInput && articleCoverPreview) {
        articleCoverInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    articleCoverPreview.src = e.target.result;
                    articleCoverPreview.classList.remove('hidden');
                };
                reader.readAsDataURL(file);
            } else {
                articleCoverPreview.classList.add('hidden');
                articleCoverPreview.src = '';
            }
        });
    }
});


