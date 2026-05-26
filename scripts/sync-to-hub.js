#!/usr/bin/env node
/**
 * Sync this project's test plans and reports into the central Test-Reports-Hub,
 * regenerate the hub dashboards, and push.
 *
 * Hub location is resolved in this order:
 *   1. --hub=<path> flag
 *   2. TEST_HUB_PATH env var
 *   3. scripts/hub.config.json  →  { "hubPath": "..." }
 *
 * Usage:
 *   node scripts/sync-to-hub.js                # copy + rebuild + commit + push
 *   node scripts/sync-to-hub.js --no-push      # commit but don't push
 *   node scripts/sync-to-hub.js --no-commit    # copy + rebuild only
 *   node scripts/sync-to-hub.js --dry-run      # report what would change
 *   node scripts/sync-to-hub.js --hub=<path>   # override hub path
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const PROJECT_NAME = 'pd-telephony';

const CONFIG_FILE = path.join(__dirname, 'hub.config.json');

function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
    else if (a.startsWith('--')) out[a.slice(2)] = true;
  }
  return out;
}

function resolveHubPath(args) {
  if (args.hub) return args.hub;
  if (process.env.TEST_HUB_PATH) return process.env.TEST_HUB_PATH;
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      if (cfg.hubPath) return cfg.hubPath;
    } catch (e) {
      console.error(`[sync-to-hub] could not parse ${CONFIG_FILE}: ${e.message}`);
    }
  }
  return null;
}

function walk(dir, predicate) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, predicate));
    else if (predicate(full, entry)) out.push(full);
  }
  return out;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyFile(src, dst, dryRun) {
  if (dryRun) return 'would-copy';
  ensureDir(path.dirname(dst));
  fs.copyFileSync(src, dst);
  return 'copied';
}

function sameContent(a, b) {
  if (!fs.existsSync(a) || !fs.existsSync(b)) return false;
  const sa = fs.statSync(a), sb = fs.statSync(b);
  if (sa.size !== sb.size) return false;
  return fs.readFileSync(a).equals(fs.readFileSync(b));
}

function syncPlans(srcRoot, dstRoot, dryRun) {
  const files = walk(srcRoot, (p) => {
    if (p.endsWith('RULES.md')) return false;
    return p.endsWith('.md') || p.endsWith('.spec.ts');
  });
  const expected = new Set();
  let copied = 0, skipped = 0;
  for (const src of files) {
    const rel = path.relative(srcRoot, src);
    const dst = path.join(dstRoot, rel);
    expected.add(path.resolve(dst));
    if (sameContent(src, dst)) { skipped++; continue; }
    copyFile(src, dst, dryRun);
    copied++;
  }
  let removed = 0;
  if (fs.existsSync(dstRoot)) {
    for (const existing of walk(dstRoot, () => true)) {
      if (path.basename(existing) === '.gitkeep') continue;
      if (!expected.has(path.resolve(existing))) {
        if (!dryRun) fs.unlinkSync(existing);
        removed++;
      }
    }
  }
  return { copied, skipped, removed };
}

function rmrf(p, dryRun) {
  if (!fs.existsSync(p)) return;
  if (dryRun) return;
  fs.rmSync(p, { recursive: true, force: true });
}

function syncAllure(srcRoot, dstRoot, dryRun) {
  if (!fs.existsSync(srcRoot)) return { present: false, files: 0 };
  rmrf(dstRoot, dryRun);
  let files = 0;
  function copyTree(s, d) {
    if (!dryRun) ensureDir(d);
    for (const entry of fs.readdirSync(s, { withFileTypes: true })) {
      const srcPath = path.join(s, entry.name);
      const dstPath = path.join(d, entry.name);
      if (entry.isDirectory()) copyTree(srcPath, dstPath);
      else {
        if (!dryRun) fs.copyFileSync(srcPath, dstPath);
        files++;
      }
    }
  }
  copyTree(srcRoot, dstRoot);
  return { present: true, files };
}

function syncJunit(srcFile, dstFile, dryRun) {
  if (!fs.existsSync(srcFile)) return { present: false };
  if (sameContent(srcFile, dstFile)) return { present: true, changed: false };
  copyFile(srcFile, dstFile, dryRun);
  return { present: true, changed: true };
}

function syncReports(srcRoot, dstRoot, dryRun) {
  if (!fs.existsSync(srcRoot)) return { copied: 0, skipped: 0 };
  const files = [];
  for (const d of fs.readdirSync(srcRoot, { withFileTypes: true })) {
    const full = path.join(srcRoot, d.name);
    if (d.isDirectory() && (/^\d{4}-\d{2}-\d{2}$/.test(d.name) || d.name === 'bugs')) {
      for (const f of fs.readdirSync(full)) {
        if (f.endsWith('.md')) files.push(path.join(full, f));
      }
    }
  }
  let copied = 0, skipped = 0;
  for (const src of files) {
    const rel = path.relative(srcRoot, src);
    const dst = path.join(dstRoot, rel);
    if (sameContent(src, dst)) { skipped++; continue; }
    copyFile(src, dst, dryRun);
    copied++;
  }
  return { copied, skipped };
}

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { code: result.status ?? 1, stdout: (result.stdout || '').trim(), stderr: (result.stderr || '').trim() };
}

function commitAndPush(hubPath, args) {
  const status = git(['status', '--porcelain'], hubPath);
  if (status.code !== 0) {
    console.error(`[sync-to-hub] git status failed: ${status.stderr}`);
    return 1;
  }
  if (!status.stdout) {
    console.log('[sync-to-hub] hub has no changes — nothing to commit.');
    return 0;
  }
  console.log('[sync-to-hub] changes detected:');
  for (const line of status.stdout.split('\n')) console.log(`  ${line}`);

  if (args['no-commit']) {
    console.log('[sync-to-hub] --no-commit set; leaving working tree dirty.');
    return 0;
  }

  const add = git(['add', '-A'], hubPath);
  if (add.code !== 0) { console.error(`[sync-to-hub] git add failed: ${add.stderr}`); return 1; }

  const today = new Date().toISOString().slice(0, 10);
  const msg = `${PROJECT_NAME}: report sync ${today}`;
  const commit = git(['commit', '-m', msg], hubPath);
  if (commit.code !== 0) {
    console.error(`[sync-to-hub] git commit failed: ${commit.stderr || commit.stdout}`);
    return 1;
  }
  console.log(`[sync-to-hub] committed: ${msg}`);

  if (args['no-push']) {
    console.log('[sync-to-hub] --no-push set; commit is local only.');
    return 0;
  }

  const push = git(['push'], hubPath);
  if (push.code !== 0) {
    console.error(`[sync-to-hub] git push failed: ${push.stderr || push.stdout}`);
    console.error('[sync-to-hub] commit is in place locally; resolve the push manually.');
    return 1;
  }
  console.log('[sync-to-hub] pushed.');
  return 0;
}

function main() {
  const args = parseArgs(process.argv);
  const hubPath = resolveHubPath(args);
  if (!hubPath) {
    console.error(`[sync-to-hub] hub path not configured. Provide one of:
  --hub=<absolute path>
  TEST_HUB_PATH=<absolute path>
  ${path.relative(REPO_ROOT, CONFIG_FILE)} containing { "hubPath": "<absolute path>" }`);
    process.exit(2);
  }
  if (!fs.existsSync(hubPath)) {
    console.error(`[sync-to-hub] hub path does not exist: ${hubPath}`);
    process.exit(2);
  }
  const buildAll = path.join(hubPath, 'scripts', 'build-all.js');
  if (!fs.existsSync(buildAll)) {
    console.error(`[sync-to-hub] hub does not look initialised (missing ${buildAll}).`);
    process.exit(2);
  }

  const dryRun = !!args['dry-run'];
  console.log(`[sync-to-hub] project=${PROJECT_NAME}  hub=${hubPath}${dryRun ? '  (dry run)' : ''}`);

  const projectDir = path.join(hubPath, 'projects', PROJECT_NAME);
  ensureDir(projectDir);
  const dstPlans = path.join(projectDir, 'test-plans');
  const dstReports = path.join(projectDir, 'test-reports');
  const dstAllure = path.join(projectDir, 'allure-report');
  const dstJunit = path.join(projectDir, 'test-results', 'junit.xml');

  const planResult = syncPlans(path.join(REPO_ROOT, 'test-plans'), dstPlans, dryRun);
  const reportResult = syncReports(path.join(REPO_ROOT, 'test-reports'), dstReports, dryRun);
  const allureResult = syncAllure(path.join(REPO_ROOT, 'allure-report'), dstAllure, dryRun);
  const junitResult = syncJunit(path.join(REPO_ROOT, 'test-results', 'junit.xml'), dstJunit, dryRun);

  console.log(`[sync-to-hub] plans: ${planResult.copied} copied, ${planResult.skipped} unchanged, ${planResult.removed} removed`);
  console.log(`[sync-to-hub] reports: ${reportResult.copied} copied, ${reportResult.skipped} unchanged`);
  console.log(`[sync-to-hub] allure: ${allureResult.present ? `${allureResult.files} files mirrored` : 'not present (skipped)'}`);
  console.log(`[sync-to-hub] junit: ${junitResult.present ? (junitResult.changed ? 'copied (test-results/junit.xml)' : 'unchanged') : 'not present (skipped)'}`);

  if (dryRun) {
    console.log('[sync-to-hub] dry run — not rebuilding or committing.');
    return;
  }

  console.log('[sync-to-hub] rebuilding hub dashboards…');
  const build = spawnSync(process.execPath, [buildAll], { cwd: hubPath, stdio: 'inherit' });
  if (build.status !== 0) {
    console.error('[sync-to-hub] hub build failed; not committing.');
    process.exit(build.status || 1);
  }

  const code = commitAndPush(hubPath, args);
  process.exit(code);
}

main();
