const $ = (id) => document.getElementById(id);
// 예매 조건 → chrome.storage.sync → content.js가 onChanged로 받아 다시 계산 (페이지 필터와 같은 값)
chrome.storage.sync.get(FILTER_DEFAULTS).then((saved) => {
  $('filters').append(buildFilters(document, saved, (next) => chrome.storage.sync.set(next)));
  $('r-baggage').checked = saved.bag_out > 0 || saved.bag_back > 0 || saved.seat;
  $('r-card').checked = saved.card;
});

chrome.runtime.sendMessage({ type: 'rules', fresh: true }).then(({ rules, online }) => {
  if (!online) return ($('status').textContent = '기본 요금표로 계산 중 · 실결제 신고는 서버가 켜져 있을 때만 돼요');
  const sellers = Object.values(rules.sellers);
  $('status').textContent = `서버 연결됨 · 판매처 ${sellers.length}곳 (검증 ${sellers.filter((s) => s.verified).length}곳)`;
});

// 스카이스캐너에서 마지막으로 누른 판매처 행으로 미리 채움
chrome.storage.local.get('lastPick').then(({ lastPick }) => {
  if (!lastPick) return;
  $('seller').value = lastPick.seller;
  $('displayed').value = lastPick.price;
});

$('report').onsubmit = async (e) => {
  e.preventDefault();
  const report = {
    seller: $('seller').value.trim(),
    displayed: Number($('displayed').value),
    final: Number($('final').value),
    baggage: $('r-baggage').checked,
    card: $('r-card').checked,
  };
  const res = await chrome.runtime.sendMessage({ type: 'report', report });
  $('msg').textContent = res.ok ? '✓ 신고 완료! 3건 이상 모이면 수수료가 실측값으로 바뀌어요' : `실패: ${res.error}`;
  if (res.ok) $('final').value = '';
};
