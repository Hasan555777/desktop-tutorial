// scripts/inject-sw-config.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = process.cwd();

// ============================================================
// Environment loader
// Priority:
// 1. .env.production
// 2. .env
// ============================================================

const loadEnvFile = (filePath) => {
  const config = {};

  if (!fs.existsSync(filePath)) {
    return config;
  }

  const envContent = fs.readFileSync(filePath, 'utf-8');

  envContent.split(/\r?\n/).forEach((line) => {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      return;
    }

    const separatorIndex = trimmedLine.indexOf('=');

    if (separatorIndex === -1) {
      return;
    }

    const key = trimmedLine
      .slice(0, separatorIndex)
      .trim();

    let value = trimmedLine
      .slice(separatorIndex + 1)
      .trim();

    // Remove optional surrounding quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) {
      config[key] = value;
    }
  });

  return config;
};

// ============================================================
// Load environment
// ============================================================

const productionEnvPath = path.resolve(
  projectRoot,
  '.env.production'
);

const defaultEnvPath = path.resolve(
  projectRoot,
  '.env'
);

const productionEnv = loadEnvFile(productionEnvPath);
const defaultEnv = loadEnvFile(defaultEnvPath);

// Production values take priority over .env.
const envConfig = {
  ...defaultEnv,
  ...productionEnv,
};

// ============================================================
// Paths
// ============================================================

const templatePath = path.resolve(
  projectRoot,
  'public/firebase-messaging-sw.template.js'
);

const outputPath = path.resolve(
  projectRoot,
  'dist/firebase-messaging-sw.js'
);

// ============================================================
// Validate template
// ============================================================

if (!fs.existsSync(templatePath)) {
  console.error(
    '❌ Firebase Messaging SW template not found:',
    templatePath
  );

  process.exit(1);
}

// ============================================================
// Required Firebase configuration
// ============================================================

const requiredEnv = {
  VITE_FIREBASE_API_KEY: envConfig.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: envConfig.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID: envConfig.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET:
    envConfig.VITE_FIREBASE_STORAGE_BUCKET,
  VITE_FIREBASE_MESSAGING_SENDER_ID:
    envConfig.VITE_FIREBASE_MESSAGING_SENDER_ID,
  VITE_FIREBASE_APP_ID: envConfig.VITE_FIREBASE_APP_ID,
};

const missingKeys = Object.entries(requiredEnv)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingKeys.length > 0) {
  console.error(
    '\n❌ Firebase Messaging Service Worker configuration is incomplete.\n'
  );

  console.error('Missing environment variables:');

  missingKeys.forEach((key) => {
    console.error(`   - ${key}`);
  });

  console.error(
    '\nExpected these values in .env.production or .env.\n'
  );

  process.exit(1);
}

// ============================================================
// Read template
// ============================================================

let content = fs.readFileSync(
  templatePath,
  'utf-8'
);

// ============================================================
// Replace placeholders
// ============================================================

const replacements = {
  '__FIREBASE_API_KEY__':
    requiredEnv.VITE_FIREBASE_API_KEY,

  '__FIREBASE_AUTH_DOMAIN__':
    requiredEnv.VITE_FIREBASE_AUTH_DOMAIN,

  '__FIREBASE_PROJECT_ID__':
    requiredEnv.VITE_FIREBASE_PROJECT_ID,

  '__FIREBASE_STORAGE_BUCKET__':
    requiredEnv.VITE_FIREBASE_STORAGE_BUCKET,

  '__FIREBASE_MESSAGING_SENDER_ID__':
    requiredEnv.VITE_FIREBASE_MESSAGING_SENDER_ID,

  '__FIREBASE_APP_ID__':
    requiredEnv.VITE_FIREBASE_APP_ID,
};

Object.entries(replacements).forEach(
  ([placeholder, value]) => {
    content = content.replace(
      new RegExp(placeholder, 'g'),
      value
    );
  }
);

// ============================================================
// Verify no placeholders remain
// ============================================================

const remainingPlaceholders = [
  '__FIREBASE_API_KEY__',
  '__FIREBASE_AUTH_DOMAIN__',
  '__FIREBASE_PROJECT_ID__',
  '__FIREBASE_STORAGE_BUCKET__',
  '__FIREBASE_MESSAGING_SENDER_ID__',
  '__FIREBASE_APP_ID__',
].filter((placeholder) =>
  content.includes(placeholder)
);

if (remainingPlaceholders.length > 0) {
  console.error(
    '\n❌ Firebase Messaging SW still contains unresolved placeholders:'
  );

  remainingPlaceholders.forEach((placeholder) => {
    console.error(`   - ${placeholder}`);
  });

  process.exit(1);
}

// ============================================================
// Ensure output directory exists
// ============================================================

const outputDir = path.dirname(outputPath);

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, {
    recursive: true,
  });
}

// ============================================================
// Write generated Service Worker
// ============================================================

fs.writeFileSync(
  outputPath,
  content,
  'utf-8'
);

// ============================================================
// Success output
// ============================================================

console.log(
  '\n✅ firebase-messaging-sw.js generated successfully!'
);

console.log(
  '📁 Output:',
  outputPath
);

console.log(
  '📦 Environment:',
  fs.existsSync(productionEnvPath)
    ? '.env.production'
    : '.env'
);

console.log('\n📋 Firebase Config:');

console.log(
  '  - API Key:',
  requiredEnv.VITE_FIREBASE_API_KEY
    ? '✅ Set'
    : '❌ Missing'
);

console.log(
  '  - Auth Domain:',
  requiredEnv.VITE_FIREBASE_AUTH_DOMAIN
    ? '✅ Set'
    : '❌ Missing'
);

console.log(
  '  - Project ID:',
  requiredEnv.VITE_FIREBASE_PROJECT_ID
    ? '✅ Set'
    : '❌ Missing'
);

console.log(
  '  - Storage Bucket:',
  requiredEnv.VITE_FIREBASE_STORAGE_BUCKET
    ? '✅ Set'
    : '❌ Missing'
);

console.log(
  '  - Messaging Sender ID:',
  requiredEnv.VITE_FIREBASE_MESSAGING_SENDER_ID
    ? '✅ Set'
    : '❌ Missing'
);

console.log(
  '  - App ID:',
  requiredEnv.VITE_FIREBASE_APP_ID
    ? '✅ Set'
    : '❌ Missing'
);

console.log(
  '\n✅ Firebase Messaging Service Worker configuration validated.'
);