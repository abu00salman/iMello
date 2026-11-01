#!/usr/bin/env python3
"""Render the Synapse config templates from environment variables.

Usage: render-synapse-config.py <out_dir>
Fails if any ${VAR} placeholder has no value, so a half-configured server never starts.
"""
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEMPLATES = {
    "homeserver.yaml": ROOT / "infrastructure/synapse/homeserver.template.yaml",
    "log.config": ROOT / "infrastructure/synapse/log.template.yaml",
}


def render(text: str) -> str:
    missing = []

    def sub(m: "re.Match[str]") -> str:
        name = m.group(1)
        value = os.environ.get(name)
        if value is None:
            missing.append(name)
            return ""
        return value

    out = re.sub(r"\$\{([A-Z0-9_]+)\}", sub, text)
    if missing:
        sys.exit(f"render-synapse-config: missing environment variables: {', '.join(sorted(set(missing)))}")
    return out


def main() -> None:
    out_dir = Path(sys.argv[1])
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, template in TEMPLATES.items():
        target = out_dir / name
        target.write_text(render(template.read_text()))
        target.chmod(0o600)


if __name__ == "__main__":
    main()
