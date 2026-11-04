"""Build the independent API edition, with manifest.json at ZIP root."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parents[1]
source = root / 'extension-wasm-offline'
manifest = json.loads((source / 'manifest.json').read_text())
if manifest['name'] != 'extension-wasm-offline':
    raise SystemExit('Unexpected extension name.')
resources = [manifest['background']['service_worker'], manifest['action']['default_popup'],
             'api-client.js', 'popup.js', 'popup.css', 'welcome.html', 'welcome.js', 'welcome.css',
             'shared.js', 'reader.css', 'reader-styles.js', 'privacy.html', 'THIRD_PARTY_NOTICES.md', 'PRIVACY.md']
resources.extend(manifest['icons'].values())
resources.extend(manifest['action']['default_icon'].values())
for entry in manifest['content_scripts']:
    resources.extend(entry['js'])
for resource in resources:
    if not (source / resource).is_file():
        raise SystemExit(f'Missing resource: {resource}')
css = (source / 'reader.css').read_text()
embedded = (source / 'reader-styles.js').read_text().removeprefix('globalThis.ExplainedReaderCSS = ').strip().removesuffix(';')
if json.loads(embedded) != css:
    raise SystemExit('Embedded reader stylesheet is out of date.')
for removed in ['solver', 'website-bridge.js', 'direct-client.js', 'stream-decoder.js']:
    if (source / removed).exists():
        raise SystemExit(f'Obsolete website component remains: {removed}')
destination = root / f"extension-wasm-offline-v{manifest['version']}.zip"
with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(source.rglob('*')):
        if not file.is_file() or any(part.startswith('.') or part == '__pycache__' for part in file.relative_to(source).parts):
            continue
        info = zipfile.ZipInfo(file.relative_to(source).as_posix(), (2026, 10, 27, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, file.read_bytes())
checksum = hashlib.sha256(destination.read_bytes()).hexdigest()
destination.with_suffix('.zip.sha256').write_text(f'{checksum}  {destination.name}\n')
print(f'Packaged {destination.name} ({destination.stat().st_size:,} bytes); manifest.json is at ZIP root.')
