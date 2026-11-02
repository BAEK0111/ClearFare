# ClearFare
창의적 사고 레포지토리 입니다.

스카이스캐너 항공권 검색 화면에 판매처 수수료·수하물·카드 수수료를 더한 **최종 결제 예상 금액**을 보여주는 크롬 확장프로그램. 기획은 [SPEC.md](SPEC.md).

```
extension/   크롬 확장프로그램 (프론트)
backend/     규칙 API + 실결제 금액 신고 저장 (Python 표준 라이브러리, SQLite)
```

## 실행
1. **서버**: `cd backend && python3 server.py` → http://127.0.0.1:8000/api/rules
2. **확장프로그램**: `chrome://extensions` → 개발자 모드 → "압축해제된 확장 프로그램 로드" → `extension` 폴더 선택
3. https://www.skyscanner.co.kr 에서 항공권 검색 → 가격 옆 배지 확인, 항공편을 눌러 판매처 화면에서 순위·비교표 확인
4. 툴바의 ClearFare 아이콘: 수하물/카드 조건 설정, 실제 결제 금액 신고

코드를 고친 뒤에는 `chrome://extensions`에서 ClearFare 새로고침(↻) 후 스카이스캐너 탭도 새로고침.

## 테스트
- 백엔드: `cd backend && python3 -m unittest`
- 확장프로그램: `cd extension && npm install && npm test`
- 설치 없이 화면 보기: `extension/test/demo.html` 열기

## 주의
- `backend/rules.json`의 수수료·수하물 숫자는 **예시**(화면에 "미검증" 표시). 실제 결제 페이지에서 확인해 채우거나, 팝업 신고가 판매처당 3건 쌓이면 자동으로 실측값으로 바뀜
- 배지가 안 뜨면: 서버 실행 여부, 스카이스캐너 탭 개발자도구 콘솔의 `[ClearFare]` 메시지, 가격 요소의 HTML 구조 확인
