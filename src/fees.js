// 최종가 추정 규칙. 숫자는 모두 예시 데이터 — 실제 판매처 결제 페이지에서 확인해 채울 것.
const SELLERS = {
  // 판매처 이름(화면에 보이는 텍스트에 포함되는 문자열): { pct: 표시가 대비 수수료 비율, fixed: 고정 수수료(원) }
  '판매처 A': { pct: 0.04, fixed: 0 },
  '판매처 B': { pct: 0, fixed: 12000 },
  '판매처 C': { pct: 0.02, fixed: 5000 },
};
const DEFAULT_RULE = { pct: 0, fixed: 0 };
const CARD_PCT = 0.015;
// ponytail: 수하물 정액 하나, 항공사·운임·무게별 표로 바꿀 것
const BAGGAGE = 45000;

function parsePrice(text) {
  const m = /₩\s*([\d,]+)/.exec(text);
  return m ? Number(m[1].replace(/,/g, '')) : null;
}

// opts: 사용자 입력 { baggage: 위탁수하물 필요, card: 카드 결제 }
function finalPrice(price, rule = DEFAULT_RULE, { baggage = false, card = false } = {}) {
  let total = price * (1 + rule.pct) + rule.fixed + (baggage ? BAGGAGE : 0);
  if (card) total *= 1 + CARD_PCT;
  return Math.round(total);
}

// 판매처를 모를 때(검색 결과 목록): 알려진 판매처 중 가장 싼 경우 ~ 가장 비싼 경우
function priceRange(price, opts) {
  const totals = [DEFAULT_RULE, ...Object.values(SELLERS)].map((r) => finalPrice(price, r, opts));
  return [Math.min(...totals), Math.max(...totals)];
}

function findSeller(text) {
  const name = Object.keys(SELLERS).find((n) => text.includes(n));
  return name ? SELLERS[name] : null;
}

// 각 값의 순위 (1부터, 동점은 같은 순위). 판매처 몇 개뿐이라 O(n²)로 충분.
function ranks(values) {
  return values.map((v) => values.filter((x) => x < v).length + 1);
}

if (typeof module !== 'undefined') module.exports = { SELLERS, BAGGAGE, CARD_PCT, parsePrice, finalPrice, priceRange, findSeller, ranks };
