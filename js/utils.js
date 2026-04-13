/**
 * Date/time parsing and iCal formatting utilities.
 */

const MONTH_NAMES = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
    apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
    aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9,
    nov: 10, november: 10, dec: 11, december: 11,
};

/**
 * Parse a flexible date string into { year, month, day } or null.
 * Supports: MM/DD/YYYY, MM-DD-YYYY, YYYY-MM-DD, "Jan 15", "January 15, 2025",
 * "15 Jan 2025", "15 January", etc.
 */
export function parseFlexibleDate(str) {
    if (!str) return null;
    str = str.trim();

    // ISO / slash / dash numeric: YYYY-MM-DD, MM/DD/YYYY, MM-DD-YYYY, M/D/YY
    const numericMatch = str.match(
        /^(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})$/
    );
    if (numericMatch) {
        let [, a, b, c] = numericMatch.map(Number);
        // YYYY-MM-DD
        if (a > 31) return { year: a, month: b, day: c };
        // MM/DD/YYYY or MM-DD-YYYY
        if (c > 31) return { year: c < 100 ? 2000 + c : c, month: a, day: b };
        // Ambiguous M/D/YY — assume MM/DD/YY
        return { year: c < 100 ? 2000 + c : c, month: a, day: b };
    }

    // "Month Day, Year" or "Month Day Year" or "Month Day"
    const mdyMatch = str.match(
        /^([a-z]+)\.?\s+(\d{1,2})(?:\s*,?\s*(\d{2,4}))?$/i
    );
    if (mdyMatch) {
        const month = MONTH_NAMES[mdyMatch[1].toLowerCase()];
        if (month !== undefined) {
            let year = mdyMatch[3] ? Number(mdyMatch[3]) : new Date().getFullYear();
            if (year < 100) year += 2000;
            return { year, month: month + 1, day: Number(mdyMatch[2]) };
        }
    }

    // "Day Month Year" or "Day Month"
    const dmyMatch = str.match(
        /^(\d{1,2})\s+([a-z]+)\.?(?:\s*,?\s*(\d{2,4}))?$/i
    );
    if (dmyMatch) {
        const month = MONTH_NAMES[dmyMatch[2].toLowerCase()];
        if (month !== undefined) {
            let year = dmyMatch[3] ? Number(dmyMatch[3]) : new Date().getFullYear();
            if (year < 100) year += 2000;
            return { year, month: month + 1, day: Number(dmyMatch[1]) };
        }
    }

    return null;
}

/**
 * Parse a time string into { hours, minutes } (24-hour) or null.
 * Supports: "2pm", "2:30 PM", "14:00", "9:00am", "noon", "midnight".
 */
export function parseFlexibleTime(str) {
    if (!str) return null;
    str = str.trim().toLowerCase();

    if (str === 'noon' || str === '12noon') return { hours: 12, minutes: 0 };
    if (str === 'midnight') return { hours: 0, minutes: 0 };

    // HH:MM with optional am/pm
    const match = str.match(/^(\d{1,2}):(\d{2})\s*(am|pm|a\.m\.|p\.m\.)?$/i);
    if (match) {
        let hours = Number(match[1]);
        const minutes = Number(match[2]);
        const period = match[3];
        if (period) {
            const isPM = period.startsWith('p');
            if (isPM && hours < 12) hours += 12;
            if (!isPM && hours === 12) hours = 0;
        }
        return { hours, minutes };
    }

    // H am/pm (no minutes)
    const shortMatch = str.match(/^(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)$/i);
    if (shortMatch) {
        let hours = Number(shortMatch[1]);
        const isPM = shortMatch[2].startsWith('p');
        if (isPM && hours < 12) hours += 12;
        if (!isPM && hours === 12) hours = 0;
        return { hours, minutes: 0 };
    }

    // Plain 24-hour HH:MM
    const plain = str.match(/^(\d{1,2}):(\d{2})$/);
    if (plain) {
        return { hours: Number(plain[1]), minutes: Number(plain[2]) };
    }

    return null;
}

/**
 * Format a date+time as an iCal DATETIME string: YYYYMMDDTHHMMSS
 */
export function formatICalDateTime(date, time) {
    const y = String(date.year).padStart(4, '0');
    const m = String(date.month).padStart(2, '0');
    const d = String(date.day).padStart(2, '0');
    if (!time) return `${y}${m}${d}`;
    const hh = String(time.hours).padStart(2, '0');
    const mm = String(time.minutes).padStart(2, '0');
    return `${y}${m}${d}T${hh}${mm}00`;
}

/**
 * Format a date-only iCal value: YYYYMMDD
 */
export function formatICalDateOnly(date) {
    const y = String(date.year).padStart(4, '0');
    const m = String(date.month).padStart(2, '0');
    const d = String(date.day).padStart(2, '0');
    return `${y}${m}${d}`;
}

/**
 * Escape text for iCal property values per RFC 5545.
 */
export function escapeICalText(str) {
    if (!str) return '';
    return str
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\n/g, '\\n');
}

/**
 * Fold a single iCal content line to 75 octets per RFC 5545.
 */
export function foldLine(line) {
    if (line.length <= 75) return line;
    const parts = [line.substring(0, 75)];
    let i = 75;
    while (i < line.length) {
        parts.push(' ' + line.substring(i, i + 74));
        i += 74;
    }
    return parts.join('\r\n');
}

/**
 * Add hours to a time object, returning a new { hours, minutes }.
 */
export function addHours(time, h) {
    return { hours: (time.hours + h) % 24, minutes: time.minutes };
}

/**
 * Generate a UUID.
 */
export function generateUID() {
    return crypto.randomUUID();
}
