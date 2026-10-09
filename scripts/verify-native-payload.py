"""Confirm compiled artifacts contain exactly the freshly built web files."""
import hashlib
import sys
import zipfile
from pathlib import Path

expected = {p.relative_to('www').as_posix(): hashlib.sha256(p.read_bytes()).digest()
            for p in Path('www').rglob('*') if p.is_file()}
for filename in sys.argv[1:]:
    target = Path(filename)
    if target.is_dir():
        actual = {p.relative_to(target / 'public').as_posix(): hashlib.sha256(p.read_bytes()).digest()
                  for p in (target / 'public').rglob('*') if p.is_file()}
    else:
        prefix = 'base/assets/public/' if target.suffix == '.aab' else 'assets/public/'
        with zipfile.ZipFile(target) as archive:
            actual = {n[len(prefix):]: hashlib.sha256(archive.read(n)).digest()
                      for n in archive.namelist() if n.startswith(prefix) and not n.endswith('/')}
    if actual != expected:
        missing = sorted(set(expected) - set(actual))
        extra = sorted(set(actual) - set(expected))
        changed = sorted(k for k in set(actual) & set(expected) if actual[k] != expected[k])
        raise SystemExit(f'{filename}: payload mismatch: missing={missing}, extra={extra}, changed={changed}')
    print(f'{filename}: {len(expected)} packaged web assets match the candidate')
