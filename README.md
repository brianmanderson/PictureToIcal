# PictureToICal

Upload a photo of a calendar or schedule, extract the events, and download a `.ics` file you can import into Google Calendar, Outlook, or Apple Calendar.

**All processing happens in your browser.** No data is uploaded anywhere.

## How It Works

1. **Upload** — Drop, paste, or browse for an image of a table-style schedule (rows with dates, times, and event names).
2. **Extract** — Tesseract.js runs OCR entirely in your browser to read the text from the image.
3. **Review** — Extracted events appear in an editable table. Fix any OCR errors, add or remove rows.
4. **Download** — Click to download a valid `.ics` file ready for import.

## Usage

### GitHub Pages

Visit the hosted version (no install needed):

> **https://BrianMAnderson.github.io/PictureToICal/**

### Run Locally

No build step required — just serve the files:

```bash
# Python
python -m http.server 8080

# Then open http://localhost:8080
```

## Supported Input Formats

Works best with table/schedule-style images where each row contains:
- A **date** (e.g., `1/15/2025`, `Jan 15`, `2025-01-15`)
- A **time** or time range (e.g., `9:00 AM`, `2pm - 4pm`)
- An **event title**

## Tech Stack

- **Tesseract.js v5** — Client-side OCR (WASM)
- Vanilla HTML/CSS/JS — No framework, no build step
- ES Modules — Native browser imports

## Deploying to GitHub Pages

1. Push this repo to GitHub
2. Go to **Settings > Pages**
3. Set source to **Deploy from a branch** > `main` > `/ (root)`
4. Your site will be live at `https://<username>.github.io/PictureToICal/`

## License

MIT
"# PictureToIcal" 
