"""Package only the independent yellow-theme copy; never write to the original."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parents[1]
source = root / 'explained-extension-yellow'
manifest = json.loads((source / 'manifest.json').read_text())
if manifest['name'] != 'Explained Yellow':
    raise SystemExit('Expected the independent Explained Yellow source directory.')

css = (source / 'reader.css').read_text()
(source / 'reader-styles.js').write_text('globalThis.ExplainedReaderCSS = ' + json.dumps(css) + ';\n')
resources = [manifest['background']['service_worker'], manifest['action']['default_popup'],
             'welcome.html', 'welcome.css', 'welcome.js', 'reader.css', 'reader-styles.js']
resources.extend(manifest['icons'].values())
resources.extend(manifest['action']['default_icon'].values())
for entry in manifest['content_scripts']:
    resources.extend(entry['js'])
for resource in resources:
    if not (source / resource).is_file():
        raise SystemExit(f'Missing yellow-copy resource: {resource}')

destination = root / f"explained-yellow-v{manifest['version']}.zip"
with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(source.rglob('*')):
        if not file.is_file() or file.name.startswith('.'):
            continue
        info = zipfile.ZipInfo(file.relative_to(root).as_posix(), (2026, 10, 22, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, file.read_bytes())
checksum = hashlib.sha256(destination.read_bytes()).hexdigest()
destination.with_suffix('.zip.sha256').write_text(f'{checksum}  {destination.name}\n')
print(f'Packaged {destination.name} ({destination.stat().st_size:,} bytes)')
