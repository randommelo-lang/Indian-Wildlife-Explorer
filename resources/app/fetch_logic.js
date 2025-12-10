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
