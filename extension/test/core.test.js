const test = require('node:test');
const assert = require('node:assert');
const { parsePrice, finalPrice, regionOf, baggageFee, estimate, ranks } = require('../src/core.js');
const rules = require('../../backend/rules.json');

const NONE = { bag_out: 0, bag_back: 0, card: false };
const JP = { region: 'japan' };
const bag = (name) => rules.airlines[name].bag;

test('parsePrice: ₩ 표기와 원 표기', () => {
  assert.strictEqual(parsePrice('₩386,700'), 386700);
  assert.strictEqual(parsePrice('₩ 1,200,000'), 1200000);
  assert.strictEqual(parsePrice('386,700원'), 386700);
  assert.strictEqual(parsePrice('가격 없음'), null);
});

test('finalPrice: 수수료·할인 → 추가 옵션 → 카드 순서', () => {
  assert.strictEqual(finalPrice(100000, { pct: 0.03, fixed: 0 }), 103000);
  assert.strictEqual(finalPrice(100000, { pct: 0, fixed: 5000 }, { extras: 40000, cardPct: 0.015 }), Math.round(145000 * 1.015));
  // 할인은 켰을 때만, 할인율이 없는 판매처는 그대로
  assert.strictEqual(finalPrice(100000, { pct: 0.03, fixed: 0, discount_pct: 0.05 }, { discount: true }), 98000);
  assert.strictEqual(finalPrice(100000, { pct: 0.03, fixed: 0, discount_pct: 0.05 }), 103000);
  assert.strictEqual(finalPrice(100000, { pct: 0, fixed: 0 }, { discount: true }), 100000);
});

test('estimate: 좌석 지정, 인원 총액 필터', () => {
  const jeju = rules.airlines['제주항공'];
  assert.strictEqual(estimate(100000, '제주항공', rules, { seat: true }).min, 100000 + jeju.seat);
  assert.strictEqual(estimate(100000, '제주항공', rules, { bag_out: 15, seat: true }, JP).min, 100000 + 40000 + jeju.seat);
  assert.strictEqual(estimate(100000, '', rules, { seat: true }).min, 100000 + rules.default_seat);
  // 총액은 인원수만큼, 1인 기준이면 인원수 무시
  assert.deepStrictEqual(estimate(100000, '', rules, { passengers: 3, display: 'total' }), { kind: 'range', min: 300000, max: 345000, airline: null });
  assert.strictEqual(estimate(100000, '', rules, { passengers: 3, display: 'person' }).min, 100000);
  const seller = estimate(100000, 'Trip.com', rules, { passengers: 2, display: 'total' }, { sellerPage: true });
  assert.deepStrictEqual([seller.shown, seller.total], [200000, 206000]);
});

test('regionOf: 스카이스캐너 URL 공항·도시 코드 → 지역', () => {
  assert.strictEqual(regionOf('/transport/flights/icn/nrt/261201/'), 'japan');
  assert.strictEqual(regionOf('/transport/flights/sela/tyoa/261201/261208/'), 'japan'); // 도시 코드
  assert.strictEqual(regionOf('/transport/flights/icn/bkk/261201/config/123'), 'sea');
  assert.strictEqual(regionOf('/transport/flights/tpe/icn/'), 'china'); // 출발지가 해외여도
  assert.strictEqual(regionOf('/transport/flights/icn/jfk/'), null);
  assert.strictEqual(regionOf('/'), null);
});

