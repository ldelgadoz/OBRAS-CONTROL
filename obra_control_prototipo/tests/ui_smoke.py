"""Prueba de humo de la interfaz en un Chrome real (abre index.html por file://, como lo hará el usuario).
Uso:  python3 tests/ui_smoke.py        (requiere python3 + playwright + Google Chrome; variable CHROME para otra ruta)"""
import json, os, re, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
URL = 'file://' + ROOT + '/index.html'
EX = os.path.join(ROOT, 'ejemplos')
SHOTS = os.environ.get('SHOTS', '/tmp/shots'); os.makedirs(SHOTS, exist_ok=True)
errors, results = [], []

def check(name, cond, extra=''):
    results.append((name, bool(cond)))
    print(('  OK   ' if cond else '  FALLA ') + name + ((' -> ' + str(extra)) if (not cond and extra != '') else ''))

def data(page):
    return page.evaluate("JSON.parse(localStorage.getItem('obra-control-v2'))")

def new_page(browser, init=None, vw=1280, vh=900):
    ctx = browser.new_context(viewport={'width': vw, 'height': vh}, locale='es-ES', timezone_id='Europe/Madrid', accept_downloads=True)
    if init: ctx.add_init_script(init)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errors.append('console.' + m.type + ': ' + m.text) if m.type == 'error' else None)
    pg.on('dialog', lambda d: d.accept())
    pg.goto(URL)
    return ctx, pg

