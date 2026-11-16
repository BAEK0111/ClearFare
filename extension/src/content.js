// 스카이스캐너 페이지에서 가격을 찾아 최종 예상가 배지와 판매처 비교표를 붙인다.
let rules = null;
let opts = { ...FILTER_DEFAULTS };
const isExtension = !!globalThis.chrome?.runtime?.id;
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
    Object.assign(badge.dataset, { seller: est.seller, price: est.shown, total: est.total, verified: est.verified });
    ctx.dataset.cfRow = JSON.stringify({ seller: est.seller, price }); // 클릭하면 팝업 신고 양식에 미리 채움
  } else {
    badge.textContent = est.min === est.max ? won(est.min) : `${won(est.min)} ~ ${won(est.max)}`;
    badge.title = `결제할 금액은 이 정도예요${totalLabel()} · 판매처마다 수수료가 달라서 범위로 알려 드려요 · 조건: ${conditionText(est.airline)}`;
  }
  el.after(badge);
}

const totalLabel = () => (opts.display === 'total' ? ` (${opts.passengers}명 총액)` : '');
function conditionText(airline) {
  const bag = opts.bag_out > 0 || opts.bag_back > 0;
  const on = [bag && `수하물 가는 편 ${opts.bag_out || 0}kg·오는 편 ${opts.bag_back || 0}kg`, opts.seat && '좌석', opts.card && '카드 수수료', opts.discount && '할인'].filter(Boolean);
  return `${on.join(', ') || '추가 옵션 없음'}${bag || opts.seat ? ` (항공사: ${airline ?? '미확인'})` : ''}`;
}

function scan() {
  const els = findPriceElements(document.body).filter((el) => el.dataset.cfPrice !== el.textContent.trim());
  if (!els.length) return;
  // 가격 텍스트가 바뀐 요소는 이전 배지 제거. 표시를 전부 먼저 해야 contextOf가 다른 가격을 센다.
  for (const el of els) {
    if (el.dataset.cfPrice && el.nextElementSibling?.classList.contains('clearfare-badge')) el.nextElementSibling.remove();
    el.dataset.cfPrice = el.textContent.trim();
  }
  const region = regionOf(location.pathname);
  const page = isSellerPage() ? { sellerPage: true, airlineHint: document.body.textContent, region } : { region };
  els.forEach((el) => annotate(el, page));
}

// 판매처끼리 처음 본 금액 순위와 결제할 금액 순위를 비교하고, 결제할 금액 순 비교표를 띄운다
function rank() {
  const badges = [...document.querySelectorAll('.clearfare-badge[data-total]')];
  const shown = ranks(badges.map((b) => +b.dataset.price));
  const final = ranks(badges.map((b) => +b.dataset.total));
  badges.forEach((b, i) => {
    const mark = b.dataset.verified === 'true' ? '' : ' · 아직 확인 못 한 수수료라 예시 기준이에요. 실제로 결제했다면 팝업에서 알려 주세요!';
    b.textContent = won(b.dataset.total);
    b.title = `결제할 금액은 이 정도예요${totalLabel()} · 처음 본 금액 ${shown[i]}위 → 결제할 금액 ${final[i]}위${mark}`;
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
  line(['판매처', '처음 본 금액', '결제할 금액', 'ClearFare가 찾아낸 금액'], 'th');
  [...rows]
    .sort((a, b) => a.total - b.total)
    .forEach((r) => line([r.seller + (r.verified === 'true' ? '' : '*'), won(r.price), won(r.total), r.total > r.price ? '+' + won(r.total - r.price) : '숨은 돈 없어요']));
  const best = table.rows[1].cells[0].appendChild(document.createElement('span'));
  best.className = 'clearfare-best';
  best.textContent = '제일 싸요';
  const title = document.createElement('b');
  title.textContent = '진짜 결제 금액, 싼 순서로 줄 세웠어요' + totalLabel();
  const close = document.createElement('button');
  close.textContent = '×';
  close.onclick = () => panel.remove();
  const note = document.createElement('small');
  note.textContent = '* 수수료를 아직 확인 못 한 곳이에요. 예시 기준으로 계산했어요';
  panel.append(close, title, table, note);
  document.body.append(panel);
}

function update() {
  if (!rules) return;
  scan();
  rank();
}

function refresh() {
  document.querySelectorAll('.clearfare-badge, .clearfare-panel').forEach((n) => n.remove());
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

// 페이지 왼쪽 아래 예매 조건 필터. 바꾸면 sync 저장소 → onChanged → 다시 계산 (팝업과 값 공유)
function mountFilters() {
  let box = document.querySelector('.clearfare-filters');
  if (!box) {
    box = document.createElement('details');
    box.className = 'clearfare clearfare-filters';
    box.open = true;
    box.appendChild(document.createElement('summary')).textContent = 'ClearFare 예매 조건';
    document.body.append(box);
  }
  box.querySelector('form')?.remove();
  box.append(buildFilters(document, opts, saveOpts));
}
function saveOpts(next) {
  if (isExtension) return chrome.storage.sync.set(next);
  opts = next; // 확장프로그램 밖(demo.html, 테스트)에서는 바로 반영
  refresh();
}

if (isExtension) {
  Promise.all([chrome.storage.sync.get(FILTER_DEFAULTS), chrome.runtime.sendMessage({ type: 'rules' })]).then(([saved, res]) => {
    opts = saved;
    rules = res?.rules ?? null;
    if (!rules) console.warn('[ClearFare] 서버에서 규칙을 못 받음 — backend/server.py 실행 확인');
    mountFilters();
    refresh();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const k in changes) opts[k] = changes[k].newValue;
    mountFilters(); // 팝업에서 바꾼 값도 페이지 필터에 반영
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
  mountFilters();
  refresh();
}
