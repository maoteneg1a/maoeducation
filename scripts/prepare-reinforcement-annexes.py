"""Prepara los anexos desde el Word original, conservando sus partes y formato.

Uso: python3 scripts/prepare-reinforcement-annexes.py (requiere lxml).
Marca espacios de datos e identidad institucional; conserva instrucciones, normativa y estilos.
"""
from copy import deepcopy
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib
import json
import re
from lxml import etree as E

ROOT = Path(__file__).resolve().parents[1] / 'apps/api/assets/reinforcement-annexes'
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
W = '{' + NS['w'] + '}'
SOURCE = ROOT / 'original.docx'
STARTS = [0, 11, 37, 63, 77, 85]
manifest = {'sourceSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
    'branding': {'headerParts': ['word/header1.xml'], 'logoParts': ['word/media/image1.png', 'word/media/image10.png'],
        'headerRelationships': 'word/_rels/header1.xml.rels', 'logoRelationshipIds': ['rId1', 'rId2']}, 'annexes': {}}

def text(node):
    return ''.join(node.xpath('.//w:t/text()', namespaces=NS))

def replace(node, old, key, defaults):
    """Reemplaza incluso textos partidos entre runs, conservando todos sus rPr."""
    nodes = node.findall('.//w:t', NS)
    full = ''.join(n.text or '' for n in nodes)
    start = full.find(old)
    if start < 0:
        raise ValueError((key, old, full))
    end, offset = start + len(old), 0
    part = 0
    for n in nodes:
        value = n.text or ''
        a, b = max(start - offset, 0), min(end - offset, len(value))
        if a < b:
            token = key if part == 0 else key + '__part' + str(part)
            defaults[token] = value[a:b]
            n.text = value[:a] + '{{' + token + '}}' + value[b:]
            n.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
            part += 1
        offset += len(value)

def blank(node, key, defaults, pattern=r'[_…\.\-]{3,}'):
    match = re.search(pattern, text(node))
    if not match:
        raise ValueError((key, text(node)))
    replace(node, match.group(), key, defaults)

def append(node, key, defaults):
    p = node if node.tag == W + 'p' else node.findall('.//w:p', NS)[0]
    run = E.Element(W + 'r', nsmap=p.nsmap)
    style = p.find('w:pPr/w:rPr', NS)
    if style is not None:
        run.append(deepcopy(style))
    t = E.SubElement(run, W + 't')
    t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
    t.text = '{{' + key + '}}'
    defaults[key] = ''
    appends[key] = E.tostring(run, encoding='unicode', with_tail=False)
    p.append(E.Comment('APPEND:' + key))

def repeat(table, rows, name, columns, defaults, groups):
    prototypes = []
    for ri, row in enumerate(rows):
        row = deepcopy(row)
        cells = row.findall('w:tc', NS)
        for ci, key in columns.items():
            if key == 'row_no':
                replace(cells[ci], text(cells[ci]), key, defaults)
            else:
                append(cells[ci], key, defaults)
        prototypes.append(E.tostring(row, encoding='unicode', with_tail=False))
    position = table.index(rows[0])
    for row in rows:
        table.remove(row)
    table.insert(position, E.Comment('REPEAT:' + name))
    groups[name] = {'minimumRows': len(rows), 'rows': prototypes}

