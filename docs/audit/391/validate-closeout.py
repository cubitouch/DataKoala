#!/usr/bin/env python3
"""Final #391 closeout checks. Source anchors and invariants, NOT product acceptance.

Requires a full Git checkout (fetch-depth: 0) including the annotated historical
archive tag, verified against its expected peeled commit. Deleted ledgers are read
from that exact tag, never reconstructed from the current Atlas.
"""
import argparse
import copy
import hashlib
import json
import re
import subprocess
import sys
from collections import Counter
from functools import lru_cache
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[3]
AUDIT = ROOT / "docs/audit/391"
AGG = AUDIT / "aggregation"
ATLAS = AGG / "agg-03-atlas.json"
LEDGER_ARCHIVE = "docs/audit/391/aggregation/agg-02-evidence.json"
MANIFEST = ROOT / "tools/visual-review/manifest.json"
BASE = "7cfc8a3b5ac92a471f2a8930599dabe68f9291db"
TAG = "audit-391-phase-1c-evidence"
STATUSES = {
    "CONFIRMED_DEFECT", "CONVERGENCE_OPPORTUNITY", "ALREADY_CONVERGED",
    "INTENTIONAL_DIFFERENCE", "POLICY_UNRESOLVED",
    "INSUFFICIENT_EVIDENCE", "TECHNICAL_RISK",
}
EXPECTED_STATUSES = {
    "CONFIRMED_DEFECT": 24, "CONVERGENCE_OPPORTUNITY": 3,
    "ALREADY_CONVERGED": 20, "INTENTIONAL_DIFFERENCE": 23,
    "POLICY_UNRESOLVED": 11, "INSUFFICIENT_EVIDENCE": 20,
    "TECHNICAL_RISK": 6,
}


def git(*args):
    return subprocess.check_output(["git", "-C", str(ROOT), *args], text=True).strip()


@lru_cache(maxsize=None)
def source_lines(path, sha):
    return git("show", f"{sha}:{path}").splitlines()


def check(condition, message, errors):
    if not condition:
        errors.append(message)


def computed_totals(a):
    entries, packages = a["atlasEntries"], a["workPackages"]
    return {
        "atlasEntries": len(entries),
        "multiCandidateGroups": sum(len(e["sourceCandidates"]) > 1 for e in entries),
        "groupedSlots": sum(len(e["sourceCandidates"]) - 1 for e in entries),
        "atlasStatuses": dict(Counter(e["status"] for e in entries)),
        "atlasPriorities": dict(Counter(e["priority"] for e in entries)),
        "workPackages": len(packages),
        "packageCategories": dict(Counter(w["category"] for w in packages)),
        "packagePriorities": dict(Counter(w["priority"] for w in packages)),
    }


