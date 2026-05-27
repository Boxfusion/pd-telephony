#!/usr/bin/env node
/**
 * Build the test-reports dashboard.
 *
 * Mirrors the Test-ReportsHub architecture: instead of one self-contained HTML
 * file, this emits a thin shell + a data file consumed by a shared renderer.
 *
 *   - test-reports/data.json   ← everything the dashboard needs
 *   - test-reports/data.js     ← `window.__DATA__ = {...}` (so the page works over file://)
 *   - test-reports/index.html  ← thin shell, loads ../assets/dashboard.css + dashboard.js
 *
 * The renderer is assets/dashboard.js; styles are assets/dashboard.css.
 *
 * Scans:
 *   - test-plans/**\/*.md  — every known plan (rows in the flows table)
 *   - test-reports/<YYYY-MM-DD>/*.md — every historical run
 *   - test-reports/bugs/*.md — linked bugs
 *
 * Usage: node scripts/build-dashboard.js
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const PLANS_ROOT = path.join(REPO_ROOT, 'test-plans');
const REPORTS_ROOT = path.join(REPO_ROOT, 'test-reports');
const BUGS_ROOT = path.join(REPORTS_ROOT, 'bugs');

const APP_NAME = 'PD Telephony';
const APP_ENV = 'QA';
const APP_URL = 'https://pd-telephony-adminportal-test.shesha.app/';
const SOURCE_REPO = 'https://github.com/Boxfusion/pd-telephony';

const HEATMAP_WEEKS = 52;
const SPARKLINE_RUNS = 12;

// The dashboard page lives in test-reports/. Plans/specs sit one level up;
// reports + bugs are under test-reports/ itself. These prefixes turn a
// repo-relative path into one the page can resolve.
const UP = '../';

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

function relRepo(p) {
  return path.relative(REPO_ROOT, p).replace(/\\/g, '/');
}
function relReports(p) {
  return path.relative(REPORTS_ROOT, p).replace(/\\/g, '/');
}
function dateOnly(s) {
  const m = String(s).match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function parseReport(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const meta = {};
  for (const line of raw.split(/\r?\n/).slice(0, 30)) {
    const m = line.match(/^\*\*([A-Za-z ]+):\*\*\s*(.+?)\s*$/);
    if (m) meta[m[1].trim().toLowerCase()] = m[2].trim();
  }
  const titleLine = raw.match(/^#\s+(.+)$/m);
  const planRel = meta.plan ? meta.plan.replace(/\\/g, '/') : null;
  const reportDate = dateOnly(meta.date) || dateOnly(path.basename(path.dirname(file)));
  return {
    fileRel: relReports(file),
    title: titleLine ? titleLine[1].trim().replace(/^Report:\s*/i, '') : path.basename(file, '.md'),
    plan: planRel,
    spec: meta.spec ? meta.spec.replace(/\\/g, '/') : null,
    result: (meta.result || 'UNKNOWN').toUpperCase(),
    duration: meta.duration || '',
    date: reportDate,
    mode: meta['execution mode'] || null,
  };
}

function collectPlans() {
  const planFiles = walk(PLANS_ROOT, (p) => p.endsWith('.md') && !p.endsWith('RULES.md'));
  return planFiles.map((p) => {
    const rel = relRepo(p);
    const specPath = p.replace(/\.md$/, '.spec.ts');
    const stat = fs.statSync(p);
    const hasSpec = fs.existsSync(specPath);
    const specMtime = hasSpec ? fs.statSync(specPath).mtime : null;
    const effectiveMtime = specMtime && specMtime > stat.mtime ? specMtime : stat.mtime;
    return {
      plan: rel,
      spec: hasSpec ? relRepo(specPath) : null,
      mtime: effectiveMtime.toISOString(),
      mdMtime: stat.mtime.toISOString(),
      specMtime: specMtime ? specMtime.toISOString() : null,
    };
  });
}

function collectReports() {
  if (!fs.existsSync(REPORTS_ROOT)) return [];
  const reports = [];
  for (const d of fs.readdirSync(REPORTS_ROOT, { withFileTypes: true })) {
    if (!d.isDirectory() || d.name === 'bugs') continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.name)) continue;
    for (const f of fs.readdirSync(path.join(REPORTS_ROOT, d.name))) {
      if (f.endsWith('.md')) reports.push(parseReport(path.join(REPORTS_ROOT, d.name, f)));
    }
  }
  return reports.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function collectBugs() {
  if (!fs.existsSync(BUGS_ROOT)) return [];
  return fs.readdirSync(BUGS_ROOT)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({ fileRel: relReports(path.join(BUGS_ROOT, f)), name: f, date: dateOnly(f) || '' }));
}

