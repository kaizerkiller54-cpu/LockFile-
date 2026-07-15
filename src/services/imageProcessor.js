const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

let sharp = null;
let isAvailable = true;

function init() {
  try {
    sharp = require('sharp');
    logger.info('Image processing (Sharp) disponible');
  } catch {
    isAvailable = false;
    logger.warn('Sharp non disponible: npm install sharp');
  }
}

async function convertToPdf(imagePath, outputPath) {
  if (!sharp) return { path: imagePath, format: 'original' };
  try {
    const ext = path.extname(outputPath).toLowerCase();
    if (ext === '.pdf') {
      const imgBuf = await sharp(imagePath).jpeg({ quality: 85 }).toBuffer();
      const imgData = imgBuf.toString('base64');
      const pdfBuf = Buffer.from(
        `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</XObject<</Img0 5 0 R>>>>>>endobj
4 0 obj<</Length 44>>stream
q 612 0 0 792 0 0 cm /Img0 Do Q
endstream
endobj
5 0 obj<</Type/XObject/Subtype/Image/Width 612/Height 792/ColorSpace/DeviceRGB/BitsPerComponent 8/Length ${imgBuf.length}/Filter/ASCIIHexDecode>>stream
${imgData}
endobj
xref
0 6
...
trailer<</Size 6/Root 1 0 R>>
startxref
280
%%EOF`
      );
      fs.writeFileSync(outputPath, pdfBuf);
      return { path: outputPath, format: 'pdf' };
    }
    const format = ext.replace('.', '') || 'jpeg';
    const supported = ['jpeg', 'png', 'webp', 'tiff'];
    if (!supported.includes(format)) return { path: imagePath, format: 'original' };
    await sharp(imagePath).toFormat(format, { quality: 85 }).toFile(outputPath);
    return { path: outputPath, format };
  } catch (error) {
    logger.error('Erreur conversion image:', error.message);
    return { path: imagePath, format: 'original' };
  }
}

async function compressImage(inputPath, outputPath, quality = 75) {
  if (!sharp) return { path: inputPath, size: fs.statSync(inputPath).size };
  try {
    const metadata = await sharp(inputPath).metadata();
    const maxWidth = 2048;
    const width = metadata.width > maxWidth ? maxWidth : null;
    const opts = { quality };
    if (width) opts.width = width;
    await sharp(inputPath).jpeg(opts).toFile(outputPath);
    const stats = fs.statSync(outputPath);
    return { path: outputPath, size: stats.size };
  } catch (error) {
    logger.error('Erreur compression:', error.message);
    return { path: inputPath, size: fs.statSync(inputPath).size };
  }
}

async function createThumbnail(imagePath, outputPath, size = 200) {
  if (!sharp) return null;
  try {
    await sharp(imagePath).resize(size, size, { fit: 'cover' }).jpeg({ quality: 60 }).toFile(outputPath);
    return outputPath;
  } catch (error) {
    logger.error('Erreur thumbnail:', error.message);
    return null;
  }
}

module.exports = { init, convertToPdf, compressImage, createThumbnail, isAvailable: () => isAvailable };
