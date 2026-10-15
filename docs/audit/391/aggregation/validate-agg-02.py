#!/usr/bin/env python3
"""Read-only AGG-02 source/citation and ledger validation; never product acceptance."""
import argparse
import copy
import functools
import json
import re
import subprocess
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
BASE = '47ad04e82208cdfeae47961ae8916f9d8cd85847'
ORIGINAL = 'e4c036d853e6f5fe6aecd794a2404c7331c5c13e'
REGISTER = 'docs/architecture/ux-convergence-coverage-register.md'
INVENTORY = 'docs/datasource-feature-inventory.md'
DEFAULT = Path(__file__).with_name('agg-02-evidence.json')
FAMILIES = dict(A=25, S=28, C=18, P=17, L=26, T=24, R=25, X=12)

# Human-reviewed source-to-feature associations. These are not automatically
# inferred semantic verdicts. The validator independently checks the cited source
# anchors, while the review is responsible for their relevance and interpretation.
FAILURE_ANCHORS = {
    'A01 A02': ('docs/architecture/ux-implementation-convergence-audit.md', '| **V-03 —'),
    'A03': (REGISTER, '- **A03 `cap02-pg-delete'),
    'A04 A07 A08': ('docs/audit/391/batches/NON-01.md', '| **NON01-06**'),
    'A19': ('docs/audit/391/batches/NON-02.md', '### NON02-01 —'),
    'C10': ('docs/audit/391/batches/NON-03.md', '### NON03-01 —'),
    'C12': ('docs/audit/391/batches/NON-07.md', '| **NON07-01 —'),
    'S16': ('docs/audit/391/batches/NON-05.md', '| **NON05-01**'),
    'S26': ('docs/audit/391/batches/NON-06.md', '| **NON06-02 —'),
    'L02': ('docs/audit/391/batches/CAP-18.md', '| VC18-04 |'),
    'L16': ('docs/audit/391/batches/CAP-19.md', '- **VC19-02'),
    'L18 X10': ('docs/audit/391/batches/CAP-19.md', '- **VC19-01'),
    'S19 R19': (REGISTER, '- **VC13-01 —'),
    'T13': ('docs/audit/391/batches/CAP-23.md', '| **VC23-01**'),
    'T18': ('docs/audit/391/batches/CAP-24.md', '| **VC24-03**'),
    'R02 R04': (REGISTER, '- **VC12-03 —'),
    'R10 R13': ('docs/audit/391/batches/CAP-26.md', '| **VC26-01 —'),
    'X01': ('docs/audit/391/batches/CAP-29.md', '### VC29-01 —'),
    'X06': ('docs/audit/391/batches/CAP-30.md', '| VC30-02 |'),
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


@functools.cache
def source(commit, path):
    require(re.fullmatch('[0-9a-f]{40}', commit) is not None, 'invalid source commit')
    require(not Path(path).is_absolute() and '..' not in Path(path).parts, 'unsafe source path')
    result = subprocess.run(['git', '-C', str(ROOT), 'show', commit + ':' + path],
                            capture_output=True, check=False)
    require(result.returncode == 0, 'immutable source unavailable: ' + path + '@' + commit)
    return result.stdout.decode()


def cells(line):
    return [part.strip() for part in line.strip().strip('|').split(' | ')]


def feature_rows(text):
    result = {}
    for line in text.splitlines():
        if re.match(r'\| [ASCLPTRX]\d{2} ', line):
            row = cells(line)
            require(row[0] not in result, 'duplicate source feature ' + row[0])
            result[row[0]] = row
    return result


def check_ref(ref):
    text = source(ref['commit'], ref['path'])
    lines = text.splitlines(keepends=True)
    require(0 < ref['line'] <= len(lines), 'source line outside file')
    require(''.join(lines[ref['line'] - 1:]).startswith(ref['quote']),
            'citation does not match immutable source: ' + ref['path'])
    require(bool(ref['quote'].strip()), 'empty evidence quote')


def walk_refs(value):
    if isinstance(value, dict):
        if {'path', 'commit', 'line', 'quote'} <= value.keys():
            check_ref(value)
        for item in value.values():
            walk_refs(item)
    elif isinstance(value, list):
        for item in value:
            walk_refs(item)


def counts(entries, batches):
    return dict(original=len(entries), sources=len(batches),
                VV=sum(e['independent']['visual'] == 'VV' for e in entries),
                BV=sum(e['independent']['behavior'] == 'BV' for e in entries),
                SO_ONLY=sum(e['independent']['visual'] != 'VV' and
                            e['independent']['behavior'] != 'BV' and
                            'SO' in e['independent'].values() for e in entries),
                UV_ONLY=sum(e['independent']['visual'] not in ('VV', 'SO') and
                            e['independent']['behavior'] not in ('BV', 'SO') for e in entries),
                FAIL=sum(e['failedAcceptance'] for e in entries),
                EVIDENCE_COMPLETE=sum(b['sourceDisposition'] == 'EVIDENCE_COMPLETE' for b in batches),
                PARTIAL=sum(b['sourceDisposition'] == 'PARTIAL' for b in batches))


def validate(data):
    require(data['integrationBase'] == BASE, 'integration identity changed')
    original = source(ORIGINAL, REGISTER)
    inv = feature_rows(source(BASE, INVENTORY))
    entries = data['ledger']
    ids = [e['id'] for e in entries]
    require(len(ids) == 175 and len(set(ids)) == 175 and set(ids) == set(inv),
            '175 unique original IDs required')
    require(dict(Counter(i[0] for i in ids)) == FAMILIES == data['familyCounts'],
            'family counts differ from original inventory')
    owners = {}
    declarations = {}
    for line in original[original.index('### CAP-01 completion'):].splitlines():
        match = re.match(r'\| \*\*((?:CAP|NON)-\d{2})\*\*', line)
        if match:
            bid = match[1]
            declarations[bid] = re.search(r'`([A-Z_]+)`', cells(line)[0])[1]
            for fid in re.findall(r'\b[ASCLPTRX]\d{2}\b', cells(line)[1]):
                require(fid not in owners, 'duplicate historical owner ' + fid)
                owners[fid] = bid
    expected_batches = {f'CAP-{n:02}' for n in range(1, 31)} | {f'NON-{n:02}' for n in range(1, 8)}
    batches = {b['id']: b for b in data['batches']}
    require(len(data['batches']) == 37 and set(batches) == expected_batches,
            '37 unique original batch sources required')
    require(set(owners) == set(inv), 'historical ownership incomplete')
    for bid, batch in batches.items():
        if bid.startswith('CAP-') and int(bid[-2:]) <= 17:
            declared = declarations[bid]
        else:
            text = source(BASE, f'docs/audit/391/batches/{bid}.md')
            found = []
            for line in text.splitlines():
                plain = re.sub(r'[*`]', '', line).strip()
                match = re.match(r'^(?:(?:Final|Current) )?(?:Disposition:\s*)?'
                                 r'(EVIDENCE_COMPLETE|PARTIAL)\b', plain, re.I)
                if match:
                    found.append(match[1].upper())
            require(bool(found), 'missing explicit source disposition ' + bid)
            declared = found[0]
        require(batch['sourceDisposition'] == declared, 'source disposition drift ' + bid)
        require(batch['workflow']['id'] == batch['run'], 'workflow citation drift')
        require(re.fullmatch('[0-9a-f]{40}', batch['sourceHead']) is not None,
                'missing historical generating SHA')
        if batch.get('artifacts'):
            require(all(a['workflow_run']['head_sha'] == batch['sourceHead'] and
                        a['workflow_run']['id'] == batch['run'] for a in batch['artifacts']),
                    'artifact metadata/source identity differs')

    # This curated association is checked against original source anchors,
    # never against AGG-01's embedded failed-ID array.
    failures = {}
    for group, (path, prefix) in FAILURE_ANCHORS.items():
        quote = next((line for line in source(BASE, path).splitlines() if line.startswith(prefix)), None)
        require(quote is not None, 'source failure anchor absent ' + prefix)
        for fid in group.split():
            failures[fid] = (path, quote)
    canonical = feature_rows(source(BASE, REGISTER).split('<!-- AGG01_HISTORICAL_BEGIN -->')[0])
    checks = {e['id']: e for e in data['executionChecks']}
    for entry in entries:
        fid = entry['id']
        require([entry['definition'], entry['providerScope']] == inv[fid][1:3],
                'definition/scope drift ' + fid)
        require(entry['expectedOwner'] == owners[fid], 'ownership drift ' + fid)
        require(entry['independent']['visual'] in {'VV', 'SO', 'UV', 'N/A'} and
                entry['independent']['behavior'] in {'BV', 'SO', 'UV', 'N/A'},
                'unrecognized modality ' + fid)
        require(entry['failedAcceptance'] == (fid in failures), 'failed acceptance lost/promoted ' + fid)
        if fid in failures:
            path, quote = failures[fid]
            require(entry['productAcceptance'] == 'FAIL' and entry['failureSource']['path'] == path and
                    entry['failureSource']['quote'] == quote, 'failure citation/verdict drift ' + fid)
        if fid in failures:
            require(entry['failureSource'] in entry.get('failureSources', []),
                    'primary failure omitted from detailed citations ' + fid)
        for detail in entry.get('failureSources', []):
            check_ref(detail)
        if entry['independent']['behavior'] == 'BV':
            require(bool(entry['executionCitations']), 'BV without execution citation ' + fid)
            for citation in entry['executionCitations']:
                require(citation.get('run') is not None and citation.get('kind') in
                        {'EXECUTED_JSDOM_UI_TEST', 'SOURCE_REPORTED_EXECUTED_ASSERTION'},
                        'unqualified execution claim ' + fid)
        if fid in checks:
            check = checks[fid]
            require(check in entry['executionCitations'] and '✓' in check['logLine'] and
                    check['test']['path'] in check['logLine'], 'named-test execution linkage absent ' + fid)
            require(source(check['test']['commit'], check['test']['path']) ==
                    source(BASE, check['test']['path']), 'test source changed after execution ' + fid)
        review = entry['screenshotReview']
        if review['independentlyReopened']:
            # No images were successfully retrieved in this audit. An affirmative
            # claim requires a new review record, not only changing this flag.
            require(bool(review['inspectionEvidence']), 'independent image inspection unsupported ' + fid)
            require(any(fid in attempt.get('imagesInspected', []) and attempt.get('retrieved')
                        for attempt in data['artifactAttempts']), 'no retrieved-image review record ' + fid)
        row = canonical[fid]
        baseline = dict(visual=row[4].split(' ', 1)[0], behavior=row[5].split(' ', 1)[0],
                        failedAcceptance=row[7].startswith('FAIL —'))
        require(entry['agg01'] == baseline, 'AGG-01 comparison transcription drift ' + fid)
        agrees = (entry['independent'] == {k: baseline[k] for k in ('visual', 'behavior')} and
                  entry['failedAcceptance'] == baseline['failedAcceptance'])
        require(entry['comparison'] == ('AGREE' if agrees else 'DISAGREE'), 'missing discrepancy ' + fid)
        require(agrees or bool(entry['findings']), 'disputed ID without finding ' + fid)
        require(bool(entry['assessment']) and bool(entry['actualSourceSupport']), 'missing per-ID review ' + fid)
    require(len(data['provisionalLeads']) == 5 and
            {l['id'] for l in data['provisionalLeads']} == {f'UI-{n:03}' for n in range(1, 6)},
            'five provisional leads required')
    require(data['totals'] == counts(entries, data['batches']), 'computed totals drift')
    walk_refs(data)
    return data['totals']


def negative_controls(data):
    mutations = [
        ('missing original ID', lambda d: d['ledger'].pop()),
        ('duplicate original ID', lambda d: d['ledger'].append(copy.deepcopy(d['ledger'][0]))),
        ('fabricated source path', lambda d: d['ledger'][0]['actualSourceSupport'].update(path='fabricated.md')),
        ('failed acceptance promoted to PASS', lambda d: d['ledger'][0].update(failedAcceptance=False, productAcceptance='PASS')),
        ('UV upgraded to BV without execution', lambda d: d['ledger'][-2]['independent'].update(behavior='BV')),
        ('independent screenshot inspection without review', lambda d: d['ledger'][0]['screenshotReview'].update(independentlyReopened=True)),
    ]
    for name, mutate in mutations:
        candidate = copy.deepcopy(data)
        mutate(candidate)
        try:
            validate(candidate)
        except (ValueError, KeyError) as error:
            print('REJECTED:', name, '—', error)
        else:
            raise ValueError('negative control accepted: ' + name)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ledger', type=Path, default=DEFAULT)
    parser.add_argument('--negative-controls', action='store_true')
    args = parser.parse_args()
    evidence = json.loads(args.ledger.read_text())
    try:
        print('PASS SOURCE/CITATION AND STRUCTURE:', json.dumps(validate(evidence), sort_keys=True))
        if args.negative_controls:
            negative_controls(evidence)
        print('LIMIT: source association review and remote metadata/log excerpts are attributed records; '
              'no behavioral rerun, original-image inspection or product acceptance follows from this PASS.')
    except (ValueError, KeyError) as error:
        raise SystemExit('FAIL: ' + str(error))
