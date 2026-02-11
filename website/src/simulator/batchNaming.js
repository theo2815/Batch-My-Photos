/**
 * Batch naming utility — port of the desktop app's batchNaming.js.
 *
 * generateBatchFolderName(pattern, batchIndex, totalBatches)
 *   Replaces {count}, {date}, {year}, {month} variables in the pattern.
 *   Auto-appends _{count} if the pattern has no {count}.
 *   Pads the count to at least 3 digits (or more if needed).
 */

export function generateBatchFolderName(pattern, batchIndex, totalBatches) {
    const now = new Date();
    const year  = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const date  = `${year}-${month}-${String(now.getDate()).padStart(2, '0')}`;

    let name = pattern;

    // If pattern doesn't include {count}, append it
    if (!name.includes('{count}')) {
        name += '_{count}';
    }

    // Determine padding width
    const digits = Math.max(3, String(totalBatches).length);
    const paddedIndex = String(batchIndex + 1).padStart(digits, '0');

    name = name
        .replace(/\{count\}/g, paddedIndex)
        .replace(/\{date\}/g, date)
        .replace(/\{year\}/g, year)
        .replace(/\{month\}/g, month);

    return name;
}
