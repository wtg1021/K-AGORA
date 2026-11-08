import os
import unittest
from unittest.mock import patch
from agora.server import ROOT, startup_options

class StartupTests(unittest.TestCase):
    def test_default_opens_real_data(self):
        with patch.dict(os.environ, {}, clear=True):
            options = startup_options([])
        self.assertEqual(options['db'], ROOT / 'data/school-accounting-2026-02.sqlite3')
        self.assertEqual(options['seed_path'], ROOT / 'documents/2026-school-accounting-02/01-agendas-master-37.json')
        self.assertTrue(options['seed'])
    def test_real_flag_overrides_stale_demo_environment(self):
        with patch.dict(os.environ, {'DATABASE_PATH': 'data/agora.sqlite3', 'SEED_DATA_PATH': 'data/sample-agendas.json', 'SEED_DEMO': 'false'}, clear=True):
            options = startup_options(['--real'])
        self.assertEqual(options['db'], ROOT / 'data/school-accounting-2026-02.sqlite3')
        self.assertIn('master-37', str(options['seed_path']))
        self.assertTrue(options['seed'])
    def test_demo_is_explicit(self):
        with patch.dict(os.environ, {}, clear=True):
            options = startup_options(['--demo'])
        self.assertEqual(options['db'], ROOT / 'data/agora.sqlite3')
        self.assertEqual(options['seed_path'], ROOT / 'data/sample-agendas.json')
    def test_custom_database_is_preserved_without_mode_flag(self):
        with patch.dict(os.environ, {'DATABASE_PATH': 'custom.sqlite3', 'SEED_DEMO': 'false'}, clear=True):
            options = startup_options([])
        self.assertEqual(options['db'], 'custom.sqlite3')
        self.assertFalse(options['seed'])
