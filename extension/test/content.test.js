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
  dom.window.eval(src('core.js') + src('content.js'));
  windows.push(dom.window);
  return dom.window;
}
const badges = (w) => [...w.document.querySelectorAll('.clearfare-badge')].map((b) => b.textContent);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const windows = [];
test.after(() => windows.forEach((w) => w.close())); // 안 닫으면 MutationObserver 때문에 프로세스가 안 끝남

test('검색 결과: ₩와 숫자가 쪼개진 가격도 찾고, 카드별로 항공사 수하물 반영', () => {
  const card = (airline, price) =>
    `<div class="card"><div><img alt="${airline}"><span>07:00 - 09:30</span></div><div><div><span>₩</span><span>${price}</span></div><button>선택</button></div></div>`;
  const w = run(card('제주항공', '200,000') + card('대한항공', '300,000'), 'https://www.skyscanner.co.kr/transport/flights/icn/nrt/', { baggage: true });
  assert.deepStrictEqual(badges(w), ['최종 ₩240,000 ~ ₩255,000', '최종 ₩300,000 ~ ₩315,000']);
});

test('판매처 화면: 순위 역전 표시와 최종가 순 비교표', async () => {
  const row = (seller, price) => `<div class="row"><span>${seller}</span><div><span>₩${price}</span></div><a>선택</a></div>`;
  const html = `<h2>인천 → 나리타 · 진에어</h2>` + row('Gotogate', '195,000') + row('Trip.com', '200,000') + row('진에어', '210,000');
  const w = run(html, 'https://www.skyscanner.co.kr/transport/flights/icn/nrt/261201/config/123');
  assert.deepStrictEqual(badges(w), [
    '최종 ₩210,000 (미검증) · 표시가 1위 → 최종 2위',
    '최종 ₩206,000 (미검증) · 표시가 2위 → 최종 1위',
    '최종 ₩210,000 · 표시가 3위 → 최종 2위',
  ]);
  assert.ok(w.document.querySelectorAll('.clearfare-badge')[0].classList.contains('clearfare-worse'));
  const cells = [...w.document.querySelectorAll('.clearfare-panel td:first-child')].map((td) => td.textContent);
  assert.deepStrictEqual(cells, ['Trip.com*', 'Gotogate*', '진에어']);

  // 나중에 추가된 판매처도 감지 (SPA)
  w.document.body.insertAdjacentHTML('beforeend', row('마이리얼트립', '190,000'));
  await wait(400);
  assert.strictEqual(badges(w).length, 4);
  assert.match(badges(w)[3], /최종 ₩195,000 \(미검증\) · 표시가 1위 → 최종 1위/);
});
