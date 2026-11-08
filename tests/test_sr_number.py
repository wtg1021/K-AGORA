import json
import tempfile
import unittest
from pathlib import Path

from agora.schema import separate_sr_number
from agora.store import Store
from test_meeting_form import DATA

class SRNumberTests(unittest.TestCase):
    def test_extracts_sr_and_preserves_other_parenthetical_information(self):
        self.assertEqual(separate_sr_number('인천광역시교육청(SR-387379)'), ('인천광역시교육청', 'SR-387379'))
        self.assertEqual(separate_sr_number('전북 익산부송중학교(행정연구회)(SR-390168)'), ('전북 익산부송중학교(행정연구회)', 'SR-390168'))
        self.assertEqual(separate_sr_number('학교(SR-123, 시범기관)'), ('학교(시범기관)', 'SR-123'))
    def test_absent_number_is_blank_and_other_numbers_are_not_sr(self):
        for name in ('교육부', '학교(2026년 행정연구회)', 'SR지원센터'):
            with self.subTest(name=name):
                self.assertEqual(separate_sr_number(name), (name, ''))
    def test_normalizes_explicit_numbers_and_preserves_multiple_distinct_numbers(self):
        self.assertEqual(separate_sr_number('학교', '387379'), ('학교', 'SR-387379'))
        self.assertEqual(separate_sr_number('학교（sr – 003）', 'SR-003, SR-004'), ('학교', 'SR-003, SR-004'))
        with self.assertRaises(ValueError):
            separate_sr_number('학교', '없음')
    def test_v2_migration_moves_sr_without_changing_id_or_source(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'old.sqlite3'
            store = Store(path)
            legacy = dict(DATA[34], organization='인천광역시교육청(SR-387379)')
            legacy.pop('sr_number', None)
            with store.connect() as db:
                db.execute('INSERT INTO agendas VALUES (?,?,?)', ('unchanged-id', legacy['number'], json.dumps(legacy, ensure_ascii=False)))
                db.execute('PRAGMA user_version=2')
            upgraded = Store(path)
            item = upgraded.get('unchanged-id')
            self.assertEqual((item['organization'], item['sr_number']), ('인천광역시교육청', 'SR-387379'))
            self.assertEqual(item['source_record'], legacy['source_record'])
            self.assertEqual(item['request'], legacy['request'])
            self.assertEqual(Store(path).get('unchanged-id'), item)
    def test_new_import_edit_clear_and_export_restore(self):
        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory) / 'one.sqlite3')
            store.import_items([dict(DATA[34], organization='인천광역시교육청(SR-387379)', sr_number=''), DATA[0]])
            items = store.all()
            self.assertEqual(items[0]['sr_number'], 'SR-387379')
            self.assertEqual(items[1]['sr_number'], '')
            saved = store.save({'sr_number': 'SR-123456'}, items[0]['id'])
            backup = {k: v for k, v in saved.items() if k not in ('id', 'year', 'quarter')}
            restored = Store(Path(directory) / 'two.sqlite3')
            restored.import_items([backup])
            self.assertEqual(restored.all()[0]['sr_number'], 'SR-123456')
            self.assertEqual(store.save({'sr_number': ''}, items[0]['id'])['sr_number'], '')
