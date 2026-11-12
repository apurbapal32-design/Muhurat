import fs from 'fs';
import path from 'path';

const root = process.cwd();
const outDir = path.join(root, 'netlify-public');

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// Copy compiled Vite assets without copying dist/index.html so GET / routes to Netlify Server
const distAssets = path.join(root, 'dist', 'assets');
if (fs.existsSync(distAssets)) {
  fs.cpSync(distAssets, path.join(outDir, 'assets'), { recursive: true });
}

// Serve the Android APK directly from Netlify CDN as a static file
const apkSrc = path.join(root, 'public', 'Muhurat_Trading_Screener.apk');
if (fs.existsSync(apkSrc)) {
  fs.copyFileSync(apkSrc, path.join(outDir, 'Muhurat_Trading_Screener.apk'));
}

console.log('[prepare-netlify-public] Prepared netlify-public/ cleanly.');
