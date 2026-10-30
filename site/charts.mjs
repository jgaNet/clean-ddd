/**
 * The article's charts, rendered to inline SVG at build time from the records' numbers. Thin marks,
 * one baseline, a 2px surface gap between touching bars, a 2px surface ring on dots, hairline
 * grids; color carries the arm and only the arm, in the same slot everywhere; every mark has a
 * tooltip (`data-tip`) and every chart a table view beside it.
 */

/** The arms, in a fixed order: the color follows the arm, never its rank in a chart. */
export const ARMS = {
  A: { name: 'A — architecture + tool', slot: 1 },
  P: { name: 'P — plain project', slot: 2 },
  D: { name: 'D — architecture, no tool', slot: 3 },
  Cp: { name: 'C′ — fan-out by context', slot: 4 },
};

const escape = value =>
  String(value).replace(
    /[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
const fmt = (value, digits = 1) =>
  Number(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const niceMax = value => {
  const step = 10 ** Math.floor(Math.log10(value || 1));
  for (const factor of [1, 2, 2.5, 5, 10]) if (factor * step >= value) return factor * step;
  return 10 * step;
};
const ticks = (max, count = 4) => Array.from({ length: count + 1 }, (_, index) => (max * index) / count);
const color = arm => `var(--series-${ARMS[arm].slot})`;

/** The legend: a swatch beside each arm's name, text in ink, never in the series color. */
export function legend(arms, shape = 'dot') {
  return `<div class="legend">${arms
    .map(
      arm =>
        `<span class="key"><svg width="14" height="14" aria-hidden="true">${
          shape === 'rect'
            ? `<rect x="1" y="1" width="12" height="12" rx="3" fill="${color(arm)}"/>`
            : `<circle cx="7" cy="7" r="5" fill="${color(arm)}"/>`
        }</svg>${escape(ARMS[arm].name)}</span>`,
    )
    .join('')}</div>`;
}

/** A table view, the chart's twin: every value readable without hovering. */
export function table(caption, head, rows) {
  return `<details class="table-view"><summary>${escape(caption)} — table</summary><table><thead><tr>${head
    .map(cell => `<th>${escape(cell)}</th>`)
    .join('')}</tr></thead><tbody>${rows
    .map(row => `<tr>${row.map(cell => `<td>${escape(cell)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></details>`;
}

/**
 * Runs as dots on one horizontal scale, one row per arm, the range between the arm's runs as a
 * hairline: how far apart the arms are, and how far apart one arm's runs are.
 */
export function dotRange({ id, title, unit, rows, max, digits = 1, prefix = '' }) {
  const width = 720;
  const left = 190;
  const right = 70;
  const rowHeight = 44;
  const top = 12;
  const plot = width - left - right;
  const height = top + rows.length * rowHeight + 30;
  const scaleMax = niceMax(max ?? Math.max(...rows.flatMap(row => row.values.map(v => v.value))) * 1.05);
  const x = value => left + (value / scaleMax) * plot;
  const grid = ticks(scaleMax)
    .map(
      tick =>
        `<line x1="${x(tick)}" x2="${x(tick)}" y1="${top - 4}" y2="${height - 26}" class="grid"/><text x="${x(tick)}" y="${height - 8}" class="tick" text-anchor="middle">${prefix}${fmt(tick, tick % 1 ? 1 : 0)}</text>`,
    )
    .join('');
  const marks = rows
    .map((row, index) => {
      const y = top + index * rowHeight + rowHeight / 2;
      const values = row.values.map(v => v.value);
      const low = Math.min(...values);
      const high = Math.max(...values);
      const median = [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
      return `<g><text x="${left - 14}" y="${y + 4}" class="label" text-anchor="end">${escape(row.label ?? ARMS[row.arm].name)}</text>
<line x1="${x(low)}" x2="${x(high)}" y1="${y}" y2="${y}" stroke="${color(row.arm)}" stroke-width="2" stroke-linecap="round" opacity="0.55"/>
${row.values
  .map(
    v =>
      `<circle cx="${x(v.value)}" cy="${y}" r="5.5" fill="${color(row.arm)}" class="dot" tabindex="0" data-tip="${escape(`${v.label}: ${prefix}${fmt(v.value, digits)}${unit ? ` ${unit}` : ''}`)}"/>`,
  )
  .join('')}
<text x="${width - right + 10}" y="${y + 4}" class="value">${values.length > 1 ? `${prefix}${fmt(low, digits)}–${fmt(high, digits)}` : `${prefix}${fmt(median, digits)}`}</text></g>`;
    })
    .join('');
  return `<figure class="chart" id="${id}"><figcaption>${escape(title)}</figcaption><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(title)}">${grid}${marks}</svg></figure>`;
}

/** Columns grouped by category, one per arm, from one baseline. */
export function groupedColumns({ id, title, unit, categories, series, digits = 1, prefix = '' }) {
  const width = 720;
  const left = 48;
  const right = 12;
  const top = 16;
  const plotHeight = 200;
  const height = top + plotHeight + 42;
  const all = series.flatMap(s => s.values.filter(v => v !== null && v !== undefined));
  const scaleMax = niceMax(Math.max(...all) * 1.05);
  const band = (width - left - right) / categories.length;
  const bar = Math.min(22, (band - 16) / series.length - 2);
  const y = value => top + plotHeight - (value / scaleMax) * plotHeight;
  const grid = ticks(scaleMax)
    .map(
      tick =>
        `<line x1="${left}" x2="${width - right}" y1="${y(tick)}" y2="${y(tick)}" class="${tick ? 'grid' : 'axis'}"/><text x="${left - 8}" y="${y(tick) + 4}" class="tick" text-anchor="end">${prefix}${fmt(tick, tick % 1 ? 1 : 0)}</text>`,
    )
    .join('');
  const groups = categories
    .map((category, c) => {
      const groupWidth = series.length * (bar + 2) - 2;
      const start = left + c * band + (band - groupWidth) / 2;
      const columns = series
        .map((s, index) => {
          const value = s.values[c];
          if (value === null || value === undefined) return '';
          const x0 = start + index * (bar + 2);
          const y0 = y(value);
          const h = top + plotHeight - y0;
          const r = Math.min(4, h);
          const path = `M${x0},${top + plotHeight} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + bar - r} Q${x0 + bar},${y0} ${x0 + bar},${y0 + r} V${top + plotHeight} Z`;
          return `<path d="${path}" fill="${color(s.arm)}" class="bar" tabindex="0" data-tip="${escape(`${ARMS[s.arm].name} · ${category}: ${prefix}${fmt(value, digits)}${unit ? ` ${unit}` : ''}`)}"/>`;
        })
        .join('');
      return `${columns}<text x="${left + c * band + band / 2}" y="${top + plotHeight + 18}" class="tick" text-anchor="middle">${escape(category)}</text>`;
    })
    .join('');
  return `<figure class="chart" id="${id}"><figcaption>${escape(title)}</figcaption>${legend(
    series.map(s => s.arm),
    'rect',
  )}<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(title)}">${grid}${groups}</svg></figure>`;
}

/** Horizontal bars, one per item, the value at the tip. */
export function bars({ id, title, unit, items, digits = 1, prefix = '' }) {
  const width = 720;
  const left = 190;
  const right = 90;
  const rowHeight = 34;
  const top = 8;
  const height = top + items.length * rowHeight + 8;
  const scaleMax = niceMax(Math.max(...items.map(item => item.value)) * 1.05);
  const x = value => left + (value / scaleMax) * (width - left - right);
  const marks = items
    .map((item, index) => {
      const y0 = top + index * rowHeight + 6;
      const w = Math.max(x(item.value) - left, 1);
      const h = 20;
      const r = Math.min(4, w);
      const path = `M${left},${y0} H${left + w - r} Q${left + w},${y0} ${left + w},${y0 + r} V${y0 + h - r} Q${left + w},${y0 + h} ${left + w - r},${y0 + h} H${left} Z`;
      return `<text x="${left - 14}" y="${y0 + 15}" class="label" text-anchor="end">${escape(item.label ?? ARMS[item.arm].name)}</text><path d="${path}" fill="${color(item.arm)}" class="bar" tabindex="0" data-tip="${escape(`${item.label ?? ARMS[item.arm].name}: ${prefix}${fmt(item.value, digits)}${unit ? ` ${unit}` : ''}${item.note ? ` — ${item.note}` : ''}`)}"/><text x="${left + w + 8}" y="${y0 + 15}" class="value">${prefix}${fmt(item.value, digits)}${unit ? ` ${unit}` : ''}</text>`;
    })
    .join('');
  return `<figure class="chart" id="${id}"><figcaption>${escape(title)}</figcaption><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(title)}"><line x1="${left}" x2="${left}" y1="${top}" y2="${height - 8}" class="axis"/>${marks}</svg></figure>`;
}
