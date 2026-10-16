#!/usr/bin/env python3
"""Source anchored structural checks for AGG-04. No product behavior is run."""

import argparse
import copy
import json
import re
import subprocess
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
BASE = 'c08e09e5f8257246696eff1b1dfc60a0c3deabce'
HISTORIC_CAP07 = '9ef44d802fca7645781e1aadbe52bf47ce064089'
CACHE = {}


def source(path, commit=None):
    key = (path, commit)
    if key not in CACHE:
        if commit:
            CACHE[key] = subprocess.check_output(
                ['git', '-C', str(ROOT), 'show', f'{commit}:{path}'], text=True,
                stderr=subprocess.DEVNULL)
        else:
            CACHE[key] = (ROOT / path).read_text()
    return CACHE[key]


def original_ids():
    return re.findall(r'^\| ([ASCPLTRX]\d{2}) \|', source('docs/datasource-feature-inventory.md'), re.M)


def original_candidates():
    current = source('docs/architecture/ux-convergence-coverage-register.md')
    historic = source('docs/architecture/ux-convergence-coverage-register.md', HISTORIC_CAP07)
    found = set()
    for number in range(5, 18):
        found.update(re.findall(fr'\bVC{number:02}-\d\d\b', current + historic))
    for number in range(18, 31):
        found.update(re.findall(fr'\bVC{number:02}-\d\d\b', source(f'docs/audit/391/batches/CAP-{number:02}.md')))
    for number in range(1, 8):
        found.update(re.findall(fr'\bNON{number:02}-\d\d\b', source(f'docs/audit/391/batches/NON-{number:02}.md')))
    found.update(re.findall(r'\bV-\d\d\b', source('docs/architecture/ux-implementation-convergence-audit.md')))
    return found


