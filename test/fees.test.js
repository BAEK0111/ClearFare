const test = require('node:test');
const assert = require('node:assert');
const { SELLERS, BAGGAGE, parsePrice, finalPrice, priceRange, findSeller, ranks } = require('../src/fees.js');

test('parsePrice', () => {
  assert.strictEqual(parsePrice('₩386,700'), 386700);
  assert.strictEqual(parsePrice('최저 ₩ 1,200,000 부터'), 1200000);
  assert.strictEqual(parsePrice('가격 없음'), null);
});

test('finalPrice adds seller fee, baggage, card fee', () => {
  assert.strictEqual(finalPrice(100000), 100000);
  assert.strictEqual(finalPrice(100000, SELLERS['판매처 A']), 104000);
  assert.strictEqual(finalPrice(100000, SELLERS['판매처 B'], { baggage: true }), 100000 + 12000 + BAGGAGE);
  assert.strictEqual(finalPrice(100000, undefined, { card: true }), 101500);
});

test('priceRange follows user options', () => {
  assert.deepStrictEqual(priceRange(100000), [100000, 112000]);
  const [min, max] = priceRange(100000, { baggage: true });
  assert.strictEqual(min, 100000 + BAGGAGE);
  assert.strictEqual(max, 112000 + BAGGAGE);
});

test('findSeller', () => {
  assert.strictEqual(findSeller('판매처 B 에서 예약 ₩300,000'), SELLERS['판매처 B']);
  assert.strictEqual(findSeller('모르는 곳'), null);
});

test('ranks: display order vs final order can flip', () => {
  assert.deepStrictEqual(ranks([300, 100, 200, 100]), [4, 1, 3, 1]);
  // 표시가는 B가 싸지만 고정 수수료 때문에 최종가는 A가 쌈
  const display = [100000, 99000];
  const final = [finalPrice(100000, SELLERS['판매처 A']), finalPrice(99000, SELLERS['판매처 B'])];
  assert.deepStrictEqual(ranks(display), [2, 1]);
  assert.deepStrictEqual(ranks(final), [1, 2]);
});
