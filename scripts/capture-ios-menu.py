"""Capture the actual native menu on App Store-sized iPhone/iPad simulators.

Run on the Xcode build runner after verifying the simulator app's web payload.
No camera, synthetic gameplay results, account credentials, or app data are used.
"""
import hashlib
import json
import struct
import subprocess
import sys
import time
from pathlib import Path


def run(*args, timeout=180):
    return subprocess.check_output(args, text=True, timeout=timeout).strip()


def sim(*args, timeout=180):
    return run('xcrun', 'simctl', *args, timeout=timeout)


def capture(app, output):
    runtimes = json.loads(sim('list', 'runtimes', '--json'))['runtimes']
    available = [r for r in runtimes if r.get('isAvailable') and r['name'].startswith('iOS ')]
    if not available:
        raise SystemExit('An available iOS simulator runtime is required')
    runtime = max(available, key=lambda r: tuple(map(int, r['version'].split('.'))))
    types = json.loads(sim('list', 'devicetypes', '--json'))['devicetypes']
    phone = next((d for d in types if d['name'] == 'iPhone 16 Pro'), None)
    tablet = next((d for d in types if d['name'].startswith('iPad Pro 13-inch (M4)')), None)
    if not phone or not tablet:
        raise SystemExit('iPhone 16 Pro and iPad Pro 13-inch (M4) device types are required')
    output.mkdir(parents=True, exist_ok=True)
    manifest = {
        'commit': run('git', 'rev-parse', 'HEAD'),
        'runtime': runtime['identifier'],
        'scene': 'Native app main menu; camera has not been requested',
        'captures': [],
    }
    for label, device, sizes in [
        ('iphone-menu', phone, {(1206, 2622), (1179, 2556)}),
        ('ipad-menu', tablet, {(2064, 2752), (2048, 2732)}),
    ]:
        identifier = sim('create', f'Blink Stop {label}', device['identifier'], runtime['identifier'])
        try:
            sim('boot', identifier)
            sim('bootstatus', identifier, '-b', timeout=240)
            sim('status_bar', identifier, 'override', '--time', '9:41',
                '--batteryState', 'charged', '--batteryLevel', '100')
            sim('install', identifier, str(app))
            sim('launch', identifier, 'com.blinkstop.app')
            # Allow WKWebView to load the bundled menu before taking a screenshot.
            time.sleep(12)
            target = output / f'{label}.png'
            sim('io', identifier, 'screenshot', '--type=png', str(target))
            data = target.read_bytes()
            if data[:8] != b'\x89PNG\r\n\x1a\n':
                raise SystemExit(f'{label}: simulator did not produce a PNG')
            dimensions = struct.unpack('>II', data[16:24])
            if dimensions not in sizes:
                raise SystemExit(f'{label}: unexpected screenshot dimensions {dimensions}')
            manifest['captures'].append({
                'file': target.name,
                'device': device['name'],
                'dimensions': dimensions,
                'sha256': hashlib.sha256(data).hexdigest(),
            })
            print(f'{label}: {device["name"]}, {dimensions}', flush=True)
        finally:
            subprocess.run(['xcrun', 'simctl', 'shutdown', identifier], check=False, timeout=60)
            subprocess.run(['xcrun', 'simctl', 'delete', identifier], check=False, timeout=60)
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')


if __name__ == '__main__':
    capture(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve())
