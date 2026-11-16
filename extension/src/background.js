// 서버 통신은 여기서만 한다 (콘텐츠 스크립트는 페이지 출처라 localhost 요청이 막힘)
const API = 'http://127.0.0.1:8000';
const RULES_TTL = 10 * 60 * 1000;

async function getRules(fresh) {
  const { rules, rulesAt = 0 } = await chrome.storage.local.get(['rules', 'rulesAt']);
  if (rules && !fresh && Date.now() - rulesAt < RULES_TTL) return { rules, online: true };
  try {
    const res = await fetch(API + '/api/rules');
    if (!res.ok) throw new Error(res.status);
    const latest = await res.json();
    await chrome.storage.local.set({ rules: latest, rulesAt: Date.now() });
    return { rules: latest, online: true };
  } catch {
    // 서버가 꺼져 있으면 마지막으로 받은 규칙, 그것도 없으면 확장프로그램에 들어 있는 기본 규칙 (서버 없이도 바로 쓰게)
    return { rules: rules ?? (await (await fetch(chrome.runtime.getURL('rules.json'))).json()), online: false };
  }
}

async function postReport(report) {
  try {
    const res = await fetch(API + '/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });
    const body = await res.json();
    if (!res.ok) return { ok: false, error: body.error };
    await chrome.storage.local.remove('rulesAt'); // 보정된 규칙을 다음에 바로 받도록
    return { ok: true };
  } catch {
    return { ok: false, error: '서버 연결 안 됨' };
  }
}

// 업데이트하면 캐시 규칙을 버린다 — 서버가 켜져 있으면 새로 받고, 꺼져 있으면 새 버전에 들어 있는 기본 규칙을 쓰게
chrome.runtime.onInstalled.addListener(() => chrome.storage.local.remove(['rules', 'rulesAt']));

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const job = msg.type === 'rules' ? getRules(msg.fresh) : msg.type === 'report' ? postReport(msg.report) : null;
  if (!job) return false;
  job.then(reply);
  return true; // 비동기 응답
});
