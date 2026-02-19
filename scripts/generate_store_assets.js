const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sourceIcon = path.join(__dirname, '../src/images/app_icon.png');

// Legacy output dir (for website/misc use)
const outputDir = path.join(__dirname, '../src/images/store');
// AppX assets dir — electron-builder reads from build/appx/
const appxDir = path.join(__dirname, '../build/appx');

[outputDir, appxDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const imagesToGenerate = [
  { name: 'PosterArt_720x1280.png', width: 720, height: 1280, fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } }, // 9:16
  { name: 'BoxArt_256x256.png', width: 256, height: 256 }, // 1:1
  { name: 'AppTile_150x150.png', width: 150, height: 150 }, // 1:1
  { name: 'AppTile_44x44.png', width: 44, height: 44 }, // 1:1
  { name: 'StoreLogo_50x50.png', width: 50, height: 50 }, // 1:1
];

// AppX assets required by electron-builder (placed in build/appx/)
// These names must match exactly for electron-builder to pick them up.
// See: https://www.electron.build/appx#appx-assets
const appxAssets = [
  { name: 'Square44x44Logo.png',   width: 44,  height: 44  },
  { name: 'Square150x150Logo.png', width: 150, height: 150 },
  { name: 'Wide310x150Logo.png',   width: 310, height: 150, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } },
  { name: 'StoreLogo.png',         width: 50,  height: 50  },
  { name: 'SmallTile.png',         width: 71,  height: 71  }, // Square71x71Logo (optional but recommended)
  { name: 'LargeTile.png',         width: 310, height: 310 }, // Square310x310Logo (optional but recommended)
  { name: 'SplashScreen.png',      width: 620, height: 300, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }, // optional
];


async function generatePosterArt() {
  const width = 720;
  const height = 1280;
  const logoSize = 400;
  const text = "Batch My Photos";
  
  // Create an SVG for the background and text
  const svgImage = `
    <svg width="${width}" height="${height}" version="1.1" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#4facfe;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#00f2fe;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#grad1)" />
      <text x="50%" y="80%" font-size="60" font-family="Arial, sans-serif" fill="white" text-anchor="middle" font-weight="bold">${text}</text>
    </svg>
  `;

  try {
    const logoBuffer = await sharp(sourceIcon)
      .resize(logoSize, logoSize)
      .toBuffer();

    await sharp(Buffer.from(svgImage))
      .composite([{ input: logoBuffer, top: 300, left: (width - logoSize) / 2 }])
      .toFile(path.join(outputDir, 'PosterArt_720x1280.png'));
      
    console.log('Generated: PosterArt_720x1280.png (Enhanced)');
  } catch (error) {
    console.error('Error generating PosterArt:', error);
  }
}

async function resizeImage(src, destPath, width, height, fit, background) {
  let pipeline = sharp(src);
  if (fit === 'contain') {
    pipeline = pipeline.resize({
      width,
      height,
      fit: 'contain',
      background: background || { r: 0, g: 0, b: 0, alpha: 0 }
    });
  } else {
    pipeline = pipeline.resize(width, height);
  }
  await pipeline.toFile(destPath);
}

async function generateImages() {
  console.log('Generating store assets...');

  // Generate legacy store assets (src/images/store/)
  for (const image of imagesToGenerate) {
    if (image.name.includes('PosterArt')) continue;
    try {
      await resizeImage(
        sourceIcon,
        path.join(outputDir, image.name),
        image.width, image.height, image.fit, image.background
      );
      console.log(`Generated (legacy): ${image.name}`);
    } catch (error) {
      console.error(`Error generating ${image.name}:`, error);
    }
  }

  // Generate specific Poster Art
  await generatePosterArt();

  // Generate AppX assets (build/appx/) — these are what electron-builder packages
  console.log('\nGenerating AppX tile assets...');
  for (const asset of appxAssets) {
    try {
      await resizeImage(
        sourceIcon,
        path.join(appxDir, asset.name),
        asset.width, asset.height, asset.fit, asset.background
      );
      console.log(`Generated (appx): ${asset.name}`);
    } catch (error) {
      console.error(`Error generating AppX asset ${asset.name}:`, error);
    }
  }

  console.log('\nDone. AppX assets are in build/appx/ — electron-builder will pick them up automatically.');
}

generateImages();
