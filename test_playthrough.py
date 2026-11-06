"""End-to-end game check using the actual HTML/CSS/JS in a sandboxed Chromium.

In this runner's environment, direct http: and file: navigation is blocked by
browser policy, so files are injected into an about:blank document and a small
localStorage adapter is used to validate save/resume logic. Run using:
python3 tests/test_playthrough.py
"""
from pathlib import Path
from itertools import permutations
import base64
import json
import re
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / 'tests' / 'screenshots'
SHOTS.mkdir(parents=True, exist_ok=True)
HTML = (ROOT/'index.html').read_text(encoding='utf-8')
CSS = (ROOT/'styles.css').read_text(encoding='utf-8')
CSS = re.sub(r'@import url\(.*?\);', '', CSS, count=1)
IMG = base64.b64encode((ROOT/'assets/library-scene.webp').read_bytes()).decode()
CSS = CSS.replace("url('assets/library-scene.webp')", "url('data:image/webp;base64," + IMG + "')")
HTML = re.sub(r'<link rel="stylesheet"[^>]*>', '', HTML)
HTML = re.sub(r'<script defer[^>]*></script>', '', HTML)
HTML = HTML.replace('</head>', '<style>' + CSS + '</style></head>')
DATA_JS = (ROOT/'js/data.js').read_text(encoding='utf-8')
APP_JS = (ROOT/'js/app.js').read_text(encoding='utf-8')


def boot(page, data=None):
    page.set_content(HTML, wait_until='domcontentloaded')
    storage_js = (
        'const __testStorage=' + json.dumps(data or {}, ensure_ascii=False) + ';'
        "Object.defineProperty(window,'localStorage',{configurable:true,value:{"
        '__data:__testStorage,'
        'getItem(k){return this.__data[k]??null},'
        'setItem(k,v){this.__data[k]=String(v)},'
        'removeItem(k){delete this.__data[k]}'
        '}});'
    )
    page.add_script_tag(content=storage_js)
    page.add_script_tag(content=DATA_JS)
    page.add_script_tag(content=APP_JS)
    page.wait_for_selector('.scene-card')


def snapshot(page):
    return page.evaluate('localStorage.__data')


def click(page, action, ident=None):
    selector = f'[data-action="{action}"]' + (f'[data-id="{ident}"]' if ident else '')
    page.locator(selector + ':visible').first.click()


def view(page, zone):
    page.locator(f'.view-tab[data-view="{zone}"]').click()


def open_puzzle(page, ident, zone=None):
    if zone is not None:
        view(page, zone)
    click(page, 'open-puzzle', ident)
    assert page.get_by_role('dialog').count() == 1


def close_puzzle(page):
    page.locator('[data-action="close"]').last.click()


def assert_solved(page):
    assert '仕掛けを解決した' in page.get_by_role('dialog').inner_text()
    close_puzzle(page)


def solve_books(page):
    open_puzzle(page, 'books', 0)
    for name in ['星', '花', '鍵', '月']:
        click(page, 'add-book', name)
    click(page, 'check-books')
    assert_solved(page)


def solve_seal(page):
    open_puzzle(page, 'seal', 0)
    for name in ['円', '三角形', '四角形', '五角形']:
        click(page, 'add-seal', name)
    click(page, 'check-seal')
    assert_solved(page)


def solve_scraps(page):
    open_puzzle(page, 'scraps', 0)
    page.screenshot(path=str(SHOTS/'05_scraps.png'), full_page=True)
    for a, b in [(0, 2), (2, 3)]:
        page.locator(f'[data-action="scrap-swap"][data-position="{a}"]').click()
        page.locator(f'[data-action="scrap-swap"][data-position="{b}"]').click()
    click(page, 'check-scraps')
    assert_solved(page)


def solve_mirror(page):
    click(page, 'item', 'mirror')
    open_puzzle(page, 'mirror', 1)
    click(page, 'use-mirror')
    page.locator('#mirror-form input[name="answer"]').fill('カゲ')
    page.locator('#mirror-form button[type="submit"]').click()
    assert_solved(page)


def solve_glass(page):
    open_puzzle(page, 'glass', 2)
    page.screenshot(path=str(SHOTS/'06_glass.png'), full_page=True)
    for i, n in enumerate([2, 3, 1, 3]):
        for _ in range(n):
            page.locator(f'[data-action="rotate-glass"][data-index="{i}"]').click()
    click(page, 'check-glass')
    assert_solved(page)


def solve_star(page):
    click(page, 'item', 'chart')
    open_puzzle(page, 'star', 1)
    click(page, 'place-chart')
    for _ in range(3):
        click(page, 'rotate-star')
    click(page, 'check-star')
    assert_solved(page)


