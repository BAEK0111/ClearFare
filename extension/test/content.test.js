// 실제 스카이스캐너와 비슷한 구조의 HTML에 content.js를 돌려서 배지·비교표를 확인
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const src = (f) => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');
const rules = require('../../backend/rules.json');

function run(html, url, opts = {}) {
  const dom = new JSDOM(`<body>${html}</body>`, { url, runScripts: 'outside-only' });
  Object.assign(dom.window, { CLEARFARE_RULES: rules, CLEARFARE_OPTS: opts });
  dom.window.eval(src('core.js') + src('filters.js') + src('content.js'));
  windows.push(dom.window);
  return dom.window;
}
const badges = (w) => [...w.document.querySelectorAll('.clearfare-badge')].map((b) => b.textContent);
const titles = (w) => [...w.document.querySelectorAll('.clearfare-badge')].map((b) => b.title);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const windows = [];
test.after(() => windows.forEach((w) => w.close())); // 안 닫으면 MutationObserver 때문에 프로세스가 안 끝남

test('검색 결과: ₩와 숫자가 쪼개진 가격도 찾고, 카드별로 항공사 수하물 반영', () => {
  const card = (airline, price) =>
    `<div class="card"><div><img alt="${airline}"><span>07:00 - 09:30</span></div><div><div><span>₩</span><span>${price}</span></div><button>선택</button></div></div>`;
  const w = run(card('제주항공', '200,000') + card('대한항공', '300,000'), 'https://www.skyscanner.co.kr/transport/flights/icn/nrt/', { bag_out: 15 });
  assert.deepStrictEqual(badges(w), ['₩240,000 ~ ₩260,000', '₩300,000 ~ ₩320,000']);
});

test('판매처 화면: 순위 역전 표시와 최종가 순 비교표', async () => {
  const row = (seller, price) => `<div class="row"><span>${seller}</span><div><span>₩${price}</span></div><a>선택</a></div>`;
  const html = `<h2>인천 → 나리타 · 진에어</h2>` + row('Gotogate', '195,000') + row('Trip.com', '200,000') + row('진에어', '210,000');
  const w = run(html, 'https://www.skyscanner.co.kr/transport/flights/icn/nrt/261201/config/123');
  // 박스엔 숫자만, 순위·미검증은 툴팁
  assert.deepStrictEqual(badges(w), ['₩215,000', '₩200,000', '₩210,000']);
  assert.deepStrictEqual(titles(w).map((t) => t.match(/처음 본 금액 \d위 → 결제할 금액 \d위/)[0]), ['처음 본 금액 1위 → 결제할 금액 3위', '처음 본 금액 2위 → 결제할 금액 1위', '처음 본 금액 3위 → 결제할 금액 2위']);
  assert.deepStrictEqual(titles(w).map((t) => t.includes('아직 확인 못 한')), [true, true, false]);
  assert.ok(w.document.querySelectorAll('.clearfare-badge')[0].classList.contains('clearfare-worse'));
  const cells = [...w.document.querySelectorAll('.clearfare-panel td:first-child')].map((td) => td.firstChild.textContent);
  assert.deepStrictEqual(cells, ['Trip.com*', '진에어', 'Gotogate*']);
  assert.strictEqual(w.document.querySelector('.clearfare-panel .clearfare-best').closest('td').firstChild.textContent, 'Trip.com*');
  assert.deepStrictEqual([...w.document.querySelectorAll('.clearfare-panel .clearfare-best')].map((b) => [b.closest('td').firstChild.textContent, b.textContent]), [['Trip.com*', '제일 싸요'], ['Trip.com*', '고객만족 1위 🥇']]);

  // 나중에 추가된 판매처도 감지 (SPA)
  w.document.body.insertAdjacentHTML('beforeend', row('마이리얼트립', '190,000'));
  await wait(400);
  assert.strictEqual(badges(w).length, 4);
  assert.strictEqual(badges(w)[3], '₩200,000');
  assert.match(titles(w)[3], /처음 본 금액 1위 → 결제할 금액 1위/);
});

