/**
 * Rich mock data generator for the BatchMyPhotos web demo.
 * Generates realistic photo metadata with camera-specific filenames,
 * paired RAW+JPEG groups, EXIF data, and sensitivity-driven blur rates.
 */

const CAMERAS = [
    { brand: 'Canon', model: 'EOS R5', prefix: 'IMG_', ext: ['jpg', 'cr3'], rawSize: [22, 45], jpgSize: [4, 12] },
    { brand: 'Canon', model: 'EOS 5D IV', prefix: 'IMG_', ext: ['jpg', 'cr2'], rawSize: [25, 40], jpgSize: [5, 14] },
    { brand: 'Nikon', model: 'Z8', prefix: 'DSC_', ext: ['jpg', 'nef'], rawSize: [20, 50], jpgSize: [4, 10] },
    { brand: 'Nikon', model: 'D850', prefix: '_DSC', ext: ['jpg', 'nef'], rawSize: [25, 55], jpgSize: [6, 15] },
    { brand: 'Sony', model: 'A7 IV', prefix: 'DSC', ext: ['jpg', 'arw'], rawSize: [24, 48], jpgSize: [5, 12] },
    { brand: 'Sony', model: 'A7R V', prefix: 'DSC', ext: ['jpg', 'arw'], rawSize: [30, 60], jpgSize: [6, 16] },
    { brand: 'Apple', model: 'iPhone 15 Pro', prefix: 'IMG_', ext: ['heic'], rawSize: [0, 0], jpgSize: [2, 8] },
    { brand: 'Apple', model: 'iPhone 14 Pro', prefix: 'IMG_', ext: ['heic'], rawSize: [0, 0], jpgSize: [2, 6] },
    { brand: 'Samsung', model: 'Galaxy S24 Ultra', prefix: 'IMG_', ext: ['jpg'], rawSize: [0, 0], jpgSize: [3, 10] },
    { brand: 'DJI', model: 'Mavic 3 Pro', prefix: 'DJI_', ext: ['jpg', 'dng'], rawSize: [18, 35], jpgSize: [4, 9] },
    { brand: 'Fujifilm', model: 'X-T5', prefix: 'DSCF', ext: ['jpg', 'raf'], rawSize: [20, 45], jpgSize: [4, 11] },
];

const LENSES = [
    '24-70mm f/2.8', '70-200mm f/2.8', '50mm f/1.4', '85mm f/1.8',
    '35mm f/1.4', '16-35mm f/4', '100-400mm f/4.5-5.6', '24mm f/1.4',
    '135mm f/2', '14-24mm f/2.8', '28-75mm f/2.8', '105mm f/2.8 Macro',
];

const BLUR_RATES = { strict: 0.12, moderate: 0.05, lenient: 0.02 };

export const DEMO_FOLDERS = [
    {
        id: 'wedding', name: 'Wedding — Sarah & James (June 2025)', icon: 'Heart',
        description: '8,247 photos from a full wedding day shoot — ceremony, portraits, reception.',
        count: 8247, cameras: ['Canon EOS R5', 'Sony A7 IV'],
        dateRange: { start: new Date(2025, 5, 14, 8, 0), end: new Date(2025, 5, 14, 23, 30) }, hasRaw: true,
    },
    {
        id: 'product', name: 'Product Photography — Spring Collection', icon: 'Camera',
        description: '3,841 product shots — white background, lifestyle, detail close-ups.',
        count: 3841, cameras: ['Sony A7R V', 'Fujifilm X-T5'],
        dateRange: { start: new Date(2025, 2, 1, 9, 0), end: new Date(2025, 2, 15, 17, 0) }, hasRaw: true,
    },
    {
        id: 'travel', name: 'Japan Trip — 3 Weeks (Oct 2024)', icon: 'Plane',
        description: '12,563 mixed photos — phones, DSLR, and drone shots across multiple cities.',
        count: 12563, cameras: ['Apple iPhone 15 Pro', 'Nikon Z8', 'DJI Mavic 3 Pro'],
        dateRange: { start: new Date(2024, 9, 5, 6, 0), end: new Date(2024, 9, 26, 22, 0) }, hasRaw: true,
    },
    {
        id: 'sports', name: 'Sports Event — Regional Track Meet', icon: 'Timer',
        description: '6,102 high-speed action shots — lots of bursts, expect some blur.',
        count: 6102, cameras: ['Canon EOS 5D IV', 'Nikon D850'],
        dateRange: { start: new Date(2025, 3, 12, 7, 30), end: new Date(2025, 3, 12, 18, 0) }, hasRaw: false,
    },
    {
        id: 'family', name: 'Family Archive — 2024 Phone Photos', icon: 'Users',
        description: '15,338 everyday phone photos — auto backups from the whole year.',
        count: 15338, cameras: ['Apple iPhone 14 Pro', 'Samsung Galaxy S24 Ultra'],
        dateRange: { start: new Date(2024, 0, 1, 0, 0), end: new Date(2024, 11, 31, 23, 59) }, hasRaw: false,
    },
];

