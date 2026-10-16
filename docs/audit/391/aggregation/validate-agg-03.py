#!/usr/bin/env python3
"""Focused source/traceability checks for AGG-03. Not product acceptance."""

import argparse
import copy
import json
import re
import subprocess
from collections import Counter
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
AGG = Path(__file__).resolve().parent
ATLAS = AGG / 'agg-03-atlas.json'
BASE = '53310d908ac720d2025cd3cf043f3d3a1b4996d5'
REC_BASE = 'fecb575ed80bd3821c543b5701aec12dea754b37'
STATUS = {'CONFIRMED_DEFECT', 'CONVERGENCE_OPPORTUNITY', 'ALREADY_CONVERGED',
          'INTENTIONAL_DIFFERENCE', 'POLICY_UNRESOLVED', 'INSUFFICIENT_EVIDENCE', 'TECHNICAL_RISK'}


@lru_cache(maxsize=None)
def source_text(path, commit):
    return subprocess.check_output(['git', '-C', str(ROOT), 'show', f'{commit}:{path}'], text=True)


def calculated_totals(data):
    entries, work = data['atlasEntries'], data['workPackages']
    return {
        'atlasEntries': len(entries),
        'multiCandidateGroups': sum(len(e['sourceCandidates']) > 1 for e in entries),
        'groupedSlots': sum(len(e['sourceCandidates']) - 1 for e in entries),
        'atlasStatuses': dict(Counter(e['status'] for e in entries)),
        'atlasPriorities': dict(Counter(e['priority'] for e in entries)),
        'workPackages': len(work),
        'packageCategories': dict(Counter(w['category'] for w in work)),
        'packagePriorities': dict(Counter(w['priority'] for w in work)),
    }


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
    require(data['metadata']['reconciliation']['integrationBase'] == REC_BASE, 'REC-01 base mismatch')
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
        require((row['visual'], row['behavior']) ==
                (original['independent']['visual'], original['independent']['behavior']),
                f"AGG-02 evidence qualification changed {row['id']}")
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
        require((bool(w['sourceFindings']) or bool(w.get('directEvidence'))) and
                all(c in by_candidate for c in w['sourceFindings']), f"dangling source finding {w['id']}")
        if w['priority'] in ('P0', 'P1'):
            require(bool(w['acceptanceContract']) and bool(w['testing']), f"high-priority contract absent {w['id']}")
    require(all(wid in wids for e in entries for wid in e['workPackages']), 'dangling Atlas package')
    require(all(e['workPackages'] for e in entries if e['status']=='CONFIRMED_DEFECT'), 'unplanned confirmed defect')
    validate_reconciliation(data, by_entry, by_candidate, expected_inventory, require, check_sources)
    return errors


