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
    return { rules: rules ?? null, online: false }; // 서버가 꺼져 있으면 마지막으로 받은 규칙 사용
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

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const job = msg.type === 'rules' ? getRules(msg.fresh) : msg.type === 'report' ? postReport(msg.report) : null;
  if (!job) return false;
  job.then(reply);
  return true; // 비동기 응답
});
