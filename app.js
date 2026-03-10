// --- State Management ---
const STORAGE_KEY = "colorAlphaExtractor";
const defaultState = {
	resultColor: "#dcf7fd",
	originalBg: "#ffffff",
	columns: ["#ffffff", "#000000"],
	format: "hexa",
	hideInvalid: true,
	theme: "auto",
};

function loadState () {
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved) {
			const parsed = JSON.parse(saved);
			return {...defaultState, ...parsed};
		}
	}
	catch (error) {}
	return {...defaultState};
}

function saveState () {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	}
	catch (error) {}
}

const state = loadState();

// --- DOM Elements ---
const els = {
	resPicker: document.getElementById("result-color-picker"),
	resHex: document.getElementById("result-color-hex"),
	bgPicker: document.getElementById("bg-color-picker"),
	bgHex: document.getElementById("bg-color-hex"),
	outFormat: document.getElementById("output-format"),
	addColPicker: document.getElementById("new-col-picker"),
	addColHex: document.getElementById("new-col-hex"),
	addColBtn: document.getElementById("add-col-btn"),
	tableHead: document.getElementById("table-head-row"),
	tableBody: document.getElementById("table-body"),
	toast: document.getElementById("toast"),
	eyeDropperRes: document.getElementById("eyedropper-result"),
	eyeDropperBg: document.getElementById("eyedropper-bg"),
	hideInvalidCheckbox: document.getElementById("hide-invalid-checkbox"),

	// Canvas elements
	imgUpload: document.getElementById("image-upload"),
	dropzone: document.getElementById("dropzone-area"),
	canvasContainer: document.getElementById("canvas-container"),
	dropzoneContent: document.getElementById("dropzone-content"),
	canvas: document.getElementById("image-canvas"),
	ctx: document.getElementById("image-canvas").getContext("2d", {willReadFrequently: true}),
	clearImgBtn: document.getElementById("clear-image"),
	pickerMode: document.getElementById("picker-mode"),
};

// --- Core Logic ---
const hexToRgb = (hex) => {
	hex = hex.replace("#", "");
	if (hex.length === 3) {
		hex = hex
			.split("")
			.map((x) => x + x)
			.join("");
	}
	return [
		parseInt(hex.slice(0, 2), 16),
		parseInt(hex.slice(2, 4), 16),
		parseInt(hex.slice(4, 6), 16),
	];
};

const rgbToHex = (r, g, b) => {
	return (
		"#" +
		[r, g, b]
			.map((x) => {
				const h = Math.round(x).toString(16);
				return h.length === 1 ? "0" + h : h;
			})
			.join("")
	);
};

function calculateBaseColor (mixedHex, bgHex, alpha) {
	const [rR, gR, bR] = hexToRgb(mixedHex);
	const [rB, gB, bB] = hexToRgb(bgHex);
	const calc = (res, bg, a) => (res - (1 - a) * bg) / a;

	let rU = calc(rR, rB, alpha);
	let gU = calc(gR, gB, alpha);
	let bU = calc(bR, bB, alpha);

	const isValid = rU >= -5 && rU <= 260 && gU >= -5 && gU <= 260 && bU >= -5 && bU <= 260;

	rU = Math.max(0, Math.min(255, Math.round(rU)));
	gU = Math.max(0, Math.min(255, Math.round(gU)));
	bU = Math.max(0, Math.min(255, Math.round(bU)));

	return {r: rU, g: gU, b: bU, a: alpha, isValid};
}

function formatColor (base, format, colHex) {
	const {r, g, b, a} = base;
	if (format === "hexa") {
		const alphaHex = Math.round(a * 255)
			.toString(16)
			.padStart(2, "0");
		return `${rgbToHex(r, g, b)}${alphaHex}`;
	}
	else if (format === "rgba") {
		const cleanA = Math.round(a * 100) / 100;
		return `rgba(${r}, ${g}, ${b}, ${cleanA})`;
	}
	else if (format === "color-mix") {
		const aPercent = Math.round(a * 100);
		return `color-mix(in srgb, ${rgbToHex(r, g, b)} ${aPercent}%, transparent)`;
	}
	else if (format === "mixed" && colHex) {
		const [bgR, bgG, bgB] = hexToRgb(colHex);
		const mixedR = Math.round(r * a + bgR * (1 - a));
		const mixedG = Math.round(g * a + bgG * (1 - a));
		const mixedB = Math.round(b * a + bgB * (1 - a));
		return rgbToHex(mixedR, mixedG, mixedB);
	}
}

