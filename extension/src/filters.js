// 최종가에 영향을 주는 예매 조건 필터. 스카이스캐너 페이지 위 패널과 팝업이 같이 쓴다.
const FILTER_DEFAULTS = { passengers: 1, display: 'person', bag_out: 0, bag_back: 0, seat: false, card: false, discount: false };

const FILTER_FIELDS = [
  { name: 'passengers', label: '인원', options: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [n, `${n}명`]) },
  { name: 'display', label: '가격 표시', options: [['person', '1인 기준'], ['total', '인원 총액']] },
  { name: 'bag_out', label: '위탁수하물 · 가는 편', unit: 'kg', hint: '무게만 적어 주세요. 몇 개 필요한지는 저희가 셀게요' },
  { name: 'bag_back', label: '위탁수하물 · 오는 편', unit: 'kg', hint: '왕복이면 여기도요! 편도면 0' },
  { name: 'seat', label: '좌석 지정' },
  { name: 'card', label: '카드 결제 (수수료)' },
  { name: 'discount', label: '판매처 할인 반영' },
];

// innerHTML 대신 createElement — 스카이스캐너 페이지의 CSP(Trusted Types)에 걸리지 않게
function buildFilters(doc, values, onChange) {
  const v = { ...FILTER_DEFAULTS, ...values };
  const form = doc.createElement('form');
  form.className = 'clearfare-filter-form';
  const inputs = FILTER_FIELDS.map((f) => {
    const label = form.appendChild(doc.createElement('label'));
    const text = label.appendChild(doc.createElement('span'));
    text.textContent = f.label;
    if (f.hint) text.appendChild(doc.createElement('small')).textContent = f.hint;
    let input;
    if (f.unit) {
      const box = label.appendChild(doc.createElement('span'));
      box.className = 'clearfare-unit';
      input = box.appendChild(doc.createElement('input'));
      Object.assign(input, { type: 'number', min: 0, max: 99, step: 1, inputMode: 'numeric', value: v[f.name] || 0 });
      box.append(f.unit);
    } else if (f.options) {
      input = label.appendChild(doc.createElement('select'));
      for (const [value, text] of f.options) {
        const opt = input.appendChild(doc.createElement('option'));
        opt.value = value;
        opt.textContent = text;
      }
      input.value = String(v[f.name]);
    } else {
      input = label.appendChild(doc.createElement('input'));
      input.type = 'checkbox';
      input.checked = !!v[f.name];
    }
    input.name = f.name;
    return input;
  });
  const read = (input, f) =>
    f.unit ? Math.min(99, Math.max(0, Math.round(Number(input.value)) || 0))
    : !f.options ? input.checked
    : typeof FILTER_DEFAULTS[f.name] === 'number' ? Number(input.value)
    : input.value;
  form.onchange = () => onChange(Object.fromEntries(FILTER_FIELDS.map((f, i) => [f.name, read(inputs[i], f)])));
  form.onsubmit = (e) => e.preventDefault();
  return form;
}

if (typeof module !== 'undefined') module.exports = { FILTER_DEFAULTS, buildFilters };
