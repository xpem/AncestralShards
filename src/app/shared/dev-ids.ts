/**
 * Modo dev `?ids=1`: desenha o valor de cada `data-ui` sobre a tela, para citar elementos pelo nome.
 * É uma camada fixa fora do app (pointer-events: none), então não altera o layout nem bloqueia cliques.
 */
export function enableDevIds(): void {
  if (new URLSearchParams(location.search).get('ids') !== '1') return;

  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;overflow:hidden';
  document.body.appendChild(layer);

  const LABEL_HEIGHT = 12;
  let scheduled = false;

  const draw = (): void => {
    scheduled = false;
    layer.replaceChildren();
    const used = new Set<string>();

    for (const el of document.querySelectorAll<HTMLElement>('[data-ui]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > innerHeight) continue;

      const box = document.createElement('div');
      box.style.cssText = `position:absolute;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;outline:1px dashed rgba(255,0,200,.7);outline-offset:-1px`;

      // Elementos aninhados começam no mesmo canto; desce o rótulo até achar um lugar livre.
      let top = r.top;
      const left = Math.round(r.left);
      while (used.has(`${left}:${Math.round(top)}`)) top += LABEL_HEIGHT;
      used.add(`${left}:${Math.round(top)}`);

      const tag = document.createElement('span');
      tag.textContent = el.dataset['ui'] ?? '';
      tag.style.cssText = `position:absolute;left:${r.left}px;top:${top}px;font:10px/${LABEL_HEIGHT - 2}px monospace;padding:0 3px;color:#fff;background:rgba(200,0,150,.85);white-space:nowrap;border-radius:2px`;

      layer.append(box, tag);
    }
  };

  const schedule = (): void => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(draw);
  };

  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true });
  addEventListener('scroll', schedule, true);
  addEventListener('resize', schedule);
  schedule();
}
