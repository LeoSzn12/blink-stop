import pathlib
import subprocess
import sys
import tempfile
import unittest
import zipfile

VERIFY = pathlib.Path(__file__).parent.parent / 'scripts/verify-native-payload.py'

class IPAPayloadTests(unittest.TestCase):
    def run_fixture(self, files):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root/'www').mkdir(); (root/'www/index.html').write_text('game')
            with zipfile.ZipFile(root/'candidate.ipa','w') as archive:
                for name, data in files.items(): archive.writestr(name,data)
            return subprocess.run([sys.executable,str(VERIFY),'candidate.ipa'],cwd=root,capture_output=True,text=True)
    def test_accepts_matching_payload_and_only_empty_capacitor_shims(self):
        result = self.run_fixture({'Payload/App.app/public/index.html':'game', 'Payload/App.app/public/cordova.js':''})
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
    def test_rejects_changed_game_and_nonempty_shim(self):
        for files in [{'Payload/App.app/public/index.html':'changed'}, {'Payload/App.app/public/index.html':'game','Payload/App.app/public/cordova.js':'injected'}]:
            self.assertNotEqual(self.run_fixture(files).returncode,0)
    def test_rejects_missing_or_multiple_app_payloads(self):
        for files in [{'Payload/App.app/Info.plist':'not a web payload'}, {'Payload/One.app/public/index.html':'game','Payload/Two.app/public/index.html':'game'}]:
            self.assertNotEqual(self.run_fixture(files).returncode,0)

if __name__ == '__main__': unittest.main()
