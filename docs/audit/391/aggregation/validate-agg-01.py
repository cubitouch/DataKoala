#!/usr/bin/env python3
"""Read-only AGG-01 accounting/provenance validation; no network or product tests."""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
REGISTER = ROOT / 'docs/architecture/ux-convergence-coverage-register.md'
REPORT = ROOT / 'docs/audit/391/aggregation/AGG-01.md'
INVENTORY = ROOT / 'docs/datasource-feature-inventory.md'


def cells(line):
    return [part.strip() for part in line.strip().strip('|').split(' | ')]


def blob_sha(path):
    data = path.read_bytes()
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()


def require(condition, explanation):
    if not condition:
        raise SystemExit('FAIL: ' + explanation)


def main():
    register = REGISTER.read_text()
    report = REPORT.read_text()
    snapshot = json.loads(report.split('```json\n', 1)[1].split('\n```', 1)[0])
    active, historical = register.split('<!-- AGG01_HISTORICAL_BEGIN -->\n', 1)
    historical = historical.split('\n<!-- AGG01_HISTORICAL_END -->', 1)[0]
    require(hashlib.sha256(historical.encode()).hexdigest() == snapshot['historicalTailSha256'],
            'historical completion/checkpoint tail altered')
    require(blob_sha(INVENTORY) == snapshot['inventoryBlob'], 'inventory changed')

    inventory = {}
    for line in INVENTORY.read_text().splitlines():
        if re.match(r'\| [ASCLPTRX]\d{2} ', line):
            row = cells(line)
            require(row[0] not in inventory, 'duplicate inventory ID ' + row[0])
            inventory[row[0]] = row
    require(len(inventory) == 175, 'expected 175 inventory IDs')
    features = {}
    for line in active.splitlines():
        if re.match(r'\| [ASCLPTRX]\d{2} ', line):
            row = cells(line)
            require(len(row) == 8, 'malformed canonical row ' + row[0])
            require(row[0] not in features, 'duplicate canonical ID ' + row[0])
            features[row[0]] = row
    require(set(features) == set(inventory), 'missing/extra canonical IDs')
    for fid, row in features.items():
        require(row[1:3] == inventory[fid][1:3], 'feature definition/scope drift ' + fid)

    manifest = snapshot['manifest']
    expected = {f'CAP-{n:02}' for n in range(1, 31)} | {f'NON-{n:02}' for n in range(1, 8)}
    batches = {item['id']: item for item in manifest}
    require(len(manifest) == 37 and set(batches) == expected, '37 unique batch sources')
    require(sum(item['type'] == 'EMBEDDED_REGISTER' for item in manifest) == 17,
            '17 embedded records required')
    partial = {f'CAP-{n:02}' for n in range(21, 31)} | {'NON-04', 'NON-05', 'NON-06', 'NON-07'}
    for item in manifest:
        bid = item['id']
        path = ROOT / item['path']
        require(path.is_file(), 'missing source ' + item['path'])
        require('### ' + bid + '\n' in report, 'missing manifest anchor ' + bid)
        require(item['disposition'] == ('PARTIAL' if bid in partial else 'EVIDENCE_COMPLETE'),
                'source disposition changed ' + bid)
        require(re.fullmatch(r'[0-9a-f]{40}', item['sourceHead']) is not None,
                'invalid generating sourceHead ' + bid)
        require(item['sourceHead'] != snapshot['base'], 'integration SHA substituted ' + bid)
        require(item['reportCommit'] and re.fullmatch(r'[0-9a-f]{40}', item['reportCommit']),
                'unidentified record revision ' + bid)
        if item['type'] == 'STANDALONE_REPORT':
            require(blob_sha(path) == snapshot['standaloneBlobs'][item['path']],
                    'standalone source evidence modified ' + bid)
            require(item['sourceHead'] in path.read_text(), 'SHA absent from report ' + bid)
            require(str(item['run']) in path.read_text(), 'workflow absent from report ' + bid)
        else:
            require(bid.startswith('CAP-') and int(bid[4:]) <= 17, 'wrong embedded type')
            require(re.search(r'\*\*' + bid + r'\*\* `EVIDENCE_COMPLETE`', historical),
                    'embedded completion table missing ' + bid)
        if item['artifact']:
            require(item['sourceHead'] == item['artifactSourceHead'], 'artifact SHA mismatch ' + bid)
            require(str(item['artifact']) in report and str(item['run']) in report,
                    'untraceable artifact/workflow ' + bid)
        else:
            require(bid.startswith('NON-') and item['newScreenshots'] == 0,
                    'unjustified absent artifact ' + bid)

    status_rows = {}
    for line in active.split('## Current integrated batch status\n', 1)[1].splitlines():
        match = re.match(r'\| \[((?:CAP|NON)-\d{2})\]', line)
        if match:
            require(match[1] not in status_rows, 'duplicate batch status ' + match[1])
            status_rows[match[1]] = cells(line)
    require(set(status_rows) == expected, 'active batch table incomplete')
    for bid, row in status_rows.items():
        require(row[1] == batches[bid]['disposition'], 'active/report disposition mismatch ' + bid)
    require('NOT_STARTED' not in active.replace('NOT_STARTED tables', 'historical tables'),
            'active NOT_STARTED status remains')
    visual, behavior, failed = {}, {}, []
    for fid, row in features.items():
        owner = re.search(r'\[((?:CAP|NON)-\d{2})\]', row[3])
        require(owner is not None and owner[1] in batches, 'missing/invalid owner ' + fid)
        require(row[3].count('](../audit/391/aggregation/AGG-01.md#') == 1,
                'ambiguous primary owner ' + fid)
        visual[fid] = row[4].split(' ', 1)[0]
        behavior[fid] = row[5].split(' ', 1)[0]
        require(visual[fid] in {'VV', 'SO', 'UV', 'N/A'}, 'invalid visual code ' + fid)
        require(behavior[fid] in {'BV', 'SO', 'UV', 'N/A'}, 'invalid behavior code ' + fid)
        if row[7].startswith('FAIL —'):
            failed.append(fid)
    require(sorted(failed) == snapshot['failedIDs'], 'known failed acceptance lost/promoted')
    for fid, tokens in {'T18': ['VC24-03', 'FAIL'], 'R10': ['VC26-01/02', 'FAIL'],
                        'X01': ['VC29-01', 'VC29-03'], 'X06': ['VC30-02'],
                        'X10': ['VC30-03']}.items():
        require(all(token in ' '.join(features[fid]) for token in tokens),
                'minimum preservation failure ' + fid)

    leads = [cells(line) for line in active.splitlines() if re.match(r'\| UI-00[1-5] ', line)]
    require(len(leads) == 5 and len({row[0] for row in leads}) == 5, 'five distinct provisional leads')
    resolved = sum(row[3].startswith('RESOLVED') for row in leads)
    unresolved = sum(row[3].startswith('UNRESOLVED') for row in leads)
    require('UNRESOLVED' in next(row[3] for row in leads if row[0] == 'UI-002'),
            'unverified BigQuery requirement silently resolved')
    counts = dict(original=len(features), assigned=len(features),
                  VV=sum(v == 'VV' for v in visual.values()),
                  BV=sum(v == 'BV' for v in behavior.values()),
                  SO_ONLY=sum(visual[f] != 'VV' and behavior[f] != 'BV' and
                              (visual[f] == 'SO' or behavior[f] == 'SO') for f in features),
                  UV_ONLY=sum(visual[f] not in {'VV', 'SO'} and
                              behavior[f] not in {'BV', 'SO'} for f in features),
                  VISUAL_UV=sum(v == 'UV' for v in visual.values()),
                  BEHAVIOR_UV=sum(v == 'UV' for v in behavior.values()),
                  VISUAL_NA=sum(v == 'N/A' for v in visual.values()), FAIL=len(failed),
                  CAP=30, NON=7,
                  EVIDENCE_COMPLETE=sum(x['disposition'] == 'EVIDENCE_COMPLETE' for x in manifest),
                  PARTIAL=sum(x['disposition'] == 'PARTIAL' for x in manifest),
                  PROVISIONAL_RESOLVED=resolved, PROVISIONAL_UNRESOLVED=unresolved,
                  MISSING_SOURCES=0, DUPLICATE_OWNERS=0)
    require(counts == snapshot['counts'], 'recalculated snapshot totals differ')
    for key, value in counts.items():
        require(f'| {key} | {value} |' in active, 'active total mismatch ' + key)
        require(f'| {key} | {value} |' in report, 'report total mismatch ' + key)
    candidate_rows = [cells(line)[0] for line in report.splitlines()
                      if re.match(r'\| (?:VC\d{2}|NON\d{2})-\d{2} \|', line)]
    require(candidate_rows == snapshot['candidateIDs'], 'candidate index/snapshot mismatch')
    require(len(candidate_rows) == len(set(candidate_rows)), 'candidate ID collision')
    for text, folder in [(active, REGISTER.parent), (report.split('```json')[0], REPORT.parent)]:
        for target in re.findall(r'\]\(([^)]+)\)', text):
            if target.startswith(('https:', 'http:', '#')):
                continue
            path = target.split('#', 1)[0]
            require((folder / path).is_file(), 'broken introduced local link ' + target)
    print('PASS: AGG-01 inventory, sources, dispositions, historical bytes, provenance, failures, leads, candidates and links')
    print(json.dumps(counts, sort_keys=True))
    print('LIMIT: structural reconciliation only; source qualifications remain PARTIAL; no product/image re-verification')


if __name__ == '__main__':
    main()
