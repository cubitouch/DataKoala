#!/usr/bin/env python3
"""Read-only source-record/structural checks; never verifies product behavior."""
import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
REGISTER = ROOT / 'docs/architecture/ux-convergence-coverage-register.md'
REPORT = ROOT / 'docs/audit/391/aggregation/AGG-01.md'
INVENTORY = ROOT / 'docs/datasource-feature-inventory.md'
# Immutable AGG-01 input identity, not an expected disposition or evidence result.
BASE_COMMIT = 'e4c036d853e6f5fe6aecd794a2404c7331c5c13e'


def cells(line):
    return [part.strip() for part in line.strip().strip('|').split(' | ')]


def blob_sha_bytes(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()


def blob_sha(path):
    return blob_sha_bytes(path.read_bytes())


def require(condition, explanation):
    if not condition:
        raise SystemExit('FAIL: ' + explanation)


def git_baseline(required):
    """Use local objects only; no fetch, checkout, writes or inferred fallback pass."""
    try:
        result = subprocess.run(
            ['git', '-C', str(ROOT), 'rev-parse', '--verify', BASE_COMMIT + '^{commit}'],
            capture_output=True, check=False)
    except FileNotFoundError:
        result = None
    available = result is not None and result.returncode == 0
    require(available or not required, 'immutable Git baseline unavailable in strict mode')
    if not available:
        return None

    def read(path):
        result = subprocess.run(
            ['git', '-C', str(ROOT), 'show', BASE_COMMIT + ':' + path],
            capture_output=True, check=False)
        require(result.returncode == 0, 'baseline object missing: ' + path)
        return result.stdout

    return read


def historical_completion_table(historical):
    """Read original batch declarations and ownership, not the AGG-01 snapshot."""
    records, owners = {}, {}
    for line in historical.splitlines():
        match = re.match(r'\| \*\*((?:CAP|NON)-\d{2})\*\*', line)
        if not match:
            continue
        row = cells(line)
        bid = match[1]
        require(bid not in records, 'duplicate historical batch record ' + bid)
        status = re.search(r'`([A-Z_]+)`', row[0])
        require(status is not None, 'historical disposition absent ' + bid)
        records[bid] = (status[1], line)
        for fid in re.findall(r'\b[ASCLPTRX]\d{2}\b', row[1]):
            require(fid not in owners, 'duplicate historical primary owner ' + fid)
            owners[fid] = bid
    return records, owners


def standalone_disposition(text, bid):
    """Parse explicit source declarations; fail on conflicts, without a batch-status map."""
    declarations = []
    for line in text.splitlines():
        plain = re.sub(r'[*`]', '', line).strip()
        explicit = re.match(
            r'^(?:(?:Final|Current)(?: [A-Za-z0-9_-]+){0,3} '
            r'(?:disposition|status|decision)|Disposition|Status)\s*:\s*([A-Z][A-Z_]{2,})\b', plain)
        if explicit:
            require(explicit[1] in {'EVIDENCE_COMPLETE', 'PARTIAL'},
                    'unrecognized explicit source disposition ' + bid)
        match = re.match(
            r'^(?:(?:(?:Final|Current)(?: [A-Za-z0-9_-]+){0,3} '
            r'(?:disposition|status|decision)|Disposition|Status)\s*:\s*)?'
            r'(EVIDENCE_COMPLETE|PARTIAL)\b', plain, re.IGNORECASE)
        if match:
            declarations.append(match[1].upper())
    require(bool(declarations), 'no recognized explicit source disposition ' + bid)
    require(len(set(declarations)) == 1, 'conflicting explicit source dispositions ' + bid)
    # This checks declared status, not whether the completeness claim is justified.
    return declarations[-1]


def embedded_record(historical, bid, completion_row):
    match = re.search(r'^### ' + bid + r'(?: completion| —)', historical, re.MULTILINE)
    if not match:
        return completion_row  # CAP-07 survives as table/row evidence, disclosed below.
    rest = historical[match.start():]
    next_record = re.search(r'^### CAP-\d{2}(?: completion| —| execution)',
                            rest[5:], re.MULTILINE)
    return rest[:next_record.start() + 5] if next_record else rest


def candidate_references(text, prefix):
    """Expand explicit compact references like VC07-01/02; not semantic classification."""
    found = set()
    for match in re.finditer(r'\b' + re.escape(prefix) + r'-(\d{2}(?:/\d{2})*)\b', text):
        found.update(prefix + '-' + suffix for suffix in match[1].split('/'))
    return found


def main(require_git=False):
    register = REGISTER.read_text()
    report = REPORT.read_text()
    snapshot = json.loads(report.split('```json\n', 1)[1].split('\n```', 1)[0])
    require(snapshot['base'] == BASE_COMMIT, 'AGG-01 immutable base identity changed')
    active, historical = register.split('<!-- AGG01_HISTORICAL_BEGIN -->\n', 1)
    historical = historical.split('\n<!-- AGG01_HISTORICAL_END -->', 1)[0]
    require(hashlib.sha256(historical.encode()).hexdigest() == snapshot['historicalTailSha256'],
            'historical completion/checkpoint tail altered')
    require(blob_sha(INVENTORY) == snapshot['inventoryBlob'], 'inventory snapshot hash differs')
    baseline = git_baseline(require_git)
    if baseline:
        original_register = baseline(str(REGISTER.relative_to(ROOT))).decode()
        require(blob_sha_bytes(original_register.encode()) == snapshot['originalRegisterBlob'],
                'original register snapshot differs from immutable Git object')
        original_tail = original_register[original_register.index('### CAP-01 completion'):]
        require(historical == original_tail, 'historical tail differs from immutable Git base')
        require(INVENTORY.read_bytes() == baseline(str(INVENTORY.relative_to(ROOT))),
                'inventory differs from immutable Git base')

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
        for cell in row[4:7]:
            require(not re.match(r'^([A-Z_/]+)(?: — |; )\1(?: — |; )', cell),
                    'duplicated presentation prefix ' + fid)

    manifest = snapshot['manifest']
    expected = {f'CAP-{n:02}' for n in range(1, 31)} | {f'NON-{n:02}' for n in range(1, 8)}
    batches = {item['id']: item for item in manifest}
    require(len(manifest) == 37 and set(batches) == expected, '37 unique batch sources')
    old_records, source_owners = historical_completion_table(historical)
    require(set(old_records) == expected, 'historical batch ownership table incomplete')
    require(set(source_owners) == set(inventory), 'historical inventory ownership incomplete')
    source_dispositions, source_candidates, qualifications = {}, set(), []
    source_checks = dict(full_sha_citations=0, abbreviated_sha_citations=0,
                         missing_sha_citations=0, workflow_citations=0,
                         missing_workflow_citations=0, artifact_citations=0)
    for item in manifest:
        bid = item['id']
        embedded = bid.startswith('CAP-') and int(bid[4:]) <= 17
        expected_type = 'EMBEDDED_REGISTER' if embedded else 'STANDALONE_REPORT'
        expected_path = str(REGISTER.relative_to(ROOT)) if embedded else f'docs/audit/391/batches/{bid}.md'
        require(item['type'] == expected_type and item['path'] == expected_path,
                'source type/path differs from authoritative historical structure ' + bid)
        path = ROOT / expected_path
        require(path.is_file(), 'missing source ' + expected_path)
        require('### ' + bid + '\n' in report, 'missing manifest anchor ' + bid)
        if embedded:
            disposition, completion_row = old_records[bid]
            record = embedded_record(historical, bid, completion_row)
            source_dispositions[bid] = disposition
            if record == completion_row:
                qualifications.append(bid + ': table-only current completion; narrative continuity remains G-01')
        else:
            record = path.read_text()
            source_dispositions[bid] = standalone_disposition(record, bid)
            require(blob_sha(path) == snapshot['standaloneBlobs'][expected_path] == item['sourceBlob'],
                    'standalone source differs from recorded snapshot hash ' + bid)
            if baseline:
                require(path.read_bytes() == baseline(expected_path),
                        'standalone evidence differs from immutable Git base ' + bid)
        require(item['disposition'] == source_dispositions[bid],
                'manifest/source disposition mismatch ' + bid)
        require(re.fullmatch(r'[0-9a-f]{40}', item['sourceHead']) is not None,
                'invalid generating sourceHead ' + bid)
        require(item['sourceHead'] != BASE_COMMIT, 'integration SHA substituted ' + bid)
        require(item['reportCommit'] and re.fullmatch(r'[0-9a-f]{40}', item['reportCommit']),
                'unidentified record revision ' + bid)
        # Lexical citation support, not proof of field association, execution or artifact contents.
        if item['sourceHead'] in record:
            source_checks['full_sha_citations'] += 1
        elif embedded and re.search(r'(?<![0-9a-f])' + item['sourceHead'][:8] + r'(?![0-9a-f])', record):
            source_checks['abbreviated_sha_citations'] += 1
            qualifications.append(bid + ': source cites abbreviated SHA; full expansion remains remote/snapshot metadata')
        else:
            source_checks['missing_sha_citations'] += 1
            qualifications.append(bid + ': generating SHA not explicit in this embedded record; remote/reuse metadata only')
            require(embedded, 'generating SHA absent from standalone source ' + bid)
        if str(item['run']) in record:
            source_checks['workflow_citations'] += 1
        else:
            source_checks['missing_workflow_citations'] += 1
            qualifications.append(bid + ': workflow not explicit in current record; remote/reuse metadata only')
            require(embedded, 'workflow absent from standalone source ' + bid)
        if item['artifact']:
            require(item['sourceHead'] == item['artifactSourceHead'], 'artifact snapshot SHA mismatch ' + bid)
            require(str(item['artifact']) in record, 'artifact ID absent from source record ' + bid)
            source_checks['artifact_citations'] += 1
        else:
            require(bid.startswith('NON-') and item['newScreenshots'] == 0,
                    'unjustified absent artifact ' + bid)
        prefix = ('VC' if bid.startswith('CAP-') else 'NON') + bid[-2:]
        # Embedded records may only retain compact candidate references in the historical table.
        candidate_source = historical if embedded else record
        source_candidates.update(candidate_references(candidate_source, prefix))

    status_rows = {}
    for line in active.split('## Current integrated batch status\n', 1)[1].splitlines():
        match = re.match(r'\| \[((?:CAP|NON)-\d{2})\]', line)
        if match:
            require(match[1] not in status_rows, 'duplicate batch status ' + match[1])
            status_rows[match[1]] = cells(line)
    require(set(status_rows) == expected, 'active batch table incomplete')
    for bid, row in status_rows.items():
        require(row[1] == source_dispositions[bid], 'active/source disposition mismatch ' + bid)
    require('NOT_STARTED' not in active.replace('NOT_STARTED tables', 'historical tables'),
            'active NOT_STARTED status remains')
    visual, behavior, failed = {}, {}, []
    for fid, row in features.items():
        owner = re.search(r'\[((?:CAP|NON)-\d{2})\]', row[3])
        require(owner is not None and owner[1] in batches, 'missing/invalid owner ' + fid)
        require(owner[1] == source_owners[fid], 'primary owner differs from historical source ' + fid)
        require(row[3].count('](../audit/391/aggregation/AGG-01.md#') == 1,
                'ambiguous primary owner ' + fid)
        visual[fid] = row[4].split(' ', 1)[0]
        behavior[fid] = row[5].split(' ', 1)[0]
        require(visual[fid] in {'VV', 'SO', 'UV', 'N/A'}, 'invalid visual code ' + fid)
        require(behavior[fid] in {'BV', 'SO', 'UV', 'N/A'}, 'invalid behavior code ' + fid)
        if row[7].startswith('FAIL —'):
            failed.append(fid)
    # Curated failed-ID preservation is snapshot consistency, not automatic source verdict parsing.
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
    counts = dict(original=len(features), assigned=len(source_owners),
                  VV=sum(v == 'VV' for v in visual.values()),
                  BV=sum(v == 'BV' for v in behavior.values()),
                  SO_ONLY=sum(visual[f] != 'VV' and behavior[f] != 'BV' and
                              (visual[f] == 'SO' or behavior[f] == 'SO') for f in features),
                  UV_ONLY=sum(visual[f] not in {'VV', 'SO'} and
                              behavior[f] not in {'BV', 'SO'} for f in features),
                  VISUAL_UV=sum(v == 'UV' for v in visual.values()),
                  BEHAVIOR_UV=sum(v == 'UV' for v in behavior.values()),
                  VISUAL_NA=sum(v == 'N/A' for v in visual.values()), FAIL=len(failed),
                  CAP=sum(bid.startswith('CAP-') for bid in source_dispositions),
                  NON=sum(bid.startswith('NON-') for bid in source_dispositions),
                  EVIDENCE_COMPLETE=sum(v == 'EVIDENCE_COMPLETE' for v in source_dispositions.values()),
                  PARTIAL=sum(v == 'PARTIAL' for v in source_dispositions.values()),
                  PROVISIONAL_RESOLVED=resolved, PROVISIONAL_UNRESOLVED=unresolved,
                  MISSING_SOURCES=len(expected - set(source_dispositions)), DUPLICATE_OWNERS=0)
    require(counts == snapshot['counts'], 'recalculated snapshot totals differ')
    for key, value in counts.items():
        require(f'| {key} | {value} |' in active, 'active total mismatch ' + key)
        require(f'| {key} | {value} |' in report, 'report total mismatch ' + key)
    candidate_rows = [cells(line)[0] for line in report.splitlines()
                      if re.match(r'\| (?:VC\d{2}|NON\d{2})-\d{2} \|', line)]
    require(set(candidate_rows) == source_candidates, 'candidate reference index differs from source records')
    require(candidate_rows == snapshot['candidateIDs'], 'candidate index/snapshot mismatch')
    require(len(candidate_rows) == len(set(candidate_rows)), 'candidate ID collision')
    for text, folder in [(active, REGISTER.parent), (report.split('```json')[0], REPORT.parent)]:
        for target in re.findall(r'\]\(([^)]+)\)', text):
            if target.startswith(('https:', 'http:', '#')):
                continue
            path = target.split('#', 1)[0]
            require((folder / path).is_file(), 'broken introduced local link ' + target)
    print('PASS SOURCE-RECORD CHECKS: inventory names/scopes, historical owners, 37 declared dispositions, source citations, candidate references')
    print('BASELINE: ' + ('immutable Git objects compared' if baseline else
                         'UNAVAILABLE locally; hash agreement is snapshot integrity only'))
    print('PASS INTERNAL CONSISTENCY: classifications/totals, curated failed IDs, leads, manifest metadata and links')
    print(json.dumps(counts, sort_keys=True))
    print('SOURCE CITATION COVERAGE: ' + json.dumps(source_checks, sort_keys=True))
    for qualification in qualifications:
        print('QUALIFICATION: ' + qualification)
    print('LIMIT: source declarations/citations and structure only; no independent behavioral, visual, acceptance, remote workflow or archive verification')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--require-git-baseline', action='store_true',
                        help='fail if immutable base commit/files are not available as local Git objects')
    main(parser.parse_args().require_git_baseline)
