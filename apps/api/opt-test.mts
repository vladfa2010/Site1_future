import sharp from 'sharp';
import { optimizeImage } from './src/utils/imageOptimize.js';
const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 40 } } }).png().toBuffer();
const o = await optimizeImage(big, 'png');
console.log('PNG 4000x3000:', (big.length/1024/1024).toFixed(2), 'MB ->', (o.buffer.length/1024).toFixed(0), 'KB, ext:', o.ext);
const jpg = await sharp({ create: { width: 800, height: 600, channels: 3, noise: { type: 'gaussian', mean: 90, sigma: 30 } } }).jpeg().toBuffer();
const o2 = await optimizeImage(jpg, 'jpg');
console.log('JPG 800x600 (маленькая):', (jpg.length/1024).toFixed(0), 'KB ->', (o2.buffer.length/1024).toFixed(0), 'KB, ext:', o2.ext);
