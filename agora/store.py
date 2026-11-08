import json
import sqlite3
from datetime import date
from pathlib import Path
from uuid import uuid4

from agora.schema import (STATUSES, REVIEW_STATUSES, BUSINESS_FIELDS, SUBMISSION_TYPES,
                          FIELDS, REQUIRED, field_values, convert_import, validate_provenance, separate_sr_number)

def validate(data):
    if not isinstance(data, dict):
        raise ValueError('안건은 JSON 객체여야 합니다.')
    result = {}
    for f in FIELDS:
        value = data.get(f, '')
        if f == 'status' and value in ('', None):
            value = '미확인'
        if f == 'review_status' and not value:
            value = '미검토'
        if f == 'submission_type' and not value:
            value = '미분류'
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
    result['organization'], result['sr_number'] = separate_sr_number(result['organization'], result['sr_number'])
    if result['status'] not in STATUSES:
        raise ValueError('올바른 반영 상태를 선택하세요.')
    if result['source'] and not result['source'].startswith(('https://', 'http://')):
        raise ValueError('원문 위치는 http 또는 https 주소를 입력하세요.')
    if result['review_status'] not in REVIEW_STATUSES:
        raise ValueError('올바른 KERIS 검토 구분을 선택하세요.')
    if result['submission_type'] not in SUBMISSION_TYPES:
        raise ValueError('올바른 제안 구분을 선택하세요.')
    result['field'] = ' · '.join(dict.fromkeys(field_values(result['field'])))
    if not result['field']:
        raise ValueError('업무를 한 개 이상 선택하세요.')
    result['source_record'] = validate_provenance(data.get('source_record', {}))
    result['year'], result['quarter'] = parsed.year, (parsed.month - 1)//3 + 1
    return result

class Store:
    def __init__(self, path):
        self.path = str(path)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS agendas (id TEXT PRIMARY KEY, number TEXT UNIQUE NOT NULL, content TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)')
            if db.execute('PRAGMA user_version').fetchone()[0] < 3:
                # Transactional in-place migration: retain IDs, numbers, text, and old statuses.
                for id_, content in db.execute('SELECT id,content FROM agendas').fetchall():
                    item = validate(json.loads(content))
                    db.execute('UPDATE agendas SET content=? WHERE id=?', (json.dumps(item, ensure_ascii=False), id_))
                db.execute('PRAGMA user_version=3')

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
        if not isinstance(data, dict):
            raise ValueError('안건은 JSON 객체여야 합니다.')
        with self.connect() as db:
            if id_:
                existing = db.execute('SELECT content FROM agendas WHERE id=?', (id_,)).fetchone()
                if not existing:
                    raise KeyError(id_)
                data = dict(json.loads(existing[0]), **data)
            item = validate(data)
            if id_:
                cursor = db.execute('UPDATE agendas SET number=?,content=? WHERE id=?', (item['number'], json.dumps(item, ensure_ascii=False), id_))
                if not cursor.rowcount:
                    raise KeyError(id_)
            else:
                id_ = uuid4().hex
                db.execute('INSERT INTO agendas VALUES (?,?,?)', (id_, item['number'], json.dumps(item, ensure_ascii=False)))
        return dict(item, id=id_)

    def import_items(self, items):
        items = convert_import(items)
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
                for source in convert_import(json.loads(Path(path).read_text(encoding='utf-8'))):
                    item = validate(source)
                    db.execute('INSERT INTO agendas VALUES (?,?,?)', (uuid4().hex, item['number'], json.dumps(item, ensure_ascii=False)))
            db.execute("INSERT INTO settings VALUES ('initialized','true')")