test('페이지 필터: 조건을 바꾸면 배지가 다시 계산됨', () => {
  const w = run('<div><img alt="제주항공"><div><span>₩200,000</span></div></div>', 'https://www.skyscanner.co.kr/transport/flights/icn/nrt/');
  assert.deepStrictEqual(badges(w), ['₩200,000 ~ ₩220,000']);
  const form = w.document.querySelector('.clearfare-filters form');
  form.elements.passengers.value = '2';
  form.elements.bag_out.value = '15';
  form.dispatchEvent(new w.Event('change'));
  // (200,000 + 수하물 40,000) × 2명 ~ (+ 고정 20,000) × 2명
  assert.deepStrictEqual(badges(w), ['₩480,000 ~ ₩520,000']);
  assert.match(titles(w)[0], /2명 총액/);
  assert.strictEqual(w.document.querySelectorAll('.clearfare-filters').length, 1);
});

test('검색 인원을 필터에 미리 채움', () => {
  const html = `<div class="SearchDetails_search__travellerContainer__NDMxN"><span class="SearchDetails_traveller__Yzg1M">여행자 2명, 일반석</span></div><div><span>₩100,000</span></div>`;
  const w = run(html, 'https://www.skyscanner.co.kr/transport/flights/icn/nrt/', {});
  assert.strictEqual(w.document.querySelector('.clearfare-filters select[name=passengers]').value, '2');
  assert.match(titles(w)[0], /2명 총액/);
});

test('지금 판매처 화면(/itinerary/): 판매처 행만 계산하고 "총" 가격은 건너뜀', () => {
  const row = (seller, price) => `<div class="row"><span>${seller}</span><div><span>₩${price}</span></div><a>선택</a></div>`;
  const html = `<h2>서울 → 시드니 · 티웨이항공</h2>` + row('인터파크', '700,000') + row('티웨이항공', '710,000') + `<div><span>총</span> <span>₩1,420,000</span></div>`;
  const w = run(html, 'https://www.skyscanner.co.kr/transport/flights/sela/syda/261202/261210/itinerary/H4sI?adultsv2=1&childrenv2=3');
  assert.deepStrictEqual(badges(w), ['₩1,420,000', '₩1,420,000']); // 2명 총액. 인터파크 발권수수료 1만, 항공사 직접 0
  assert.strictEqual(w.document.querySelectorAll('.clearfare-panel tr').length, 3);
});

test('여러 명 검색: 카드마다 1인 가격 옆 "총 ₩…"이 있어도 카드 가격에 배지, 총액엔 안 붙임', () => {
  const card = (airline, price, total) =>
    `<div class="card"><div><img alt="${airline}"><span>07:00 - 09:30</span></div><div><div><span>₩${price}</span><span>총 ₩${total}</span></div><button>선택</button></div></div>`;
  const tabs = `<div><button><span>추천순</span><span>₩200,000</span></button><button><span>최저가</span><span>₩200,000</span></button></div>`;
  const w = run(tabs + card('제주항공', '200,000', '400,000') + card('대한항공', '300,000', '600,000'), 'https://www.skyscanner.co.kr/transport/flights/icn/nrt/?adultsv2=2', { bag_out: 15 });
  const cardBadges = [...w.document.querySelectorAll('.card .clearfare-badge')];
  assert.deepStrictEqual(cardBadges.map((b) => b.previousElementSibling.textContent), ['₩200,000', '₩300,000']); // 총액 옆엔 없음
  // 2명 총액, 항공사도 카드에서 찾음: 제주항공 수하물 4만, 대한항공 1개 포함
  assert.deepStrictEqual(cardBadges.map((b) => b.textContent), ['₩480,000 ~ ₩520,000', '₩600,000 ~ ₩640,000']);
});

test('여러 명 검색: 카드에 총액만 있으면 인원수로 나눠 계산', () => {
  const card = (airline, total) => `<div class="card"><div><img alt="${airline}"></div><div><div><span>총</span> <span>₩${total}</span></div><button>선택</button></div></div>`;
  const w = run(card('제주항공', '400,000') + card('대한항공', '600,000'), 'https://www.skyscanner.co.kr/transport/flights/icn/nrt/?adultsv2=2');
  assert.deepStrictEqual(badges(w), ['₩400,000 ~ ₩440,000', '₩600,000 ~ ₩640,000']);
});
