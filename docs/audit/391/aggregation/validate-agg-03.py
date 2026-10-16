#!/usr/bin/env python3
"""Focused source/traceability checks for AGG-03. Not product acceptance."""

import argparse
import copy
import json
import re
import subprocess
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
AGG = Path(__file__).resolve().parent
ATLAS = AGG / 'agg-03-atlas.json'
BASE = '53310d908ac720d2025cd3cf043f3d3a1b4996d5'
STATUS = {'CONFIRMED_DEFECT', 'CONVERGENCE_OPPORTUNITY', 'ALREADY_CONVERGED',
          'INTENTIONAL_DIFFERENCE', 'POLICY_UNRESOLVED', 'INSUFFICIENT_EVIDENCE', 'TECHNICAL_RISK'}


def source_text(path, commit):
    if commit == BASE:
        return (ROOT / path).read_text()
    return subprocess.check_output(['git', '-C', str(ROOT), 'show', f'{commit}:{path}'], text=True)


def declared_ids():
    """Re-enumerate source IDs without using AGG-01's candidate index."""
    register = (ROOT / 'docs/architecture/ux-convergence-coverage-register.md').read_text()
    historical = source_text('docs/architecture/ux-convergence-coverage-register.md',
                             '9ef44d802fca7645781e1aadbe52bf47ce064089')
    ids = {x for x in re.findall(r'\bVC\d{2}-\d{2}\b', register + historical)
           if 5 <= int(x[2:4]) <= 17}
    for number in range(18, 31):
        text = (ROOT / f'docs/audit/391/batches/CAP-{number:02}.md').read_text()
        ids |= {x for x in re.findall(r'\bVC\d{2}-\d{2}\b', text) if x.startswith(f'VC{number:02}-')}
    for number in range(1, 8):
        text = (ROOT / f'docs/audit/391/batches/NON-{number:02}.md').read_text()
        ids |= {x for x in re.findall(r'\bNON\d{2}-\d{2}\b', text) if x.startswith(f'NON{number:02}-')}
    visual = (ROOT / 'docs/architecture/ux-implementation-convergence-audit.md').read_text()
    ids |= {x for x in re.findall(r'\bV-\d{2}\b', visual) if 1 <= int(x[2:]) <= 12}
    return ids


