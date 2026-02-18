const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sourceIcon = path.join(__dirname, '../src/images/app_icon.png');
const outputDir = path.join(__dirname, '../src/images/store');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const imagesToGenerate = [
  { name: 'PosterArt_720x1280.png', width: 720, height: 1280, fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } }, // 9:16
  { name: 'BoxArt_256x256.png', width: 256, height: 256 }, // 1:1
  { name: 'AppTile_150x150.png', width: 150, height: 150 }, // 1:1
  { name: 'AppTile_44x44.png', width: 44, height: 44 }, // 1:1
  { name: 'StoreLogo_50x50.png', width: 50, height: 50 }, // 1:1
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

async function generateImages() {
  console.log('Generating store assets...');

  // Generate standard resized images (excluding the old PosterArt logic)
  for (const image of imagesToGenerate) {
    if (image.name.includes('PosterArt')) continue; // Skip standard poster art logic

    try {
      let pipeline = sharp(sourceIcon);

      if (image.fit === 'contain') {
        pipeline = pipeline.resize({
          width: image.width,
          height: image.height,
          fit: 'contain',
          background: image.background || { r: 0, g: 0, b: 0, alpha: 0 }
        });
      } else {
        pipeline = pipeline.resize(image.width, image.height);
      }

      await pipeline.toFile(path.join(outputDir, image.name));
      console.log(`Generated: ${image.name}`);
    } catch (error) {
      console.error(`Error generating ${image.name}:`, error);
    }
  }

  // Generate specific Poster Art
  await generatePosterArt();

  console.log('Done.');
}

generateImages();