def validate(d, check_sources=True):
    errors = []

    def check(ok, message):
        if not ok:
            errors.append(message)

    check(d.get('integrationBase') == BASE, 'immutable integration base')
    ids = d['originalInventory']['ids']
    expected = original_ids() if check_sources else ids
    check(len(ids) == 175 and Counter(ids) == Counter(expected), '175 original atomic inventory IDs')
    check(Counter(x[0] for x in ids) == d['originalInventory']['familyCounts'], 'family counts')
    batches = d['sourceBatches']
    expected_batches = {f'CAP-{i:02}' for i in range(1, 31)} | {f'NON-{i:02}' for i in range(1, 8)}
    check(len(batches) == 37 and {b['id'] for b in batches} == expected_batches, '37 batch records')
    if check_sources:
        register = source('docs/architecture/ux-convergence-coverage-register.md')
        historic = source('docs/architecture/ux-convergence-coverage-register.md', HISTORIC_CAP07)
        for b in batches:
            record = register + (historic if b['id'] == 'CAP-07' else '') if b['id'].startswith('CAP-') and int(b['id'][4:]) <= 17 else source(f"docs/audit/391/batches/{b['id']}.md")
            check(b['id'] in record, f"missing original source {b['id']}")
            ref = b['originalRecord']
            try:
                line = source(ref['path'],ref['commit']).splitlines()[ref['line']-1]
                check(line == ref['quote'] and b['id'] in line, f"original batch anchor {b['id']}")
                # CAP-01 names its run/artifact but not this head; CAP-09 abbreviates it.
                if b['id'] not in {'CAP-01','CAP-09'}:
                    check(b['sourceHead'] in source(ref['path'],ref['commit']), f"generating sourceHead in record {b['id']}")
                elif b['id'] == 'CAP-09':
                    check(b['sourceHead'][:6] in source(ref['path'],ref['commit']), 'abbreviated CAP-09 sourceHead')
            except (IndexError,subprocess.CalledProcessError,FileNotFoundError):
                errors.append(f"unreadable original batch anchor {b['id']}")
        check(Counter(b['disposition'] for b in batches) == {'EVIDENCE_COMPLETE':23,'PARTIAL':14}, 'source batch dispositions')
    cids = d['candidateIds']
    check(len(cids) == 147 and len(set(cids)) == 147, '147 unique declarations')
    if check_sources:
        check(set(cids) == original_candidates(), 'source-declared candidate universe')
    entries = d['atlasReviews']
    eids = [e['id'] for e in entries]
    check(len(eids) == 104 and len(set(eids)) == 104 and set(eids) == {f'ATL-{i:03}' for i in range(1, 105)}, '104 Atlas reviews')
    owned = [c for e in entries for c in e['sourceCandidates']]
    check(Counter(owned) == Counter(cids), 'unique primary candidate ownership')
    groups = d['groupReviews']
    expected_groups = {e['id'] for e in entries if len(e['sourceCandidates']) > 1}
    check(len(groups) == 28 and {g['atlas'] for g in groups} == expected_groups, '28 grouped reviews')
    group_by_id = {g['atlas']: g for g in groups}
    for e in entries:
        if e['id'] in group_by_id:
            check(group_by_id[e['id']]['candidates'] == e['sourceCandidates'], f"group membership {e['id']}")
            check(bool(group_by_id[e['id']]['reason']), f"group rationale {e['id']}")
        check(e['verdict'] in {'CONFIRMED','NEEDS_QUALIFICATION','RECLASSIFY','SPLIT','MERGE','INSUFFICIENT_EVIDENCE'}, f"entry verdict {e['id']}")
        if e['verdict'] != 'CONFIRMED':
            check(bool(e['reason']), f"entry finding rationale {e['id']}")
        check(len(e['sourceCandidates']) == len(e['sourceCitations']), f"entry citations {e['id']}")
    failures = d['failedAcceptance']
    expected_failures = {x['id'] for x in json.loads((HERE/'agg-02-evidence.json').read_text())['ledger'] if x['failedAcceptance']}
    check(len(failures) == 25 and {f['id'] for f in failures} == expected_failures, '25 source-reported failed IDs')
    for f in failures:
        check(f['disposition'] == 'FAILED_SCOPED' and bool(f['narrowFailure']), f"failed contract {f['id']}")
        check(bool(f['source']) and len(f['source']) == len(f['sourceAssertionOrFinding']), f"failure support {f['id']}")
        check(all(e in eids for e in f['atlas']), f"failure Atlas link {f['id']}")
    packages = d['packageReviews']
    pids = {f'P2-{i:02}' for i in range(1, 23)}
    check(len(packages) == 22 and {p['id'] for p in packages} == pids, '22 reviewed packages')
    for p in packages:
        check(bool(p['assessment']) and bool(p['sourceFindings']), f"package assessment {p['id']}")
        check(all(c in cids for c in p['sourceFindings']), f"package source {p['id']}")
        check(all(e in eids for e in p['atlasEntries']), f"package Atlas {p['id']}")
    leads = d['provisionalLeads']
    check({l['id'] for l in leads} == {f'UI-{i:03}' for i in range(1, 6)}, 'five provisional leads')
    limits = d['evidenceLimits']
    check(limits.get('CAP06OriginalImagesInspected') == 0 and limits.get('CAP09OriginalImagesInspected') == 0
          and limits.get('CAP09SupplementaryFrameInspected') == 1, 'historical screenshot provenance')
    check((limits.get('A25'),limits.get('P03'),limits.get('X11')) == ('UV/BV','SO/SO','UV/UV'), 'unsupported promotion')
    change = d['proposedAtlasChange']
    check(change['notAppliedToAGG03'] and change['ifAdopted'] == {'atlasEntries':107,'multiCandidateGroups':25,'duplicateOwnershipSlotsRemoved':40,'candidates':147,'failedIds':25}, 'explicit proposed totals')

    # These checks touch immutable original lines, not just an AGG-04 copy of an AGG-03 ledger.
    if check_sources:
        for e in entries:
            for cid, url in zip(e['sourceCandidates'], e['sourceCitations']):
                match = re.fullmatch(r'https://github\.com/cubitouch/DataKoala/blob/([0-9a-f]{40})/([^#]+)#L(\d+)', url)
                check(bool(match), f"source citation syntax {e['id']}:{cid}")
                if match:
                    commit,path,line = match.groups()
                    try:
                        check(cid in source(path,commit).splitlines()[int(line)-1], f"source citation content {e['id']}:{cid}")
                    except (IndexError,subprocess.CalledProcessError,FileNotFoundError):
                        errors.append(f"source citation unreadable {e['id']}:{cid}")
        for f in failures:
            for s,excerpt in zip(f['source'],f['sourceAssertionOrFinding']):
                try:
                    original=source(s['path'],s['commit']).splitlines()[s['line']-1]
                    check(original.startswith(excerpt), f"direct failure finding {f['id']}")
                except (IndexError,subprocess.CalledProcessError,FileNotFoundError):
                    errors.append(f"unreadable failure source {f['id']}")
    return errors


def negative_controls(data):
    mutations = {
        'missing Atlas review': lambda d: d['atlasReviews'].pop(),
        'incorrect candidate mapping': lambda d: d['atlasReviews'][0]['sourceCandidates'].append('V-02'),
        'lost failed acceptance': lambda d: d['failedAcceptance'].pop(),
        'omitted package': lambda d: d['packageReviews'].pop(),
        'unsupported VV promotion': lambda d: d['evidenceLimits'].update(A25='VV/BV'),
        'dangling original source': lambda d: d['atlasReviews'][0]['sourceCitations'].__setitem__(0,'https://github.com/cubitouch/DataKoala/blob/0000000000000000000000000000000000000000/no-file#L1'),
        'omitted grouped review': lambda d: d['groupReviews'].pop(),
        'invented screenshot inspection': lambda d: d['evidenceLimits'].update(CAP06OriginalImagesInspected=1),
    }
    for label, mutate in mutations.items():
        changed=copy.deepcopy(data)
        mutate(changed)
        if not validate(changed, check_sources=label=='dangling original source'):
            raise AssertionError(f'negative control escaped: {label}')
        print(f'REJECTED: {label}')


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--negative-controls',action='store_true')
    args=parser.parse_args()
    data=json.loads((HERE/'agg-04-verification.json').read_text())
    errors=validate(data)
    if errors:
        raise SystemExit('\n'.join(errors))
    print('PASS: 175 IDs, 37 batches, 147 candidates, 104 entries, 28 groups, 25 failed IDs, 22 packages, 5 leads')
    if args.negative_controls:
        negative_controls(data)