def validate_data(a, ledger, manifest):
    """Data relationships plus comparison with the independent AGG-02 ledger.

    The independent ledger is itself a historical audit result, not live behavior.
    """
    errors = []
    candidates = a["originalCandidateIndex"]
    entries = a["atlasEntries"]
    inventory = a["inventoryMappings"]
    mappings = a["candidateMappings"]
    packages = a["workPackages"]
    failed = a["confirmedFailures"]
    batches = a["sourceBatches"]
    cid = [c["id"] for c in candidates]
    eid = [e["id"] for e in entries]
    iid = [i["id"] for i in inventory]
    wid = [w["id"] for w in packages]
    byc, bye, byi, byw = (
        {x["id"]: x for x in group}
        for group in (candidates, entries, inventory, packages)
    )
    source_i = {row["id"]: row for row in ledger["ledger"]}
    source_b = {row["id"]: row for row in ledger["batches"]}
    batches_expected = {f"CAP-{n:02}" for n in range(1, 31)} | {
        f"NON-{n:02}" for n in range(1, 8)
    }
    check(len(batches) == 37 and {b["id"] for b in batches} == batches_expected,
          "batch coverage (37 CAP/NON)", errors)
    check(len(inventory) == 175 and len(set(iid)) == 175 and set(iid) == set(source_i),
          "inventory conservation (175)", errors)
    check(len(candidates) == 147 and len(set(cid)) == 147, "original candidate coverage (147)", errors)
    check(len(entries) == 107 and len(set(eid)) == 107, "canonical entries (107)", errors)
    check(len(packages) == 25 and len(set(wid)) == 25, "packages (25)", errors)
    check(len(failed) == 25 and len({x["id"] for x in failed}) == 25,
          "failed-acceptance entries (25)", errors)
    check({x["id"] for x in failed} == {k for k, v in source_i.items() if v["failedAcceptance"]},
          "failed-acceptance source conservation", errors)
    check(Counter(e["status"] for e in entries) == Counter(EXPECTED_STATUSES),
          "classification distribution", errors)
    check(a["reconciliationTotals"] == computed_totals(a),
          "computed totals disagree with declared totals", errors)
    check(a["reconciliationTotals"]["multiCandidateGroups"] == 25 and
          a["reconciliationTotals"]["groupedSlots"] == 40,
          "candidate grouping count", errors)
    check(Counter(w["category"] for w in packages) ==
          Counter({"READY_TO_IMPLEMENT": 19, "DECISION_OR_EVIDENCE": 6}),
          "roadmap readiness (19/6)", errors)
    check(Counter(m["candidate"] for m in mappings) == Counter(cid),
          "exactly one candidate primary mapping", errors)
    for m in mappings:
        c = byc.get(m["candidate"])
        e = bye.get(m["primaryAtlas"])
        check(c is not None and e is not None and c["primaryAtlas"] == m["primaryAtlas"] and
              m["candidate"] in e["sourceCandidates"], f"mapping reciprocity {m['candidate']}", errors)
        check(all(x in bye for x in m["secondaryAtlas"]),
              f"secondary mapping {m['candidate']}", errors)
    for e in entries:
        check(e["status"] in STATUSES and bool(e["sourceCitations"]) and bool(e["sourceCandidates"]),
              f"entry classification/citation {e['id']}", errors)
        check(all(c in byc and byc[c]["primaryAtlas"] == e["id"] for c in e["sourceCandidates"]),
              f"entry ownership {e['id']}", errors)
        check(set(e["inventoryIds"]) ==
              {i for c in e["sourceCandidates"] for i in byc.get(c, {}).get("inventoryIds", [])},
              f"entry inventory {e['id']}", errors)
        if e["status"] in {"POLICY_UNRESOLVED", "INSUFFICIENT_EVIDENCE"}:
            check(e["priority"] == "BLOCKED", f"premature entry readiness {e['id']}", errors)
        if e["status"] == "INTENTIONAL_DIFFERENCE":
            check(bool(e.get("providerSpecificContract")), f"provider contract missing {e['id']}", errors)
        check(all(w in byw for w in e["workPackages"]), f"package ownership {e['id']}", errors)
    for b in batches:
        other = source_b.get(b["id"])
        check(other is not None and
              (b["sourceHead"], b["run"], b["sourceDisposition"]) ==
              (other["sourceHead"], other["run"], other["sourceDisposition"]),
              f"batch provenance mismatch {b['id']}", errors)
    for row in inventory:
        old = source_i.get(row["id"])
        if old is None:
            continue
        check((row["owner"], row["visual"], row["behavior"], row["failedAcceptance"]) ==
              (old["expectedOwner"], old["independent"]["visual"],
               old["independent"]["behavior"], old["failedAcceptance"]),
              f"source evidence changed {row['id']}", errors)
        check(set(row["sourceCandidates"]) ==
              {c["id"] for c in candidates if row["id"] in c["inventoryIds"]},
              f"inventory candidates changed {row['id']}", errors)
        check(set(row["atlasEntries"]) ==
              {byc[c]["primaryAtlas"] for c in row["sourceCandidates"] if c in byc},
              f"inventory atlas linkage {row['id']}", errors)
    check((byi["A25"]["visual"], byi["P03"]["visual"], byi["P03"]["behavior"],
           byi["X11"]["visual"], byi["X11"]["behavior"]) ==
          ("UV", "SO", "SO", "UV", "UV"), "unwarranted evidence promotion", errors)
    check({l["id"] for l in a["provisionalLeads"]} ==
          {f"UI-{n:03}" for n in range(1, 6)}, "provisional leads (five)", errors)
    check(next(l for l in a["provisionalLeads"] if l["id"] == "UI-002")["status"] == "POLICY_UNRESOLVED" and
          next(l for l in a["provisionalLeads"] if l["id"] == "UI-004")["status"] == "INSUFFICIENT_EVIDENCE",
          "open product decisions/evidence", errors)
    for row in failed:
        check(bool(row.get("originalFailureSource")) and bool(row.get("atlasEntries")) and
              all(x in bye and bye[x]["status"] == "CONFIRMED_DEFECT" for x in row["atlasEntries"]),
              f"lost source-backed failure {row['id']}", errors)
    for c in candidates:
        check(c.get("evidenceProvenance", "").startswith("SOURCE_REPORTED"),
              f"unsupported screenshot promotion {c['id']}", errors)
    expected_splits = {
        "VC24-02": ("ATL-029", "INTENTIONAL_DIFFERENCE"),
        "VC24-04": ("ATL-105", "ALREADY_CONVERGED"),
        "VC25-01": ("ATL-030", "INTENTIONAL_DIFFERENCE"),
        "VC25-02": ("ATL-106", "ALREADY_CONVERGED"),
        "NON07-05": ("ATL-035", "INTENTIONAL_DIFFERENCE"),
        "NON07-06": ("ATL-107", "ALREADY_CONVERGED"),
    }
    for c, (id_, status) in expected_splits.items():
        check(byc[c]["primaryAtlas"] == id_ and bye.get(id_, {}).get("status") == status and
              bye.get(id_, {}).get("sourceCandidates") == [c], f"REC-01 split status {c}", errors)
    direct = bye["ATL-003"].get("directInventoryEvidence", [])
    check(len(direct) == 1 and direct[0].get("inventoryId") == "A03" and
          direct[0].get("evidenceRole") == "DIRECT_FAILURE" and
          byc["V-03"].get("inventoryEvidenceRoles", {}).get("A03") == "SECONDARY_CONTEXT_ONLY",
          "A03 CAP-02 direct provenance versus V-03 secondary", errors)
    check(set(wid) >= {f"P2-05{x}" for x in "abcd"} and "P2-05" not in byw and
          byw["P2-05b"]["dependencies"] == ["P2-05a"], "P2-05 split/dependency", errors)
    check(byw["P2-22"]["priority"] == "BLOCKED" and
          byw["P2-22"]["category"] == "DECISION_OR_EVIDENCE" and
          bye["ATL-089"]["priority"] == "BLOCKED",
          "BigQuery synthetic security marker escalated", errors)
    check(byw["P2-12"]["optionalFollowUp"]["blocksRelationFix"] is False,
          "optional AI terms must not gate relation correction", errors)
    check(bool(byw["P2-03"].get("quantizationRule")), "displayed-boundary quantization", errors)
    for w in packages:
        check(bool(w["acceptanceContract"]) and bool(w["testing"]) and bool(w["atlasEntries"]) and
              all(e in bye and w["id"] in bye[e]["workPackages"] for e in w["atlasEntries"]),
              f"package contract/link {w['id']}", errors)
        check(all(dep in byw for dep in w["dependencies"] if dep.startswith("P2-")),
              f"missing package dependency {w['id']}", errors)
        check(set(w["inventoryIds"]) <=
              {i for e in w["atlasEntries"] if e in bye for i in bye[e]["inventoryIds"]},
              f"package inventory mismatch {w['id']}", errors)
        if w["category"] == "DECISION_OR_EVIDENCE":
            check(w["priority"] == "BLOCKED", f"blocked package promoted {w['id']}", errors)
    check(len(manifest["comparisons"]) == 18 and len(manifest["assets"]) == 23 and
          sum(not slot.get("asset") for c in manifest["comparisons"]
              for slot in c["images"]) == 3,
          "VIS-01 comparisons/assets/missing slots", errors)
    check(len({c["id"] for c in manifest["comparisons"]}) == 18 and
          all(c["atlasId"] in bye for c in manifest["comparisons"]),
          "VIS-01 atlas references", errors)
    for c in manifest["comparisons"]:
        check(len(c["images"]) == 2 and
              all(not slot.get("asset") or slot["asset"] in manifest["assets"] for slot in c["images"]),
              f"VIS-01 screenshot reference {c['id']}", errors)
    return errors


