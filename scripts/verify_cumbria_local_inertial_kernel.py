#!/usr/bin/env python3
"""Verify the frozen Cumbria numerical kernel using isolated fixtures only."""

from __future__ import annotations

import json
import hashlib
from pathlib import Path
import sys


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
ENGINE_ROOT = REPOSITORY_ROOT / "surface-flow-engine"
sys.path.insert(0, str(ENGINE_ROOT))

from surface_flow.fixtures import run_fixture_suite  # noqa: E402


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    manifest_path = (
        REPOSITORY_ROOT / "tests" / "ground-truth" / "cumbria-2015" / "manifest.json"
    )
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    verification = manifest["publicBaselineNumericalKernelVerification"]
    implementation = verification["implementation"]

    if verification["protocol"]["sha256"] != manifest["replacementSolverProtocol"][
        "protocolSha256"
    ]:
        raise RuntimeError("numerical-kernel verification protocol identity drifted")

    source_identities = {
        "moduleSha256": _sha256(REPOSITORY_ROOT / implementation["module"]),
        "fixtureModuleSha256": _sha256(
            REPOSITORY_ROOT / implementation["fixtureModule"]
        ),
        "verifierSha256": _sha256(REPOSITORY_ROOT / implementation["verifier"]),
    }
    for field, actual in source_identities.items():
        if actual != implementation[field]:
            raise RuntimeError(f"numerical-kernel {field} drifted")

    result = run_fixture_suite()
    if result["resultSha256"] != verification["fixtureSuite"]["resultSha256"]:
        raise RuntimeError("numerical-kernel fixture result identity drifted")

    output = {
        "manifestVersion": manifest["manifestVersion"],
        "protocolSha256": verification["protocol"]["sha256"],
        "sourceIdentities": source_identities,
        "fixtureResult": result,
        "eventExecutionAuthorized": verification["isolation"][
            "eventExecutionAuthorized"
        ],
        "evaluationReferenceAccessAllowed": verification["isolation"][
            "evaluationReferenceAccessAllowed"
        ],
    }
    print(json.dumps(output, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
