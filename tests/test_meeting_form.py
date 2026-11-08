import json
import sqlite3
import threading
from urllib.parse import urlencode
from urllib.request import urlopen
import tempfile
import unittest
from pathlib import Path

from agora.schema import convert_import
from agora.server import ROOT, create_server
from agora.store import Store, validate

DATA = [validate(a) for a in convert_import(json.loads((ROOT / 'documents/2026-school-accounting-02/01-agendas-master-37.json').read_text(encoding='utf-8')))]

class MeetingFormTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'meeting.sqlite3'
        self.store = Store(self.path)
    def tearDown(self):
        self.temp.cleanup()
    def test_all_37_preserve_pre_review_and_source(self):
        self.assertEqual(self.store.import_items(DATA), 37)
        items = self.store.all()
        self.assertEqual({a['status'] for a in items}, {'미확인'})
        self.assertEqual({s: sum(a['review_status'] == s for a in items) for s in ('현행유지', '협의필요', '개선예정')}, {'현행유지': 10, '협의필요': 23, '개선예정': 4})
        first = items[0]
        self.assertEqual((first['region'], first['meeting_region']), ('전국', '충북'))
        second = next(a for a in items if a['source_agenda_number'] == '2')
        self.assertEqual((second['region'], second['field']), ('부산', '지출 · 계약'))
        self.assertTrue(second['improvement_plan'])
        self.assertNotIn('[원문 개선방안]', second['request'])
        self.assertEqual(second['source_record'], DATA[1]['source_record'])
        thirteenth = next(a for a in items if a['source_agenda_number'] == '13')
        self.assertEqual((thirteenth['review_status'], thirteenth['list_status']), ('개선예정', '협의필요'))
    def test_master_conversion_includes_previously_excluded_10(self):
        master = {'document': DATA[0]['source_record']['document'], 'records': [a['source_record']['record'] for a in DATA]}
        self.assertEqual(self.store.import_items(master), 37)
        self.assertEqual(sum(a['review_status'] == '현행유지' for a in self.store.all()), 10)
    def test_export_round_trip_and_edit_keep_provenance(self):
        self.store.import_items(DATA)
        saved = self.store.all()[1]
        self.store.save({'title': '수정한 요구사항명', 'review_status': '개선예정'}, saved['id'])
        changed = self.store.get(saved['id'])
        self.assertEqual(changed['source_record'], saved['source_record'])
        self.assertEqual(changed['target_menu'], saved['target_menu'])
        backup = [{k: v for k, v in a.items() if k not in ('id', 'year', 'quarter')} for a in self.store.all()]
        other = Store(Path(self.temp.name) / 'restore.sqlite3')
        other.import_items(json.loads(json.dumps(backup, ensure_ascii=False)))
        restored = {a['number']: a for a in other.all()}
        self.assertEqual(restored[changed['number']]['source_record'], changed['source_record'])
        self.assertEqual(restored[changed['number']]['title'], '수정한 요구사항명')
    def test_duplicate_import_rolls_back_all_new_rows(self):
        self.store.import_items([DATA[0]])
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.import_items([DATA[1], DATA[0]])
        self.assertEqual(len(self.store.all()), 1)
    def test_legacy_database_migration_preserves_ids_and_content(self):
        legacy = {key: DATA[0][key] for key in ('number', 'meeting', 'date', 'region', 'field', 'title', 'request', 'status')}
        legacy.update(number='OLD-01', status='반영 완료', region='서울', answer='이전 확정 답변')
        with self.store.connect() as db:
            db.execute('INSERT INTO agendas VALUES (?,?,?)', ('old-id', legacy['number'], json.dumps(legacy, ensure_ascii=False)))
            db.execute('PRAGMA user_version=0')
        migrated = Store(self.path)
        item = migrated.get('old-id')
        for key, value in legacy.items():
            self.assertEqual(item[key], value)
        self.assertEqual(item['review_status'], '미검토')
        self.assertEqual(item['target_menu'], '')
        self.assertEqual(Store(self.path).get('old-id'), item)
        with migrated.connect() as db:
            self.assertEqual(db.execute('PRAGMA user_version').fetchone()[0], 3)
    def test_invalid_new_fields_are_rejected_before_import(self):
        for update in ({'review_status': '반영 완료'}, {'submission_type': '없는 구분'}, {'source_record': []}, {'target_menu': ['잘못된 타입']}):
            with self.subTest(update=update), self.assertRaises(ValueError):
                self.store.import_items([DATA[0], dict(DATA[1], **update)])
            self.assertEqual(self.store.all(), [])
        with self.assertRaises(ValueError):
            self.store.save([], 'missing')
    def test_legacy_status_does_not_become_review_classification(self):
        item = validate(dict(DATA[0], review_status='', status='반영 완료'))
        self.assertEqual((item['status'], item['review_status']), ('반영 완료', '미검토'))

class MeetingAPITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.server = create_server(port=0, db=Path(cls.temp.name) / 'api.sqlite3', seed=True,
                                   seed_path=ROOT / 'documents/2026-school-accounting-02/01-agendas-master-37.json')
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = 'http://127.0.0.1:' + str(cls.server.server_port)
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.temp.cleanup()
    def get(self, path):
        with urlopen(self.url + path) as response:
            return json.loads(response.read())
    def test_multi_business_filter_and_metadata(self):
        result = self.get('/api/agendas?' + urlencode({'field': '계약', 'region': '부산'}))
        self.assertEqual({a['source_agenda_number'] for a in result['items']}, {'2', '3'})
        result = self.get('/api/agendas?' + urlencode({'review_status': '현행유지', 'status': '미확인'}))
        self.assertEqual(result['total'], 10)
        meta = self.get('/api/meta')
        self.assertEqual(meta['count'], 37)
        self.assertIn('계약', meta['field'])
        self.assertNotIn('지출 · 계약', meta['field'])
    def test_sr_number_search_uses_separate_field(self):
        result = self.get('/api/agendas?' + urlencode({'q': 'SR-387379'}))
        self.assertEqual(result['items'][0]['source_agenda_number'], '35')
        self.assertEqual(result['items'][0]['organization'], '인천광역시교육청')
        self.assertEqual(result['items'][0]['sr_number'], 'SR-387379')

    def test_search_identifies_pre_review_and_source(self):
        result = self.get('/api/agendas?' + urlencode({'q': '학부모부담금 신용카드 수수료'}))
        self.assertEqual(result['items'][0]['source_agenda_number'], '1')
        self.assertIn('사전 검토의견', result['answer'])
        self.assertIn('실제 반영 상태: 미확인', result['answer'])
        self.assertIn('PDF', result['answer'])

if __name__ == '__main__':
    unittest.main()
