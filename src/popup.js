// 체크박스 값을 chrome.storage.sync에 저장 → content.js가 onChanged로 받아 다시 계산
const defaults = { baggage: false, card: false };
chrome.storage.sync.get(defaults, (saved) => {
  for (const key in defaults) {
    const box = document.getElementById(key);
    box.checked = saved[key];
    box.onchange = () => chrome.storage.sync.set({ [key]: box.checked });
  }
});
