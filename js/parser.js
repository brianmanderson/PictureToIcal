/**
 * Heuristic parser: extracts calendar events from raw OCR text.
 * Designed for table/schedule-style layouts with rows of Date | Time | Event.
 */
import { parseFlexibleTime, addHours } from './utils.js';

/**
 * Format a time object { hours, minutes } back into a readable string like "10:00 AM".
 */
function formatTime({ hours, minutes }) {
    const period = hours >= 12 ? 'PM' : 'AM';
    const h = hours % 12 || 12;
    const mm = String(minutes).padStart(2, '0');
    return `${h}:${mm} ${period}`;
}

/**
 * If no end time was found but we have a start time, default end to start + 1 hour.
 */
function defaultEndTime(startTimeStr, endTimeStr) {
    if (endTimeStr || !startTimeStr) return endTimeStr;
    const parsed = parseFlexibleTime(startTimeStr);
    if (!parsed) return '';
    return formatTime(addHours(parsed, 1));
}

/** Day-of-week names to strip from remaining text (they're part of the date, not the title). */
const DAY_NAMES = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b\.?/gi;

/**
 * Pre-process a line to fix common OCR artifacts:
 * - Insert space between month name and day number when missing ("April13" → "April 13")
 */
function fixOCRArtifacts(line) {
    return line.replace(
        /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(\d)/gi,
        '$1 $2'
    );
}

// Date patterns
const DATE_PATTERNS = [
    // MM/DD/YYYY, MM-DD-YYYY, MM.DD.YYYY (and 2-digit year)
    /\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\b/,
    // YYYY-MM-DD
    /\b(\d{4}-\d{1,2}-\d{1,2})\b/,
    // "January 15, 2025" or "Jan 15, 2025" or "Jan 15 2025" or "Jan 15"
    /\b((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}(?:\s*,?\s*\d{2,4})?)\b/i,
    // "15 January 2025" or "15 Jan"
    /\b(\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?(?:\s*,?\s*\d{2,4})?)\b/i,
];

// Time patterns — match a time or a time range
const TIME_RANGE_PATTERN =
    /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)\s*[-–—to]+\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)\b/i;

const TIME_SINGLE_PATTERN =
    /\b(\d{1,2}:\d{2}\s*(?:am|pm|a\.m\.|p\.m\.)?)\b|\b(\d{1,2}\s*(?:am|pm|a\.m\.|p\.m\.))\b/i;

/**
 * Try to extract a date string from a line. Returns { match, remaining } or null.
 */
function extractDate(line) {
    for (const pattern of DATE_PATTERNS) {
        const m = line.match(pattern);
        if (m) {
            const remaining = line.replace(m[0], '  ').trim();
            return { match: m[1] || m[0], remaining };
        }
    }
    return null;
}

/**
 * Try to extract time(s) from a line. Returns { startTime, endTime, remaining }.
 */
function extractTimes(line) {
    // Try range first: "9:00 AM - 11:00 AM"
    const rangeMatch = line.match(TIME_RANGE_PATTERN);
    if (rangeMatch) {
        const remaining = line.replace(rangeMatch[0], '  ').trim();
        return { startTime: rangeMatch[1].trim(), endTime: rangeMatch[2].trim(), remaining };
    }

    // Single time
    const singleMatch = line.match(TIME_SINGLE_PATTERN);
    if (singleMatch) {
        const matched = (singleMatch[1] || singleMatch[2]).trim();
        const remaining = line.replace(singleMatch[0], '  ').trim();
        return { startTime: matched, endTime: '', remaining };
    }

    return { startTime: '', endTime: '', remaining: line };
}

/**
 * Clean up a title string extracted after removing date/time tokens.
 */
function cleanTitle(str) {
    return str
        .replace(/^[\s|,\-–—:]+/, '')  // leading separators
        .replace(/[\s|,\-–—:]+$/, '')  // trailing separators
        .replace(/\s{2,}/g, ' ')       // collapse whitespace
        .trim();
}

/**
 * Parse raw OCR text into an array of event objects.
 * Returns [{ date, startTime, endTime, title, location }]
 */
export function parseEventsFromText(rawText) {
    if (!rawText) return [];

    const lines = rawText.split('\n').map((l) => fixOCRArtifacts(l.trim())).filter(Boolean);
    const events = [];
    let lastDate = '';

    for (const line of lines) {
        // Skip lines that look like headers
        if (/^(date|time|event|description|location|schedule|calendar)\b/i.test(line)) continue;
        // Skip very short lines (likely noise)
        if (line.length < 3) continue;

        // Extract date
        const dateResult = extractDate(line);
        let currentDate = lastDate;
        let rest = line;
        const hasOwnDate = !!dateResult;

        if (dateResult) {
            currentDate = dateResult.match;
            lastDate = currentDate;
            rest = dateResult.remaining;
        }

        // Extract times
        const timeResult = extractTimes(rest);
        const hasTime = !!timeResult.startTime;

        // Lines that inherit a date (no date of their own) must have a time
        // to be considered events — otherwise they're likely footer text or noise
        if (!hasOwnDate && !hasTime) continue;

        // Strip day-of-week names (they're part of the date, not the event title)
        let title = cleanTitle(timeResult.remaining.replace(DAY_NAMES, ' '));

        // If no title remains but we have a date+time, use a generic label
        if (!title && currentDate) {
            title = 'Event';
        }

        // Only create event if we have at least a title and a date
        if (title && currentDate) {
            events.push({
                date: currentDate,
                startTime: timeResult.startTime,
                endTime: defaultEndTime(timeResult.startTime, timeResult.endTime),
                title,
                location: '',
            });
        }
    }

    return events;
}
