/** The page around the article: tokens for both themes, the reading column, the tooltip layer. */
export function page({ title, description, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<style>
:root {
  color-scheme: light;
  --page: #f9f9f7;
  --surface-1: #fcfcfb;
  --text-primary: #0b0b0b;
  --text-secondary: #52514e;
  --text-muted: #898781;
  --grid: #e1e0d9;
  --axis: #c3c2b7;
  --border: rgba(11, 11, 11, 0.1);
  --link: #1c5cab;
  --series-1: #2a78d6;
  --series-2: #eb6834;
  --series-3: #1baf7a;
  --series-4: #eda100;
  --good: #006300;
  --critical: #d03b3b;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --page: #0d0d0d;
    --surface-1: #1a1a19;
    --text-primary: #f0efec;
    --text-secondary: #c3c2b7;
    --text-muted: #898781;
    --grid: #2c2c2a;
    --axis: #383835;
    --border: rgba(255, 255, 255, 0.1);
    --link: #86b6ef;
    --series-1: #3987e5;
    --series-2: #d95926;
    --series-3: #199e70;
    --series-4: #c98500;
    --good: #0ca30c;
    --critical: #e66767;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --page: #0d0d0d;
  --surface-1: #1a1a19;
  --text-primary: #f0efec;
  --text-secondary: #c3c2b7;
  --text-muted: #898781;
  --grid: #2c2c2a;
  --axis: #383835;
  --border: rgba(255, 255, 255, 0.1);
  --link: #86b6ef;
  --series-1: #3987e5;
  --series-2: #d95926;
  --series-3: #199e70;
  --series-4: #c98500;
  --good: #0ca30c;
  --critical: #e66767;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--page);
  color: var(--text-primary);
  font: 17px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif;
}
main { max-width: 760px; margin: 0 auto; padding: 48px 16px 96px; }
header.title { margin-bottom: 40px; }
h1 { font-size: 2rem; line-height: 1.2; margin: 0 0 12px; letter-spacing: -0.01em; }
.dek { color: var(--text-secondary); font-size: 1.15rem; margin: 0 0 16px; }
.byline { color: var(--text-muted); font-size: 0.9rem; }
h2 { font-size: 1.4rem; margin: 56px 0 12px; line-height: 1.3; }
h3 { font-size: 1.1rem; margin: 32px 0 8px; }
p, li { color: var(--text-primary); }
a { color: var(--link); }
code { font: 0.88em ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--surface-1); border: 1px solid var(--border); border-radius: 4px; padding: 0 4px; }
blockquote { margin: 24px 0; padding: 4px 0 4px 16px; border-left: 3px solid var(--axis); color: var(--text-secondary); }
.answer { background: var(--surface-1); border: 1px solid var(--border); border-radius: 12px; padding: 16px 20px; margin: 24px 0; }
.answer p { margin: 8px 0; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 24px 0; }
.stat { background: var(--surface-1); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; }
.stat .figure { font-size: 1.7rem; font-weight: 600; line-height: 1.2; }
.stat .what { color: var(--text-secondary); font-size: 0.85rem; }
figure.chart { margin: 28px 0 8px; background: var(--surface-1); border: 1px solid var(--border); border-radius: 12px; padding: 16px 16px 8px; }
figure.chart figcaption { font-weight: 600; margin-bottom: 8px; }
figure.chart svg { width: 100%; height: auto; display: block; overflow: visible; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 16px; color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 4px; }
.legend .key { display: inline-flex; align-items: center; gap: 6px; }
svg .grid { stroke: var(--grid); stroke-width: 1; }
svg .axis { stroke: var(--axis); stroke-width: 1; }
svg .tick { fill: var(--text-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
svg .label { fill: var(--text-secondary); font-size: 13px; }
svg .value { fill: var(--text-primary); font-size: 13px; font-variant-numeric: tabular-nums; }
svg .dot { stroke: var(--surface-1); stroke-width: 2; cursor: default; }
svg .bar { cursor: default; }
svg .dot:hover, svg .dot:focus, svg .bar:hover, svg .bar:focus { opacity: 0.8; outline: none; }
.note { color: var(--text-muted); font-size: 0.85rem; margin: 4px 0 24px; }
details.table-view { margin: 4px 0 24px; font-size: 0.9rem; }
details.table-view summary { color: var(--text-muted); cursor: pointer; }
table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 0.9rem; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--grid); font-variant-numeric: tabular-nums; }
th { color: var(--text-secondary); font-weight: 600; }
.scroll { overflow-x: auto; }
.pass { color: var(--good); }
.fail { color: var(--critical); }
#tip { position: fixed; pointer-events: none; background: var(--surface-1); color: var(--text-primary); border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; font-size: 0.85rem; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12); display: none; max-width: 320px; z-index: 10; }
footer { margin-top: 64px; color: var(--text-muted); font-size: 0.85rem; border-top: 1px solid var(--grid); padding-top: 16px; }
</style>
</head>
<body>
<main>
${body}
</main>
<div id="tip" role="tooltip"></div>
<script>
// One tooltip for every mark: the value first, from the mark's data-tip, set as text (never as HTML).
const tip = document.getElementById('tip');
const show = (mark, x, y) => {
  tip.textContent = mark.getAttribute('data-tip');
  tip.style.display = 'block';
  const width = tip.offsetWidth;
  tip.style.left = Math.min(x + 12, window.innerWidth - width - 8) + 'px';
  tip.style.top = (y + 14) + 'px';
};
const hide = () => { tip.style.display = 'none'; };
document.querySelectorAll('[data-tip]').forEach(mark => {
  mark.addEventListener('pointermove', event => show(mark, event.clientX, event.clientY));
  mark.addEventListener('pointerleave', hide);
  mark.addEventListener('focus', () => { const box = mark.getBoundingClientRect(); show(mark, box.right, box.top); });
  mark.addEventListener('blur', hide);
});
</script>
</body>
</html>
`;
}
