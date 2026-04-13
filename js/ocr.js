/**
 * Tesseract.js OCR wrapper with image preprocessing.
 */

/**
 * Preprocess an image on a canvas for better OCR accuracy.
 * Converts to grayscale and applies threshold binarization.
 * Returns a canvas element.
 */
function preprocessImage(img) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;

    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Grayscale + threshold binarization
    const threshold = 140;
    for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const val = gray > threshold ? 255 : 0;
        data[i] = val;
        data[i + 1] = val;
        data[i + 2] = val;
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
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
