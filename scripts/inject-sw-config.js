// scripts/inject-sw-config.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Environment variables গুলো লোড করুন
const envFile = path.resolve(process.cwd(), '.env');
let envConfig = {};

if (fs.existsSync(envFile)) {
  const envContent = fs.readFileSync(envFile, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const [key, ...valueParts] = trimmedLine.split('=');
      const value = valueParts.join('=').trim();
      if (key && value) {
        envConfig[key.trim()] = value;
      }
    }
  });
}

const templatePath = path.resolve(process.cwd(), 'public/firebase-messaging-sw.template.js');
const outputPath = path.resolve(process.cwd(), 'dist/firebase-messaging-sw.js');

if (!fs.existsSync(templatePath)) {
  console.warn('⚠️ Template file not found at:', templatePath);
  process.exit(0);
}

// ✅ Template ফাইল পড়ুন
let content = fs.readFileSync(templatePath, 'utf-8');

// ✅ Placeholders গুলো Replace করুন
const replacements = {
  '__FIREBASE_API_KEY__': envConfig.VITE_FIREBASE_API_KEY || '',
  '__FIREBASE_AUTH_DOMAIN__': envConfig.VITE_FIREBASE_AUTH_DOMAIN || '',
  '__FIREBASE_PROJECT_ID__': envConfig.VITE_FIREBASE_PROJECT_ID || '',
  '__FIREBASE_STORAGE_BUCKET__': envConfig.VITE_FIREBASE_STORAGE_BUCKET || '',
  '__FIREBASE_MESSAGING_SENDER_ID__': envConfig.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  '__FIREBASE_APP_ID__': envConfig.VITE_FIREBASE_APP_ID || ''
};

Object.entries(replacements).forEach(([key, value]) => {
  content = content.replace(new RegExp(key, 'g'), value);
});

// ✅ Output ফোল্ডার তৈরি করুন (যদি না থাকে)
const outputDir = path.dirname(outputPath);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// ✅ নতুন ফাইল তৈরি করুন
fs.writeFileSync(outputPath, content, 'utf-8');
console.log('✅ firebase-messaging-sw.js generated successfully!');
console.log('📁 Output:', outputPath);

// ✅ Config Values চেক করুন (Debugging)
console.log('📋 Config Values used:');
console.log('  - API Key:', replacements.__FIREBASE_API_KEY__ ? '✅ Set' : '❌ Missing');
console.log('  - Auth Domain:', replacements.__FIREBASE_AUTH_DOMAIN__ ? '✅ Set' : '❌ Missing');
console.log('  - Project ID:', replacements.__FIREBASE_PROJECT_ID__ ? '✅ Set' : '❌ Missing');
console.log('  - Storage Bucket:', replacements.__FIREBASE_STORAGE_BUCKET__ ? '✅ Set' : '❌ Missing');
console.log('  - Messaging Sender ID:', replacements.__FIREBASE_MESSAGING_SENDER_ID__ ? '✅ Set' : '❌ Missing');
console.log('  - App ID:', replacements.__FIREBASE_APP_ID__ ? '✅ Set' : '❌ Missing');