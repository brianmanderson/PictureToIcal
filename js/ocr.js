/**
 * Tesseract.js OCR wrapper with adaptive image preprocessing.
 */

// Tesseract works best when text is at least ~30px tall.
// Upscale small images so text hits that threshold.
const MIN_OCR_WIDTH = 1000;

/**
 * Analyze image brightness to determine if it's a screenshot or camera photo.
 * Screenshots: bright, low variance (white/light background, clean text)
 * Camera photos: darker, high variance (uneven lighting, shadows, paper texture)
 */
function analyzeImage(imageData) {
    const data = imageData.data;
    const pixelCount = data.length / 4;
    let sum = 0;
    let sumSq = 0;

    for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        sum += gray;
        sumSq += gray * gray;
    }

    const mean = sum / pixelCount;
    const variance = (sumSq / pixelCount) - (mean * mean);

    return {
        mean,
        variance,
        isScreenshot: mean > 180 && variance < 8000,
    };
}

/**
 * Preprocess an image for OCR.
 *
 * Strategy:
 *   - Screenshots (bright, clean): upscale if small, keep as grayscale.
 *     No binarization — Tesseract handles clean screenshots best with anti-aliased edges intact.
 *   - Camera photos (dark, noisy): grayscale + threshold binarization to cut through
 *     uneven lighting and paper textures, then upscale.
 *
 * Returns a canvas element ready for Tesseract.
 */
function preprocessImage(img) {
    const srcCanvas = document.createElement('canvas');
    const srcCtx = srcCanvas.getContext('2d');

    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    srcCanvas.width = w;
    srcCanvas.height = h;
    srcCtx.drawImage(img, 0, 0);

    const imageData = srcCtx.getImageData(0, 0, w, h);
    const { isScreenshot } = analyzeImage(imageData);
    const data = imageData.data;

    if (isScreenshot) {
        // Convert to grayscale only — preserve anti-aliased text edges
        for (let i = 0; i < data.length; i += 4) {
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            data[i] = gray;
            data[i + 1] = gray;
            data[i + 2] = gray;
        }
    } else {
        // Camera photo: grayscale + threshold binarization
        const threshold = 140;
        for (let i = 0; i < data.length; i += 4) {
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            const val = gray > threshold ? 255 : 0;
            data[i] = val;
            data[i + 1] = val;
            data[i + 2] = val;
        }
    }

    srcCtx.putImageData(imageData, 0, 0);

    // Upscale small images for better OCR accuracy
    // Tesseract accuracy improves significantly when text is larger
    if (w < MIN_OCR_WIDTH) {
        const scale = Math.min(2, MIN_OCR_WIDTH / w);
        const outCanvas = document.createElement('canvas');
        outCanvas.width = Math.round(w * scale);
        outCanvas.height = Math.round(h * scale);
        const outCtx = outCanvas.getContext('2d');
        outCtx.imageSmoothingEnabled = true;
        outCtx.imageSmoothingQuality = 'high';
        outCtx.drawImage(srcCanvas, 0, 0, outCanvas.width, outCanvas.height);
        return outCanvas;
    }

    return srcCanvas;
}

/**
 * Run OCR on an image element.
 * @param {HTMLImageElement} img - The image to process.
 * @param {function} onProgress - Callback with { status: string, progress: number (0-1) }.
 * @returns {Promise<string>} The extracted text.
 */
export async function extractText(img, onProgress) {
    const canvas = preprocessImage(img);

    const worker = await Tesseract.createWorker('eng', 1, {
        logger: (m) => {
            if (m.status && onProgress) {
                onProgress({
                    status: m.status,
                    progress: m.progress || 0,
                });
            }
        },
    });

    const { data } = await worker.recognize(canvas);
    await worker.terminate();

    return data.text;
}
