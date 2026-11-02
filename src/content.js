// 페이지에서 "₩123,456" 형태의 가격 텍스트를 찾아 옆에 최종 예상가 배지를 붙인다.
// 클래스명 대신 텍스트로 찾기 때문에 사이트 구조가 바뀌어도 덜 깨진다.
const PRICE_RE = /^\s*₩\s*[\d,]+\s*$/;
const won = (n) => '₩' + n.toLocaleString('ko-KR');
let opts = { baggage: false, card: false };

function annotate(el) {
  const price = parsePrice(el.textContent);
  if (!price) return;
  el.dataset.clearfare = '1';
  // ponytail: 판매처 이름은 가격의 조상 3단계 안에서만 찾음, 실제 DOM 보고 조정
  const row = el.parentElement?.parentElement?.parentElement ?? el;
  const seller = findSeller(row.textContent);
  const badge = document.createElement('span');
  badge.className = 'clearfare-badge';
  if (seller) {
    badge.dataset.price = price;
    badge.dataset.total = finalPrice(price, seller, opts);
  } else {
    const [min, max] = priceRange(price, opts);
    badge.textContent = min === max ? `최종 ${won(min)}` : `최종 ${won(min)} ~ ${won(max)}`;
  }
  el.after(badge);
}

// 판매처 배지들끼리 표시가 순위와 최종가 순위를 비교해 표시
function rank() {
  const badges = [...document.querySelectorAll('.clearfare-badge[data-total]')];
  const shown = ranks(badges.map((b) => +b.dataset.price));
  const final = ranks(badges.map((b) => +b.dataset.total));
  badges.forEach((b, i) => {
    b.textContent = `최종 ${won(+b.dataset.total)} · 표시가 ${shown[i]}위 → 최종 ${final[i]}위`;
    b.classList.toggle('clearfare-worse', final[i] > shown[i]);
  });
}

function scan(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (el) =>
      el.childElementCount === 0 && !el.dataset.clearfare && !el.classList.contains('clearfare-badge') && PRICE_RE.test(el.textContent)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP,
  });
  const found = [];
  while (walker.nextNode()) found.push(walker.currentNode);
  found.forEach(annotate);
  return found.length;
}

// 설정이 바뀌면 배지를 전부 지우고 다시 계산
function refresh() {
  document.querySelectorAll('.clearfare-badge').forEach((b) => b.remove());
  document.querySelectorAll('[data-clearfare]').forEach((el) => delete el.dataset.clearfare);
  scan(document.body);
  rank();
}

// 결과가 스크롤/필터로 계속 바뀌는 SPA라 변경을 감시.
// 새 가격을 찾았을 때만 rank() — rank()의 텍스트 변경이 다시 이 콜백을 부르므로 무조건 호출하면 무한 루프.
new MutationObserver((muts) => {
  let found = 0;
  muts.forEach((m) => m.addedNodes.forEach((n) => n.nodeType === 1 && (found += scan(n))));
  if (found) rank();
}).observe(document.body, { childList: true, subtree: true });

const store = globalThis.chrome?.storage?.sync;
if (store) {
  store.get(opts, (saved) => {
    opts = saved;
    refresh();
  });
  chrome.storage.onChanged.addListener((changes) => {
    for (const k in changes) opts[k] = changes[k].newValue;
    refresh();
  });
} else {
  refresh(); // test/demo.html처럼 확장프로그램 밖에서 열었을 때
}
