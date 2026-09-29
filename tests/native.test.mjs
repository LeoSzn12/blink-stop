import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

test('native icon and splash assets are branded PNGs, with adaptive icon safe area', () => {
    const png = path => {
        const data = readFileSync(new URL(`../${path}`, import.meta.url));
        assert.equal(data.subarray(1, 4).toString(), 'PNG', path);
        return { width: data.readUInt32BE(16), height: data.readUInt32BE(20),
            hash: createHash('sha256').update(data).digest('hex') };
    };
    const icon = png('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');
    assert.deepEqual([icon.width, icon.height], [1024, 1024]);
    const splash = png('ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png');
    assert.deepEqual([splash.width, splash.height], [2732, 2732]);
    assert.notEqual(icon.hash, splash.hash);
    const android = png('android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png');
    const foreground = png('android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png');
    assert.deepEqual([android.width, android.height], [192, 192]);
    assert.deepEqual([foreground.width, foreground.height], [432, 432]);
    assert.notEqual(android.hash, foreground.hash);
    const background = readFileSync(new URL('../android/app/src/main/res/values/ic_launcher_background.xml', import.meta.url), 'utf8');
    assert.match(background, /#050917/);
});

test('Android declares camera permission and iOS explains camera use', () => {
    const android = readFileSync(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
    const ios = readFileSync(new URL('../ios/App/App/Info.plist', import.meta.url), 'utf8');
    assert.match(android, /android\.permission\.CAMERA/);
    assert.match(ios, /NSCameraUsageDescription/);
    assert.match(android, /android:allowBackup="false"/);
});
