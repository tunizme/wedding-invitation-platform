#!/usr/bin/env python3
"""Audit committed WOFF2 files; pip install 'fonttools[woff]' uharfbuzz.

Checks bytes/hashes for every source and cmap + NFC/NFD shaping for each new
full face. Legacy Noto subsets remain unchanged and are checked as a union.
This is offline: it never downloads fonts or changes the installed catalog.
"""
import argparse
import hashlib
import io
import json
import unicodedata
from pathlib import Path

from fontTools.ttLib import TTFont
import uharfbuzz as hb

ROOT = Path(__file__).resolve().parent.parent
FONT_DIR = ROOT / 'apps/web/public/fonts/invitation-builder'
VIETNAMESE = 'ÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ'
VIETNAMESE += VIETNAMESE.lower()
LETTERS = ''.join(sorted(set(VIETNAMESE)))
PHRASE = 'Lễ Thành Hôn — Nguyễn Đặng Ánh Hằng, Trường Ước, Ắ Ấ Ề Ễ ệ ỡ Ự Ỳ ỹ'
REQUIRED = set(map(ord, LETTERS + ''.join(chr(i) for i in range(32, 127))))


def audit():
    manifest = json.loads((FONT_DIR / 'manifest.json').read_text())
    report = []
    for face in manifest['faces']:
        cmaps = set()
        fonts = []
        for source in face['sources']:
            data = (FONT_DIR / Path(source['url']).name).read_bytes()
            assert len(data) == source['bytes'], source['url']
            assert hashlib.sha256(data).hexdigest() == source['sha256'], source['url']
            assert data[:4] == b'wOF2', source['url']
            font = TTFont(io.BytesIO(data))
            cmaps.update(cp for cp, name in font.getBestCmap().items() if name != '.notdef')
            fonts.append(font)
        missing = REQUIRED - cmaps
        assert not missing, (face['fontId'], face['weight'], face['style'], sorted(missing))
        legacy = face['fontId'] in ['noto-sans-v1', 'noto-serif-v1']
        if not legacy:
            assert len(fonts) == 1, face['fontId']
            assert set(map(ord, unicodedata.normalize('NFD', LETTERS))) <= cmaps, face['fontId']
            font = fonts[0]
            font.flavor = None
            output = io.BytesIO()
            font.save(output)
            shaper = hb.Font(hb.Face(output.getvalue()))
            equivalent = {}
            for normalization in ['NFC', 'NFD']:
                equivalent[normalization] = []
                for sample in [LETTERS, PHRASE]:
                    buffer = hb.Buffer()
                    buffer.add_str(unicodedata.normalize(normalization, sample))
                    buffer.guess_segment_properties()
                    buffer.language = 'vi'
                    hb.shape(shaper, buffer)
                    assert buffer.glyph_infos and all(g.codepoint != 0 for g in buffer.glyph_infos), (face['fontId'], normalization)
                    equivalent[normalization].append([(g.codepoint, p.x_advance, p.y_advance, p.x_offset, p.y_offset) for g, p in zip(buffer.glyph_infos, buffer.glyph_positions)])
            assert equivalent['NFC'] == equivalent['NFD'], (face['fontId'], face['weight'], face['style'], 'normalization-shaping-mismatch')
        report.append({'fontId': face['fontId'], 'weight': face['weight'], 'style': face['style'], 'vietnameseLetters': len(LETTERS), 'hashes': 'pass', 'cmap': 'pass', 'NFC_NFD_shaping': 'legacy-subset-preserved' if legacy else 'pass', 'NFC_NFD_positions': 'legacy-subset-preserved' if legacy else 'identical', 'language': 'vi'})
    return {'families': len(manifest['families']), 'newFamilies': len(manifest['families']) - 2, 'faces': len(report), 'vietnameseLetters': len(LETTERS), 'checks': report}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    result = audit()
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({key: value for key, value in result.items() if key != 'checks'}, ensure_ascii=False))