class SeededRandom {
    constructor(seed = 42) { this.state = seed; }
    next() {
        this.state = (this.state * 1664525 + 1013904223) & 0xffffffff;
        return (this.state >>> 0) / 0xffffffff;
    }
    nextInt(min, max) { return Math.floor(this.next() * (max - min + 1)) + min; }
    pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
}

function formatDateForFilename(date) {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    const h = date.getHours().toString().padStart(2, '0');
    const min = date.getMinutes().toString().padStart(2, '0');
    const s = date.getSeconds().toString().padStart(2, '0');
    return `${y}${m}${d}_${h}${min}${s}`;
}

function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash) || 1;
}

export const generateMockPhotos = (folder, sensitivity = 'moderate') => {
    const rng = new SeededRandom(hashCode(folder.id));
    const count = folder.count;
    const blurRate = BLUR_RATES[sensitivity] || BLUR_RATES.moderate;
    
    const folderCameras = CAMERAS.filter(c => 
        folder.cameras.some(fc => fc.includes(c.model) || fc.includes(c.brand))
    );
    if (folderCameras.length === 0) folderCameras.push(CAMERAS[0]);
    
    const { start, end } = folder.dateRange;
    const timeSpan = end.getTime() - start.getTime();
    
    const photos = [];
    const groups = [];
    let groupId = 0;
    
    for (let i = 0; i < count; i++) {
        const camera = rng.pick(folderCameras);
        const lens = camera.brand === 'Apple' || camera.brand === 'Samsung' 
            ? `${camera.model} Main` 
            : rng.pick(LENSES);
        
        const progress = i / count;
        const baseTime = start.getTime() + (timeSpan * progress);
        const jitter = rng.nextInt(-300000, 300000);
        const timestamp = new Date(Math.max(start.getTime(), Math.min(end.getTime(), baseTime + jitter)));
        
        const counter = rng.nextInt(1000, 9999);
        const dateStr = formatDateForFilename(timestamp);
        const baseName = `${camera.prefix}${dateStr}_${counter.toString().padStart(4, '0')}`;
        
        const hasRawPair = folder.hasRaw && camera.ext.length > 1 && rng.next() < 0.7;
        
        const isBlurry = rng.next() < blurRate;
        const blurScore = isBlurry 
            ? Math.round(20 + rng.next() * 35)
            : Math.round(60 + rng.next() * 40);
        
        const focalLength = lens.includes('-') 
            ? rng.nextInt(parseInt(lens), parseInt(lens.split('-')[1]))
            : parseInt(lens);
        const aperture = parseFloat(lens.match(/f\/(\d+\.?\d*)/)?.[1] || '2.8');
        const iso = rng.pick([100, 200, 400, 800, 1600, 3200, 6400]);
        const shutterSpeed = rng.pick(['1/8000', '1/4000', '1/2000', '1/1000', '1/500', '1/250', '1/125', '1/60', '1/30']);
        
        const jpgSize = rng.nextInt(camera.jpgSize[0], camera.jpgSize[1]) * 1024 * 1024;
        const jpgFile = {
            id: photos.length, name: `${baseName}.${camera.ext[0]}`,
            path: `/mock/${folder.name}/${baseName}.${camera.ext[0]}`,
            size: jpgSize, type: `image/${camera.ext[0] === 'heic' ? 'heic' : 'jpeg'}`,
            date: timestamp, isBlurry, blurScore, groupId,
            exif: {
                camera: `${camera.brand} ${camera.model}`, lens,
                focalLength: `${focalLength}mm`, aperture: `f/${aperture}`,
                iso: `ISO ${iso}`, shutterSpeed,
                dimensions: camera.brand === 'Apple' ? '4032×3024' : '6000×4000',
            },
        };
        photos.push(jpgFile);
        const groupFiles = [jpgFile];
        
        if (hasRawPair) {
            const rawExt = camera.ext[1];
            const rawSize = rng.nextInt(camera.rawSize[0], camera.rawSize[1]) * 1024 * 1024;
            const rawFile = {
                id: photos.length, name: `${baseName}.${rawExt}`,
                path: `/mock/${folder.name}/${baseName}.${rawExt}`,
                size: rawSize, type: `image/${rawExt}`,
                date: timestamp, isBlurry, blurScore, groupId, exif: jpgFile.exif,
            };
            photos.push(rawFile);
            groupFiles.push(rawFile);
        }
        
        groups.push({
            id: groupId, baseName, files: groupFiles, fileCount: groupFiles.length,
            totalSize: groupFiles.reduce((sum, f) => sum + f.size, 0),
            date: timestamp, isBlurry,
        });
        groupId++;
    }
    
    photos.sort((a, b) => a.date - b.date);
    groups.sort((a, b) => a.date - b.date);
    
    const totalSize = photos.reduce((sum, p) => sum + p.size, 0);
    const blurryCount = groups.filter(g => g.isBlurry).length;
    const rawCount = photos.filter(p => !p.type.includes('jpeg') && !p.type.includes('heic')).length;
    
    return {
        photos, groups,
        stats: {
            totalFiles: photos.length, totalGroups: groups.length, totalSize,
            blurryCount, blurryPercent: Math.round((blurryCount / groups.length) * 100),
            rawCount, jpgCount: photos.length - rawCount,
            cameras: [...new Set(photos.map(p => p.exif.camera))],
            dateRange: { start: photos[0]?.date, end: photos[photos.length - 1]?.date },
        },
    };
};

