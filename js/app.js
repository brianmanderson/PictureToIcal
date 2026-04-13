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
function loadImage(file) {
    if (!file || !file.type.startsWith('image/')) return;
    currentFile = file;

    // Use createImageBitmap to properly handle EXIF orientation from mobile cameras,
    // then draw to a canvas to produce a reliable image for OCR.
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
        URL.revokeObjectURL(url);
        // createImageBitmap respects EXIF orientation in modern browsers
        createImageBitmap(img).then((bitmap) => {
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(bitmap, 0, 0);
            const dataURL = canvas.toDataURL('image/png');
            previewImg.src = dataURL;
            dropZone.classList.add('hidden');
            imagePreview.classList.remove('hidden');
        }).catch(() => {
            // Fallback: use original image directly
            previewImg.src = img.src;
            dropZone.classList.add('hidden');
            imagePreview.classList.remove('hidden');
        });
    };
    img.onerror = () => {
        URL.revokeObjectURL(url);
        alert('Could not load the image. Please try a different file.');
    };
    img.src = url;
}

function clearImage() {
    currentFile = null;
    previewImg.src = '';
    dropZone.classList.remove('hidden');
    imagePreview.classList.add('hidden');
}

// ── File Input Handlers ──
fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) loadImage(e.target.files[0]);
});

dropZone.addEventListener('click', () => fileInput.click());

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
