"""Fetch official-site favicons for providers that lobe-icons does not cover.

For every provider without a logo we take the doc/base URLs from models.dev,
find the site's declared icon (<link rel="icon">), fall back to /favicon.ico,
then normalise whatever we get into a 48x48 lossy RGBA WebP under icons/.

48px is the right raster size: the UI draws logos at 24px (ProviderMark
size=24), so 48px is its 2x retina rendition. Do not write PNGs here — a PNG
inflates the inlined bundle for no visual gain (icons are inlined as data URLs
by scripts/gen-icons.mjs, which warns if a .png sneaks back in).

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

from PIL import Image, ImageMath, features

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(ROOT, 'icons')
TEMPLATES = os.path.join(ROOT, 'src/client/templates')

ICON_SIZE = 48
WEBP_OPTIONS = {'quality': 90, 'method': 6, 'alpha_quality': 100}

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


def resize_rgba(image, size):
    """LANCZOS downscale to `size` without letting transparent pixels bleed.

    A plain straight-alpha resize averages the colour of fully transparent
    pixels into the visible edge, which shows up as a dark halo on light
    backgrounds (43 of the original 79 favicons had non-black RGB under
    alpha=0). Premultiply by alpha, resize, then divide the alpha back out.
    The multiply/divide run in float ('F') because an 8-bit premultiply loses
    too much precision at the low-alpha edge and re-introduces colour error.
    Pillow-only on purpose: no numpy, so plain `python3` can run this.
    """
    red, green, blue, alpha = image.split()
    alpha_f = alpha.convert('F')
    alpha_small = alpha_f.resize(size, Image.LANCZOS)
    # 0 would divide by zero; those pixels are fully transparent either way
    alpha_safe = alpha_small.convert('L').point(lambda value: value if value else 1).convert('F')
    bands = []
    for channel in (red, green, blue):
        premultiplied = ImageMath.lambda_eval(
            lambda args: args['c'] * args['a'] / 255, c=channel.convert('F'), a=alpha_f
        ).resize(size, Image.LANCZOS)
        straight = ImageMath.lambda_eval(
            lambda args: args['p'] * 255 / args['a'], p=premultiplied, a=alpha_safe
        ).convert('L')
        bands.append(straight)
    return Image.merge('RGBA', (*bands, alpha_small.convert('L')))


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
    width, height = image.size
    scale = min(ICON_SIZE / width, ICON_SIZE / height, 1.0)
    target = (max(1, round(width * scale)), max(1, round(height * scale)))
    scaled = image if target == image.size else resize_rgba(image, target)
    canvas = Image.new('RGBA', (ICON_SIZE, ICON_SIZE), (0, 0, 0, 0))
    canvas.paste(scaled, ((ICON_SIZE - target[0]) // 2, (ICON_SIZE - target[1]) // 2), scaled)
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
            icon.save(os.path.join(ICONS, pid + '.webp'), 'WEBP', **WEBP_OPTIONS)
            stale = os.path.join(ICONS, pid + '.png')
            if os.path.exists(stale):
                os.remove(stale)  # never leave a PNG twin behind
                print(f'  removed stale {pid}.png', flush=True)
            return pid, url
    return pid, None


def missing_icons():
    """Provider ids referenced by the template catalog that have no logo.

    The catalog is split across `src/client/templates/*.js`, one preset per
    line, so a line scan is enough and avoids pulling a JS parser in here.
    """
    entries = []
    for name in sorted(os.listdir(TEMPLATES)):
        if not name.endswith('.js'):
            continue
        with open(os.path.join(TEMPLATES, name), encoding='utf-8') as handle:
            for line in handle:
                pid = re.search(r"\{ id: '([^']+)'", line)
                if pid is None:
                    continue
                entries.append((pid.group(1), re.search(r"icon: '([^']+)'", line) is not None))
    return [pid for pid, has_icon in entries if not has_icon]


def main():
    if not features.check('webp'):
        raise SystemExit(
            'this Pillow has no WebP support (needs libwebp): upgrade Pillow, then rerun. '
            'Do not fall back to PNG — icons are inlined as WebP data URLs.'
        )
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