def validate_reconciliation(data, by_entry, by_candidate, expected_inventory, require, check_sources):
    # Snapshot conservation checks history/internal consistency, not behavior.
    previous = json.loads(source_text('docs/audit/391/aggregation/agg-03-atlas.json', REC_BASE))
    for key in ('sourceBatches', 'provisionalLeads', 'discrepancies'):
        require(data[key] == previous[key], f'preserved {key} changed')
    previous_candidates = {c['id']: c for c in previous['originalCandidateIndex']}
    for c in data['originalCandidateIndex']:
        old = previous_candidates.get(c['id'], {})
        require({k:v for k,v in c.items() if k not in {'primaryAtlas','inventoryEvidenceRoles'}} ==
                {k:v for k,v in old.items() if k not in {'primaryAtlas','inventoryEvidenceRoles'}},
                f"historical candidate fields changed {c['id']}")
    for row in data['confirmedFailures']:
        old = next((r for r in previous['confirmedFailures'] if r['id']==row['id']), {})
        require(all(row.get(k) == v for k,v in old.items()), f"historical failure changed {row['id']}")

    # CAP-02 supplements A03 without a new candidate declaration.
    direct = by_entry['ATL-003'].get('directInventoryEvidence', [])
    expected_a03 = expected_inventory['A03']['failureSource']
    require(len(direct) == 1 and all(direct[0].get(k) == v for k,v in expected_a03.items()),
            'A03 direct CAP-02 citation absent or altered')
    require(bool(direct) and direct[0].get('inventoryId') == 'A03' and
            direct[0].get('batch') == 'CAP-02' and direct[0].get('evidenceRole') == 'DIRECT_FAILURE',
            'A03 direct evidence role')
    for collection in ('inventoryMappings','confirmedFailures'):
        row=next(r for r in data[collection] if r['id']=='A03')
        require(row.get('candidateEvidenceRoles') == {'V-03':'SECONDARY_CONTEXT_ONLY'} and
                row.get('directEvidence') == direct, 'A03 V-03 secondary-only linkage')
    require(by_candidate['V-03'].get('inventoryEvidenceRoles', {}).get('A03') == 'SECONDARY_CONTEXT_ONLY'
            and by_entry['ATL-003']['sourceCitations'][0].get('inventoryEvidenceRoles') ==
            by_candidate['V-03'].get('inventoryEvidenceRoles'), 'V-03 cannot directly prove deletion')
    if check_sources and direct:
        ref = direct[0]
        try:
            require(source_text(ref['path'],ref['commit']).splitlines()[ref['line']-1] == ref['quote']
                    and 'BODY' in ref['quote'] and 'Escape and Cancel' in ref['quote'],
                    'A03 immutable original finding mismatch')
        except (OSError, subprocess.CalledProcessError, IndexError):
            require(False, 'A03 original finding unreadable')

    expected_splits = {'VC24-02':('ATL-029','INTENTIONAL_DIFFERENCE'),
                       'VC24-04':('ATL-105','ALREADY_CONVERGED'),
                       'VC25-01':('ATL-030','INTENTIONAL_DIFFERENCE'),
                       'VC25-02':('ATL-106','ALREADY_CONVERGED'),
                       'NON07-05':('ATL-035','INTENTIONAL_DIFFERENCE'),
                       'NON07-06':('ATL-107','ALREADY_CONVERGED')}
    for cid,(eid,status) in expected_splits.items():
        entry=by_entry.get(eid, {})
        require(by_candidate[cid]['primaryAtlas'] == eid and entry.get('sourceCandidates') == [cid]
                and entry.get('status') == status, f'reconciled status/ownership {cid}')
        if check_sources:
            c=by_candidate[cid]
            line=source_text(c['path'],c['commit']).splitlines()[c['line']-1]
            require(status in re.sub(r'[ -]', '_', line), f'original split classification {cid}')
    validate_roadmap(data, by_entry, direct, require)
    require(data.get('reconciliationTotals') == calculated_totals(data), 'recomputed REC-01 totals differ')


def validate_roadmap(data, by_entry, direct, require):
    by_work = {w['id']:w for w in data['workPackages']}
    slice_ids = {f'P2-05{x}' for x in 'abcd'}
    require('P2-05' not in by_work and slice_ids <= set(by_work), 'P2-05 four independent slices')
    require(len(data.get('packageUmbrellas', [])) == 1 and
            data['packageUmbrellas'][0]['id'] == 'P2-05' and
            data['packageUmbrellas'][0]['category'] == 'PLANNING_ONLY' and
            set(data['packageUmbrellas'][0]['slices']) == slice_ids, 'P2-05 planning-only umbrella')
    slice_scope = {'a':(['ATL-002'],['X01'],[]), 'b':(['ATL-003'],['A01','A02'],['P2-05a']),
                   'c':(['ATL-003'],['A03'],[]), 'd':(['ATL-023'],['X01'],[])}
    for suffix,(eids,iids,deps) in slice_scope.items():
        w=by_work.get('P2-05'+suffix, {})
        require((w.get('atlasEntries'),w.get('inventoryIds'),w.get('dependencies')) == (eids,iids,deps)
                and w.get('parentUmbrella') == 'P2-05' and bool(w.get('acceptanceContract'))
                and bool(w.get('testing')) and bool(w.get('relativeSize')), f'slice contract {suffix}')
    require(by_work.get('P2-05c', {}).get('directEvidence') == direct, 'delete slice direct evidence')
    for w in data['workPackages']:
        require(set(w['inventoryIds']) <= set().union(*(set(by_entry[e]['inventoryIds']) for e in w['atlasEntries'] if e in by_entry)),
                f"work inventory outside parent Atlas {w['id']}")
        for dep in w['dependencies']:
            if dep.startswith('P2-'):
                require(dep in by_work and dep != w['id'], f"unresolved package dependency {w['id']}")
        for eid in w['atlasEntries']:
            require(w['id'] in by_entry.get(eid, {}).get('workPackages', []), f"missing reverse package link {w['id']}")
    bq=by_work['P2-22']
    require(bq['priority'] == 'BLOCKED' and bq['category'] == 'DECISION_OR_EVIDENCE'
            and len(bq['dependencies']) >= 2 and by_entry['ATL-089']['priority'] == 'BLOCKED'
            and by_entry['ATL-089'].get('evidenceQualification', {}).get('notEstablished') ==
            ['Real credential exposure','Electron/UI marker display','Renderer/log propagation','Actual exploitability'],
            'synthetic marker is not P1-ready credential exposure')
    optional=by_work['P2-12'].get('optionalFollowUp', {})
    require(by_work['P2-12']['atlasEntries'] == ['ATL-099'] and
            by_work['P2-12']['sourceFindings'] == ['NON06-02'] and
            by_work['P2-12']['category'] == 'READY_TO_IMPLEMENT' and
            optional.get('blocksRelationFix') is False and optional.get('atlasEntries') == ['ATL-100']
            and optional.get('sourceFindings') == ['NON06-03'] and bool(optional.get('testing')),
            'optional terms must not gate relation dedupe')
    require(bool(by_work['P2-03'].get('quantizationRule')) and
            by_work['P2-03']['quantizationRule'] in by_work['P2-03']['acceptanceContract'],
            'displayed-boundary quantization must precede acceptance')
    for eid in ('ATL-024','ATL-032'):
        e=by_entry[eid]
        require(e.get('groupingKind') == 'COMPARATIVE_CATALOG' and
                bool(e.get('providerInvestigations')), f'provider catalog qualification {eid}')
    require({x['id'] for x in by_work['P2-16'].get('investigationTracks', [])} ==
            {'PG_DIAGNOSTICS','PG_READ_ONLY','DUCKDB_EXECUTION','FILES_AND_EXTENSIONS','AI_CATALOG'},
            'provider investigations independently scoped')


