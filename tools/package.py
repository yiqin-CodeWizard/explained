"""Validate local extension resources, mirror CSS, and create a deterministic ZIP."""
from pathlib import Path
import json
import zipfile
import hashlib

root = Path(__file__).resolve().parents[1]
source = root / 'explained-extension'
css = (source / 'reader.css').read_text()
(source / 'reader-styles.js').write_text('globalThis.ExplainedReaderCSS = ' + json.dumps(css) + ';\n')
manifest = json.loads((source / 'manifest.json').read_text())
resources = [manifest['background']['service_worker'], manifest['action']['default_popup']]
resources.extend(manifest['icons'].values())
for entry in manifest['content_scripts']:
    resources.extend(entry['js'])
for resource in resources:
    if not (source / resource).is_file():
        raise SystemExit(f'Missing manifest resource: {resource}')
destination = root / f"explained-v{manifest['version']}.zip"
with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(source.rglob('*')):
        if not file.is_file() or file.name.startswith('.'):
            continue
        info = zipfile.ZipInfo(file.relative_to(root).as_posix(), (2026, 10, 21, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, file.read_bytes())
    for name in ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'PRIVACY.md']:
        info = zipfile.ZipInfo(f'explained-extension/{name}', (2026, 10, 21, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, (root / name).read_bytes())
checksum = hashlib.sha256(destination.read_bytes()).hexdigest()
destination.with_suffix('.zip.sha256').write_text(f'{checksum}  {destination.name}\n')
print(f'Packaged {destination.name} ({destination.stat().st_size:,} bytes)')
