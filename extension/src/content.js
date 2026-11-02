// 스카이스캐너 페이지에서 가격을 찾아 최종 예상가 배지와 판매처 비교표를 붙인다.
let rules = null;
let opts = { baggage: false, card: false };
const won = (n) => '₩' + Number(n).toLocaleString('ko-KR');
// 판매처 선택 화면 URL에는 /config/가 들어간다
const isSellerPage = () => location.pathname.includes('/config/');

function annotate(el, page) {
  const price = parsePrice(el.dataset.cfPrice);
  const ctx = contextOf(el);
  const est = estimate(price, textOf(ctx), rules, opts, page);
  const badge = document.createElement('span');
  badge.className = 'clearfare clearfare-badge';
  if (est.kind === 'seller') {
    Object.assign(badge.dataset, { seller: est.seller, price, total: est.total, verified: est.verified });
    ctx.dataset.cfRow = JSON.stringify({ seller: est.seller, price }); // 클릭하면 팝업 신고 양식에 미리 채움
    if (!est.verified) badge.title = '예시 수수료 규칙(미검증) — 실제 결제 금액을 팝업에서 신고해 주세요';
  } else {
    badge.textContent = est.min === est.max ? `최종 ${won(est.min)}` : `최종 ${won(est.min)} ~ ${won(est.max)}`;
    badge.title = `판매처별 수수료${opts.baggage ? `, 수하물(${est.airline ?? '항공사 미확인'})` : ''}${opts.card ? ', 카드 수수료' : ''} 포함 예상 범위`;
  }
  el.after(badge);
}

function scan() {
  const els = findPriceElements(document.body).filter((el) => el.dataset.cfPrice !== el.textContent.trim());
  if (!els.length) return;
  // 가격 텍스트가 바뀐 요소는 이전 배지 제거. 표시를 전부 먼저 해야 contextOf가 다른 가격을 센다.
  for (const el of els) {
    if (el.dataset.cfPrice && el.nextElementSibling?.classList.contains('clearfare-badge')) el.nextElementSibling.remove();
    el.dataset.cfPrice = el.textContent.trim();
  }
  const page = isSellerPage() ? { sellerPage: true, airlineHint: document.body.textContent } : {};
  els.forEach((el) => annotate(el, page));
}

// 판매처끼리 표시가 순위와 최종가 순위를 비교하고, 최종가 순 비교표를 띄운다
function rank() {
  const badges = [...document.querySelectorAll('.clearfare-badge[data-total]')];
  const shown = ranks(badges.map((b) => +b.dataset.price));
  const final = ranks(badges.map((b) => +b.dataset.total));
  badges.forEach((b, i) => {
    const mark = b.dataset.verified === 'true' ? '' : ' (미검증)';
    b.textContent = `최종 ${won(b.dataset.total)}${mark} · 표시가 ${shown[i]}위 → 최종 ${final[i]}위`;
    b.classList.toggle('clearfare-worse', final[i] > shown[i]);
  });
  renderPanel(badges.map((b) => b.dataset));
}

function renderPanel(rows) {
  document.querySelector('.clearfare-panel')?.remove();
  if (rows.length < 2) return;
  const panel = document.createElement('div');
  panel.className = 'clearfare clearfare-panel';
  const table = document.createElement('table');
  const line = (cells, tag = 'td') => {
    const tr = table.insertRow();
    cells.forEach((c) => (tr.appendChild(document.createElement(tag)).textContent = c));
    return tr;
  };
  line(['판매처', '표시가', '최종가', '차이'], 'th');
  [...rows]
    .sort((a, b) => a.total - b.total)
    .forEach((r) => line([r.seller + (r.verified === 'true' ? '' : '*'), won(r.price), won(r.total), '+' + won(r.total - r.price)]));
  const title = document.createElement('b');
  title.textContent = 'ClearFare · 최종가 순';
  const close = document.createElement('button');
  close.textContent = '×';
  close.onclick = () => panel.remove();
  const note = document.createElement('small');
  note.textContent = '* 미검증 예시 규칙';
  panel.append(close, title, table, note);
  document.body.append(panel);
}

function update() {
  if (!rules) return;
  scan();
  rank();
}

function refresh() {
  document.querySelectorAll('.clearfare').forEach((n) => n.remove());
  document.querySelectorAll('[data-cf-price]').forEach((el) => delete el.dataset.cfPrice);
  document.querySelectorAll('[data-cf-row]').forEach((el) => delete el.dataset.cfRow);
  update();
}

// 결과가 스크롤/필터로 계속 바뀌는 SPA라 변경을 감시. 우리가 넣은 배지·표의 변경은 무시해야 무한 루프가 안 생긴다.
const ours = (n) => (n.nodeType === 1 ? n : n.parentElement)?.closest('.clearfare');
const relevant = (m) => (m.type === 'characterData' ? !ours(m.target) : [...m.addedNodes, ...m.removedNodes].some((n) => !ours(n)));
let timer;
new MutationObserver((muts) => {
  if (!muts.some(relevant)) return;
  clearTimeout(timer);
  timer = setTimeout(update, 300);
}).observe(document.body, { childList: true, subtree: true, characterData: true });

if (globalThis.chrome?.runtime?.id) {
  Promise.all([chrome.storage.sync.get(opts), chrome.runtime.sendMessage({ type: 'rules' })]).then(([saved, res]) => {
    opts = saved;
    rules = res?.rules ?? null;
    if (!rules) console.warn('[ClearFare] 서버에서 규칙을 못 받음 — backend/server.py 실행 확인');
    refresh();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const k in changes) opts[k] = changes[k].newValue;
    refresh();
  });
  document.addEventListener(
    'click',
    (e) => {
      const row = e.target.closest?.('[data-cf-row]');
      if (row) chrome.storage.local.set({ lastPick: JSON.parse(row.dataset.cfRow) });
    },
    true
  );
} else {
  // 확장프로그램 밖(test/demo.html, 테스트)에서는 페이지가 넣어 준 규칙 사용
  rules = globalThis.CLEARFARE_RULES ?? null;
  opts = { ...opts, ...globalThis.CLEARFARE_OPTS };
  refresh();
}