def check_source_anchors(a):
    errors = []
    # Independent source paths/commits/lines; a declaration line is not a passing assertion.
    for c in a["originalCandidateIndex"]:
        try:
            text = source_lines(c["path"], c["commit"])[c["line"] - 1]
            check(c["id"] in text, f"historical candidate line {c['id']}", errors)
        except (subprocess.CalledProcessError, IndexError):
            errors.append(f"unreadable historical candidate line {c['id']}")
    direct = next(e for e in a["atlasEntries"] if e["id"] == "ATL-003")["directInventoryEvidence"][0]
    try:
        observed = source_lines(direct["path"], direct["commit"])[direct["line"] - 1]
        check(observed == direct["quote"] and "Escape and Cancel" in observed,
              "A03 exact original CAP-02 line/quote", errors)
    except (subprocess.CalledProcessError, IndexError):
        errors.append("A03 direct source absent")
    for b in a["sourceBatches"]:
        rec = b["originalRecord"]
        try:
            line = source_lines(rec["path"], rec["commit"])[rec["line"] - 1]
            check(line == rec["quote"], f"batch embedded/source record {b['id']}", errors)
        except (subprocess.CalledProcessError, IndexError):
            errors.append(f"unreadable batch record {b['id']}")
    return errors


def archived_paths(a):
    paths = {
        "docs/architecture/ux-convergence-coverage-register.md",
        "docs/architecture/ux-implementation-convergence-audit.md",
        "docs/audit/391/aggregation/AGG-01.md",
        "docs/audit/391/aggregation/AGG-02.md",
        "docs/audit/391/aggregation/AGG-03.md",
        "docs/audit/391/aggregation/AGG-04.md",
        LEDGER_ARCHIVE,
        "docs/audit/391/aggregation/agg-03-atlas.json",
        "docs/audit/391/aggregation/agg-04-verification.json",
    }
    paths |= {f"docs/audit/391/aggregation/validate-agg-{n:02}.py" for n in range(1, 5)}
    paths |= {b["originalRecord"]["path"] for b in a["sourceBatches"]}
    paths |= {f"docs/audit/391/batches/CAP-{n:02}.md" for n in range(18, 31)}
    paths |= {f"docs/audit/391/batches/NON-{n:02}.md" for n in range(1, 8)}
    return paths


