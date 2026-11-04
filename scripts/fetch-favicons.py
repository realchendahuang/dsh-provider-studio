"""Fetch official-site favicons for providers that lobe-icons does not cover.

For every provider without a logo we take the doc/base URLs from models.dev,
find the site's declared icon (<link rel="icon">), fall back to /favicon.ico,
then normalise whatever we get into a 64x64 RGBA PNG under icons/.

Usage: python3 scripts/fetch-favicons.py
"""

import concurrent.futures
import io
import json
import os
import re
import ssl
import sys
import urllib.parse
import urllib.request

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(ROOT, 'icons')
OUT = os.path.join(ROOT, 'src/client/templates.js')

UA = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
                  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Accept': 'image/avif,image/webp,image/png,image/svg+xml,image/*,*/*;q=0.8',
}
CTX = ssl._create_unverified_context()
LIMIT = 2_000_000


def fetch(url, timeout=8):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout, context=CTX) as resp:
        data = resp.read(LIMIT + 1)
        if len(data) > LIMIT:
            return None, ''
        return data, (resp.headers.get('content-type') or '')


def candidate_hosts(doc, base):
    hosts = []
    for url in (doc, base):
        if not url:
            continue
        try:
            host = urllib.parse.urlparse(url).netloc.lower().split(':')[0]
        except ValueError:
            continue
        if not host:
            continue
        for prefix in ('docs.', 'doc.', 'www.', 'api.', 'api-', 'tinker-docs.', 'tinker.', 'developers.'):
            if host.startswith(prefix):
                hosts.append(host[len(prefix):])
                break
        hosts.append(host)
    out = []
    for host in hosts:
        if host and host not in out:
            out.append(host)
    return out


def declared_icon(host):
    for scheme in ('https', 'http'):
        try:
            data, ctype = fetch(f'{scheme}://{host}/')
        except Exception:
            continue
        if 'html' not in ctype:
            continue
        text = data.decode('utf-8', 'replace')
        for match in re.finditer(r'<link[^>]+>', text, re.I):
            tag = match.group(0)
            if not re.search(r'rel="[^"]*icon', tag, re.I):
                continue
            href = re.search(r'href="([^"]+)"', tag)
            if href:
                return urllib.parse.urljoin(f'{scheme}://{host}/', href.group(1))
    return None


def normalise(data):
    image = Image.open(io.BytesIO(data))
    if getattr(image, 'n_frames', 1) > 1:
        best = None
        for index in range(image.n_frames):
            image.seek(index)
            if best is None or image.size[0] > best[0]:
                best = (image.size[0], image.copy())
        image = best[1]
    image = image.convert('RGBA')
    if min(image.size) < 24:
        return None
    colours = image.convert('RGB').getcolors(maxcolors=256)
    if colours is None or len(colours) < 4:
        return None  # blank or single-colour placeholder
    image.thumbnail((64, 64), Image.LANCZOS)
    canvas = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    canvas.paste(image, ((64 - image.size[0]) // 2, (64 - image.size[1]) // 2), image)
    return canvas


def work(item):
    pid, doc, base = item
    for host in candidate_hosts(doc, base):
        urls = []
        href = declared_icon(host)
        if href:
            urls.append(href)
        urls += [f'https://{host}/favicon.ico', f'https://{host}/apple-touch-icon.png']
        for url in urls:
            try:
                data, _ = fetch(url)
            except Exception:
                continue
            if not data:
                continue
            try:
                icon = normalise(data)
            except Exception:
                continue
            if icon is None:
                continue
            icon.save(os.path.join(ICONS, pid + '.png'))
            return pid, url
    return pid, None


def missing_icons():
    """Provider ids referenced by templates.js that currently have no logo."""
    source = open(OUT, encoding='utf-8').read()
    entries = []
    for block in re.finditer(r'  \{\n(.*?)\n  \},', source, re.S):
        body = block.group(1)
        pid = re.search(r"id: '([^']+)'", body)
        if not pid:
            continue
        has_icon = re.search(r"icon: '([^']+)'", body) is not None
        entries.append((pid.group(1), has_icon))
    return [pid for pid, has_icon in entries if not has_icon]


def main():
    providers = json.load(open('/tmp/providers.json'))
    md = json.load(open('/tmp/models-dev.json'))
    todo = []
    for pid in missing_icons():
        info = providers.get(pid) or {}
        doc = (md.get(pid) or {}).get('doc') or ''
        base = info.get('baseURL') or (md.get(pid) or {}).get('api') or ''
        todo.append((pid, doc, base))
    print(f'providers to try: {len(todo)}', flush=True)

    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        futures = {pool.submit(work, item): item for item in todo}
        for index, future in enumerate(concurrent.futures.as_completed(futures), 1):
            try:
                results.append(future.result())
            except Exception as exc:  # pragma: no cover - defensive
                results.append((futures[future][0], None))
            if index % 20 == 0:
                ok = sum(1 for _pid, url in results if url)
                print(f'  {index}/{len(todo)} done, icons found: {ok}', flush=True)

    found = {pid: url for pid, url in results if url}
    failed = [pid for pid, url in results if not url]
    json.dump({'found': found, 'failed': failed}, open('/tmp/favicons.json', 'w'), indent=1)
    print(f'\nfound: {len(found)}  failed: {len(failed)}')
    print('failed:', ', '.join(failed[:40]))
    return 0


if __name__ == '__main__':
    sys.exit(main())