def negative_controls(data):
    mutations = {
      'missing candidate mapping': lambda d: d['candidateMappings'].pop(),
      'duplicate Atlas ID': lambda d: d['atlasEntries'][-1].update(id=d['atlasEntries'][0]['id']),
      'lost failed acceptance': lambda d: d['confirmedFailures'].pop(),
      'dangling package reference': lambda d: d['workPackages'][0]['atlasEntries'].append('ATL-999'),
      'false screenshot promotion': lambda d: d['originalCandidateIndex'][0].update(evidenceProvenance='INDEPENDENTLY_INSPECTED'),
      'false X11 promotion': lambda d: next(x for x in d['inventoryMappings'] if x['id']=='X11').update(behavior='BV'),
      'lost direct A03 evidence': lambda d: d['atlasEntries'][2].pop('directInventoryEvidence'),
      'V-03 deletion attribution': lambda d: next(x for x in d['originalCandidateIndex'] if x['id']=='V-03')['inventoryEvidenceRoles'].update(A03='DIRECT_FAILURE'),
      'mixed split status': lambda d: next(x for x in d['atlasEntries'] if x['id']=='ATL-105').update(status='INTENTIONAL_DIFFERENCE'),
      'missing independent delete slice': lambda d: d['workPackages'].remove(next(x for x in d['workPackages'] if x['id']=='P2-05c')),
      'lost slice dependency': lambda d: next(x for x in d['workPackages'] if x['id']=='P2-05b').update(dependencies=[]),
      'P1-ready synthetic security claim': lambda d: next(x for x in d['workPackages'] if x['id']=='P2-22').update(priority='P1',category='READY_TO_IMPLEMENT'),
      'optional terms gate relation fix': lambda d: next(x for x in d['workPackages'] if x['id']=='P2-12')['optionalFollowUp'].update(blocksRelationFix=True),
      'missing quantization rule': lambda d: next(x for x in d['workPackages'] if x['id']=='P2-03').pop('quantizationRule'),
      'lost provider catalog qualification': lambda d: next(x for x in d['atlasEntries'] if x['id']=='ATL-032').pop('providerInvestigations'),
      'invented totals': lambda d: d['reconciliationTotals'].update(atlasEntries=104),
      'changed source declaration': lambda d: d['originalCandidateIndex'][0].update(excerpt='invented behavior'),
    }
    for label, mutate in mutations.items():
        changed = copy.deepcopy(data)
        mutate(changed)
        # Each control must trip a substantive invariant, not merely a cached count.
        if label != 'invented totals':
            changed['reconciliationTotals'] = calculated_totals(changed)
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
    print(json.dumps(calculated_totals(atlas), sort_keys=True))
    if args.negative_controls:
        negative_controls(atlas)