function indexRunsByPlan(plans, reports) {
  const byPlan = new Map();
  for (const p of plans) byPlan.set(p.plan, []);
  for (const r of reports) {
    if (!r.plan) continue;
    if (!byPlan.has(r.plan)) byPlan.set(r.plan, []);
    byPlan.get(r.plan).push(r);
  }
  return byPlan;
}

function buildHeatmap(reports) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  const anchor = new Date(today);
  anchor.setDate(today.getDate() + (6 - dow));
  const cols = HEATMAP_WEEKS;
  const startDate = new Date(anchor);
  startDate.setDate(anchor.getDate() - (cols * 7 - 1));

  const cellMap = new Map();
  for (const r of reports) {
    if (!r.date) continue;
    if (!cellMap.has(r.date)) cellMap.set(r.date, { runs: 0, passed: 0, failed: 0, partial: 0 });
    const c = cellMap.get(r.date);
    c.runs += 1;
    if (r.result === 'PASSED') c.passed += 1;
    else if (r.result === 'FAILED') c.failed += 1;
    else if (r.result === 'PARTIAL') c.partial += 1;
  }

  const days = [];
  for (let i = 0; i < cols * 7; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const data = cellMap.get(iso) || { runs: 0, passed: 0, failed: 0, partial: 0 };
    days.push({ iso, ...data });
  }
  return { weeks: cols, startDate: startDate.toISOString().slice(0, 10), days };
}

function bugsForPlan(planRel, bugs) {
  const kebab = path.basename(planRel, '.md');
  return bugs
    .filter((b) => b.name.includes(kebab))
    .map((b) => ({ name: b.name, href: b.fileRel })); // fileRel is already relative to test-reports/
}

function titleCaseSlug(slug) {
  return slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function groupBySection(planEntries) {
  const sections = new Map();
  for (const entry of planEntries) {
    const stripped = entry.plan.replace(/^test-plans\//, '');
    const slash = stripped.indexOf('/');
    const key = slash >= 0 ? stripped.slice(0, slash) : '_root';
    if (!sections.has(key)) sections.set(key, []);
    sections.get(key).push(entry);
  }
  return [...sections.entries()]
    .sort(([a], [b]) => (a === '_root' ? -1 : b === '_root' ? 1 : a.localeCompare(b)))
    .map(([key, plans]) => ({
      key,
      title: key === '_root' ? 'General' : titleCaseSlug(key),
      stripPrefix: key === '_root' ? 'test-plans/' : `test-plans/${key}/`,
      plans,
    }));
}

function buildPlanEntry(plan, runs, bugs) {
  const last = runs[0] || null;
  const badges = [];
  if (!last) {
    badges.push({ kind: 'new', text: 'NEW · never run' });
  } else {
    const lastRunMs = Date.parse(`${last.date}T23:59:59Z`);
    if (Date.parse(plan.mtime) > lastRunMs) {
      const specMs = plan.specMtime ? Date.parse(plan.specMtime) : 0;
      const which = specMs > Date.parse(plan.mdMtime) ? 'spec' : 'plan';
      badges.push({ kind: 'updated', text: `UPDATED · ${which} edited after last run` });
    }
  }
  if (!plan.spec) badges.push({ kind: 'no-spec', text: 'no .spec.ts yet' });

  const status = last ? last.result : 'NEVER';
  let rowStatus = 'never';
  if (last && last.result === 'FAILED') rowStatus = 'failing';
  else if (last && last.result === 'PARTIAL') rowStatus = 'partial';
  else if (last && last.result === 'PASSED') rowStatus = 'passing';

  return {
    plan: plan.plan,
    planHref: UP + plan.plan,
    spec: plan.spec,
    specHref: plan.spec ? UP + plan.spec : null,
    canRun: !!plan.spec,
    badges,
    rowStatus,
    status,
    last: last ? {
      date: last.date,
      result: last.result,
      duration: last.duration,
      reportHref: last.fileRel, // relative to test-reports/
    } : null,
    runCount: runs.length,
    history: runs.slice(0, SPARKLINE_RUNS).map((r) => ({ date: r.date, result: r.result, duration: r.duration })),
    bugs: bugsForPlan(plan.plan, bugs),
  };
}

function buildKpis(plans, reports, byPlan) {
  const recent = reports.filter((r) => {
    if (!r.date) return false;
    return Date.now() - Date.parse(`${r.date}T00:00:00Z`) <= 7 * 24 * 3600 * 1000;
  });
  const recentPass = recent.filter((r) => r.result === 'PASSED').length;
  const lastResultIs = (res) => [...byPlan.entries()].filter(([, runs]) => runs[0] && runs[0].result === res).length;
  return {
    totalPlans: plans.length,
    totalRuns: reports.length,
    last7Runs: recent.length,
    last7Pass: recentPass,
    last7PassPct: recent.length === 0 ? null : Math.round((recentPass / recent.length) * 100),
    failingFlows: lastResultIs('FAILED'),
    passingFlows: lastResultIs('PASSED'),
    partialFlows: lastResultIs('PARTIAL'),
    neverFlows: [...byPlan.entries()].filter(([, runs]) => !runs[0]).length,
  };
}

function buildTimeline(reports) {
  const byDate = new Map();
  for (const r of reports) {
    if (!r.date) continue;
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date).push({
      plan: r.plan,
      planDisplay: r.plan ? r.plan.replace(/^test-plans\//, '') : path.basename(r.fileRel),
      result: r.result,
      duration: r.duration,
      mode: r.mode,
      reportHref: r.fileRel,
    });
  }
  return [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, runs]) => ({ date, runs }));
}

