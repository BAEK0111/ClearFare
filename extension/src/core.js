// 가격 파싱·최종가 계산·가격 요소 탐색. content.js와 테스트(node)가 같이 쓴다.
const PRICE_ONLY = /^(?:₩\s*[\d,]+|[\d,]+\s*원)$/;
const DIRECT = { pct: 0, fixed: 0, verified: true }; // 항공사 공식 사이트 직접 예약

function parsePrice(text) {
  const m = /₩\s*([\d,]+)|([\d,]+)\s*원/.exec(text);
  const n = m ? Number((m[1] ?? m[2]).replace(/,/g, '')) : 0;
  return n > 0 ? n : null;
}

// text 안에 들어 있는 첫 번째 이름 → [이름, 값]
function findName(text, map) {
  const lower = text.toLowerCase();
  const name = Object.keys(map).find((n) => lower.includes(n.toLowerCase()));
  return name ? [name, map[name]] : null;
}

function finalPrice(price, seller, baggageFee = 0, cardPct = 0) {
  return Math.round((price * (1 + seller.pct) + seller.fixed + baggageFee) * (1 + cardPct));
}

// ctx: 가격 주변 텍스트, opts: 사용자 입력 {baggage, card}
// page.sellerPage: 판매처 선택 화면인지, page.airlineHint: 주변에 항공사가 없을 때 찾아볼 텍스트(페이지 전체)
function estimate(price, ctx, rules, opts, page = {}) {
  const ctxAirline = findName(ctx, rules.airlines);
  const airline = ctxAirline ?? (page.airlineHint ? findName(page.airlineHint, rules.airlines) : null);
  const bag = opts.baggage ? (airline ? airline[1].baggage : rules.default_baggage) : 0;
  const card = opts.card ? rules.card_pct : 0;
  const seller = findName(ctx, rules.sellers) ?? (page.sellerPage && ctxAirline ? [ctxAirline[0], DIRECT] : null);
  if (seller) {
    return { kind: 'seller', seller: seller[0], verified: !!seller[1].verified, total: finalPrice(price, seller[1], bag, card) };
  }
  const totals = [DIRECT, ...Object.values(rules.sellers)].map((s) => finalPrice(price, s, bag, card));
  return { kind: 'range', min: Math.min(...totals), max: Math.max(...totals), airline: airline?.[0] ?? null };
}

// 각 값의 순위 (1부터, 동점은 같은 순위). 판매처 몇 개뿐이라 O(n²)로 충분.
function ranks(values) {
  return values.map((v) => values.filter((x) => x < v).length + 1);
}

// 텍스트 전체가 가격인 가장 바깥 요소들. "₩" 와 숫자가 다른 <span>으로 쪼개져 있어도 부모를 잡는다.
// 클래스명 대신 텍스트로 찾기 때문에 사이트가 클래스명을 바꿔도 덜 깨진다.
function findPriceElements(root) {
  const walker = root.ownerDocument.createTreeWalker(root, 4); // NodeFilter.SHOW_TEXT
  const found = new Set();
  while (walker.nextNode()) {
    if (!/\d/.test(walker.currentNode.data)) continue;
    // "200,000"만 든 안쪽 span은 가격이 아니어도, 짧은 텍스트인 동안은 계속 올라가며 가장 바깥 가격 요소를 찾는다
    let top = null;
    for (let el = walker.currentNode.parentElement; el && el.textContent.length <= 30; el = el.parentElement) {
      if (PRICE_ONLY.test(el.textContent.trim())) top = el;
    }
    if (top && !top.closest('.clearfare')) found.add(top);
  }
  return [...found];
}

// 가격 하나만 포함하는 가장 큰 조상 = 그 가격의 카드/행. 다른 가격 요소는 미리 data-cf-price로 표시돼 있어야 한다.
// ponytail: 카드 안에 가격이 2개(1인/총액)면 카드 전체를 못 잡음, 실제 DOM 보고 조정
function contextOf(el, maxUp = 8) {
  let ctx = el;
  for (let p = el.parentElement, i = 0; p && i < maxUp; p = p.parentElement, i++) {
    if (p.querySelectorAll('[data-cf-price]').length > 1) break;
    ctx = p;
  }
  return ctx;
}

// 로고 이미지의 alt에 항공사·판매처 이름이 들어 있는 경우가 많아 같이 읽는다
function textOf(el) {
  return el.textContent + ' ' + [...el.querySelectorAll('img[alt]')].map((i) => i.alt).join(' ');
}

if (typeof module !== 'undefined') module.exports = { parsePrice, findName, finalPrice, estimate, ranks, findPriceElements, contextOf, textOf };
