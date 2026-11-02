# ClearFare
창의적 사고 레포지토리 입니다.

항공권 검색 화면의 표시가 옆에 수수료·수하물·카드 수수료를 더한 **최종 결제 예상 금액**을 붙이는 크롬 확장프로그램.

- `src/fees.js` — 최종가 계산 규칙 (판매처별 수수료 숫자는 예시, 실측으로 채울 것)
- `src/content.js` — 페이지의 `₩123,456` 가격을 찾아 배지 부착
- `src/popup.html` — 사용자 입력 (위탁수하물, 카드 결제)
- 기획: [SPEC.md](SPEC.md)

## 실행
- 테스트: `npm test`
- 브라우저 미리보기: `test/demo.html` 열기
- 설치: `chrome://extensions` → 개발자 모드 → "압축해제된 확장 프로그램 로드" → 이 폴더 선택 → skyscanner.co.kr 검색
