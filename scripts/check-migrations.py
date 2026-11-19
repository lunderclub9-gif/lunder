#!/usr/bin/env python3
"""Static checks for the forward-only Supabase migration history.

This is deliberately not a SQL parser and never connects to Supabase. It catches
migration hygiene regressions early while treating CREATE OR REPLACE as an
intentional evolution that must be reviewed, not deleted automatically.
"""
from __future__ import annotations

import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "supabase" / "migrations"
FILENAME = re.compile(r"^(\d{14})_([a-z0-9][a-z0-9_-]*)\.sql$")
CREATE_OBJECT = re.compile(
    r"CREATE\s+(?P<replace>OR\s+REPLACE\s+)?(?P<kind>TABLE|TYPE|VIEW|TRIGGER|INDEX|POLICY|FUNCTION)"
    r"(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:public\.|storage\.|lunder_private\.)?\"?([^\s\(\"]+)\"?",
    re.IGNORECASE,
)
DROP_FUNCTION = re.compile(r"DROP\s+FUNCTION\s+IF\s+EXISTS\s+(?:public\.)?([\w]+)", re.IGNORECASE)
FUNCTION_BLOCK = re.compile(
    r"CREATE\s+OR\s+REPLACE\s+FUNCTION\b.*?\$\$;", re.IGNORECASE | re.DOTALL
)


def main() -> int:
    files = sorted(ROOT.glob("*.sql"))
    errors: list[str] = []
    warnings: list[str] = []
    identifiers: dict[str, str] = {}
    object_defs: defaultdict[tuple[str, str], list[tuple[str, bool]]] = defaultdict(list)
    defined_functions: set[str] = set()

    if not files:
        errors.append(f"No migrations found in {ROOT}")

    previous_timestamp = ""
    for path in files:
        match = FILENAME.match(path.name)
        if not match:
            errors.append(f"Invalid migration filename: {path.name}")
            continue
        timestamp = match.group(1)
        if timestamp in identifiers:
            errors.append(f"Duplicate migration timestamp {timestamp}: {identifiers[timestamp]} and {path.name}")
        identifiers[timestamp] = path.name
        if previous_timestamp and timestamp <= previous_timestamp:
            errors.append(f"Migration order is not strictly increasing: {path.name}")
        previous_timestamp = timestamp

        text = path.read_text(encoding="utf-8", errors="replace")
        for object_match in CREATE_OBJECT.finditer(text):
            kind = object_match.group("kind").lower()
            name = object_match.group(3).lower()
            replace = bool(object_match.group("replace"))
            object_defs[(kind, name)].append((path.name, replace))
            if kind == "function":
                defined_functions.add(name)

        # Every CREATE OR REPLACE SECURITY DEFINER function must pin search_path.
        for block in FUNCTION_BLOCK.findall(text):
            if "SECURITY DEFINER" in block.upper() and "SEARCH_PATH" not in block.upper():
                errors.append(f"SECURITY DEFINER function without SET search_path: {path.name}")

        for name in DROP_FUNCTION.findall(text):
            if name.lower() not in defined_functions:
                warnings.append(f"Function dropped before a local definition is seen: {path.name} -> {name}")

    for (kind, name), definitions in sorted(object_defs.items()):
        if len(definitions) < 2:
            continue
        if kind == "function":
            # Replacements are expected in a forward migration history. Keep a
            # visible inventory line so reviewers do not mistake them for loss.
            warnings.append(
                f"Intentional-or-review CREATE OR REPLACE history: {kind} {name} in "
                + ", ".join(file for file, _ in definitions)
            )
        else:
            # A repeated trigger is a controlled replacement when its later
            # migration drops it first. Policies and views follow the same
            # forward-replacement pattern in this repository.
            if kind not in {"policy", "view", "trigger"}:
                errors.append(
                    f"Repeated non-function object definition: {kind} {name} in "
                    + ", ".join(file for file, _ in definitions)
                )

    print(f"migrations={len(files)}")
    print(f"unique_timestamps={len(identifiers)}")
    print(f"repeated_objects={sum(1 for defs in object_defs.values() if len(defs) > 1)}")
    for warning in warnings:
        print(f"WARNING: {warning}")
    for error in errors:
        print(f"ERROR: {error}", file=sys.stderr)
    if errors:
        return 1
    print("migration static checks: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
