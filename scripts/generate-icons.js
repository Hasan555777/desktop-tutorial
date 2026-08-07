// scripts/generate-icons.js

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Icon sizes needed
const sizes = [
  { size: 72, name: 'icon-72x72.png' },
  { size: 96, name: 'icon-96x96.png' },
  { size: 128, name: 'icon-128x128.png' },
  { size: 144, name: 'icon-144x144.png' },
  { size: 152, name: 'icon-152x152.png' },
  { size: 192, name: 'icon-192x192.png' },
  { size: 384, name: 'icon-384x384.png' },
  { size: 512, name: 'icon-512x512.png' },
  { size: 192, name: 'icon-192x192-maskable.png', maskable: true },
  { size: 512, name: 'icon-512x512-maskable.png', maskable: true },
];

// ✅ Colors (Your brand colors)
const COLORS = {
  primary: '#438e82',      // Main brand color
  secondary: '#2d6b5f',    // Darker shade
  accent: '#4fb3a3',       // Lighter shade
  background: '#0f1420',   // Dark background
  text: '#ffffff',         // White text
};

// ✅ Create SVG icon programmatically
const createSVGIcon = (size, maskable = false) => {
  const padding = maskable ? Math.round(size * 0.12) : Math.round(size * 0.08);
  const innerSize = size - (padding * 2);
  const borderRadius = Math.round(innerSize * 0.18);
  const cubeSize = Math.round(innerSize * 0.55);
  const cubeOffset = Math.round((innerSize - cubeSize) / 2);
  
  // Gradient colors
  const gradientId = 'mainGradient';
  const glowId = 'glowEffect';
  
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Main Gradient -->
        <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${COLORS.primary};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${COLORS.secondary};stop-opacity:1" />
        </linearGradient>
        
        <!-- Glow Effect -->
        <radialGradient id="${glowId}" cx="50%" cy="40%" r="50%">
          <stop offset="0%" style="stop-color:${COLORS.accent};stop-opacity:0.3" />
          <stop offset="100%" style="stop-color:${COLORS.primary};stop-opacity:0" />
        </radialGradient>
        
        <!-- Drop Shadow -->
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="${Math.round(size * 0.04)}" flood-color="#000000" flood-opacity="0.3"/>
        </filter>
        
        <!-- Inner Shadow for depth -->
        <filter id="innerShadow">
          <feGaussianBlur in="SourceAlpha" stdDeviation="${Math.round(size * 0.02)}" result="blur"/>
          <feOffset dx="0" dy="2" result="offsetBlur"/>
          <feComposite in="SourceGraphic" in2="offsetBlur" operator="over"/>
        </filter>
      </defs>
      
      <!-- Background -->
      <rect width="${size}" height="${size}" rx="${maskable ? Math.round(size * 0.22) : borderRadius}" fill="${COLORS.background}"/>
      
      <!-- Glow Effect -->
      <rect width="${size}" height="${size}" rx="${maskable ? Math.round(size * 0.22) : borderRadius}" fill="url(#${glowId})"/>
      
      <!-- Main Container with gradient -->
      <rect 
        x="${padding}" 
        y="${padding}" 
        width="${innerSize}" 
        height="${innerSize}" 
        rx="${borderRadius}" 
        fill="url(#${gradientId})"
        filter="url(#shadow)"
      />
      
      <!-- Cube Icon (fa-cube style) -->
      <g transform="translate(${padding + cubeOffset + Math.round(cubeSize * 0.05)}, ${padding + cubeOffset - Math.round(cubeSize * 0.05)})">
        <!-- Cube Top Face -->
        <polygon 
          points="
            ${Math.round(cubeSize * 0.5)},0
            ${cubeSize},${Math.round(cubeSize * 0.3)}
            ${Math.round(cubeSize * 0.5)},${Math.round(cubeSize * 0.6)}
            0,${Math.round(cubeSize * 0.3)}
          " 
          fill="${COLORS.accent}"
          opacity="0.9"
        />
        
        <!-- Cube Left Face -->
        <polygon 
          points="
            0,${Math.round(cubeSize * 0.3)}
            ${Math.round(cubeSize * 0.5)},${Math.round(cubeSize * 0.6)}
            ${Math.round(cubeSize * 0.5)},${cubeSize}
            0,${Math.round(cubeSize * 0.7)}
          " 
          fill="${COLORS.secondary}"
          opacity="0.7"
        />
        
        <!-- Cube Right Face -->
        <polygon 
          points="
            ${Math.round(cubeSize * 0.5)},${Math.round(cubeSize * 0.6)}
            ${cubeSize},${Math.round(cubeSize * 0.3)}
            ${cubeSize},${Math.round(cubeSize * 0.7)}
            ${Math.round(cubeSize * 0.5)},${cubeSize}
          " 
          fill="${COLORS.primary}"
          opacity="0.85"
        />
        
        <!-- Cube Highlight (Top face shine) -->
        <polygon 
          points="
            ${Math.round(cubeSize * 0.5)},${Math.round(cubeSize * 0.05)}
            ${Math.round(cubeSize * 0.8)},${Math.round(cubeSize * 0.2)}
            ${Math.round(cubeSize * 0.5)},${Math.round(cubeSize * 0.35)}
            ${Math.round(cubeSize * 0.2)},${Math.round(cubeSize * 0.2)}
          " 
          fill="${COLORS.text}"
          opacity="0.15"
        />
      </g>
      
      <!-- Optional: Small decorative dots (like a subtle pattern) -->
      ${size > 128 ? `
        <circle cx="${Math.round(size * 0.15)}" cy="${Math.round(size * 0.15)}" r="${Math.round(size * 0.015)}" fill="${COLORS.text}" opacity="0.1"/>
        <circle cx="${Math.round(size * 0.85)}" cy="${Math.round(size * 0.15)}" r="${Math.round(size * 0.015)}" fill="${COLORS.text}" opacity="0.1"/>
        <circle cx="${Math.round(size * 0.15)}" cy="${Math.round(size * 0.85)}" r="${Math.round(size * 0.015)}" fill="${COLORS.text}" opacity="0.1"/>
        <circle cx="${Math.round(size * 0.85)}" cy="${Math.round(size * 0.85)}" r="${Math.round(size * 0.015)}" fill="${COLORS.text}" opacity="0.1"/>
      ` : ''}
      
      <!-- Border for crisp edges -->
      <rect 
        x="${padding}" 
        y="${padding}" 
        width="${innerSize}" 
        height="${innerSize}" 
        rx="${borderRadius}" 
        fill="none" 
        stroke="${COLORS.text}" 
        stroke-opacity="0.05" 
        stroke-width="${Math.round(size * 0.005)}"
      />
    </svg>
  `;
};

// ✅ Generate all icons
async function generateIcons() {
  console.log('🎨 Generating PWA icons...');
  console.log('📐 Creating icons in all required sizes...\n');
  
  const outputDir = path.join(process.cwd(), 'public', 'icons');
  
  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (const { size, name, maskable } of sizes) {
    try {
      const svgContent = createSVGIcon(size, maskable);
      const outputPath = path.join(outputDir, name);
      
      // Convert SVG to PNG using sharp
      await sharp(Buffer.from(svgContent))
        .png()
        .toFile(outputPath);
      
      console.log(`✅ Generated: ${name} (${size}x${size}${maskable ? ' - maskable' : ''})`);
    } catch (error) {
      console.error(`❌ Error generating ${name}:`, error);
    }
  }

  // ✅ Generate favicon.ico (32x32)
  try {
    const faviconSvg = createSVGIcon(32, false);
    await sharp(Buffer.from(faviconSvg))
      .resize(32, 32)
      .toFile(path.join(process.cwd(), 'public', 'favicon.ico'));
    console.log('✅ Generated: favicon.ico');
  } catch (error) {
    console.error('❌ Error generating favicon:', error);
  }

  // ✅ Generate apple-touch-icon (180x180)
  try {
    const appleSvg = createSVGIcon(180, false);
    await sharp(Buffer.from(appleSvg))
      .png()
      .toFile(path.join(process.cwd(), 'public', 'apple-touch-icon.png'));
    console.log('✅ Generated: apple-touch-icon.png');
  } catch (error) {
    console.error('❌ Error generating apple-touch-icon:', error);
  }

  console.log('\n✅ All icons generated successfully!');
  console.log(`📁 Output directory: ${outputDir}`);
  console.log('\n📋 Generated files:');
  console.log('   - 10 PNG icons (72-512px)');
  console.log('   - 2 Maskable icons');
  console.log('   - favicon.ico');
  console.log('   - apple-touch-icon.png');
}

// ✅ Run
generateIcons().catch(console.error);