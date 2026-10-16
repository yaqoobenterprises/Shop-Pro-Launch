import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const baselinePath = path.join(__dirname, 'file-size-baseline.json');
let baseline = {};
if (fs.existsSync(baselinePath)) {
  baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
}

const CATEGORY_LIMITS = {
  component: 300,
  utility: 200,
  service: 400,
  test: 400,
  migration: 300,
};

function getFileCategory(relPath) {
  const normalized = relPath.replace(/\\/g, '/');

  // Test files
  if (normalized.startsWith('tests/')) {
    return 'test';
  }

  // SQL migrations
  if (normalized.startsWith('supabase/migrations/') && normalized.endsWith('.sql')) {
    return 'migration';
  }

  // Services
  if (normalized.startsWith('src/services/')) {
    return 'service';
  }

  // Hooks, lib, parser, config, utils, regional, i18n
  if (
    normalized.startsWith('src/hooks/') ||
    normalized.startsWith('src/lib/') ||
    normalized.startsWith('src/parser/') ||
    normalized.startsWith('src/config/') ||
    normalized.startsWith('src/utils/') ||
    normalized.startsWith('src/regional/') ||
    normalized.startsWith('src/i18n/')
  ) {
    return 'utility';
  }

  // React components (.tsx files in src)
  if (normalized.startsWith('src/') && normalized.endsWith('.tsx')) {
    return 'component';
  }

  // Fallback for any other source files in src
  if (normalized.startsWith('src/') && (normalized.endsWith('.ts') || normalized.endsWith('.js'))) {
    return 'utility';
  }

  return null;
}

function scanDir(dir) {
  let files = [];
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(scanDir(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

const scanDirs = [
  path.join(rootDir, 'src'),
  path.join(rootDir, 'tests'),
  path.join(rootDir, 'supabase', 'migrations'),
];

const allFiles = scanDirs.flatMap((dir) => scanDir(dir));
const violations = [];
let checkedCount = 0;

for (const filePath of allFiles) {
  const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/');
  const category = getFileCategory(relPath);
  if (!category) continue;

  checkedCount++;
  const content = fs.readFileSync(filePath, 'utf8');
  const lineCount = content.split(/\r?\n/).length;
  const standardLimit = CATEGORY_LIMITS[category];
  const baselineLimit = baseline[relPath];

  if (baselineLimit !== undefined) {
    if (lineCount > baselineLimit) {
      violations.push({
        file: relPath,
        lineCount,
        allowed: baselineLimit,
        reason: `Exceeded ratchet baseline (${lineCount} > ${baselineLimit} baseline)`,
      });
    }
  } else if (lineCount > standardLimit) {
    violations.push({
      file: relPath,
      lineCount,
      allowed: standardLimit,
      reason: `Exceeded ${category} limit (${lineCount} > ${standardLimit} limit)`,
    });
  }
}

console.log(`Checked ${checkedCount} files against size limits and ratchet baseline.`);

if (violations.length > 0) {
  console.error(`\nERROR: Found ${violations.length} file size violation(s):`);
  for (const v of violations) {
    console.error(`  - ${v.file}: ${v.lineCount} lines (${v.reason})`);
  }
  process.exit(1);
} else {
  console.log(`All files comply with size limits.`);
}
