/*
 * PD Telephony test-reports dashboard renderer.
 *
 * Consumes window.__DATA__ (emitted as test-reports/data.js by
 * scripts/build-dashboard.js), falling back to fetch('data.json') over http.
 * Plain browser JS, no framework, no build step. Mounts into #dashboard-root.
 *
 * This repo is a single project (no hub, no cross-project landing), and runs
 * are launched via the /RunTest skill — so there is no one-click re-run button.
 */
(function () {
  const SPARK_CLASS = { PASSED: 'spark-pass', FAILED: 'spark-fail', PARTIAL: 'spark-partial' };
  const PILL_CLASS = { PASSED: 'pass', FAILED: 'fail', PARTIAL: 'partial' };
  const BADGE_CLASS = { updated: 'badge-updated', new: 'badge-new', 'no-spec': 'badge-no-spec' };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }
  function isExternal(href) { return /^https?:\/\//.test(href || ''); }
  function linkAttrs(href) { return isExternal(href) ? ' target="_blank" rel="noopener noreferrer"' : ''; }

  // ────── Header ──────
  function headerHtml(data) {
    const m = data.meta || {};
    const env = m.environment ? `<span class="env-chip">${esc(m.environment)}</span>` : '';
    const bits = [];
    if (m.description) bits.push(esc(m.description));
    if (m.appUrl) bits.push(`<a href="${esc(m.appUrl)}" target="_blank" rel="noopener noreferrer">${esc(m.appUrl)}</a>`);
    if (m.sourceRepo) bits.push(`<a href="${esc(m.sourceRepo)}" target="_blank" rel="noopener noreferrer">repo</a>`);
    const allureBtn = data.hasAllure
      ? `<button type="button" class="btn" id="open-allure">View Allure report</button>`
      : '';
    return `
      <div class="project-header">
        <div>
          <div class="title-row">
            <h1>${esc(m.displayName || data.displayName || data.project)}</h1>
            ${env}
          </div>
          ${bits.length ? `<p class="subtitle">${bits.join(' &nbsp;·&nbsp; ')}</p>` : ''}
        </div>
        <div class="actions">${allureBtn}</div>
      </div>`;
  }

  // ────── KPIs ──────
  function kpisHtml(k) {
    const passPct = k.last7PassPct == null ? '—' : `${k.last7PassPct}%`;
    const failingClass = (k.failingFlows || 0) > 0 ? 'kpi-warn' : 'kpi-good';
    return `
      <section class="kpis" aria-label="Overview">
        <div class="kpi"><span class="label">Flows</span><span class="num">${k.totalPlans || 0}</span><span class="meta">${k.neverFlows || 0} never run</span></div>
        <div class="kpi"><span class="label">Total runs</span><span class="num">${k.totalRuns || 0}</span><span class="meta">${k.last7Runs || 0} in the last 7 days</span></div>
        <div class="kpi"><span class="label">7d pass rate</span><span class="num">${passPct}</span><span class="meta">${k.last7Pass || 0}/${k.last7Runs || 0} passed</span></div>
        <div class="kpi ${failingClass}"><span class="label">Currently failing</span><span class="num">${k.failingFlows || 0}</span><span class="meta">${k.passingFlows || 0} passing · ${k.partialFlows || 0} partial</span></div>
      </section>`;
  }

  // ────── Heatmap ──────
  function heatColor(d) {
    if (!d.runs) return 'var(--surface-2)';
    if (d.failed > 0) return '#f87171';
    if (d.partial > 0) return '#fbbf24';
    return '#4ade80';
  }
  function heatmapHtml(hm) {
    if (!hm || !hm.days || !hm.days.length) return '';
    const cell = 11, gap = 3, step = cell + gap;
    const topPad = 16, leftPad = 26;
    const weeks = hm.weeks || Math.ceil(hm.days.length / 7);
    const width = leftPad + weeks * step;
    const height = topPad + 7 * step;
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    let cells = '', months = '', lastMonth = -1;
    for (let i = 0; i < hm.days.length; i++) {
      const d = hm.days[i];
      const col = Math.floor(i / 7), row = i % 7;
      const x = leftPad + col * step, y = topPad + row * step;
      const title = d.runs
        ? `${d.iso}: ${d.runs} run${d.runs === 1 ? '' : 's'} · ${d.passed}✓ ${d.failed}✗ ${d.partial}~`
        : `${d.iso}: no runs`;
      cells += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" fill="${heatColor(d)}"><title>${esc(title)}</title></rect>`;
      if (row === 0) {
        const mo = new Date(d.iso + 'T00:00:00Z').getUTCMonth();
        if (mo !== lastMonth) { months += `<text class="month" x="${x}" y="${topPad - 5}">${MONTHS[mo]}</text>`; lastMonth = mo; }
      }
    }
    const dayLabels = [['Mon', 1], ['Wed', 3], ['Fri', 5]]
      .map(([lbl, r]) => `<text class="day" x="0" y="${topPad + r * step + cell - 1}">${lbl}</text>`).join('');

    return `
      <div class="panel">
        <div class="panel-head"><h2>Activity</h2></div>
        <div class="panel-body">
          <svg class="heatmap" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMinYMin meet" role="img" aria-label="Run activity over the last year">
            ${months}${dayLabels}${cells}
          </svg>
          <div class="legend">
            <span>Less</span>
            <span class="group"><span class="swatch" style="background:var(--surface-2)"></span></span>
            <span class="group"><span class="swatch" style="background:#4ade80"></span> pass</span>
            <span class="group"><span class="swatch" style="background:#fbbf24"></span> partial</span>
            <span class="group"><span class="swatch" style="background:#f87171"></span> fail</span>
          </div>
        </div>
      </div>`;
  }

  // ────── Flows ──────
  function pill(status) {
    if (status === 'NEVER' || !status) return '<span class="pill pill-neutral">never run</span>';
    return `<span class="pill pill-${PILL_CLASS[status] || 'neutral'}">${esc(status)}</span>`;
  }
  function sparkline(history) {
    if (!history || !history.length) return '<span class="spark-empty">—</span>';
    const cells = history.slice().reverse().map((h) => {
      const cls = SPARK_CLASS[h.result] || 'spark-neutral';
      const t = `${h.date || ''} ${h.result || ''}${h.duration ? ' · ' + h.duration : ''}`.trim();
      return `<span class="spark ${cls}" title="${esc(t)}"></span>`;
    }).join('');
    return `<span class="sparkline">${cells}</span>`;
  }
  function badges(list) {
    if (!list || !list.length) return '';
    return `<div class="plan-badges">${list.map((b) =>
      `<span class="badge ${BADGE_CLASS[b.kind] || ''}">${esc(b.text)}</span>`).join('')}</div>`;
  }
  function linksCell(p) {
    const out = [`<a href="${esc(p.planHref)}"${linkAttrs(p.planHref)}>plan</a>`];
    if (p.spec && p.specHref) out.push(`<a href="${esc(p.specHref)}"${linkAttrs(p.specHref)}>spec</a>`);
    (p.bugs || []).forEach((b) => out.push(`<a href="${esc(b.href)}"${linkAttrs(b.href)} title="${esc(b.name)}">bug</a>`));
    return `<span class="links">${out.join(' · ')}</span>`;
  }
  function lastRunCell(p) {
    if (!p.last) return '<span class="muted">—</span>';
    const dur = p.last.duration ? ` <span class="muted">${esc(p.last.duration)}</span>` : '';
    const date = p.last.reportHref
      ? `<a href="${esc(p.last.reportHref)}"${linkAttrs(p.last.reportHref)}>${esc(p.last.date)}</a>`
      : esc(p.last.date);
    return `${date}${dur}`;
  }
  function flowRow(p, stripPrefix) {
    const name = p.plan.replace(new RegExp('^' + stripPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), '');
    return `
      <tr>
        <td class="plan-cell">
          <div class="plan-name">${esc(name)}</div>
          ${badges(p.badges)}
        </td>
        <td class="nowrap">${pill(p.status)}</td>
        <td>${sparkline(p.history)}</td>
        <td class="nowrap">${lastRunCell(p)}</td>
        <td class="num">${p.runCount || 0}</td>
        <td>${linksCell(p)}</td>
      </tr>`;
  }
  function sectionHtml(sec) {
    const rows = sec.plans.map((p) => flowRow(p, sec.stripPrefix)).join('');
    return `
      <div class="panel section-panel">
        <div class="panel-head section-head">
          <div class="section-title-group">
            <h3 class="section-title">${esc(sec.title)}</h3>
            <span class="section-stats muted">${sec.plans.length} flow${sec.plans.length === 1 ? '' : 's'}</span>
          </div>
        </div>
        <div class="panel-body no-pad">
          <table class="flows">
            <thead><tr><th>Flow</th><th>Status</th><th>Last 12 runs</th><th>Last run</th><th>Runs</th><th>Links</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }
  function flowsHtml(sections) {
    if (!sections || !sections.length) {
      return `<div class="empty"><strong>No flows yet</strong> Add plans under <code>test-plans/</code> with <code>/CreateTest</code>, then rebuild.</div>`;
    }
    return `<div class="flows-toolbar"><h2>Flows</h2></div>${sections.map(sectionHtml).join('')}`;
  }

  // ────── Timeline ──────
  function timelineHtml(timeline) {
    if (!timeline || !timeline.length) return '';
    const days = timeline.map((day) => {
      const runs = day.runs.map((r) => {
        const cls = PILL_CLASS[r.result] || 'neutral';
        const dur = r.duration ? `<span class="muted">${esc(r.duration)}</span>` : '';
        const mode = r.mode ? `<span class="muted">${esc(r.mode)}</span>` : '';
        const label = esc(r.planDisplay || r.plan || 'run');
        const link = r.reportHref
          ? `<a class="run-link" href="${esc(r.reportHref)}"${linkAttrs(r.reportHref)}>${label}</a>`
          : `<span class="run-link">${label}</span>`;
        return `<li class="timeline-run"><span class="pill pill-${cls}">${esc(r.result)}</span>${link}${dur}${mode}</li>`;
      }).join('');
      return `
        <div class="timeline-day">
          <header><strong>${esc(day.date)}</strong><span class="muted">${day.runs.length} run${day.runs.length === 1 ? '' : 's'}</span></header>
          <ul>${runs}</ul>
        </div>`;
    }).join('');
    return `<div class="flows-toolbar"><h2>Run history</h2></div>${days}`;
  }

  // ────── Allure modal ──────
  function wireAllure(data) {
    const btn = document.getElementById('open-allure');
    if (!btn || !data.hasAllure) return;
    const src = data.allureHref || 'allure-report/index.html';
    btn.addEventListener('click', () => {
      let modal = document.getElementById('allure-modal');
      if (!modal) {
        modal = el(`
          <div class="allure-modal" id="allure-modal">
            <div class="dialog">
              <div class="head">
                <span class="title">Allure report — ${esc(data.displayName || data.project)}</span>
                <div class="right">
                  <a class="popout" href="${esc(src)}" target="_blank" rel="noopener noreferrer">Open in new tab ↗</a>
                  <button type="button" class="close">Close</button>
                </div>
              </div>
              <div class="allure-frame-wrap">
                <div class="loader">Loading Allure…</div>
                <iframe src="${esc(src)}" title="Allure report"></iframe>
              </div>
            </div>
          </div>`);
        document.body.appendChild(modal);
        const loader = modal.querySelector('.loader');
        modal.querySelector('iframe').addEventListener('load', () => loader.classList.add('hidden'));
        const close = () => { modal.classList.remove('open'); document.body.classList.remove('modal-open'); };
        modal.querySelector('.close').addEventListener('click', close);
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
      }
      modal.classList.add('open');
      document.body.classList.add('modal-open');
    });
  }

  // ────── Render ──────
  function render(data) {
    const root = document.getElementById('dashboard-root');
    if (!root) return;
    document.title = `${data.displayName || data.project} · Test Reports`;
    root.innerHTML = `
      ${headerHtml(data)}
      ${kpisHtml(data.kpis || {})}
      ${heatmapHtml(data.heatmap)}
      ${flowsHtml(data.sections)}
      ${timelineHtml(data.timeline)}
      <footer class="page-footer">
        <span>Generated ${esc((data.generated || '').replace('T', ' ').slice(0, 16))} UTC</span>
        <span><code>node scripts/build-dashboard.js</code></span>
      </footer>`;
    wireAllure(data);
  }

  function showError(msg) {
    const root = document.getElementById('dashboard-root');
    if (root) root.innerHTML = `<div class="dashboard-error">Couldn't load dashboard data: ${esc(msg)}</div>`;
  }

  if (window.__DATA__) {
    render(window.__DATA__);
  } else {
    fetch('data.json', { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(render)
      .catch((e) => showError(`${e.message} — open via a local server or run \`node scripts/build-dashboard.js\` to refresh data.js.`));
  }
})();
