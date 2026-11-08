"""Dependency-free local/internal prototype server."""
import argparse
import hmac
import json
import os
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from agora.search import rank
from agora.store import STATUSES, Store
from agora.schema import REVIEW_STATUSES, BUSINESS_FIELDS, SUBMISSION_TYPES, field_values

ROOT = Path(__file__).resolve().parent.parent
MAX_BODY = 2 * 1024 * 1024

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # Do not write query text, document contents or authorization to access logs.
        pass

    def send(self, status, value, mime='application/json; charset=utf-8'):
        payload = value if isinstance(value, bytes) else json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        self.end_headers()
        self.wfile.write(payload)

    def authorized(self):
        token = self.server.admin_token
        return bool(token) and hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + token)

    def body(self):
        try:
            size = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            raise ValueError('요청 크기가 잘못되었습니다.')
        if not 0 < size <= MAX_BODY:
            raise ValueError('JSON 요청 크기는 2MB 이하여야 합니다.')
        if self.headers.get_content_type() != 'application/json':
            raise ValueError('application/json 형식으로 전송하세요.')
        try:
            return json.loads(self.rfile.read(size))
        except (ValueError, UnicodeError) as exc:
            raise ValueError('올바른 JSON 파일을 입력하세요.') from exc

    def do_GET(self):
        path = urlsplit(self.path).path
        params = parse_qs(urlsplit(self.path).query)
        if path == '/api/health':
            self.server.store.all()
            return self.send(200, {'status': 'ok'})
        if path == '/api/meta':
            items = self.server.store.all()
            return self.send(200, {
                'count': len(items), 'statuses': STATUSES, 'review_statuses': REVIEW_STATUSES,
                'business_fields': BUSINESS_FIELDS, 'submission_types': SUBMISSION_TYPES,
                'management_enabled': bool(self.server.admin_token),
                **{key: sorted({a[key] for a in items}) for key in ('year', 'region', 'organization')},
                'field': sorted({v for a in items for v in field_values(a['field'])}),
                'search_mode': '동의어 확장 + 텍스트 관련도 검색 (외부 AI 미사용)',
            })
        if path == '/api/agendas':
            query = params.get('q', [''])[0].strip()
            if len(query) > 1000:
                return self.send(400, {'error': '검색어는 1,000자 이하로 입력하세요.'})
            items = self.server.store.all()
            for key in ('year', 'quarter', 'region', 'field', 'status', 'review_status', 'submission_type', 'organization', 'meeting'):
                value = params.get(key, [''])[0]
                if value:
                    items = [a for a in items if value in field_values(a['field'])] if key == 'field' else [a for a in items if str(a[key]) == value]
            results = [dict(a, score=score, matched=matched) for a, score, matched in rank(items, query)]
            if query and results:
                top = results[0]
                answer = f"관련 안건 {len(results)}건을 찾았습니다. 가장 관련된 안건은 ‘{top['title']}’입니다. {top['meeting']} ({top['date']}) · 제안기관: {top['organization'] or top['region']}. KERIS 검토 구분: {top['source_status'] or top['review_status']}. 실제 반영 상태: {top['status']}. 검토 내용: {top['review'] or top['answer'] or '등록된 검토 내용이 없습니다.'}"
                if top['source_file']:
                    answer += f"\n출처: {top['source_file']} · PDF {top['source_pages'] or '쪽수 미등록'}쪽. 자료집의 사전 검토의견이며 회의 후 확정 결과가 아닙니다."
            elif query:
                answer = '일치하는 안건이 없습니다. 검색어를 줄이거나 조건을 변경해 보세요.'
            else:
                answer = f'현재 조건에 맞는 안건 {len(results)}건입니다. 궁금한 업무나 요구사항을 질문해 보세요.'
            return self.send(200, {'items': results, 'total': len(results), 'answer': answer})
        if path == '/api/export':
            if not self.authorized():
                return self.send(401, {'error': '관리자 키가 필요합니다.'})
            return self.send(200, [{k: v for k, v in a.items() if k not in ('id', 'year', 'quarter')} for a in self.server.store.all()])
        if path.startswith('/api/agendas/'):
            item = self.server.store.get(path.rsplit('/', 1)[-1])
            return self.send(200, item) if item else self.send(404, {'error': '안건을 찾을 수 없습니다.'})
        files = {'/': ('index.html', 'text/html; charset=utf-8'), '/text-format.js': ('text-format.js', 'text/javascript; charset=utf-8'), '/app.js': ('app.js', 'text/javascript; charset=utf-8'), '/style.css': ('style.css', 'text/css; charset=utf-8')}
        if path in files:
            name, mime = files[path]
            return self.send(200, (ROOT / 'static' / name).read_bytes(), mime)
        self.send(404, {'error': '요청한 경로가 없습니다.'})

    def mutate(self):
        if not self.authorized():
            return self.send(401, {'error': '관리 기능이 꺼져 있거나 관리자 키가 올바르지 않습니다.'})
        path = urlsplit(self.path).path
        try:
            if self.command == 'POST' and path == '/api/agendas':
                return self.send(201, self.server.store.save(self.body()))
            if self.command == 'POST' and path == '/api/import':
                return self.send(201, {'imported': self.server.store.import_items(self.body())})
            if path.startswith('/api/agendas/'):
                id_ = path.rsplit('/', 1)[-1]
                if self.command == 'PUT':
                    return self.send(200, self.server.store.save(self.body(), id_))
                if self.command == 'DELETE':
                    if not self.server.store.delete(id_):
                        raise KeyError(id_)
                    return self.send(200, {'deleted': True})
            self.send(404, {'error': '요청한 경로가 없습니다.'})
        except sqlite3.IntegrityError:
            self.send(409, {'error': '이미 등록된 안건번호입니다. 중복 안건을 확인하세요. 가져오기는 전체 취소되었습니다.'})
        except KeyError:
            self.send(404, {'error': '안건을 찾을 수 없습니다.'})
        except ValueError as exc:
            self.send(400, {'error': str(exc)})

    do_POST = mutate
    do_PUT = mutate
    do_DELETE = mutate


