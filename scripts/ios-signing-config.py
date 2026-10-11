"""Validate a decoded App Store profile and prepare ephemeral signing settings."""
import datetime
import plistlib
import re
import sys
from pathlib import Path


def validate_profile(profile, team, now=None):
    if not re.fullmatch(r'[A-Z0-9]{10}', team):
        raise ValueError('APPLE_TEAM_ID must be a ten-character team identifier')
    if profile.get('TeamIdentifier') != [team]:
        raise ValueError('Provisioning profile belongs to a different Apple team')
    entitlements = profile.get('Entitlements', {})
    if entitlements.get('application-identifier') != team + '.com.blinkstop.app':
        raise ValueError('Profile must use the explicit com.blinkstop.app identifier')
    if entitlements.get('get-task-allow') or profile.get('ProvisionedDevices') or profile.get('ProvisionsAllDevices'):
        raise ValueError('Use an App Store distribution profile, not development, ad hoc or enterprise')
    expiry = profile.get('ExpirationDate')
    now = now or datetime.datetime.now(datetime.timezone.utc)
    if not isinstance(expiry, datetime.datetime):
        raise ValueError('Profile has no valid expiration date')
    if expiry.replace(tzinfo=datetime.timezone.utc) <= now:
        raise ValueError('Provisioning profile has expired')
    uuid = profile.get('UUID', '')
    if not re.fullmatch(r'[A-Fa-f0-9-]{36}', uuid):
        raise ValueError('Profile has no valid UUID')
    return uuid


def prepare(profile_path, team, project_path, export_path):
    profile = plistlib.loads(Path(profile_path).read_bytes())
    uuid = validate_profile(profile, team)
    project = Path(project_path)
    source = project.read_text()
    marker = 'CODE_SIGN_STYLE = Automatic;'
    if source.count(marker) != 2:
        raise ValueError('Unexpected App signing configuration; inspect the project before signing')
    # Override only App target configs, not package/framework targets. Never commit this patch.
    source = source.replace(marker, f'CODE_SIGN_STYLE = Manual;\n\t\t\t\tDEVELOPMENT_TEAM = {team};\n\t\t\t\tCODE_SIGN_IDENTITY = "Apple Distribution";\n\t\t\t\tPROVISIONING_PROFILE_SPECIFIER = "{uuid}";')
    project.write_text(source)
    options = {'method': 'app-store-connect', 'destination': 'export', 'teamID': team,
               'signingStyle': 'manual', 'signingCertificate': 'Apple Distribution',
               'provisioningProfiles': {'com.blinkstop.app': uuid},
               'manageAppVersionAndBuildNumber': False, 'uploadSymbols': False}
    Path(export_path).write_bytes(plistlib.dumps(options))
    return uuid


if __name__ == '__main__':
    try:
        uuid = prepare(*sys.argv[1:])
        print(uuid)  # Runner-private bookkeeping only; no profile/certificate dump.
    except (ValueError, KeyError, plistlib.InvalidFileException) as error:
        raise SystemExit(str(error))