function ensureValidHex (hex, fallback) {
	const valid = /^#([0-9A-F]{3}){1,2}$/i.test(hex);
	return valid ? hex : fallback;
}

// --- UI Updates ---
function updateTable () {
	els.tableHead.innerHTML = `<th>Alpha</th><th>Base Color (No Alpha)</th>`;
	state.columns.forEach((col, idx) => {
		const th = document.createElement("th");
		th.innerHTML = `
                <div class="col-header">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        Preview on
                        <div class="header-color-swatch" style="width: 18px; height: 18px; border-radius: 4px; background-color: ${col}; border: 1px solid rgba(255,255,255,0.15);"></div>
                        <span>${col}</span>
                    </div>
                    ${idx >= 2 ? `<button class="remove-col" data-idx="${idx}" title="Remove"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>` : ""}
                </div>
            `;
		els.tableHead.appendChild(th);
	});

	els.tableBody.innerHTML = "";
	let firstValidRowIndex = null;
	let validRowCount = 0;
	const rows = [];

	for (let alphaPercent = 0; alphaPercent <= 100; alphaPercent += 2.5) {
		const a = alphaPercent / 100;
		const tr = document.createElement("tr");

		const base = calculateBaseColor(state.resultColor, state.originalBg, a);

		// Track first valid row for scrolling and highlight first 3 valid rows
		if (base.isValid) {
			if (firstValidRowIndex === null) {
				firstValidRowIndex = rows.length;
			}
			validRowCount++;
			if (validRowCount <= 3) {
				tr.classList.add("preferred-row");
			}
		}
		else if (state.hideInvalid) {
			tr.classList.add("invalid-row");
		}

		const tdAlpha = document.createElement("td");
		tdAlpha.style.fontWeight = "600";
		tdAlpha.style.color = "var(--text-main)";
		tdAlpha.innerHTML = `<span class="alpha-cell-content">${alphaPercent}%${base.isValid && validRowCount <= 3 ? "<span class=\"preferred-badge\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"20 6 9 17 4 12\"></polyline></svg><span class=\"badge-label\">Recommended</span></span>" : ""}</span>`;
		tr.appendChild(tdAlpha);

		// Add base color column (without alpha)
		const tdBase = document.createElement("td");
		if (!base.isValid) {
			tdBase.innerHTML = `<div class="out-of-bounds"><strong>Out of bounds</strong><span style="opacity: 0.8; margin-top: 4px;">Impossible to reach result</span></div>`;
		}
		else {
			const baseColorHex = rgbToHex(base.r, base.g, base.b);

			const previewBox = document.createElement("div");
			previewBox.className = "color-preview-box";
			previewBox.style.backgroundColor = baseColorHex;

			const codeLabel = document.createElement("div");
			codeLabel.className = "color-code";
			codeLabel.textContent = baseColorHex;
			codeLabel.title = "Click to copy";
			codeLabel.onclick = () => copyToClipboard(baseColorHex);

			const container = document.createElement("div");
			container.className = "cell-content";
			container.appendChild(previewBox);
			container.appendChild(codeLabel);

			tdBase.appendChild(container);
		}
		tr.appendChild(tdBase);

		state.columns.forEach((colHex) => {
			const td = document.createElement("td");
			if (!base.isValid) {
				td.innerHTML = `<div class="out-of-bounds"><strong>Out of bounds</strong><span style="opacity: 0.8; margin-top: 4px;">Impossible to reach result</span></div>`;
			}
			else {
				const previewBox = document.createElement("div");
				previewBox.className = "color-preview-box";
				previewBox.style.backgroundColor = colHex;

				const innerOverlay = document.createElement("div");
				innerOverlay.style.width = "100%";
				innerOverlay.style.height = "100%";
				innerOverlay.style.backgroundColor = `rgba(${base.r}, ${base.g}, ${base.b}, ${base.a})`;
				previewBox.appendChild(innerOverlay);

				const colorString = formatColor(base, state.format, colHex);

				const codeLabel = document.createElement("div");
				codeLabel.className = "color-code";
				codeLabel.textContent = colorString;
				codeLabel.title = "Click to copy";
				codeLabel.onclick = () => copyToClipboard(colorString);

				const container = document.createElement("div");
				container.className = "cell-content";
				container.appendChild(previewBox);
				container.appendChild(codeLabel);

				td.appendChild(container);
			}
			tr.appendChild(td);
		});

		rows.push(tr);
		els.tableBody.appendChild(tr);
	}

	// Scroll to first valid row within the table container
	if (firstValidRowIndex !== null) {
		// Use setTimeout to ensure DOM is rendered

		const updateScroll = () => {
			const tableContainer = document.querySelector(".table-container");
			const firstValidRow = rows[firstValidRowIndex];
			const rowTop = firstValidRow.offsetTop;
			const headerHeight = document.querySelector("#results-table thead").offsetHeight;

			// Scroll the table container to show the first valid row just below the header
			tableContainer.scrollTop = rowTop - headerHeight;
		};
		setTimeout(updateScroll, 50);
		updateScroll();
	}

	document.querySelectorAll(".remove-col").forEach((btn) => {
		btn.addEventListener("click", (e) => {
			const idx = parseInt(e.currentTarget.dataset.idx);
			state.columns.splice(idx, 1);
			updateTable();
			saveState();
		});
	});
}

