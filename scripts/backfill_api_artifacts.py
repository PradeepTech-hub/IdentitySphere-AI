"""Backfill API JSON artifacts from existing pipeline CSV + report (no full regen)."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from identitysphere.core.pipeline import IdentitySpherePipeline


def main():
    cfg_path = ROOT / "identitysphere" / "config" / "settings.yaml"

    print("Running pipeline to regenerate artifacts...")
    pipeline = IdentitySpherePipeline(config_path=str(cfg_path))
    report = pipeline.run()

    import subprocess
    subprocess.run([sys.executable, str(ROOT / "build_frontend_data.py")], check=True)
    print("Done. Artifacts in identitysphere/data/generated/")


if __name__ == "__main__":
    main()
