# ClearFare
창의적 사고 레포지토리 입니다.

스카이스캐너 항공권 검색 화면에 판매처 수수료·수하물·카드 수수료를 더한 **최종 결제 예상 금액**을 보여주는 크롬 확장프로그램. 기획은 [SPEC.md](SPEC.md).

```
extension/   크롬 확장프로그램 (프론트)
backend/     실결제 금액 신고 저장·수수료 보정 API (선택, Python 표준 라이브러리, SQLite)
```

## 설치 (서버 없이 바로 사용)
1. GitHub 페이지에서 **Code → Download ZIP** → 받은 zip 압축 풀기
2. 크롬 주소창에 `chrome://extensions` → 오른쪽 위 **개발자 모드** 켜기
3. **압축해제된 확장 프로그램을 로드** → 압축 푼 폴더 안의 **`extension` 폴더** 선택 (`ClearFare-main` 폴더가 아니라 그 안의 `extension`)
4. https://www.skyscanner.co.kr 에서 항공권 검색 → 가격 옆 노란 배지, 항공편을 눌러 판매처 화면에서 비교표 확인
5. 툴바의 ClearFare 아이콘: 인원·수하물·카드 등 예매 조건 설정

- 압축 푼 폴더를 지우거나 옮기면 확장프로그램이 멈춤
- 새 버전: zip을 다시 받아 같은 자리에 덮어쓴 뒤 `chrome://extensions`에서 ClearFare 새로고침(↻), 스카이스캐너 탭도 새로고침

## 서버 (개발자용, 선택)
요금표는 확장프로그램에 들어 있는 `extension/rules.json`을 쓰므로 서버 없이도 동작한다. 서버는 **실제 결제 금액 신고**를 모아 수수료를 보정할 때만 필요하다.
- `cd backend && python3 server.py` → http://127.0.0.1:8000/api/rules (`extension/rules.json` + 신고 보정)
- 서버가 켜져 있으면 확장프로그램이 서버 요금표를 우선 사용, 꺼져 있으면 내장 요금표 사용

## 테스트
- 백엔드: `cd backend && python3 -m unittest`
- 확장프로그램: `cd extension && npm install && npm test`
- 설치 없이 화면 보기: `extension/test/demo.html` 열기

## 주의
- `extension/rules.json`의 수수료·수하물 숫자는 2026-11 공개 자료 조사값(출처 `source`), 실제 결제로 확인 전까지 "미검증" 표시. 서버를 켜고 팝업 신고가 판매처당 3건 쌓이면 실측값으로 보정
- 배지가 안 뜨면: 확장프로그램 새로고침 여부, 스카이스캐너 탭 개발자도구 콘솔의 `[ClearFare]` 메시지, 가격 요소의 HTML 구조 확인