function syncInputs () {
	els.resPicker.value = state.resultColor;
	els.resHex.value = state.resultColor;
	els.bgPicker.value = state.originalBg;
	els.bgHex.value = state.originalBg;
	els.hideInvalidCheckbox.checked = state.hideInvalid;
	applyTheme();
}

function applyTheme () {
	const effectiveTheme =
		state.theme === "auto"
			? window.matchMedia("(prefers-color-scheme: dark)").matches
				? "dark"
				: "light"
			: state.theme;

	document.documentElement.setAttribute("data-theme", effectiveTheme);
	document.querySelectorAll(".theme-btn").forEach((btn) => {
		if (btn.dataset.theme === state.theme) {
			btn.classList.add("active");
		}
		else {
			btn.classList.remove("active");
		}
	});
}

function copyToClipboard (text) {
	const ta = document.createElement("textarea");
	ta.value = text;
	ta.style.position = "fixed";
	ta.style.opacity = "0";
	document.body.appendChild(ta);
	ta.select();
	try {
		document.execCommand("copy");
		showToast();
	}
	catch (error) {
		console.error("Failed to copy text", error);
	}
	document.body.removeChild(ta);
}

function showToast () {
	els.toast.classList.add("show");
	setTimeout(() => els.toast.classList.remove("show"), 2000);
}

function loadImageFile (file) {
	if (!file || !file.type.startsWith("image/")) {
		return;
	}

	const reader = new FileReader();
	reader.onload = (event) => {
		const img = new Image();
		img.onload = () => {
			els.canvasContainer.style.display = "block";
			const containerWidth = els.canvasContainer.clientWidth;
			const scale = Math.min(1, containerWidth / img.width);
			els.canvas.width = img.width * scale;
			els.canvas.height = img.height * scale;

			els.ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
			els.ctx.drawImage(img, 0, 0, els.canvas.width, els.canvas.height);

			els.dropzoneContent.style.display = "none";
			els.pickerMode.style.display = "flex";
			els.clearImgBtn.style.display = "flex";
		};
		img.src = event.target.result;
	};
	reader.readAsDataURL(file);
}

// --- Native EyeDropper Support ---
if (!window.EyeDropper) {
	els.eyeDropperRes.style.display = "none";
	els.eyeDropperBg.style.display = "none";
}
else {
	const picker = new EyeDropper();

	els.eyeDropperRes.addEventListener("click", async () => {
		try {
			const result = await picker.open();
			state.resultColor = result.sRGBHex;
			syncInputs();
			updateTable();
		}
		catch (error) {}
	});

	els.eyeDropperBg.addEventListener("click", async () => {
		try {
			const result = await picker.open();
			state.originalBg = result.sRGBHex;
			syncInputs();
			updateTable();
		}
		catch (error) {}
	});
}

