import json
import sqlite3
from datetime import date
from pathlib import Path
from uuid import uuid4

STATUSES = ('검토 중', '일부 반영', '반영 완료', '미반영')
FIELDS = ('number', 'meeting', 'date', 'region', 'organization', 'field', 'title', 'situation', 'problem', 'request', 'effect', 'review', 'answer', 'department', 'status', 'implemented_at', 'keywords', 'source')
REQUIRED = ('number', 'meeting', 'date', 'region', 'field', 'title', 'request', 'status')

def validate(data):
    if not isinstance(data, dict):
        raise ValueError('안건은 JSON 객체여야 합니다.')
    result = {}
    for f in FIELDS:
        value = data.get(f, '')
        if not isinstance(value, str) or len(value) > 20000:
            raise ValueError(f'{f}: 문자열(20,000자 이하)을 입력하세요.')
        result[f] = value.strip()
    for f in REQUIRED:
        if not result[f]:
            raise ValueError(f'필수 항목 누락: {f}')
    try:
        parsed = date.fromisoformat(result['date'])
    except ValueError as exc:
        raise ValueError('개최일은 YYYY-MM-DD 형식이어야 합니다.') from exc
    result['date'] = parsed.isoformat()
    if result['status'] not in STATUSES:
        raise ValueError('올바른 반영 상태를 선택하세요.')
    if result['source'] and not result['source'].startswith(('https://', 'http://')):
        raise ValueError('원문 위치는 http 또는 https 주소를 입력하세요.')
    result['year'], result['quarter'] = parsed.year, (parsed.month - 1)//3 + 1
    return result

class Store:
    def __init__(self, path):
        self.path = str(path)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS agendas (id TEXT PRIMARY KEY, number TEXT UNIQUE NOT NULL, content TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)')

    def connect(self):
        db = sqlite3.connect(self.path, timeout=15)
        db.execute('PRAGMA busy_timeout=15000')
        return db

    def all(self):
        with self.connect() as db:
            return [dict(json.loads(content), id=id_) for id_, content in db.execute('SELECT id,content FROM agendas')]

    def get(self, id_):
        with self.connect() as db:
            row = db.execute('SELECT content FROM agendas WHERE id=?', (id_,)).fetchone()
            return dict(json.loads(row[0]), id=id_) if row else None

    def save(self, data, id_=None):
        item = validate(data)
        with self.connect() as db:
            if id_:
                cursor = db.execute('UPDATE agendas SET number=?,content=? WHERE id=?', (item['number'], json.dumps(item, ensure_ascii=False), id_))
                if not cursor.rowcount:
                    raise KeyError(id_)
            else:
                id_ = uuid4().hex
                db.execute('INSERT INTO agendas VALUES (?,?,?)', (id_, item['number'], json.dumps(item, ensure_ascii=False)))
        return dict(item, id=id_)

    def import_items(self, items):
        if not isinstance(items, list) or not 1 <= len(items) <= 500:
            raise ValueError('한 번에 안건 1~500개를 가져올 수 있습니다.')
        validated = [validate(item) for item in items]
        with self.connect() as db:
            for item in validated:
                db.execute('INSERT INTO agendas VALUES (?,?,?)', (uuid4().hex, item['number'], json.dumps(item, ensure_ascii=False)))
        return len(validated)

    def delete(self, id_):
        with self.connect() as db:
            return db.execute('DELETE FROM agendas WHERE id=?', (id_,)).rowcount > 0

    def seed(self, path):
        # A marker prevents deleted sample data from reappearing after restart.
        with self.connect() as db:
            if db.execute("SELECT 1 FROM settings WHERE key='initialized'").fetchone():
                return
            if not db.execute('SELECT 1 FROM agendas LIMIT 1').fetchone():
                for source in json.loads(Path(path).read_text()):
                    item = validate(source)
                    db.execute('INSERT INTO agendas VALUES (?,?,?)', (uuid4().hex, item['number'], json.dumps(item, ensure_ascii=False)))
            db.execute("INSERT INTO settings VALUES ('initialized','true')")
