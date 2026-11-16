"""ClearFare API 서버. 표준 라이브러리만 사용 — `python server.py`로 바로 실행."""
import json
import sqlite3
import statistics
from collections import defaultdict
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

HERE = Path(__file__).parent
RULES_PATH = HERE.parent / "extension" / "rules.json"  # 확장프로그램에 같이 들어가는 기본 규칙과 같은 파일
DB_PATH = HERE / "clearfare.db"
MIN_SAMPLES = 3  # 판매처당 신고가 이만큼 쌓이면 수수료율을 실측값으로 교체
MAX_BODY = 10_000
MAX_PRICE = 100_000_000


def connect(path=DB_PATH):
    db = sqlite3.connect(path, check_same_thread=False)  # 요청은 서버 스레드 하나에서만 처리됨
    db.execute(
        """create table if not exists reports (
            id integer primary key,
            seller text not null,
            displayed integer not null,
            final integer not null,
            baggage integer not null,
            card integer not null,
            created_at text not null default current_timestamp)"""
    )
    return db


def load_rules(db):
    rules = json.loads(RULES_PATH.read_text(encoding="utf-8"))
    rules.pop("_note", None)
    # 수하물을 뺀 신고만 사용, 카드 수수료는 나눠서 제거
    markups = defaultdict(list)
    for seller, displayed, final, card in db.execute("select seller, displayed, final, card from reports where baggage = 0"):
        card_pct = rules["sellers"].get(seller, {}).get("card_pct", rules["card_pct"])
        if isinstance(card_pct, list):  # [최소, 최대] 범위면 중간값
            card_pct = sum(card_pct) / 2
        markups[seller].append(final / (1 + card_pct * card) / displayed - 1)
    for seller, ms in markups.items():
        if len(ms) >= MIN_SAMPLES:
            rules["sellers"][seller] = {**rules["sellers"].get(seller, {}), "pct": round(statistics.median(ms), 4), "fixed": 0, "verified": True, "samples": len(ms)}
    return rules


def validate_report(body):
    seller, displayed, final = body.get("seller"), body.get("displayed"), body.get("final")
    if not isinstance(seller, str) or not 1 <= len(seller.strip()) <= 50:
        raise ValueError("seller는 1~50자 문자열")
    for name, v in (("displayed", displayed), ("final", final)):
        if type(v) is not int or not 0 < v <= MAX_PRICE:
            raise ValueError(f"{name}는 1~{MAX_PRICE} 정수")
    if not displayed * 0.5 <= final <= displayed * 3:
        raise ValueError("final이 displayed와 너무 차이 남 (0.5~3배)")
    for name in ("baggage", "card"):
        if not isinstance(body.get(name, False), bool):
            raise ValueError(f"{name}는 true/false")
    return seller.strip(), displayed, final, int(body.get("baggage", False)), int(body.get("card", False))


def make_handler(db):
    class Handler(BaseHTTPRequestHandler):
        def send_json(self, status, data):
            raw = json.dumps(data, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self):
            if self.path == "/api/rules":
                self.send_json(200, load_rules(db))
            else:
                self.send_json(404, {"error": "not found"})

        def do_POST(self):
            if self.path != "/api/reports":
                return self.send_json(404, {"error": "not found"})
            length = int(self.headers.get("Content-Length") or 0)
            if not 0 < length <= MAX_BODY:
                return self.send_json(400, {"error": "본문 크기 오류"})
            try:
                body = json.loads(self.rfile.read(length))
                row = validate_report(body if isinstance(body, dict) else {})
            except (ValueError, json.JSONDecodeError) as e:
                return self.send_json(400, {"error": str(e)})
            with db:
                db.execute("insert into reports (seller, displayed, final, baggage, card) values (?, ?, ?, ?, ?)", row)
            self.send_json(201, {"ok": True})

    return Handler


# ponytail: 단일 스레드 서버 + 커넥션 하나, 동시 사용자가 많아지면 FastAPI/Postgres로
def make_server(db, port=8000):
    return HTTPServer(("127.0.0.1", port), make_handler(db))


if __name__ == "__main__":
    server = make_server(connect())
    print("ClearFare API: http://127.0.0.1:8000/api/rules")
    server.serve_forever()
