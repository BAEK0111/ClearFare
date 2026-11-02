const test = require('node:test');
const assert = require('node:assert');
const { parsePrice, finalPrice, estimate, ranks } = require('../src/core.js');
const rules = require('../../backend/rules.json');

const NONE = { baggage: false, card: false };

test('parsePrice: ₩ 표기와 원 표기', () => {
  assert.strictEqual(parsePrice('₩386,700'), 386700);
  assert.strictEqual(parsePrice('₩ 1,200,000'), 1200000);
  assert.strictEqual(parsePrice('386,700원'), 386700);
  assert.strictEqual(parsePrice('가격 없음'), null);
});

test('finalPrice: 수수료 → 수하물 → 카드 순서', () => {
  assert.strictEqual(finalPrice(100000, { pct: 0.03, fixed: 0 }), 103000);
  assert.strictEqual(finalPrice(100000, { pct: 0, fixed: 5000 }, 40000, 0.015), Math.round(145000 * 1.015));
});

test('estimate: 검색 결과 목록은 판매처 전체 기준 범위', () => {
  const est = estimate(100000, '제주항공 07:00 → 09:30 직항', rules, NONE);
  assert.deepStrictEqual([est.kind, est.min, est.max], ['range', 100000, 115000]); // 직접예약 ~ 고정 15,000원
  const withBag = estimate(100000, '제주항공 직항', rules, { baggage: true, card: false });
  assert.strictEqual(withBag.min, 100000 + rules.airlines['제주항공'].baggage);
  // 대형항공사는 수하물 포함
  assert.strictEqual(estimate(100000, '대한항공', rules, { baggage: true }).min, 100000);
  // 항공사를 모르면 기본 수하물 요금
  assert.strictEqual(estimate(100000, '', rules, { baggage: true }).min, 100000 + rules.default_baggage);
});

test('estimate: 판매처 화면은 판매처별 최종가, 항공사는 페이지에서 찾음', () => {
  const page = { sellerPage: true, airlineHint: '인천 → 나리타 티웨이항공 TW211' };
  const est = estimate(100000, 'Trip.com 선택', rules, { baggage: true, card: false }, page);
  assert.deepStrictEqual(est, { kind: 'seller', seller: 'Trip.com', verified: false, total: 103000 + rules.airlines['티웨이'].baggage });
  // 항공사 공식 사이트 행은 수수료 0, 검증됨
  const direct = estimate(100000, '티웨이항공 선택', rules, NONE, page);
  assert.deepStrictEqual([direct.seller, direct.total, direct.verified], ['티웨이', 100000, true]);
  // 모르는 판매처는 범위로
  assert.strictEqual(estimate(100000, '모르는여행사', rules, NONE, page).kind, 'range');
});

test('ranks: 표시가 순위와 최종가 순위가 뒤집힘', () => {
  assert.deepStrictEqual(ranks([300, 100, 200, 100]), [4, 1, 3, 1]);
  const trip = rules.sellers['Trip.com'];
  const gotogate = rules.sellers['Gotogate'];
  assert.deepStrictEqual(ranks([200000, 195000]), [2, 1]);
  assert.deepStrictEqual(ranks([finalPrice(200000, trip), finalPrice(195000, gotogate)]), [1, 2]);
});