export const createBatches = (groups, settings) => {
    const { maxPhotos = 500, folderName = 'Batch', sortBy = 'date-asc', blurEnabled = false } = settings;
    const maxFilesPerBatch = parseInt(maxPhotos) || 500;
    
    let sorted = [...groups];
    switch (sortBy) {
        case 'date-desc': sorted.sort((a, b) => b.date - a.date); break;
        case 'name-asc': sorted.sort((a, b) => a.baseName.localeCompare(b.baseName)); break;
        case 'name-desc': sorted.sort((a, b) => b.baseName.localeCompare(a.baseName)); break;
        default: sorted.sort((a, b) => a.date - b.date); break;
    }
    
    const normalGroups = blurEnabled ? sorted.filter(g => !g.isBlurry) : sorted;
    const blurryGroups = blurEnabled ? sorted.filter(g => g.isBlurry) : [];
    
    // ── Sequential slicing by group count (photos per batch) ──────────────
    // The setting is "Max Photos Per Batch" — each group = 1 photo.
    // Simple sequential slicing guarantees every batch has exactly
    // maxPhotos groups (except the last batch which may have fewer).
    // This ensures the user sees clean, 100% accurate numbers.
    const batches = [];
    
    for (let i = 0; i < normalGroups.length; i += maxFilesPerBatch) {
        const chunk = normalGroups.slice(i, i + maxFilesPerBatch);
        const allFiles = chunk.flatMap(g => g.files);
        // Store up to 50 representative files for the accordion + image viewer
        const sampleFiles = chunk.slice(0, 50).flatMap(g => g.files);
        const chunkSorted = [...chunk].sort((a, b) => a.date - b.date);
        batches.push({
            id: batches.length,
            name: `${folderName}_${(batches.length + 1).toString().padStart(3, '0')}`,
            count: chunk.length,
            fileCount: allFiles.length,
            totalSize: allFiles.reduce((s, f) => s + f.size, 0),
            items: sampleFiles,
            dateRange: { start: chunkSorted[0]?.date, end: chunkSorted[chunkSorted.length - 1]?.date },
            isBlurBatch: false,
        });
    }
    
    if (blurryGroups.length > 0) {
        const blurFiles = blurryGroups.flatMap(g => g.files);
        const blurSampleFiles = blurryGroups.slice(0, 50).flatMap(g => g.files);
        batches.push({
            id: batches.length, name: `${folderName}_BLURRY`,
            count: blurryGroups.length, fileCount: blurFiles.length,
            totalSize: blurFiles.reduce((s, f) => s + f.size, 0),
            items: blurSampleFiles,
            dateRange: { start: blurryGroups[0]?.date, end: blurryGroups[blurryGroups.length - 1]?.date },
            isBlurBatch: true,
        });
    }
    
    return batches;
};

export const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

export const formatDate = (date) => {
    if (!date) return '';
    return new Intl.DateTimeFormat('en-US', { 
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
    }).format(date);
};