def validate(data, check_sources=True):
    errors = []
    def require(condition, message):
        if not condition: errors.append(message)

    require(data['metadata']['integrationBase'] == BASE, 'integration base mismatch')
    batches = data['sourceBatches']
    expected_batches = {f'CAP-{n:02}' for n in range(1, 31)} | {f'NON-{n:02}' for n in range(1, 8)}
    require({b['id'] for b in batches} == expected_batches and len(batches) == 37, '37 source batches')
    candidates = data['originalCandidateIndex']
    cids = [c['id'] for c in candidates]
    require(len(cids) == len(set(cids)), 'duplicate source candidate')
    if check_sources:
        require(set(cids) == declared_ids(), 'original source declarations differ from candidate index')
        ag01 = (AGG / 'AGG-01.md').read_text().split('## H. Candidate-reference index', 1)[1].split('## I. AGG-02 handoff', 1)[0]
        indexed = set(re.findall(r'^\| ((?:VC|NON)\d{2}-\d{2}) \|', ag01, re.M))
        require(indexed == {x for x in cids if x.startswith(('VC', 'NON'))} and len(indexed) == 135,
                'AGG-01 candidate-index addition, omission or collision')
        for c in candidates:
            try:
                lines = source_text(c['path'], c['commit']).splitlines()
                require(c['line'] is not None and c['id'] in lines[c['line'] - 1],
                        f"source declaration/citation mismatch: {c['id']}")
            except (OSError, subprocess.CalledProcessError, IndexError):
                errors.append(f"source unreadable: {c['id']}")
    entries = data['atlasEntries']
    eids = [e['id'] for e in entries]
    require(len(eids) == len(set(eids)), 'duplicate Atlas ID')
    by_entry = {e['id']: e for e in entries}
    by_candidate = {c['id']: c for c in candidates}
    mapping = data['candidateMappings']
    require(Counter(m['candidate'] for m in mapping) == Counter(cids), 'source candidate requires exactly one primary mapping')
    for m in mapping:
        require(m['primaryAtlas'] in by_entry, f"dangling primary Atlas: {m['candidate']}")
        require(all(x in by_entry for x in m['secondaryAtlas']), f"dangling secondary Atlas: {m['candidate']}")
        if m['candidate'] in by_candidate:
            c = by_candidate[m['candidate']]
            require(c['primaryAtlas'] == m['primaryAtlas'], f"conflicting candidate mapping: {m['candidate']}")
            if m['primaryAtlas'] in by_entry:
                require(m['candidate'] in by_entry[m['primaryAtlas']]['sourceCandidates'], f"missing entry member: {m['candidate']}")
    for e in entries:
        require(e['status'] in STATUS, f"invalid status {e['id']}")
        require(bool(e['sourceCandidates']) and bool(e['sourceCitations']), f"uncited entry {e['id']}")
        require(e['confidence'] in ('HIGH_SOURCE', 'MEDIUM_SOURCE', 'LOW_SOURCE'), f"confidence absent {e['id']}")
        require(bool(e['inventoryIds']), f"entry lacks implicated inventory IDs {e['id']}")
        if e['status'] == 'INTENTIONAL_DIFFERENCE':
            require(bool(e['providerSpecificContract']), f"intentional semantics absent {e['id']}")
        if e['status'] in ('INSUFFICIENT_EVIDENCE', 'POLICY_UNRESOLVED'):
            require(e['priority'] == 'BLOCKED', f"evidence gap promoted to actionable: {e['id']}")
        for cid in e['sourceCandidates']:
            require(cid in by_candidate and by_candidate[cid]['primaryAtlas'] == e['id'], f"entry ownership mismatch {cid}")
        require(set(e['inventoryIds']) == set().union(*(set(by_candidate[c]['inventoryIds']) for c in e['sourceCandidates'] if c in by_candidate)), f"entry inventory loss {e['id']}")
    source_ledger = json.loads((AGG / 'agg-02-evidence.json').read_text())
    source_batches = {b['id']: b for b in source_ledger['batches']}
    for b in batches:
        ref = source_batches[b['id']]
        require((b['sourceHead'], b['run'], b['sourceDisposition']) ==
                (ref['sourceHead'], ref['run'], ref['sourceDisposition']), f"batch provenance altered {b['id']}")
    expected_inventory = {row['id']: row for row in source_ledger['ledger']}
    inv = data['inventoryMappings']
    require(len(inv) == 175 and {row['id'] for row in inv} == set(expected_inventory), '175 original inventory IDs')
    for row in inv:
        original = expected_inventory[row['id']]
        require(row['owner'] == original['expectedOwner'], f"owner altered {row['id']}")
        require(row['failedAcceptance'] == original['failedAcceptance'], f"failed flag changed {row['id']}")
        require(set(row['sourceCandidates']) == {c['id'] for c in candidates if row['id'] in c['inventoryIds']}, f"inventory candidate loss {row['id']}")
        require(set(row['atlasEntries']) == {by_candidate[c]['primaryAtlas'] for c in row['sourceCandidates']}, f"inventory Atlas loss {row['id']}")
    failed = data['confirmedFailures']
    expected_failed = {row['id'] for row in source_ledger['ledger'] if row['failedAcceptance']}
    require(len(failed) == 25 and {row['id'] for row in failed} == expected_failed, 'lost failed acceptance')
    for row in failed:
        require(bool(row['candidates']) and bool(row['atlasEntries']) and bool(row['originalFailureSource']), f"untraced failed acceptance {row['id']}")
        require(all(e in by_entry and by_entry[e]['status'] == 'CONFIRMED_DEFECT' for e in row['atlasEntries']), f"failure not a confirmed entry {row['id']}")
    leads = data['provisionalLeads']
    require({x['id'] for x in leads} == {f'UI-{n:03}' for n in range(1, 6)}, 'five provisional leads')
    require(all(x['sourceCandidate'] in by_candidate and x['atlasEntry'] == by_candidate[x['sourceCandidate']]['primaryAtlas'] for x in leads), 'lead mapping mismatch')
    require(next(x for x in inv if x['id'] == 'X11')['visual'] == 'UV' and next(x for x in inv if x['id'] == 'X11')['behavior'] == 'UV', 'X11 promotion')
    require(next(x for x in inv if x['id'] == 'P03')['visual'] == 'SO' and next(x for x in inv if x['id'] == 'P03')['behavior'] == 'SO', 'P03 promotion')
    require(next(x for x in inv if x['id'] == 'A25')['visual'] == 'UV', 'A25 visual promotion')
    for c in candidates:
        require(c['evidenceProvenance'].startswith('SOURCE_REPORTED'), f"unsupported independent inspection {c['id']}")
        if c['sourceClassification'] in ('INSUFFICIENT_EVIDENCE', 'POLICY_UNRESOLVED'):
            require(by_entry[c['primaryAtlas']]['status'] != 'CONFIRMED_DEFECT', f"unverified candidate promoted {c['id']}")
    work = data['workPackages']
    wids = [w['id'] for w in work]
    require(len(wids) == len(set(wids)), 'duplicate work package')
    for w in work:
        require(bool(w['atlasEntries']) and all(e in by_entry for e in w['atlasEntries']), f"dangling work-package reference {w['id']}")
        require(bool(w['sourceFindings']) and all(c in by_candidate for c in w['sourceFindings']), f"dangling source finding {w['id']}")
        if w['priority'] in ('P0', 'P1'):
            require(bool(w['acceptanceContract']) and bool(w['testing']), f"high-priority contract absent {w['id']}")
    require(all(wid in wids for e in entries for wid in e['workPackages']), 'dangling Atlas package')
    require(all(e['workPackages'] for e in entries if e['status']=='CONFIRMED_DEFECT'), 'unplanned confirmed defect')
    return errors


def negative_controls(data):
    mutations = {
      'missing candidate mapping': lambda d: d['candidateMappings'].pop(),
      'duplicate Atlas ID': lambda d: d['atlasEntries'][-1].update(id=d['atlasEntries'][0]['id']),
      'lost failed acceptance': lambda d: d['confirmedFailures'].pop(),
      'dangling package reference': lambda d: d['workPackages'][0]['atlasEntries'].append('ATL-999'),
      'false screenshot promotion': lambda d: d['originalCandidateIndex'][0].update(evidenceProvenance='INDEPENDENTLY_INSPECTED'),
      'false X11 promotion': lambda d: next(x for x in d['inventoryMappings'] if x['id']=='X11').update(behavior='BV'),
    }
    for label, mutate in mutations.items():
        changed = copy.deepcopy(data)
        mutate(changed)
        if not validate(changed, check_sources=False):
            raise AssertionError(f'negative control escaped: {label}')
        print(f'REJECTED: {label}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--negative-controls', action='store_true')
    args = parser.parse_args()
    atlas = json.loads(ATLAS.read_text())
    failures = validate(atlas)
    if failures:
        raise SystemExit('\n'.join(failures))
    print(f"PASS: {len(atlas['sourceBatches'])} batches, {len(atlas['originalCandidateIndex'])} candidates, {len(atlas['atlasEntries'])} Atlas entries, {len(atlas['confirmedFailures'])} failed IDs")
    if args.negative_controls:
        negative_controls(atlas)
