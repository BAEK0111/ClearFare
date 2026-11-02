const $ = (id) => document.getElementById(id);
const defaults = { baggage: false, card: false };

// 내 조건 → chrome.storage.sync → content.js가 onChanged로 받아 다시 계산
chrome.storage.sync.get(defaults).then((saved) => {
  for (const key in defaults) {
    $(key).checked = $('r-' + key).checked = saved[key];
    $(key).onchange = () => chrome.storage.sync.set({ [key]: $(key).checked });
  }
});

chrome.runtime.sendMessage({ type: 'rules', fresh: true }).then(({ rules, online }) => {
  if (!online) return ($('status').textContent = '⚠ 서버 연결 안 됨 — backend/server.py 실행 필요');
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