const SHELL_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Test Report Dashboard — ${APP_NAME}</title>
<link rel="stylesheet" href="../assets/dashboard.css" />
</head>
<body>
  <header class="topbar">
    <div class="inner">
      <a class="brand" href="index.html">
        <span class="mark">PD</span>
        <span class="name">${APP_NAME}<span class="org">Test Reports</span></span>
      </a>
      <nav></nav>
    </div>
  </header>

  <main class="container" id="dashboard-root">
    <div class="dashboard-loading">Loading dashboard…</div>
  </main>

  <script src="data.js"></script>
  <script src="../assets/dashboard.js"></script>
</body>
</html>
`;

function build() {
  const plans = collectPlans();
  const reports = collectReports();
  const bugs = collectBugs();
  const byPlan = indexRunsByPlan(plans, reports);
  const hasAllure = fs.existsSync(path.join(REPO_ROOT, 'allure-report', 'index.html'));

  const planEntries = plans.map((p) => buildPlanEntry(p, byPlan.get(p.plan) || [], bugs));
  planEntries.sort((a, b) => {
    const aDate = a.last?.date || '0000';
    const bDate = b.last?.date || '0000';
    if (aDate !== bDate) return bDate.localeCompare(aDate);
    return a.plan.localeCompare(b.plan);
  });

  const data = {
    project: 'pd-telephony',
    displayName: APP_NAME,
    meta: {
      displayName: APP_NAME,
      appUrl: APP_URL,
      environment: APP_ENV,
      sourceRepo: SOURCE_REPO,
      description: 'Hybrid Markdown + Playwright test reports for PD Telephony.',
      source: { kind: 'local' },
    },
    hasAllure,
    allureHref: UP + 'allure-report/index.html',
    workflowUrl: null, // pd-telephony has no one-click re-run workflow
    kpis: buildKpis(plans, reports, byPlan),
    heatmap: buildHeatmap(reports),
    sections: groupBySection(planEntries),
    timeline: buildTimeline(reports),
    generated: new Date().toISOString(),
  };

  fs.mkdirSync(REPORTS_ROOT, { recursive: true });
  fs.writeFileSync(path.join(REPORTS_ROOT, 'data.json'), JSON.stringify(data, null, 2));
  fs.writeFileSync(path.join(REPORTS_ROOT, 'data.js'), `window.__DATA__ = ${JSON.stringify(data)};\n`);

  const shellPath = path.join(REPORTS_ROOT, 'index.html');
  if (!fs.existsSync(shellPath) || fs.readFileSync(shellPath, 'utf8') !== SHELL_TEMPLATE) {
    fs.writeFileSync(shellPath, SHELL_TEMPLATE);
  }

  console.log(`[dashboard] ${plans.length} flow(s), ${reports.length} run(s) → test-reports/data.json`);
}

build();