def solve_beam(page):
    click(page, 'item', 'lens')
    open_puzzle(page, 'beam', 1)
    page.screenshot(path=str(SHOTS/'07_beam.png'), full_page=True)
    click(page, 'place-lens')
    click(page, 'rotate-beam-a')
    click(page, 'rotate-beam-b')
    click(page, 'check-beam')
    assert_solved(page)


def solve_door(page):
    open_puzzle(page, 'door', 2)
    page.locator('#door-form input').fill('ひらけ')
    page.locator('#door-form button[type="submit"]').click()
    assert '第1世界 脱出成功' in page.get_by_role('dialog').inner_text()
    assert '8 / 8' in page.locator('.topbar').inner_text()


# All possible orders that meet the book clues: exactly one.
valid_orders=[p for p in permutations(['星','花','鍵','月']) if p[3]=='月' and p.index('花')+1==p.index('鍵') and p.index('星')<p.index('花')]
assert valid_orders==[('星','花','鍵','月')], valid_orders

with sync_playwright() as pw:
    chromium_exe = '/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None
    browser = pw.chromium.launch(headless=True, executable_path=chromium_exe, args=['--no-sandbox'])
    desktop = browser.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
    page = desktop.new_page()
    page.set_default_timeout(6000)
    errors = []
    page.on('pageerror', lambda exc: errors.append(str(exc)))
    boot(page)
    page.screenshot(path=str(SHOTS/'00_intro.png'), full_page=True)
    click(page, 'start')
    assert '0 / 8' in page.locator('.topbar').inner_text()
    open_puzzle(page, 'books', 0)
    for name in ['鍵', '月', '花', '星']:
        click(page, 'add-book', name)
    click(page, 'check-books')
    assert 'まだ並びが違う' in page.get_by_role('dialog').inner_text()
    click(page, 'hint', 'books')
    assert 'ヒント 1' in page.get_by_role('dialog').inner_text()
    assert '0 / 8' in page.locator('.topbar').inner_text()
    click(page, 'reset-books')
    close_puzzle(page)
    solve_books(page)
    solve_seal(page)
    click(page,'notes')
    page.locator('#personal-note').fill('星図に注目する')
    close_puzzle(page)
    store = snapshot(page)
    page.close()
    page = desktop.new_page()
    page.on('pageerror', lambda exc: errors.append(str(exc)))
    boot(page, store)
    assert '2 / 8' in page.locator('.topbar').inner_text()
    assert page.evaluate('state.personalNote') == '星図に注目する'
    assert page.evaluate('state.hints.books') == 1
    assert page.get_by_role('dialog').count() == 1
    click(page, 'start')
    solve_scraps(page)
    solve_mirror(page)
    solve_glass(page)
    page.screenshot(path=str(SHOTS/'01_midgame.png'), full_page=True)
    solve_star(page)
    solve_beam(page)
    beam_routes=page.evaluate("""() => { const originalA=state.puzzle.beamA,originalB=state.puzzle.beamB;const combinations=[];for(const a of ['/', String.fromCharCode(92)])for(const b of ['/', String.fromCharCode(92)]){state.puzzle.beamA=a;state.puzzle.beamB=b;if(traceBeam().reached)combinations.push([a,b])}state.puzzle.beamA=originalA;state.puzzle.beamB=originalB;return combinations }""")
    assert beam_routes==[['/','/']],beam_routes
    open_puzzle(page, 'door', 2)
    page.screenshot(path=str(SHOTS/'02_big_puzzle.png'), full_page=True)
    close_puzzle(page)
    solve_door(page)
    page.screenshot(path=str(SHOTS/'03_clear.png'), full_page=True)
    store = snapshot(page)
    page.close()
    page = desktop.new_page()
    page.on('pageerror', lambda exc: errors.append(str(exc)))
    boot(page, store)
    assert '第1世界 脱出成功' in page.get_by_role('dialog').inner_text()
    assert not errors, errors
    desktop.close()

    mobile = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1, is_mobile=True, has_touch=True)
    mob = mobile.new_page()
    mob.set_default_timeout(6000)
    boot(mob)
    click(mob, 'start')
    mob.screenshot(path=str(SHOTS/'04_mobile.png'), full_page=True)
    assert mob.locator('.location-strip [data-action="open-puzzle"]').count() == 3
    open_puzzle(mob, 'books', 0)
    assert mob.get_by_role('dialog').count() == 1
    assert mob.locator('body').evaluate('(el) => el.scrollWidth <= window.innerWidth + 2')
    mobile.close()
    browser.close()
print('PASS: all 8 puzzles, wrong answer rejection, reload/resume, persistent results, desktop/mobile, no JS errors')
