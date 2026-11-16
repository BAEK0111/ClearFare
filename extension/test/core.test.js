const test = require('node:test');
const assert = require('node:assert');
const { HIGH, parsePrice, finalPrice, regionOf, passengersOf, baggageFee, estimate, ranks } = require('../src/core.js');
const rules = require('../rules.json');

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
  // 항상 인원 총액
  assert.deepStrictEqual(estimate(100000, '', rules, { passengers: 3 }), { kind: 'range', min: 300000, max: 450000, airline: null });
  const seller = estimate(100000, 'Trip.com', rules, { passengers: 2 }, { sellerPage: true });
  assert.deepStrictEqual([seller.shown, seller.min, seller.max], [200000, 200000, 200000]);
});

test('passengersOf: URL 인원 우선, 없으면 화면 글자', () => {
  assert.strictEqual(passengersOf('?adultsv2=2&cabinclass=economy&childrenv2=', '여행자 5명'), 2);
  assert.strictEqual(passengersOf('?adultsv2=1&childrenv2=5|8'), 3);
  assert.strictEqual(passengersOf('', '여행자 2명, 일반석'), 2);
  assert.strictEqual(passengersOf('?adultsv2=8&childrenv2=3|5'), 9);
  assert.strictEqual(passengersOf('', undefined), null);
});

test('regionOf: 스카이스캐너 URL 공항·도시 코드 → 지역', () => {
  assert.strictEqual(regionOf('/transport/flights/icn/nrt/261201/'), 'japan');
  assert.strictEqual(regionOf('/transport/flights/sela/tyoa/261201/261208/'), 'japan'); // 도시 코드
  assert.strictEqual(regionOf('/transport/flights/icn/bkk/261201/config/123'), 'sea');
  assert.strictEqual(regionOf('/transport/flights/tpe/icn/'), 'china'); // 출발지가 해외여도
  assert.strictEqual(regionOf('/transport/flights/sela/syda/261202/261210/itinerary/abc'), 'oceania');
  assert.strictEqual(regionOf('/transport/flights/icn/jfk/'), 'americas');
  assert.strictEqual(regionOf('/transport/flights/icn/cdg/'), null);
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
  assert.strictEqual(baggageFee(30, bag('아시아나'), 'sea'), 99000);
  // 미주는 2개 포함이라 2번째 무료, 3번째부터 요금
  assert.strictEqual(baggageFee(46, bag('대한항공'), 'americas'), 0);
  assert.strictEqual(baggageFee(69, bag('대한항공'), 'americas'), 200000);
  assert.strictEqual(baggageFee(30, bag('대한항공'), 'oceania'), 130000);
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
  assert.deepStrictEqual([est.kind, est.min, est.max], ['range', 100000, 150000]); // 직접예약 ~ Gotogate 최대 50,000원
  const withBag = estimate(100000, '제주항공 직항', rules, { bag_out: 15, card: false }, JP);
  assert.strictEqual(withBag.min, 100000 + 40000);
  // 대형항공사는 1개 포함
  assert.strictEqual(estimate(100000, '대한항공', rules, { bag_out: 20 }, JP).min, 100000);
});

test('estimate: 판매처 화면은 판매처별 최종가, 항공사는 페이지에서 찾음', () => {
  const page = { sellerPage: true, airlineHint: '인천 → 나리타 티웨이항공 TW211', region: 'japan' };
  const est = estimate(100000, 'Trip.com 선택', rules, { bag_out: 15, card: false }, page);
  assert.deepStrictEqual(est, { kind: 'seller', seller: 'Trip.com', verified: false, shown: 100000, min: 140000, max: 140000 });
  // 항공사 공식 사이트 행은 수수료 0, 검증됨
  const direct = estimate(100000, '티웨이항공 선택', rules, NONE, page);
  assert.deepStrictEqual([direct.seller, direct.min, direct.max, direct.verified], ['티웨이', 100000, 100000, true]);
  // 검색 결과 목록은 카드에 판매처 이름이 있어도 범위
  assert.strictEqual(estimate(100000, '티웨이항공 Trip.com 외 3곳', rules, NONE, { region: 'japan' }).kind, 'range');
  // 모르는 판매처는 범위로
  assert.strictEqual(estimate(100000, '모르는여행사', rules, NONE, page).kind, 'range');
});

test('finalPrice: 판매처별 카드 수수료(card_pct)가 기본값보다 우선', () => {
  assert.strictEqual(finalPrice(100000, rules.sellers['인터파크'], { cardPct: 0.015 }), 110000); // 국내 여행사 카드 수수료 0
  assert.strictEqual(finalPrice(100000, rules.sellers['Gotogate'], { cardPct: 0.015 }), Math.round(120000 * 1.01)); // 최소: 수수료 2만, 카드 1%
  assert.strictEqual(finalPrice(100000, rules.sellers['Gotogate'], { cardPct: 0.015 }, HIGH), Math.round(150000 * 1.03)); // 최대: 5만, 3%
  assert.strictEqual(finalPrice(100000, rules.sellers['Gotogate'], { cardPct: 0 }), 120000); // 카드 결제 꺼짐
});

test('ranks: 표시가 순위와 최종가 순위가 뒤집힘', () => {
  assert.deepStrictEqual(ranks([300, 100, 200, 100]), [4, 1, 3, 1]);
  const trip = rules.sellers['Trip.com'];
  const gotogate = rules.sellers['Gotogate'];
  assert.deepStrictEqual(ranks([200000, 195000]), [2, 1]);
  assert.deepStrictEqual(ranks([finalPrice(200000, trip), finalPrice(195000, gotogate)]), [1, 2]);
});

test('estimate: 해외 항공사 영문 표기, 비즈니스 검색은 수하물·좌석 추가 없음', () => {
  // 젯스타: 20kg 6.5만 + 5kg 1.2만, 좌석 2.3만
  const est = estimate(1000000, 'Jetstar Airways', rules, { bag_out: 25, seat: true }, { region: 'oceania' });
  assert.deepStrictEqual([est.airline, est.min], ['젯스타', 1000000 + 65000 + 12000 + 23000]);
  assert.strictEqual(estimate(1000000, '대한항공', rules, { bag_out: 50, seat: true }, { region: 'oceania', premium: true }).min, 1000000);
});

test('estimate: 판매처 화면도 수수료 폭만큼 범위, 폭이 없으면 금액 하나', () => {
  const page = { sellerPage: true, region: 'japan' };
  const go = estimate(100000, 'Gotogate', rules, { card: true }, page);
  assert.deepStrictEqual([go.min, go.max], [Math.round(120000 * 1.01), Math.round(150000 * 1.03)]);
  const park = estimate(100000, '인터파크', rules, { card: true }, page);
  assert.deepStrictEqual([park.min, park.max], [110000, 110000]);
});

test('estimate: 해외 항공사 직접 예약은 그 항공사 예약 수수료 범위', () => {
  const page = { sellerPage: true, region: 'oceania' };
  const jq = estimate(1000000, 'Jetstar', rules, {}, page);
  assert.deepStrictEqual([jq.seller, jq.min, jq.max, jq.verified], ['젯스타', 1008000, 1023000, false]);
  assert.strictEqual(estimate(1000000, 'Jetstar', rules, {}, { region: 'oceania' }).min, 1000000); // 목록 최소는 수수료 없는 판매처(Trip.com)
});