// --- Image Canvas Picker Logic ---
els.imgUpload.addEventListener("change", (e) => {
	const file = e.target.files[0];
	loadImageFile(file);
});

["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
	els.dropzone.addEventListener(eventName, (e) => {
		e.preventDefault();
		e.stopPropagation();
	});
});

let dragCounter = 0;

els.dropzone.addEventListener("dragenter", (e) => {
	dragCounter++;
	els.dropzone.classList.add("dragover");
});

els.dropzone.addEventListener("dragleave", (e) => {
	dragCounter--;
	if (dragCounter === 0) {
		els.dropzone.classList.remove("dragover");
	}
});

els.dropzone.addEventListener("drop", (e) => {
	dragCounter = 0;
	els.dropzone.classList.remove("dragover");

	const file = Array.from(e.dataTransfer.files || []).find((item) =>
		item.type.startsWith("image/")
	);
	if (!file) {
		return;
	}

	els.imgUpload.files = e.dataTransfer.files;
	loadImageFile(file);
});

els.clearImgBtn.addEventListener("click", (e) => {
	e.stopPropagation(); // prevent triggering upload again
	els.imgUpload.value = "";
	els.canvasContainer.style.display = "none";
	els.dropzoneContent.style.display = "block";
	els.pickerMode.style.display = "none";
	els.clearImgBtn.style.display = "none";
	els.ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
});

els.canvas.addEventListener("click", (e) => {
	e.stopPropagation(); // prevent triggering upload again
	const rect = els.canvas.getBoundingClientRect();
	const x = Math.floor(e.clientX - rect.left);
	const y = Math.floor(e.clientY - rect.top);

	const pixel = els.ctx.getImageData(x, y, 1, 1).data;
	const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);

	const target = document.querySelector("input[name=\"pick-target\"]:checked").value;
	if (target === "result") {
		state.resultColor = hex;
	}
	else {
		state.originalBg = hex;
	}
	syncInputs();
	updateTable();
	saveState();
});

// --- Event Listeners ---
els.resPicker.addEventListener("input", (e) => {
	state.resultColor = e.target.value;
	els.resHex.value = state.resultColor;
	updateTable();
	saveState();
});
els.resHex.addEventListener("change", (e) => {
	state.resultColor = ensureValidHex(e.target.value, state.resultColor);
	syncInputs();
	updateTable();
	saveState();
});

els.bgPicker.addEventListener("input", (e) => {
	state.originalBg = e.target.value;
	els.bgHex.value = state.originalBg;
	updateTable();
	saveState();
});
els.bgHex.addEventListener("change", (e) => {
	state.originalBg = ensureValidHex(e.target.value, state.originalBg);
	syncInputs();
	updateTable();
	saveState();
});

els.outFormat.addEventListener("change", (e) => {
	state.format = e.target.value;
	updateTable();
	saveState();
});

els.addColPicker.addEventListener("input", (e) => {
	els.addColHex.value = e.target.value;
});
els.addColHex.addEventListener("change", (e) => {
	els.addColPicker.value = ensureValidHex(e.target.value, "#000000");
});
els.addColBtn.addEventListener("click", () => {
	const newCol = ensureValidHex(els.addColHex.value, "#000000");
	if (!state.columns.includes(newCol)) {
		state.columns.push(newCol);
		updateTable();
		saveState();
	}
});

els.hideInvalidCheckbox.addEventListener("change", (e) => {
	state.hideInvalid = e.target.checked;
	updateTable();
	saveState();
});

// Theme switcher
document.querySelectorAll(".theme-btn").forEach((btn) => {
	btn.addEventListener("click", () => {
		state.theme = btn.dataset.theme;
		applyTheme();
		saveState();
	});
});

// Listen for system theme changes when auto is selected
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
	if (state.theme === "auto") {
		applyTheme();
	}
});

// Initialize
syncInputs();
updateTable();
