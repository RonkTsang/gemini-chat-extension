#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get the project root directory (one level up from scripts)
const projectRoot = path.resolve(__dirname, '..');
const localesDir = path.join(projectRoot, 'src', 'locales');

/**
 * Recursively get all keys from a nested object
 * @param {Object} obj - The object to extract keys from
 * @param {string} prefix - The prefix for nested keys
 * @returns {string[]} Array of all keys
 */
function getAllKeys(obj, prefix = '') {
  const keys = [];
  
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // If it's an object, recursively get keys
      keys.push(...getAllKeys(value, fullKey));
    } else {
      // If it's a primitive value, add the key
      keys.push(fullKey);
    }
  }
  
  return keys;
}

/**
 * Load and parse a JSON file
 * @param {string} filePath - Path to the JSON file
 * @returns {Object|null} Parsed JSON object or null if error
 */
function loadJsonFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error loading ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Main function to check i18n keys
 */
function checkI18nKeys() {
  console.log('🌍 Checking i18n keys across all language files...\n');
  
  // Load English as the base language
  const enFilePath = path.join(localesDir, 'en.json');
  const enData = loadJsonFile(enFilePath);
  
  if (!enData) {
    console.error('❌ Failed to load English locale file (en.json)');
    process.exit(1);
  }
  
  // Get all keys from English file
  const allKeys = getAllKeys(enData);
  console.log(`📊 Total keys in English (en.json): ${allKeys.length}`);
  
  // Get all language files
  const languageFiles = fs.readdirSync(localesDir)
    .filter(file => file.endsWith('.json'))
    .filter(file => file !== 'en.json'); // Exclude English as it's our base
  
  console.log(`\n🔍 Checking ${languageFiles.length} language files...\n`);
  
  const results = {};
  let hasMissingKeys = false;
  
  // Check each language file
  for (const file of languageFiles) {
    const language = file.replace('.json', '');
    const filePath = path.join(localesDir, file);
    const data = loadJsonFile(filePath);
    
    if (!data) {
      console.error(`❌ Failed to load ${file}`);
      continue;
    }
    
    const languageKeys = getAllKeys(data);
    const missingKeys = allKeys.filter(key => !languageKeys.includes(key));
    
    results[language] = {
      totalKeys: languageKeys.length,
      missingKeys: missingKeys,
      missingCount: missingKeys.length
    };
    
    if (missingKeys.length > 0) {
      hasMissingKeys = true;
    }
  }
  
  // Display results
  console.log('📋 Results Summary:');
  console.log('='.repeat(50));
  
  for (const [language, result] of Object.entries(results)) {
    const status = result.missingCount === 0 ? '✅' : '❌';
    console.log(`${status} ${language.toUpperCase()}: ${result.totalKeys}/${allKeys.length} keys (${result.missingCount} missing)`);
    
    if (result.missingKeys.length > 0) {
      console.log(`   Missing keys:`);
      result.missingKeys.forEach(key => {
        console.log(`   - ${key}`);
      });
      console.log('');
    }
  }
  
  console.log('='.repeat(50));
  
  if (hasMissingKeys) {
    console.warn('⚠️  Some language files are missing keys. Please update them.');
  } else {
    console.log('🎉 All language files are up to date!');
  }
}

// Run the check
checkI18nKeys();