def create_server(host='127.0.0.1', port=8000, db=None, seed=False, token='', seed_path=None):
    store = Store(db or ROOT / 'data' / 'agora.sqlite3')
    if seed:
        store.seed(seed_path or ROOT / 'data' / 'sample-agendas.json')
    server = ThreadingHTTPServer((host, port), Handler)
    server.store, server.admin_token = store, token
    return server


def startup_options(argv=None):
    parser = argparse.ArgumentParser(description='K-AGORA 협의체 안건 서버 (기본: 실제 자료 37건)')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--real', action='store_true', help='기존 DB 환경변수와 관계없이 실제 자료 DB로 실행')
    mode.add_argument('--demo', action='store_true', help='테스트용 예시 8건 DB로 실행')
    args = parser.parse_args(argv)
    real_db = ROOT / 'data' / 'school-accounting-2026-02.sqlite3'
    real_seed = ROOT / 'documents' / '2026-school-accounting-02' / '01-agendas-master-37.json'
    db = os.getenv('DATABASE_PATH') or real_db
    seed_path = os.getenv('SEED_DATA_PATH') or real_seed
    seed = os.getenv('SEED_DEMO', 'true').lower() == 'true'
    if args.real:
        db, seed_path, seed = real_db, real_seed, True
    elif args.demo:
        db, seed_path, seed = ROOT / 'data' / 'agora.sqlite3', ROOT / 'data' / 'sample-agendas.json', True
    return dict(host=os.getenv('HOST', '127.0.0.1'), port=int(os.getenv('PORT', '8000')),
                db=db, seed=seed, token=os.getenv('ADMIN_TOKEN', ''), seed_path=seed_path)


def main(argv=None):
    server = create_server(**startup_options(argv))
    print(f'K-AGORA listening on {server.server_address}; management={bool(server.admin_token)}', flush=True)
    print(f'Database: {server.store.path} | Registered agendas: {len(server.store.all())}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

if __name__ == '__main__':
    main()