def check_archive(a):
    errors = []
    ref = "refs/tags/" + TAG
    try:
        kind = git("cat-file", "-t", ref)
        check(kind == "tag", "historical archive is not an annotated tag", errors)
        resolved = git("rev-parse", "--verify", ref + "^{commit}")
        check(resolved == BASE, "annotated tag does not peel to exact source commit", errors)
        check(git("rev-parse", "--verify", BASE + "^{tree}") ==
              git("rev-parse", "--verify", ref + "^{tree}"),
              "archive tree mismatch", errors)
    except subprocess.CalledProcessError:
        errors.append("required annotated archive tag unavailable: " + TAG)
    # The archive commit contains the *pre-consolidation* evidence bytes.
    paths = archived_paths(a)
    for p in sorted(paths):
        try:
            git("cat-file", "-e", ref + ":" + p)
            git("cat-file", "-e", BASE + ":" + p)
        except subprocess.CalledProcessError:
            errors.append("missing archived source: " + p)
    return errors, len(paths)

def check_active_paths(manifest):
    errors = []
    required = [
        "scripts/visual-preview/audit.mjs",
        "scripts/visual-preview/audit-batch-loader.mjs",
        "scripts/visual-preview/run-audit-batches.mjs",
        "scripts/visual-preview/capture.mjs",
        "scripts/visual-preview/assertions.mjs",
        ".github/workflows/visual-preview.yml",
        "tools/visual-review/generate.mjs",
        "tools/visual-review/serve.mjs",
        "tools/visual-review/review-board.test.mjs",
        "docs/audit/391/final-report.md",
        "docs/audit/391/phase-2-roadmap.md",
        "docs/audit/391/evidence-and-coverage.md",
        "docs/audit/391/README.md",
        "docs/audit/391/harness-maintenance.md",
    ]
    required += [f"scripts/visual-preview/audit-batches/cap-{n:02}.mjs" for n in range(18, 31)]
    for p in required:
        check((ROOT / p).is_file(), "required executable/document absent: " + p, errors)
    for name, a in manifest["assets"].items():
        p = ROOT / a["path"]
        try:
            content = p.read_bytes()
            git_blob = hashlib.sha1(b"blob " + str(len(content)).encode() + b"\0" + content).hexdigest()
            check(p.is_relative_to(ROOT / "tools/visual-review/images") and
                  git_blob == a["blobSha"] and len(content) == a["byteSize"] and
                  content[:8] == b"\x89PNG\r\n\x1a\n",
                  "VIS-01 verified PNG bytes " + name, errors)
        except OSError:
            errors.append("missing VIS-01 image " + name)
    # Validates active relative document links (external immutable Git links aren't
    # fetched here; source anchors are separately validated above).
    for name in ("README.md", "final-report.md", "phase-2-roadmap.md",
                 "evidence-and-coverage.md", "harness-maintenance.md"):
        p = AUDIT / name
        text = p.read_text(encoding="utf-8")
        for target in re.findall(r"\[[^\]]+\]\(([^)]+)\)", text):
            if target.startswith(("http://", "https://", "#", "mailto:")):
                continue
            rel = unquote(target.split("#", 1)[0].strip())
            if rel:
                check((p.parent / rel).exists(), f"broken local link {name}: {target}", errors)
    return errors


