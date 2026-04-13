/**
 * Main application controller — wires UI to OCR, parser, and iCal generator.
 */
import { extractText } from './ocr.js';
import { parseEventsFromText } from './parser.js';
import { generateICS, downloadICS } from './ical-generator.js';

// ── DOM References ──
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const imagePreview = document.getElementById('image-preview');
const previewImg = document.getElementById('preview-img');
const btnClear = document.getElementById('btn-clear');
const btnExtract = document.getElementById('btn-extract');

const sectionUpload = document.getElementById('step-upload');
const sectionExtract = document.getElementById('step-extract');
const sectionReview = document.getElementById('step-review');
const sectionDownload = document.getElementById('step-download');

const progressBar = document.getElementById('progress-bar');
const progressLabel = document.getElementById('progress-label');
const rawTextDetails = document.getElementById('raw-text-details');
const rawTextArea = document.getElementById('raw-text');

const eventsBody = document.getElementById('events-body');
const btnAddRow = document.getElementById('btn-add-row');
const btnDownload = document.getElementById('btn-download');

const btnBackUpload = document.getElementById('btn-back-upload');

const downloadSummary = document.getElementById('download-summary');
const btnDownloadAgain = document.getElementById('btn-download-again');
const btnStartOver = document.getElementById('btn-start-over');

const steps = document.querySelectorAll('.step');

// ── State ──
let currentFile = null;
let lastICS = '';

// ── Step Navigation ──
function goToStep(num) {
    [sectionUpload, sectionExtract, sectionReview, sectionDownload].forEach((s) =>
        s.classList.add('hidden')
    );
    steps.forEach((s) => {
        const n = Number(s.dataset.step);
        s.classList.toggle('active', n === num);
        s.classList.toggle('done', n < num);
    });

    const sections = { 1: sectionUpload, 2: sectionExtract, 3: sectionReview, 4: sectionDownload };
    sections[num]?.classList.remove('hidden');
}

// ── Image Loading ──
const loadingImage = document.getElementById('loading-image');

// Max dimension for OCR — large phone photos are downscaled for speed
const MAX_IMAGE_DIM = 2000;

function showImageLoading() {
    dropZone.classList.add('hidden');
    imagePreview.classList.add('hidden');
    loadingImage.classList.remove('hidden');
}

function hideImageLoading() {
    loadingImage.classList.add('hidden');
}

function showPreview() {
    hideImageLoading();
    imagePreview.classList.remove('hidden');
}

/**
 * Set the preview image src and wait for it to load.
 * Resolves when loaded, rejects on error or timeout.
 */
function setPreviewSrc(src, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Image load timed out')), timeoutMs);
        // Clean up any previous handlers
        previewImg.onload = () => { clearTimeout(timer); resolve(); };
        previewImg.onerror = () => { clearTimeout(timer); reject(new Error('Image failed to load')); };
        previewImg.src = src;
    });
}

async function loadImage(file) {
    if (!file) return;
    // Accept any image type; some mobile cameras report unusual MIME types
    if (file.type && !file.type.startsWith('image/')) return;
    currentFile = file;
    showImageLoading();

    try {
        // Try createImageBitmap first — handles EXIF orientation from mobile cameras
        const bitmap = await createImageBitmap(file);

        // Downscale large images for faster OCR and preview rendering
        let w = bitmap.width;
        let h = bitmap.height;
        if (w > MAX_IMAGE_DIM || h > MAX_IMAGE_DIM) {
            const scale = MAX_IMAGE_DIM / Math.max(w, h);
            w = Math.round(w * scale);
            h = Math.round(h * scale);
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);

        // Convert canvas to blob (async, non-blocking) then display
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (blob) {
            const url = URL.createObjectURL(blob);
            await setPreviewSrc(url);
            URL.revokeObjectURL(url);
        } else {
            // toBlob returned null — use dataURL fallback
            await setPreviewSrc(canvas.toDataURL('image/png'));
        }

        showPreview();
    } catch {
        // Fallback: load the file directly via object URL (handles HEIC on older iOS, etc.)
        try {
            const url = URL.createObjectURL(file);
            await setPreviewSrc(url);
            URL.revokeObjectURL(url);
            showPreview();
        } catch {
            hideImageLoading();
            dropZone.classList.remove('hidden');
            alert('Could not load the image. Please try a different file.');
        }
    }
}

function clearImage() {
    currentFile = null;
    previewImg.src = '';
    fileInput.value = '';  // Reset so re-selecting the same file triggers change
    hideImageLoading();
    dropZone.classList.remove('hidden');
    imagePreview.classList.add('hidden');
}

// ── File Input Handlers ──
fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) loadImage(e.target.files[0]);
});