def goto(pg, name):
    pg.click('#nav button[data-page="%s"]' % name)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), args=['--no-sandbox'])

    print('1. Arranque limpio, navegación y datos de ejemplo')
    ctx, pg = new_page(b)
    check('el panel carga y muestra "Obras activas"', 'Obras activas' in pg.inner_text('#view'))
    check('aviso de datos de ejemplo visible', 'datos de ejemplo' in pg.inner_text('#banners'))
    check('SheetJS local cargado (sin CDN)', pg.evaluate("typeof XLSX !== 'undefined' && XLSX.version"))
    for name in ['obras', 'planning', 'subcontratas', 'compras', 'diario', 'actas', 'agenda', 'datos', 'dashboard']:
        goto(pg, name)
        check('página %s se pinta' % name, len(pg.inner_text('#view')) > 40)
    goto(pg, 'planning')
    check('Gantt de la obra demo con barras', pg.locator('.gbar').count() >= 7, pg.locator('.gbar').count())
    check('línea base y marcador de hoy dibujados', pg.locator('.gbase').count() >= 7)
    pg.screenshot(path=SHOTS + '/01_gantt_demo.png', full_page=False)
    pg.click('button[data-tab="table"]')
    inp = pg.locator('input[data-change="progress"]').nth(2)
    inp.fill('30'); inp.dispatch_event('change')
    d = data(pg)
    check('cambiar avance se guarda en localStorage', [a for a in d['activities'] if a['code'] == '03'][0]['progress'] == 30)
    check('al subir el avance se rellena el inicio real', [a for a in d['activities'] if a['code'] == '03'][0]['actualStart'] != '')
    pg.screenshot(path=SHOTS + '/02_tabla.png')

    print('2. Eliminar datos de ejemplo y crear una obra')
    pg.click('[data-act="remove-demo"]')
    d = data(pg)
    check('datos de ejemplo eliminados', len(d['projects']) == 0 and len(d['activities']) == 0)
    goto(pg, 'obras'); pg.click('.pagehead [data-act="project-new"]')
    pg.fill('input[name="name"]', 'Obra de prueba'); pg.select_option('select[name="type"]', 'Reforma de vivienda')
    pg.click('#modalBody form button.primary')
    check('obra creada', len(data(pg)['projects']) == 1)

    print('3. Importar Excel real (v1) -> línea base')
    goto(pg, 'planning')
    pg.set_input_files('#importFile', EX + '/planning_ejemplo_v1.xlsx')
    pg.wait_for_selector('#modalBody .mapping')
    check('detecta la fila de encabezados (fila 4)', pg.input_value('input[data-change="wz-header"]') == '4', pg.input_value('input[data-change="wz-header"]'))
    maps = pg.evaluate("[...document.querySelectorAll('[data-change=wz-map]')].map(s=>[s.dataset.field, s.selectedOptions[0].textContent])")
    mp = dict(maps)
    check('mapeo automático de columnas', 'Inicio' in mp['start'] and 'Fin' in mp['end'] and 'Capítulo' in mp['name'] and 'Avance' in mp['progress'], mp)
    pg.screenshot(path=SHOTS + '/03_import_paso1.png')
    pg.click('[data-act="wz-next1"]')
    check('paso 2 lista 11 filas', pg.locator('#modalBody tbody tr').count() == 11, pg.locator('#modalBody tbody tr').count())
    pg.screenshot(path=SHOTS + '/04_import_paso2.png')
    pg.click('[data-act="wz-next2"]')
    check('paso 3 anuncia primera importación / versión 1', 'Primera importación' in pg.inner_text('#modalBody'))
    pg.click('[data-act="wz-confirm"]')
    d = data(pg)
    acts = d['activities']
    check('11 actividades creadas con jerarquía', len(acts) == 11 and len([a for a in acts if a['parentId']]) == 8)
    check('versión 1 creada', [v['number'] for v in d['planVersions']] == [1])
    check('Gantt con barras e hito', pg.locator('.gbar').count() == 7 and pg.locator('.gmile').count() >= 1, (pg.locator('.gbar').count(), pg.locator('.gmile').count()))
    check('capítulos dibujados', pg.locator('.gchap').count() == 3)
    pg.screenshot(path=SHOTS + '/05_gantt_v1.png')

    print('4. Seguimiento real + reimportar revisión (v2)')
    pg.click('button[data-tab="table"]')
    row = pg.locator('tr', has_text='Demoliciones y desescombro')
    inp = row.locator('input[data-change="progress"]'); inp.fill('50'); inp.dispatch_event('change')
    pg.click('button[data-act="task-edit"][data-id="%s"]' % [a for a in data(pg)['activities'] if a['name'] == 'Demoliciones y desescombro'][0]['id'])
    pg.fill('textarea[name="notes"]', 'Falta retirar escombro de la sala'); pg.click('#modalBody form button.primary')
    before = [a for a in data(pg)['activities'] if a['name'] == 'Demoliciones y desescombro'][0]
    pg.set_input_files('#importFile', EX + '/planning_ejemplo_v2_revision.xlsx')
    pg.wait_for_selector('#modalBody .mapping'); pg.click('[data-act="wz-next1"]'); pg.click('[data-act="wz-next2"]')
    txt = pg.inner_text('#modalBody')
    check('muestra el resumen de diferencias', '1 nuevas' in txt and '1 no están en el archivo' in txt, txt[:300])
    check('avisa de que no se toca el seguimiento real', 'avance real' in txt and 'no se tocan' in txt)
    check('la actividad que desaparece NO está marcada por defecto', pg.locator('tr', has_text='Climatización').locator('input[type=checkbox]').is_checked() == False)
    pg.screenshot(path=SHOTS + '/06_import_diff.png')
    pg.click('[data-act="wz-confirm"]')
    d = data(pg)
    after = [a for a in d['activities'] if a['name'] == 'Demoliciones y desescombro'][0]
    check('plan actual actualizado (fin 30/11)', after['end'] == '2026-11-30', after['end'])
    check('línea base intacta (fin 25/11)', after['baseEnd'] == '2026-11-25', after['baseEnd'])
    check('avance, observaciones y fechas reales NO se tocan', all(after[k] == before[k] for k in ['progress', 'notes', 'actualStart', 'actualEnd', 'status']) and after['progress'] == 50)
    check('Climatización sigue en el plan (no confirmada su eliminación)', not [a for a in d['activities'] if a['name'] == 'Climatización'][0]['removedFromPlan'])
    check('versión 2 creada y pestaña de versiones visible', [v['number'] for v in d['planVersions']] == [1, 2] and 'v2' in pg.inner_text('#view'))
    check('comparación v1 vs v2 lista cambios', 'Modificada' in pg.inner_text('#view') and 'Añadida' in pg.inner_text('#view'))
    pg.screenshot(path=SHOTS + '/07_versiones.png', full_page=True)
    pg.click('button[data-tab="gantt"]')
    check('Gantt muestra desvío respecto a la base', 'vs base' in pg.inner_text('#view'))
    pg.screenshot(path=SHOTS + '/08_gantt_v2.png')

    print('5. Deshacer la última versión')
    pg.click('button[data-tab="versions"]'); pg.click('[data-act="version-revert"]')
    d = data(pg)
    back = [a for a in d['activities'] if a['name'] == 'Demoliciones y desescombro'][0]
    check('versión 2 deshecha, fechas y seguimiento como antes', [v['number'] for v in d['planVersions']] == [1] and back['end'] == '2026-11-25' and back['progress'] == 50 and back['notes'].startswith('Falta'))

    print('6. Copia de seguridad y restauración')
    goto(pg, 'datos')
    with pg.expect_download() as dl: pg.click('[data-act="download-backup"]')
    path = dl.value.path(); bk = json.load(open(path, encoding='utf-8'))
    check('la copia descargada contiene los datos', bk['app'] == 'obra-control' and len(bk['data']['activities']) == 11)
    check('queda registrada la fecha de la última copia', data(pg)['meta']['lastBackupAt'] != '')
    pg.evaluate("(()=>{const d=JSON.parse(localStorage.getItem('obra-control-v2'));d.activities=[];localStorage.setItem('obra-control-v2',JSON.stringify(d));})()")
    pg.reload(); goto(pg, 'datos')
    pg.set_input_files('#restoreFile', path)
    pg.wait_for_timeout(400)
    check('restaurar devuelve las actividades', len(data(pg)['activities']) == 11)
    pg.click('#nav button[data-page="datos"]')
    pg.set_input_files('#restoreFile', {'name': 'mala.json', 'mimeType': 'application/json', 'buffer': b'{"x":1}'})
    pg.wait_for_timeout(300)
    check('una copia inválida se rechaza sin tocar los datos', len(data(pg)['activities']) == 11 and 'No se puede restaurar' in pg.inner_text('#toast'))
    ctx.close()

    print('7. Datos dañados y migración del prototipo v1')
    ctx, pg = new_page(b, init="localStorage.setItem('obra-control-v2','{\"schema\":2,\"projects\":[')")
    check('datos dañados: aviso y copia conservada', 'No se han podido leer' in pg.inner_text('#banners') and pg.evaluate("Object.keys(localStorage).some(k=>k.startsWith('obra-control-corrupto-'))"))
    ctx.close()
    v1 = json.dumps({"projects": [{"id": "o1", "name": "Mi obra antigua", "client": "", "address": "Alcalá", "start": "2026-11-16", "end": "2027-01-30", "status": "En ejecución"}],
        "tasks": [{"id": "t1", "projectId": "o1", "code": "01", "name": "Albañilería", "start": "2026-11-16", "end": "2026-11-20", "actualStart": "2026-11-16", "actualEnd": "", "progress": 40, "status": "En curso", "notes": "mi nota"}],
        "subs": [], "orders": [], "diary": [], "minutes": []})
    ctx, pg = new_page(b, init="localStorage.setItem('obra-control-v1', %s)" % json.dumps(v1))
    d = data(pg)
    check('migración v1 -> v2 conserva avance y notas', d['activities'][0]['progress'] == 40 and d['activities'][0]['notes'] == 'mi nota')
    check('la copia v1 original sigue intacta', pg.evaluate("localStorage.getItem('obra-control-v1')") == v1)
    check('aviso de migración visible', 'migrado' in pg.inner_text('#banners'))
    ctx.close()

    print('8. Móvil (390 px)')
    ctx, pg = new_page(b, vw=390, vh=800)
    for name in ['dashboard', 'planning', 'obras', 'datos']:
        goto(pg, name)
        ow = pg.evaluate("document.documentElement.scrollWidth - window.innerWidth")
        check('móvil: %s sin desbordamiento horizontal de la página' % name, ow <= 1, ow)
    goto(pg, 'dashboard'); pg.screenshot(path=SHOTS + '/09_movil_panel.png')
    goto(pg, 'planning'); pg.screenshot(path=SHOTS + '/10_movil_planning.png')
    ctx.close(); b.close()

print()
bad = [n for n, ok in results if not ok]
real_errors = [e for e in errors if 'favicon' not in e]
print('Errores de consola/página:', real_errors if real_errors else 'ninguno')
print('%d comprobaciones, %d fallos' % (len(results), len(bad)))
sys.exit(1 if bad or real_errors else 0)