test('baggageFee: 무게제(LCC)', () => {
  // 제주항공: 최초 15kg + 5kg 단위, 일본 4만씩
  assert.strictEqual(baggageFee(0, bag('제주항공'), 'japan'), 0);
  assert.strictEqual(baggageFee(undefined, bag('제주항공'), 'japan'), 0);
  assert.strictEqual(baggageFee('', bag('제주항공'), 'japan'), 0);
  assert.strictEqual(baggageFee(10, bag('제주항공'), 'japan'), 40000);
  assert.strictEqual(baggageFee(15, bag('제주항공'), 'japan'), 40000);
  assert.strictEqual(baggageFee(17, bag('제주항공'), 'japan'), 80000);
  assert.strictEqual(baggageFee(25, bag('제주항공'), 'sea'), 180000);
  // 진에어: 15kg 무료, 초과 5kg마다
  assert.strictEqual(baggageFee(15, bag('진에어'), 'japan'), 0);
  assert.strictEqual(baggageFee(20, bag('진에어'), 'japan'), 45000);
  // 에어부산: 처음부터 5kg 단위
  assert.strictEqual(baggageFee(12, bag('에어부산'), 'japan'), 90000);
  // 지역을 모르면 가장 비싼 지역 요금
  assert.strictEqual(baggageFee(15, bag('제주항공'), null), 60000);
});

test('baggageFee: 개수제(대형항공사)', () => {
  // 대한항공 23kg 1개 포함, 2번째 7만, 3번째부터 10만 (일본)
  assert.strictEqual(baggageFee(23, bag('대한항공'), 'japan'), 0);
  assert.strictEqual(baggageFee(30, bag('대한항공'), 'japan'), 70000);
  assert.strictEqual(baggageFee(69, bag('대한항공'), 'japan'), 170000);
  assert.strictEqual(baggageFee(92, bag('대한항공'), 'japan'), 270000);
  assert.strictEqual(baggageFee(30, bag('대한항공'), 'sea'), 100000);
  // 아시아나 동남아 요금은 없음 → 가장 비싼 지역
  assert.strictEqual(baggageFee(30, bag('아시아나'), 'sea'), 80000);
});

test('estimate: 왕복 수하물, 예전 형식 규칙에서도 NaN 안 남', () => {
  assert.strictEqual(estimate(100000, '제주항공', rules, { bag_out: 15, bag_back: 20 }, JP).min, 100000 + 40000 + 80000);
  // 항공사 모르면 기본(LCC) 요금
  assert.strictEqual(estimate(100000, '', rules, { bag_out: 15 }, JP).min, 100000 + 40000);
  // bag·default_bag·default_seat 없는 예전 캐시 규칙
  const old = { card_pct: 0.015, sellers: {}, airlines: { 제주항공: { baggage: 40000, seat: 15000 } } };
  const est = estimate(100000, '제주항공', old, { bag_out: 15, seat: true, card: true }, JP);
  assert.ok(Number.isFinite(est.min) && Number.isFinite(est.max));
  assert.strictEqual(estimate(100000, '', { sellers: {}, airlines: {} }, { bag_out: 15, seat: true, card: true }).min, 160000);
});

test('estimate: 검색 결과 목록은 판매처 전체 기준 범위', () => {
  const est = estimate(100000, '제주항공 07:00 → 09:30 직항', rules, NONE);
  assert.deepStrictEqual([est.kind, est.min, est.max], ['range', 100000, 115000]); // 직접예약 ~ 고정 15,000원
  const withBag = estimate(100000, '제주항공 직항', rules, { bag_out: 15, card: false }, JP);
  assert.strictEqual(withBag.min, 100000 + 40000);
  // 대형항공사는 1개 포함
  assert.strictEqual(estimate(100000, '대한항공', rules, { bag_out: 20 }, JP).min, 100000);
});

test('estimate: 판매처 화면은 판매처별 최종가, 항공사는 페이지에서 찾음', () => {
  const page = { sellerPage: true, airlineHint: '인천 → 나리타 티웨이항공 TW211', region: 'japan' };
  const est = estimate(100000, 'Trip.com 선택', rules, { bag_out: 15, card: false }, page);
  assert.deepStrictEqual(est, { kind: 'seller', seller: 'Trip.com', verified: false, shown: 100000, total: 103000 + 40000 });
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
