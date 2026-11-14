#!/usr/bin/env bash
# The baton fixture plus a small hand-written design-system bundle (#134's request).
set -euo pipefail
bash "$(dirname "$0")/../_fixtures/baton-repo.sh"
mkdir -p bundle
cat > bundle/ds.js <<'JS'
// Hand-written design-system bundle. The members and events apps load it with a <script> tag
// and call window.DS.Button(...) etc.; each component returns a DOM node.
(function () {
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    (children || []).forEach(function (c) { node.append(c); });
    return node;
  }
  function Button(label, opts) {
    return el('button', { class: 'ds-btn ds-btn--' + ((opts && opts.variant) || 'primary') }, [label]);
  }
  function Badge(text, tone) { return el('span', { class: 'ds-badge ds-badge--' + (tone || 'neutral') }, [text]); }
  function Card(title, body, footer) { return el('section', { class: 'ds-card' }, [el('h3', {}, [title]), body, footer || '']); }
  window.DS = { Button: Button, Badge: Badge, Card: Card };
})();
JS
cat > bundle/ds.d.ts <<'TS'
// Hand-kept and out of date: Badge takes tone, Card takes footer.
declare namespace DS {
  function Button(label: string, opts?: { variant?: 'primary' | 'secondary' }): HTMLButtonElement;
  function Badge(text: string): HTMLSpanElement;
  function Card(title: string, body: Node): HTMLElement;
}
TS
cat > bundle/README.md <<'MD'
# Design-system bundle
`ds.js` is copied as-is to the CDN; there is no build step. The members and events apps embed it
with a `<script>` tag and must keep calling `window.DS.Button(...)` and getting DOM nodes back.
The planned move to TSX changes how components are written, not what the apps load: no React or
other runtime ships in the bundle.
MD
git add -A
git commit -q -m "Add design-system bundle"
