import copy
import datetime
import importlib.util
from pathlib import Path
import plistlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('signing', Path(__file__).parent.parent / 'scripts/ios-signing-config.py')
signing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(signing)

class SigningProfileTests(unittest.TestCase):
    def setUp(self):
        self.team = 'ABCD123456'
        self.now = datetime.datetime.now(datetime.timezone.utc)
        self.profile = {'TeamIdentifier': [self.team], 'UUID': '12345678-1234-1234-1234-123456789ABC',
            'ExpirationDate': (self.now + datetime.timedelta(days=365)).replace(tzinfo=None),
            'Entitlements': {'application-identifier': self.team + '.com.blinkstop.app', 'get-task-allow': False}}
    def test_rejects_wrong_team_or_app(self):
        for change in [{'TeamIdentifier':['OTHER12345']}, {'Entitlements':{'application-identifier':self.team+'.another.app'}}]:
            value = copy.deepcopy(self.profile); value.update(change)
            with self.assertRaises(ValueError): signing.validate_profile(value, self.team, self.now)
    def test_rejects_non_store_or_expired_profile(self):
        for change in [{'ProvisionedDevices':['device']}, {'ProvisionsAllDevices':True}, {'ExpirationDate':datetime.datetime(2025,1,1)}, {'Entitlements':{'application-identifier':self.team+'.com.blinkstop.app','get-task-allow':True}}]:
            value = copy.deepcopy(self.profile); value.update(change)
            with self.assertRaises(ValueError): signing.validate_profile(value, self.team, self.now)
    def test_store_profile_only_patches_app_and_keeps_upload_separate(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            profile = root/'profile.plist'; profile.write_bytes(plistlib.dumps(self.profile))
            project = root/'project.pbxproj'; project.write_text('App Debug: CODE_SIGN_STYLE = Automatic;\nApp Release: CODE_SIGN_STYLE = Automatic;\nFramework: CODE_SIGNING_ALLOWED = NO;')
            export = root/'ExportOptions.plist'
            signing.prepare(profile, self.team, project, export)
            settings = plistlib.loads(export.read_bytes())
            self.assertEqual(settings['destination'], 'export')
            self.assertEqual(settings['provisioningProfiles'], {'com.blinkstop.app':self.profile['UUID']})
            self.assertIn('Framework: CODE_SIGNING_ALLOWED = NO;', project.read_text())
            self.assertEqual(project.read_text().count('CODE_SIGN_STYLE = Manual;'), 2)
    def test_unexpected_project_shape_is_untouched(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            profile = root/'profile.plist'; profile.write_bytes(plistlib.dumps(self.profile))
            project = root/'project.pbxproj'; project.write_text('changed project')
            with self.assertRaises(ValueError): signing.prepare(profile, self.team, project, root/'export.plist')
            self.assertEqual(project.read_text(), 'changed project')

if __name__ == '__main__': unittest.main()