dropZone.addEventListener('click', (e) => {
    // Don't trigger a second file picker if the click came from the label or input itself
    if (e.target === fileInput || e.target.closest('.file-btn')) return;
    fileInput.click();
});

dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput.click();
    }
});

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) loadImage(file);
});

// Clipboard paste
document.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
        if (item.type.startsWith('image/')) {
            loadImage(item.getAsFile());
            break;
        }
    }
});

btnClear.addEventListener('click', clearImage);

// ── OCR Extraction ──
btnExtract.addEventListener('click', async () => {
    if (!currentFile) return;

    goToStep(2);
    progressBar.style.width = '0%';
    progressLabel.textContent = 'Initializing OCR...';
    rawTextDetails.classList.add('hidden');

    try {
        const text = await extractText(previewImg, ({ status, progress }) => {
            const pct = Math.round(progress * 100);
            progressBar.style.width = `${pct}%`;
            progressBar.setAttribute('aria-valuenow', pct);

            const labels = {
                'loading tesseract core': 'Loading OCR engine...',
                'initializing tesseract': 'Initializing...',
                'loading language traineddata': 'Loading language data...',
                'initializing api': 'Preparing...',
                'recognizing text': `Recognizing text... ${pct}%`,
            };
            progressLabel.textContent = labels[status] || status;
        });

        progressBar.style.width = '100%';
        progressLabel.textContent = 'Done!';

        rawTextArea.value = text;
        rawTextDetails.classList.remove('hidden');

        // Parse events
        const events = parseEventsFromText(text);
        populateEventsTable(events);
        goToStep(3);
    } catch (err) {
        progressLabel.textContent = `Error: ${err.message}`;
        progressBar.style.width = '0%';
        console.error('OCR Error:', err);
    }
});

// ── Events Table ──
function createEventRow(event = {}) {
    const tr = document.createElement('tr');
    const fields = ['date', 'startTime', 'endTime', 'title', 'location'];
    const placeholders = ['MM/DD/YYYY', '9:00 AM', '10:00 AM', 'Event title', 'Location (optional)'];

    fields.forEach((field, i) => {
        const td = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'text';
        input.name = field;
        input.value = event[field] || '';
        input.placeholder = placeholders[i];
        td.appendChild(input);
        tr.appendChild(td);
    });

    const tdAction = document.createElement('td');
    const btnDel = document.createElement('button');
    btnDel.className = 'btn-delete-row';
    btnDel.type = 'button';
    btnDel.textContent = '\u00d7';
    btnDel.title = 'Remove row';
    btnDel.addEventListener('click', () => tr.remove());
    tdAction.appendChild(btnDel);
    tr.appendChild(tdAction);

    return tr;
}

function populateEventsTable(events) {
    eventsBody.innerHTML = '';
    if (events.length === 0) {
        // Add one empty row so user can manually enter
        eventsBody.appendChild(createEventRow());
        return;
    }
    for (const event of events) {
        eventsBody.appendChild(createEventRow(event));
    }
}

function getEventsFromTable() {
    const rows = eventsBody.querySelectorAll('tr');
    const events = [];
    for (const row of rows) {
        const inputs = row.querySelectorAll('input');
        events.push({
            date: inputs[0].value,
            startTime: inputs[1].value,
            endTime: inputs[2].value,
            title: inputs[3].value,
            location: inputs[4].value,
        });
    }
    return events;
}

btnAddRow.addEventListener('click', () => {
    eventsBody.appendChild(createEventRow());
    // Focus the date input of the new row
    const lastRow = eventsBody.lastElementChild;
    lastRow?.querySelector('input')?.focus();
});

// ── Download ──
function doDownload() {
    const events = getEventsFromTable();
    const { ics, count, warnings } = generateICS(events);

    if (count === 0) {
        alert(
            'No valid events to export.\n\n' +
            (warnings.length ? 'Issues:\n' + warnings.join('\n') : 'Make sure each event has a date and title.')
        );
        return;
    }

    lastICS = ics;
    downloadICS(ics);

    let summary = `${count} event${count !== 1 ? 's' : ''} exported.`;
    if (warnings.length) {
        summary += `\n${warnings.length} event${warnings.length !== 1 ? 's' : ''} skipped.`;
    }
    downloadSummary.textContent = summary;
    goToStep(4);
}

btnDownload.addEventListener('click', doDownload);

btnBackUpload.addEventListener('click', () => {
    clearImage();
    eventsBody.innerHTML = '';
    rawTextArea.value = '';
    goToStep(1);
});

btnDownloadAgain.addEventListener('click', () => {
    if (lastICS) downloadICS(lastICS);
});

btnStartOver.addEventListener('click', () => {
    clearImage();
    eventsBody.innerHTML = '';
    rawTextArea.value = '';
    lastICS = '';
    goToStep(1);
});

// ── Init ──
goToStep(1);
