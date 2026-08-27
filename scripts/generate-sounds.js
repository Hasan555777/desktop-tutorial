// scripts/generate-sounds.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const soundsDir = path.join(__dirname, '../public/sounds');

if (!fs.existsSync(soundsDir)) {
  fs.mkdirSync(soundsDir, { recursive: true });
  console.log('📁 Created sounds directory');
}

function createSilentWav(filename) {
  const filepath = path.join(soundsDir, filename);
  
  const header = Buffer.from([
    0x52, 0x49, 0x46, 0x46,
    0x24, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45,
    0x66, 0x6D, 0x74, 0x20,
    0x10, 0x00, 0x00, 0x00,
    0x01, 0x00,
    0x01, 0x00,
    0x44, 0xAC, 0x00, 0x00,
    0x88, 0x58, 0x01, 0x00,
    0x02, 0x00,
    0x10, 0x00,
    0x64, 0x61, 0x74, 0x61,
    0x00, 0x00, 0x00, 0x00
  ]);
  
  fs.writeFileSync(filepath, header);
  console.log(`✅ Created ${filename}`);
}

const soundFiles = [
  'admin-announcement.wav',
  'admin-notification.wav',
  'chat-image.wav',
  'chat-message.wav',
  'success.wav',
  'warning.wav',
  'wallet.wav',
  'notification.wav',
  'error.wav',
  'click.wav',
  'deal.wav',
  'offer.wav'
];

console.log('🎵 Generating sound files...');
soundFiles.forEach(createSilentWav);
console.log('✨ All sounds generated successfully!');