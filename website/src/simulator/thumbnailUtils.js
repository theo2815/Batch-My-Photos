/**
 * Sample thumbnail system using generated gradient SVGs.
 * Creates visually distinct thumbnails from filename hashes — zero network cost.
 * Also exports a set of 20 bundled tiny sample images (as data URIs of SVGs
 * that look like abstract photo thumbnails with color variety).
 */

// Deterministic hash from a string
const hashString = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return Math.abs(hash);
};

// HSL color palette that looks like real photos
const PHOTO_PALETTES = [
    // Warm sunset tones
    { bg: [25, 85, 25], fg: [35, 90, 45] },
    { bg: [15, 70, 20], fg: [30, 80, 40] },
    // Green nature
    { bg: [120, 40, 25], fg: [140, 50, 35] },
    { bg: [100, 35, 20], fg: [130, 45, 30] },
    // Blue sky / ocean
    { bg: [210, 60, 30], fg: [200, 70, 50] },
    { bg: [220, 50, 25], fg: [210, 60, 45] },
    // Purple twilight
    { bg: [270, 45, 25], fg: [260, 55, 40] },
    { bg: [280, 40, 20], fg: [270, 50, 35] },
    // Golden hour
    { bg: [40, 80, 30], fg: [45, 85, 50] },
    { bg: [35, 75, 25], fg: [42, 82, 45] },
    // Cool morning
    { bg: [190, 50, 28], fg: [195, 60, 45] },
    { bg: [185, 45, 22], fg: [190, 55, 38] },
    // Indoor warm
    { bg: [30, 55, 22], fg: [35, 65, 38] },
    { bg: [20, 50, 18], fg: [28, 60, 35] },
    // City night
    { bg: [240, 40, 15], fg: [250, 50, 30] },
    { bg: [230, 35, 12], fg: [240, 45, 28] },
    // Forest
    { bg: [150, 50, 18], fg: [160, 60, 30] },
    { bg: [140, 45, 15], fg: [155, 55, 28] },
    // Desert
    { bg: [35, 60, 35], fg: [30, 70, 50] },
    { bg: [32, 55, 30], fg: [38, 65, 48] },
];

/**
 * Generate a thumbnail SVG data URI for a given filename.
 * Each filename produces a unique but consistent visual.
 */
export const getThumbnailForFile = (filename, size = 80) => {
    const hash = hashString(filename);
    const palette = PHOTO_PALETTES[hash % PHOTO_PALETTES.length];
    const variation = (hash >> 8) % 360;
    
    const bgH = (palette.bg[0] + variation) % 360;
    const fgH = (palette.fg[0] + variation) % 360;
    
    const bgColor = `hsl(${bgH}, ${palette.bg[1]}%, ${palette.bg[2]}%)`;
    const fgColor = `hsl(${fgH}, ${palette.fg[1]}%, ${palette.fg[2]}%)`;
    const accentColor = `hsl(${(bgH + 40) % 360}, ${palette.bg[1] + 10}%, ${palette.bg[2] + 15}%)`;
    
    // Create abstract "photo-like" composition
    const shapeType = hash % 4;
    let shapes = '';
    
    if (shapeType === 0) {
        // Landscape with horizon
        const horizonY = 45 + (hash % 20);
        shapes = `
            <rect width="${size}" height="${horizonY}" fill="${fgColor}" opacity="0.6"/>
            <rect y="${horizonY}" width="${size}" height="${size - horizonY}" fill="${accentColor}" opacity="0.4"/>
            <circle cx="${size * 0.7}" cy="${size * 0.25}" r="${size * 0.08}" fill="${accentColor}" opacity="0.8"/>
        `;
    } else if (shapeType === 1) {
        // Portrait-ish with central subject
        const cx = size / 2 + ((hash >> 4) % 10) - 5;
        const cy = size / 2 + ((hash >> 6) % 10) - 5;
        shapes = `
            <rect width="${size}" height="${size}" fill="${fgColor}" opacity="0.3"/>
            <ellipse cx="${cx}" cy="${cy}" rx="${size * 0.2}" ry="${size * 0.28}" fill="${accentColor}" opacity="0.6"/>
        `;
    } else if (shapeType === 2) {
        // Close-up / macro
        shapes = `
            <circle cx="${size * 0.4}" cy="${size * 0.5}" r="${size * 0.35}" fill="${fgColor}" opacity="0.5"/>
            <circle cx="${size * 0.6}" cy="${size * 0.4}" r="${size * 0.2}" fill="${accentColor}" opacity="0.4"/>
        `;
    } else {
        // Abstract / artistic
        shapes = `
            <rect x="0" y="0" width="${size * 0.6}" height="${size}" fill="${fgColor}" opacity="0.4" rx="2"/>
            <rect x="${size * 0.4}" y="0" width="${size * 0.6}" height="${size}" fill="${accentColor}" opacity="0.3" rx="2"/>
        `;
    }
    
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <rect width="${size}" height="${size}" fill="${bgColor}"/>
        ${shapes}
        <rect width="${size}" height="${size}" fill="url(#noise)" opacity="0.03"/>
    </svg>`;
    
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

/**
 * Get a CSS gradient string for a thumbnail (lighter weight than SVG).
 * Use this for the batch row thumbnails where we show many at once.
 */
export const getThumbnailGradient = (filename) => {
    const hash = hashString(filename);
    const palette = PHOTO_PALETTES[hash % PHOTO_PALETTES.length];
    const variation = (hash >> 8) % 360;
    
    const h1 = (palette.bg[0] + variation) % 360;
    const h2 = (palette.fg[0] + variation) % 360;
    
    const angle = (hash % 4) * 45 + 90;
    
    return `linear-gradient(${angle}deg, hsl(${h1}, ${palette.bg[1]}%, ${palette.bg[2]}%), hsl(${h2}, ${palette.fg[1]}%, ${palette.fg[2]}%))`;
};

/**
 * Get a blur overlay gradient (slightly foggy) for blurry photos.
 */
export const getBlurOverlay = () => {
    return 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%)';
};
