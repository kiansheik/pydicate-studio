"""Generate the in-app reference from source comments and the selected local corpus."""
from __future__ import annotations

import argparse
from contextlib import redirect_stdout
import hashlib
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / 'python'))
from authoring_runtime import configure
from learning_library import build


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--parent', type=Path, default=Path(os.environ.get('PYDICATE_PROJECT_PARENT', ROOT.parent)))
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    output = ROOT / 'src/generated/learning.json'
    if not (args.parent / 'oldtupicorpus/historic').is_dir():
        parser.error('Informe --parent ou PYDICATE_PROJECT_PARENT com oldtupicorpus e nhe-enga. Não será usada uma referência antiga silenciosamente.')
    with redirect_stdout(sys.stderr):
        library = build(configure(args.parent.resolve()))
    unavailable = [lesson['id'] for lesson in library['lessons'] if not lesson['available']]
    if unavailable:
        parser.error('Revise as lições que perderam a referência: ' + ', '.join(unavailable))
    encoded = json.dumps(library, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    library['contentId'] = hashlib.sha256(encoded.encode()).hexdigest()
    text = json.dumps(library, ensure_ascii=False, indent=2) + '\n'
    if args.check:
        if not output.is_file() or output.read_text() != text:
            parser.error('A documentação gerada está desatualizada. Execute npm run docs:build.')
    else:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(text)
    print(f"{len(library['lessons'])} lições; {len(library['guides'])} verbetes; {library['verifiedCount']} referências conferidas.")


if __name__ == '__main__':
    main()