def negative_controls(a, ledger, manifest):
    changes = {
        "lost original mapping": lambda x: x["candidateMappings"].pop(),
        "duplicated Atlas owner": lambda x: x["atlasEntries"][-1].update(id=x["atlasEntries"][0]["id"]),
        "lost original failed ID": lambda x: x["confirmedFailures"].pop(),
        "removed inventory ID": lambda x: x["inventoryMappings"].pop(),
        "false screenshot promotion": lambda x: x["originalCandidateIndex"][0].update(
            evidenceProvenance="INDEPENDENTLY_INSPECTED"),
        "false X11 validation": lambda x: next(i for i in x["inventoryMappings"] if i["id"] == "X11").update(behavior="BV"),
        "mixed status after split": lambda x: next(i for i in x["atlasEntries"] if i["id"] == "ATL-105").update(status="INTENTIONAL_DIFFERENCE"),
        "lost A03 direct evidence": lambda x: next(i for i in x["atlasEntries"] if i["id"] == "ATL-003").pop("directInventoryEvidence"),
        "V-03 falsely direct for delete": lambda x: next(i for i in x["originalCandidateIndex"] if i["id"] == "V-03")["inventoryEvidenceRoles"].update(A03="DIRECT_FAILURE"),
        "remove keyboard slice": lambda x: x["workPackages"].remove(next(i for i in x["workPackages"] if i["id"] == "P2-05c")),
        "lose keyboard dependency": lambda x: next(i for i in x["workPackages"] if i["id"] == "P2-05b").update(dependencies=[]),
        "promote synthetic security": lambda x: next(i for i in x["workPackages"] if i["id"] == "P2-22").update(priority="P1", category="READY_TO_IMPLEMENT"),
        "optional AI terms become gate": lambda x: next(i for i in x["workPackages"] if i["id"] == "P2-12")["optionalFollowUp"].update(blocksRelationFix=True),
        "lose Tempo quantization": lambda x: next(i for i in x["workPackages"] if i["id"] == "P2-03").pop("quantizationRule"),
        "misstate grouped slot count": lambda x: x["reconciliationTotals"].update(groupedSlots=99),
    }
    for label, mutation in changes.items():
        modified = copy.deepcopy(a)
        mutation(modified)
        # Do not let a stale snapshot number alone catch the regression.
        if label != "misstate grouped slot count":
            modified["reconciliationTotals"] = computed_totals(modified)
        errors = validate_data(modified, ledger, manifest)
        if not errors:
            raise AssertionError(f"NEGATIVE CONTROL ESCAPED: {label}")
        print("REJECTED:", label)
    return len(changes)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--negative-controls", action="store_true")
    args = parser.parse_args()
    a = json.loads(ATLAS.read_text())
    archive_errors, checked = check_archive(a)
    if archive_errors:
        print("\n".join("FAIL: " + error for error in archive_errors), file=sys.stderr)
        raise SystemExit(1)
    ledger = json.loads(git("show", f"refs/tags/{TAG}:{LEDGER_ARCHIVE}"))
    manifest = json.loads(MANIFEST.read_text())
    errors = validate_data(a, ledger, manifest)
    errors.extend(check_source_anchors(a))
    errors.extend(check_active_paths(manifest))
    if errors:
        print("\n".join("FAIL: " + error for error in errors), file=sys.stderr)
        raise SystemExit(1)
    negatives = negative_controls(a, ledger, manifest) if args.negative_controls else 0
    print(f"PASS #391: 175 original IDs / 37 batches / 147 candidates / 107 entries / "
          f"25 failed IDs / 25 packages; {checked} historical paths; {negatives} negative controls")
    print(f"Archive: annotated {TAG} -> {BASE}; all {checked} historical paths resolvable")
    print("SOURCE-BACKED: original candidate/batch/A03 lines, independent AGG-02 owners and flags")
    print("STRUCTURAL ONLY: Atlas dispositions, reciprocal mappings, package policies, visual asset identities")
    print("NOT VERIFIED HERE: actual product behavior, source-reported images, native/live-provider or OS acceptance")


if __name__ == "__main__":
    main()
