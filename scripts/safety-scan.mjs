import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Scan the repository containing this script, independently of the caller's cwd.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const excluded = new Set([
  '.git',
  'node_modules',
  'dist',
  'test-results',
  'playwright-report',
  'coverage',
  '.vite',
]);
const findings = new Map();
let scannedFiles = 0;
const approvedPublicNames = new Set(['Julia Rakitina']);
const forbiddenExtensions = new Set([
  '.zip',
  '.tar',
  '.gz',
  '.tgz',
  '.bz2',
  '.xz',
  '.7z',
  '.rar',
  '.db',
  '.sqlite',
  '.sqlite3',
  '.mdb',
  '.accdb',
  '.dbf',
  '.sql',
  '.pem',
  '.key',
  '.p12',
  '.pfx',
  '.keystore',
  '.jks',
  '.las',
  '.dlis',
  '.lis',
  '.csv',
  '.tsv',
]);
const contentRules = [
  ['private-key', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----|PuTTY-User-Key-File-\d/],
  [
    'provider-credential',
    /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{40,}|xox[baprs]-[A-Za-z0-9-]{15,}|(?:AKIA|ASIA)[A-Z0-9]{16}|sk-(?:proj-)?[A-Za-z0-9_-]{24,})/,
  ],
  ['jwt-like-token', /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  [
    'private-home-path',
    /(?:\/(?:Users|home)\/[A-Za-z0-9_.-]+|[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][^\s"'<>]+)/,
  ],
  ['credential-in-url', /\b(?:https?|wss?|postgres(?:ql)?|mysql|mongodb):\/\/[^\s/@:]+:[^\s/@]+@/i],
  ['personal-contact', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
];

function flag(category) {
  findings.set(category, (findings.get(category) ?? 0) + 1);
}

function isPlaceholder(value) {
  return /^(?:<[^>]+>|\$\{[^}]+\}|(?:your|example|sample|synthetic|demo|test|placeholder|redacted|changeme|replace)[\w .:/-]*|localhost|127\.0\.0\.1)$/i.test(
    value,
  );
}

function inspectContent(bytes) {
  // Inspect ASCII-compatible content even in binary files: copied keys or paths can
  // occur in metadata. No content, captured values, or sensitive filenames are logged.
  const content = bytes.toString('utf8');
  for (const [category, pattern] of contentRules) {
    if (pattern.test(content)) flag(category);
  }
  const assignments = content.matchAll(
    /(?:api[-_]?key|client[-_]?secret|password|access[-_]?token|refresh[-_]?token|authorization)["']?\s*[:=]\s*["']([^"'\r\n]{8,})["']/gi,
  );
  for (const match of assignments) {
    if (!isPlaceholder(match[1])) {
      flag('credential-assignment');
      break;
    }
  }
  const identifiers = content.matchAll(
    /(?:customer|client|site|field|machine|host|well)[_-]?(?:name|identifier|id)["']?\s*[:=]\s*["']([^"'\r\n]+)["']/gi,
  );
  for (const match of identifiers) {
    if (!approvedPublicNames.has(match[1]) && !isPlaceholder(match[1])) {
      flag('potential-operational-identifier');
      break;
    }
  }
  const archiveSignature =
    bytes.length >= 4 &&
    ((bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) ||
      (bytes[0] === 0x1f && bytes[1] === 0x8b));
  if (archiveSignature) flag('archive-signature');
  if (bytes.subarray(0, 16).toString('ascii') === 'SQLite format 3\0') flag('database-signature');
  if (
    /^\s*~(?:Version|Well|Curve)(?:\s|_)/im.test(content) &&
    /\b(?:DEPT|STRT|STOP|NULL)\s*\./.test(content)
  )
    flag('las-field-data');
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (excluded.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      // Never follow a link into private reference material or outside the repo.
      flag('unreviewed-symlink');
      continue;
    }
    if (entry.isDirectory()) {
      if (['reference', 'legacy', '.crossbar'].includes(entry.name.toLowerCase()))
        flag('legacy-or-production-directory');
      await walk(path);
      continue;
    }
    if (!entry.isFile()) {
      flag('unexpected-filesystem-entry');
      continue;
    }
    scannedFiles += 1;
    const lowerName = entry.name.toLowerCase();
    if (forbiddenExtensions.has(extname(lowerName))) flag('forbidden-data-key-or-archive-file');
    if (lowerName.startsWith('.env') && lowerName !== '.env.example') flag('environment-file');
    if (/^(?:id_rsa|id_ed25519|id_dsa|id_ecdsa)(?:\.pub)?$/.test(lowerName)) flag('ssh-key-file');
    if (lowerName === '.ds_store') flag('machine-artifact');
    try {
      inspectContent(await readFile(path));
    } catch {
      flag('unreadable-file');
    }
  }
}

try {
  await walk(root);
} catch {
  flag('scan-incomplete');
}

const counts = Object.fromEntries([...findings.entries()].sort(([a], [b]) => a.localeCompare(b)));
console.log(
  JSON.stringify(
    {
      status: findings.size === 0 ? 'PASS' : 'FAIL',
      scannedFiles,
      findings: counts,
      scope: 'Working tree; dependencies, Git internals, builds, and test reports excluded.',
      limitations:
        'Pattern checks cannot prove the absence of arbitrary real names, customer/site identifiers, secrets, or field data. Julia Rakitina is approved public attribution. Manually review screenshots, tracked files, and intended Git history before release.',
    },
    null,
    2,
  ),
);
process.exitCode = findings.size === 0 ? 0 : 1;
