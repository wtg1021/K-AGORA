import json
import sqlite3
import tempfile
import threading
import unittest
from unittest.mock import patch
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from agora.search import rank
from agora.server import ROOT, create_server
from agora.store import Store

SAMPLES = json.loads((ROOT / 'data/sample-agendas.json').read_text(encoding='utf-8'))

class EncodingTests(unittest.TestCase):
    def test_seed_with_windows_cp949_default(self):
        read_text = Path.read_text

        def windows_read_text(path, encoding=None, errors=None):
            return read_text(path, encoding=encoding or 'cp949', errors=errors)

        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory) / 'windows.sqlite3')
            with patch.object(Path, 'read_text', windows_read_text):
                store.seed(ROOT / 'data/sample-agendas.json')
            self.assertEqual(len(store.all()), len(SAMPLES))
            actual = {a['number']: a['title'] for a in store.all()}
            self.assertEqual(actual, {a['number']: a['title'] for a in SAMPLES})

class SearchTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.store=Store(Path(self.temp.name)/'test.sqlite3')
        self.store.seed(ROOT/'data/sample-agendas.json')
    def tearDown(self):
        self.temp.cleanup()
    def test_representative_questions(self):
        for query, number in [('법인카드 사용내역을 한 번에 등록하는 안건이 전에 있었어?', 'DEMO-2025-01'),('월급 소급 내역 엑셀', 'DEMO-2025-02'),('담당자 변경 권한 인수인계','DEMO-2024-04'),('증빙 파일 여러 개 첨부','DEMO-2025-03')]:
            with self.subTest(query=query):
                self.assertEqual(rank(self.store.all(),query)[0][0]['number'],number)
    def test_no_unrelated_results(self):
        self.assertEqual(rank(self.store.all(),'양자컴퓨터 우주망원경'),[])
    def test_seed_does_not_restore_deleted_data(self):
        for a in self.store.all(): self.store.delete(a['id'])
        Store(self.store.path).seed(ROOT/'data/sample-agendas.json')
        self.assertEqual(self.store.all(),[])
    def test_import_atomic_on_duplicate(self):
        first=dict(SAMPLES[0],number='NEW-1')
        with self.assertRaises(sqlite3.IntegrityError):self.store.import_items([first,SAMPLES[0]])
        self.assertEqual(len(self.store.all()),8)
    def test_validation_rejects_bad_dates_and_links(self):
        for patch in [{'date':'2026-02-30'},{'source':'javascript:alert(1)'},{'title':''},{'status':'unknown'}]:
            with self.subTest(patch=patch),self.assertRaises(ValueError):self.store.save(dict(SAMPLES[0],**patch))

class APITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        cls.db=Path(cls.temp.name)/'test.sqlite3'
        cls.server=create_server(port=0,db=cls.db,seed=True,token='test-admin-key')
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
        cls.url='http://127.0.0.1:'+str(cls.server.server_port)
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.thread.join();cls.temp.cleanup()
    def request(self,path,method='GET',body=None,auth=False):
        headers={'Content-Type':'application/json'}
        if auth:headers['Authorization']='Bearer test-admin-key'
        req=Request(self.url+path,data=json.dumps(body).encode() if body is not None else None,headers=headers,method=method)
        try:
            with urlopen(req) as r:return r.status,json.loads(r.read())
        except HTTPError as e:return e.code,json.loads(e.read())
    def test_health_and_actual_html(self):
        self.assertEqual(self.request('/api/health'),(200,{'status':'ok'}))
        with urlopen(self.url) as r:
            self.assertIn('K-AGORA',r.read().decode());self.assertIn("script-src 'self'",r.headers['Content-Security-Policy'])
        self.assertEqual(self.request('/../agora/server.py')[0],404)
    def test_combined_filters(self):
        result=self.request('/api/agendas?year=2025&quarter=2')[1]
        self.assertEqual([a['number'] for a in result['items']],['DEMO-2025-01'])
    def test_write_and_export_require_auth(self):
        for path,method,body in [('/api/agendas','POST',SAMPLES[0]),('/api/import','POST',SAMPLES),('/api/export','GET',None),('/api/agendas/anything','DELETE',None)]:
            with self.subTest(path=path):self.assertEqual(self.request(path,method,body)[0],401)
    def test_crud_and_persistence(self):
        code,a=self.request('/api/agendas','POST',dict(SAMPLES[0],number='CRUD-01'),True);self.assertEqual(code,201)
        self.assertEqual(Store(self.db).get(a['id'])['number'],'CRUD-01')
        path='/api/agendas/'+a['id']
        self.assertEqual(self.request(path,'PUT',dict(a,title='수정된 제목'),True)[0],200)
        self.assertEqual(self.request(path)[1]['title'],'수정된 제목')
        self.assertEqual(self.request(path,'DELETE',auth=True)[0],200)
        self.assertEqual(self.request(path)[0],404)
    def test_invalid_json(self):
        req=Request(self.url+'/api/import',data=b'{broken',headers={'Content-Type':'application/json','Authorization':'Bearer test-admin-key'},method='POST')
        with self.assertRaises(HTTPError) as ctx:urlopen(req)
        self.assertEqual(ctx.exception.code,400)
    def test_import_export(self):
        code,data=self.request('/api/import','POST',[dict(SAMPLES[0],number='IMPORT-01')],True)
        self.assertEqual((code,data['imported']),(201,1))
        code,items=self.request('/api/export',auth=True)
        self.assertEqual(code,200);self.assertTrue(any(a['number']=='IMPORT-01' for a in items))
        self.assertNotIn('id',items[0])

if __name__=='__main__':unittest.main()
