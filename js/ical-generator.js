/**
 * Generates RFC 5545 compliant .ics file content from an array of events.
 *
 * Each event: { date, startTime, endTime, title, location }
 *   - date: string (user-entered, e.g. "2025-01-15")
 *   - startTime: string or "" (e.g. "9:00 AM")
 *   - endTime: string or "" (e.g. "10:00 AM")
 *   - title: string
 *   - location: string or ""
 */
import {
    parseFlexibleDate,
    parseFlexibleTime,
    formatICalDateTime,
    formatICalDateOnly,
    escapeICalText,
    foldLine,
    addHours,
    generateUID,
} from './utils.js';

function nowStamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/**
 * Generate a complete .ics calendar string from events.
 * Returns { ics: string, count: number, warnings: string[] }
 */
export function generateICS(events) {
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//PictureToICal//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
    ];
    const warnings = [];
    let count = 0;
    const stamp = nowStamp();

    for (const event of events) {
        const date = parseFlexibleDate(event.date);
        if (!date) {
            warnings.push(`Skipped "${event.title || 'untitled'}": could not parse date "${event.date}"`);
            continue;
        }

        const title = (event.title || '').trim();
        if (!title) {
            warnings.push(`Skipped event on ${event.date}: no title`);
            continue;
        }

        const startTime = parseFlexibleTime(event.startTime);
        const endTime = parseFlexibleTime(event.endTime);

        const eventLines = [
            'BEGIN:VEVENT',
            `UID:${generateUID()}@picturetoical`,
            `DTSTAMP:${stamp}`,
        ];

        if (startTime) {
            eventLines.push(`DTSTART:${formatICalDateTime(date, startTime)}`);
            if (endTime) {
                eventLines.push(`DTEND:${formatICalDateTime(date, endTime)}`);
            } else {
                // Default: 1 hour duration
                eventLines.push(`DTEND:${formatICalDateTime(date, addHours(startTime, 1))}`);
            }
        } else {
            // All-day event
            eventLines.push(`DTSTART;VALUE=DATE:${formatICalDateOnly(date)}`);
            eventLines.push(`DTEND;VALUE=DATE:${formatICalDateOnly(date)}`);
        }

        eventLines.push(`SUMMARY:${escapeICalText(title)}`);

        const location = (event.location || '').trim();
        if (location) {
            eventLines.push(`LOCATION:${escapeICalText(location)}`);
        }

        eventLines.push('END:VEVENT');

        for (const line of eventLines) {
            lines.push(foldLine(line));
        }
        count++;
    }

    lines.push('END:VCALENDAR');

    // Join with CRLF as required by RFC 5545
    const ics = lines.join('\r\n') + '\r\n';
    return { ics, count, warnings };
}

/**
 * Trigger a browser download of the .ics content.
 */
export function downloadICS(icsContent, filename = 'events.ics') {
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
