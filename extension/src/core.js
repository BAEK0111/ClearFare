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

// 1인 기준. extras: 수하물·좌석 등 추가 옵션 요금, discount: 판매처 할인율(discount_pct) 적용 여부
function finalPrice(price, seller, { extras = 0, cardPct = 0, discount = false } = {}) {
  const pct = seller.pct - (discount ? seller.discount_pct ?? 0 : 0);
  return Math.round((price * (1 + pct) + seller.fixed + extras) * (1 + cardPct));
}

// 서버 규칙에 수하물 요금이 없을 때(예전 캐시 등) 쓰는 기본값: 일반적인 국내 LCC 사전 구매 요금
const DEFAULT_BAG = { type: 'kg', free_kg: 0, first_kg: 15, first: { japan: 40000, china: 50000, sea: 60000 }, step_kg: 5, step: { japan: 40000, china: 50000, sea: 60000 } };

// 스카이스캐너 URL의 공항·도시 코드 → 수하물 요금 지역. 목록에 없으면 null (가장 비싼 지역 요금으로 계산)
// ponytail: 자주 가는 공항만 넣음, 미주·유럽 등 장거리는 지역 추가 필요
const REGIONS = {
  japan: 'tyo nrt hnd osa kix itm ukb ngo fuk cts spk oka kij hij oit kmj kmi kgs okj tak myj sdj aoj aku fsz ibr toy',
  china: 'bjs pek pkx sha pvg can szx tao hgh xmn dlc tsn wuh cgo kmg ctu cku sya yty ytt wei hkg mfm tpe tsa khh rmq uln ubn',
  sea: 'bkk dmk hkt cnx sgn han dad cxr pqc dli mnl ceb crk sin kul bki pen dps cgk vte rep pnh',
};
function regionOf(pathname) {
  const m = /\/flights\/([a-z]+)\/([a-z]+)/i.exec(pathname);
  if (!m) return null;
  for (const code of [m[2], m[1]].map((c) => c.toLowerCase().slice(0, 3))) {
    const region = Object.keys(REGIONS).find((r) => REGIONS[r].split(' ').includes(code));
    if (region) return region;
  }
  return null;
}

// 지역별 요금 중 해당 지역 값, 없으면 가장 비싼 지역 값 (모를 땐 적게 잡지 않게)
function pick(byRegion, region) {
  if (byRegion[region] !== undefined) return byRegion[region];
  const first = (v) => (Array.isArray(v) ? v[0] : v);
  return Object.values(byRegion).reduce((a, b) => (first(b) > first(a) ? b : a));
}

// 짐 무게(kg) → 수하물 요금. 1인·한 구간(가는 편 또는 오는 편) 기준
// kg(무게제 LCC): 무료 무게 → 최초 구매 단위 → 이후 step_kg마다 추가. piece(개수제 대형항공사): 1개 한도로 개수 계산 → 포함 개수 뺀 만큼 추가 요금
// ponytail: 1개 무게 한도를 넘으면 1개 더 사는 걸로 계산, 초과중량 요금(23→32kg)은 요금표 확보되면 추가
function baggageFee(kg, bag, region) {
  kg = Number(kg);
  if (!(kg > 0)) return 0;
  if (bag.type === 'piece') {
    const extra = Math.max(0, Math.ceil(kg / bag.bag_kg) - bag.free_bags);
    const fees = pick(bag.extra, region); // [2번째, 3번째부터]
    let sum = 0;
    for (let i = 0; i < extra; i++) sum += fees[Math.min(i, fees.length - 1)];
    return sum;
  }
  let left = kg - (bag.free_kg ?? 0);
  if (left <= 0) return 0;
  let fee = 0;
  if (bag.first_kg) {
    fee += pick(bag.first, region);
    left -= bag.first_kg;
  }
  return fee + Math.max(0, Math.ceil(left / bag.step_kg)) * pick(bag.step, region);
}

// ctx: 가격 주변 텍스트, opts: 예매 조건 필터(filters.js)
// page.sellerPage: 판매처 선택 화면인지, page.airlineHint: 주변에 항공사가 없을 때 찾아볼 텍스트(페이지 전체), page.region: regionOf()
// ponytail: 수수료·옵션 요금을 모두 1인당으로 계산, 예약 건당 고정 수수료가 확인되면 분리
function estimate(price, ctx, rules, opts, page = {}) {
  const ctxAirline = findName(ctx, rules.airlines);
  const airline = ctxAirline ?? (page.airlineHint ? findName(page.airlineHint, rules.airlines) : null);
  const air = airline?.[1] ?? {};
  const bag = air.bag ?? rules.default_bag ?? DEFAULT_BAG;
  const calc = {
    extras: baggageFee(opts.bag_out, bag, page.region) + baggageFee(opts.bag_back, bag, page.region) + (opts.seat ? air.seat ?? rules.default_seat ?? 0 : 0),
    cardPct: opts.card ? rules.card_pct ?? 0 : 0,
    discount: !!opts.discount,
  };
  const n = opts.display === 'total' ? opts.passengers || 1 : 1;
  const seller = findName(ctx, rules.sellers) ?? (page.sellerPage && ctxAirline ? [ctxAirline[0], DIRECT] : null);
  if (seller) {
    return { kind: 'seller', seller: seller[0], verified: !!seller[1].verified, shown: price * n, total: finalPrice(price, seller[1], calc) * n };
  }
  const totals = [DIRECT, ...Object.values(rules.sellers)].map((s) => finalPrice(price, s, calc) * n);
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

if (typeof module !== 'undefined') module.exports = { parsePrice, findName, finalPrice, regionOf, baggageFee, estimate, ranks, findPriceElements, contextOf, textOf };
