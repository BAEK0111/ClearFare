// 스카이스캐너 페이지에서 가격을 찾아 최종 예상가 배지와 판매처 비교표를 붙인다.
let rules = null;
let opts = { ...FILTER_DEFAULTS };
const isExtension = !!globalThis.chrome?.runtime?.id;
const won = (n) => '₩' + Number(n).toLocaleString('ko-KR');
// 판매처 선택 화면 URL에는 /config/(예전) 또는 /itinerary/(지금)가 들어간다
const isSellerPage = () => /\/(config|itinerary)\//.test(location.pathname);
// 스카이스캐너 가격은 1인 기준인데, 여러 명이면 "총 ₩…"(인원 총액)도 같이 나온다.
// "총" 라벨이 이 가격 것인지: 가격 위 2단계 안에서, 다른 가격 없이 "총/합계/total"만 같이 있을 때.
// (1인 가격과 "총 ₩…"이 한 부모에 있으면 그 "총"은 옆 가격 것이라 1인 가격은 총액이 아님)
// ponytail: 라벨 글자로만 판단, 실제 DOM에서 놓치면 조정
const TOTAL_LABEL = /총|합계|total/i;
const OTHER_PRICE = /₩\s*\d|\d\s*원/;
function isTotalPrice(el) {
  for (let p = el.parentElement, i = 0; p && i < 2; p = p.parentElement, i++) {
    const rest = p.textContent.replace(el.textContent, '');
    if (rest.length > 40 || OTHER_PRICE.test(rest)) return false;
    if (TOTAL_LABEL.test(rest)) return true;
  }
  return false;
}
// 총액 가격 근처(3단계 안)에 1인 가격이 있으면 총액은 건너뛴다. 그 1인 가격에 배지를 붙이니까
function hasPersonPriceNearby(el) {
  for (let p = el.parentElement, i = 0; p && i < 3; p = p.parentElement, i++) {
    const others = [...p.querySelectorAll('[data-cf-price]')].filter((o) => o !== el);
    if (others.length) return others.some((o) => !isTotalPrice(o));
  }
  return false;
}

// total: 총액으로 표시된 가격이면 인원수로 나눠 1인 가격으로 계산 (총액만 보여 주는 카드)
function annotate(el, page, total) {
  const price = Math.round(parsePrice(el.dataset.cfPrice) / (total ? opts.passengers || 1 : 1));
  const ctx = contextOf(el);
  const est = estimate(price, textOf(ctx), rules, opts, page);
  const badge = document.createElement('span');
  badge.className = 'clearfare clearfare-badge';
  if (est.kind === 'seller') {
    Object.assign(badge.dataset, { seller: est.seller, price: est.shown, total: est.total, verified: est.verified });
    ctx.dataset.cfRow = JSON.stringify({ seller: est.seller, price: est.shown }); // 클릭하면 팝업 신고 양식에 미리 채움. 실결제도 총액이라 인원 총액으로
  } else {
    badge.textContent = est.min === est.max ? won(est.min) : `${won(est.min)} ~ ${won(est.max)}`;
    badge.title = `결제할 금액은 이 정도예요${totalLabel()} · 판매처마다 수수료가 달라서 범위로 알려 드려요 · 조건: ${conditionText(est.airline)}`;
  }
  el.after(badge);
}

const totalLabel = () => ` (${opts.passengers || 1}명 총액)`;
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
    delete el.dataset.cfSkip;
  }
  const totals = els.map(isTotalPrice);
  els.forEach((el, i) => totals[i] && hasPersonPriceNearby(el) && (el.dataset.cfSkip = ''));
  const region = regionOf(location.pathname);
  const premium = /business|first/i.test(new URLSearchParams(location.search).get('cabinclass') ?? '');
  const page = isSellerPage() ? { sellerPage: true, airlineHint: document.body.textContent, region, premium } : { region, premium };
  els.forEach((el, i) => el.dataset.cfSkip === undefined && annotate(el, page, totals[i]));
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
  const medal = table.rows[1].cells[0].appendChild(document.createElement('span'));
  medal.className = 'clearfare-best';
  medal.textContent = '고객만족 1위 🥇';
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

// 스카이스캐너 검색 인원을 필터에 미리 채운다. 검색 인원이 바뀔 때만 덮어써서, 사용자가 필터에서 직접 바꾼 값은 유지
let seenPassengers = null;
function syncPassengers() {
  const n = passengersOf(location.search, document.querySelector('[class*="SearchDetails_traveller"]')?.textContent);
  if (!n || n === seenPassengers) return false;
  seenPassengers = n;
  if (n === opts.passengers) return false;
  opts.passengers = n;
  if (isExtension) chrome.storage.sync.set({ passengers: n }); // 팝업에도 반영
  mountFilters();
  return true;
}

function update() {
  if (!rules) return;
  if (syncPassengers()) return refresh();
  scan();
  rank();
}

function refresh() {
  document.querySelectorAll('.clearfare-badge, .clearfare-panel').forEach((n) => n.remove());
  document.querySelectorAll('[data-cf-price]').forEach((el) => {
    delete el.dataset.cfPrice;
    delete el.dataset.cfSkip;
  });
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