with ZipFile(SOURCE) as source:
    original = E.fromstring(source.read('word/document.xml'))
    original_body = original.find('w:body', NS)
    for annex in range(1, 6):
        defaults, groups, appends = {}, {}, {}
        root = deepcopy(original)
        body = root.find('w:body', NS)
        for child in list(body):
            body.remove(child)
        selected = {}
        for index in range(STARTS[annex - 1], STARTS[annex]):
            selected[index] = deepcopy(original_body[index])
            body.append(selected[index])
        # Los párrafos vacíos que separaban este anexo del siguiente no crean hojas adicionales.
        while len(body) and not text(body[-1]).strip() and not body[-1].findall('.//w:drawing', NS):
            body.remove(body[-1])
        body.append(deepcopy(original_body[-1]))
        p = selected
        # El nombre impreso en el cuerpo también pertenece a la institución activa.
        for node in selected.values():
            for printed_name in ['Escuela de Educación Básica “Panamá”', 'INSTITUCIÓN EDUCATIVA “PANAMÁ”']:
                if printed_name in text(node):
                    replace(node, printed_name, 'institution_name', defaults)
        header = E.fromstring(source.read('word/header1.xml'))
        replace(header, 'ESCUELA DE EDUCACIÓN básica “PANAMÁ”', 'header_institution', defaults)
        replace(header, 'SUBDIRECCIÓN DE LA ESCUELA PANAMÁ', 'header_department', defaults)
        replace(header, '2026-2027', 'header_academic_year', defaults)
        if annex == 1:
            replace(p[2], '2026–2027', 'academic_year', defaults)
            replace(p[4], '☐', 'jornada_matutina', defaults)
            replace(p[4], '☐', 'jornada_vespertina', defaults)
            for key in ['grade', 'parallel', 'tutor']:
                blank(p[4], key, defaults)
            blank(p[5], 'subject', defaults)
            replace(p[5], '____ / ____ / ______', 'date', defaults)
            append(p[5], 'period', defaults)
            blank(p[6], 'acta', defaults)
            for key in ['day', 'month', 'year', 'teacher', 'grade_narrative']:
                blank(p[7], key, defaults)
            rows = p[10].findall('w:tr', NS)
            repeat(p[10], rows[1:8], 'roster', {0: 'row_no', 1: 'row_name', 2: 'row_result'}, defaults, groups)
            cells = rows[8].findall('w:tc', NS)
            blank(cells[0], 'teacher_signature', defaults)
            blank(cells[1], 'authority', defaults)
        if annex == 2:
            for key in ['guardian', 'student', 'grade', 'jornada', 'academic_year']:
                blank(p[14], key, defaults)
            rows = p[30].findall('w:tr', NS)
            repeat(p[30], rows[1:], 'schedule', {0: 'row_subject', 1: 'row_days', 2: 'row_hours'}, defaults, groups)
            blank(p[32], 'place_date', defaults)
        if annex == 3:
            for index, key in [(40, 'student'), (43, 'subject'), (49, 'schedule'), (50, 'duration'), (51, 'start_date')]:
                append(p[index], key, defaults)
            # Estos renglones carecen de subrayado en el original; se insertan datos tras cada etiqueta.
            replace(p[41], 'Grado o Curso:      Paralelo:    ', 'grade_parallel', defaults)
            replace(p[42], 'Tutor/a:                                              Profesor/a de refuerzo:   ', 'tutor_teacher', defaults)
            blank(p[45], 'inside_mark', defaults, r'\(\s+\)')
            blank(p[45], 'inside_group', defaults, r'\(\s+\)')
            blank(p[46], 'inside_individual', defaults, r'\(\s+\)')
            blank(p[47], 'outside_mark', defaults, r'\(\s+\)')
            blank(p[47], 'outside_group', defaults, r'\(\s+\)')
            blank(p[48], 'outside_individual', defaults, r'\(\s+\)')
            blank(p[53], 'objective', defaults)
            rows = p[54].findall('w:tr', NS)
            for row, prefix in zip(rows[1:], ['lengua', 'matematica']):
                for cell, suffix in zip(row.findall('w:tc', NS), ['competencia', 'indicador', 'saberes', 'estrategias', 'recursos', 'evaluacion']):
                    append(cell, prefix + '_' + suffix, defaults)
            blank(p[57], 'observations', defaults)
        if annex == 4:
            paras = p[66].findall('.//w:p', NS)
            for index, key in [(1, 'institution'), (2, 'student')]:
                blank(paras[index], key, defaults)
            for key in ['grade', 'parallel']:
                blank(paras[3], key, defaults)
            for key in ['tutor', 'reinforcement_teacher']:
                blank(paras[4], key, defaults)
            blank(paras[5], 'attended', defaults)
            blank(paras[6], 'subject', defaults)
            for index, key in [(8, 'achievements'), (10, 'difficulties'), (12, 'suggestions')]:
                blank(paras[index], key, defaults)
            rows = p[70].findall('w:tr', NS)
            repeat(p[70], rows[1:], 'progress', {0: 'row_indicator', 1: 'row_learning', 2: 'row_before', 3: 'row_after'}, defaults, groups)
            blank(p[72], 'place_date', defaults)
        if annex == 5:
            rows = p[78].findall('w:tr', NS)
            for cell, key in zip(rows[1].findall('w:tc', NS), ['subject', 'grade', 'academic_year']):
                if key == 'academic_year': replace(cell, '2026- 2027', key, defaults)
                else: append(cell, key, defaults)
            for cell, key in zip(rows[2].findall('w:tc', NS), ['teacher', 'period']):
                append(cell, key, defaults)
            rows = p[80].findall('w:tr', NS)
            for i, cell in enumerate(rows[1].findall('w:tc', NS)[2:-1]):
                append(cell, f'date_{i}', defaults)
            repeat(p[80], rows[2:12], 'attendance', {0: 'row_no', 1: 'row_name', **{i + 2: f'row_att_{i}' for i in range(8)}}, defaults, groups)
            append(rows[12].find('w:tc', NS), 'observations', defaults)

        # Nunca se usa la identidad ni el año de la escuela del documento fuente como fallback.
        for key in defaults:
            base = key.split('__part')[0]
            if base in ['institution_name', 'header_institution', 'header_academic_year', 'header_department'] or (base == 'academic_year' and annex in [1, 5]):
                defaults[key] = '' if '__part' in key else ('SUBDIRECCIÓN' if key == 'header_department' else '________________')
        xml = E.tostring(root, encoding='UTF-8', xml_declaration=True, standalone=True)
        header_xml = E.tostring(header, encoding='UTF-8', xml_declaration=True, standalone=True)
        with ZipFile(ROOT / f'annex-{annex}.docx', 'w', ZIP_DEFLATED) as output:
            for entry in source.infolist():
                payload = xml if entry.filename == 'word/document.xml' else header_xml if entry.filename == 'word/header1.xml' else source.read(entry.filename)
                output.writestr(deepcopy(entry), payload)
        manifest['annexes'][str(annex)] = {'defaults': defaults, 'groups': groups, 'appends': appends,
            'originalText': ''.join(text(original_body[index]) for index in range(STARTS[annex - 1], STARTS[annex]))}
    (ROOT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
