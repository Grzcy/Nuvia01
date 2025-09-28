#!/usr/bin/env python3
"""
Replace OLD_UID with NEW_UID across all text files in a repo,
skip binary files, back up originals, and optionally commit locally.
"""
import os
import sys
import shutil
import argparse
import datetime
from pathlib import Path
import subprocess

# CONFIG - set to your UIDs
OLD_UID = "cc96gdhCRPO72NFZtleRCujHvIq2"
NEW_UID = "RxKuP9OjYrhmSiMSF6CZHK3JZQq1"

# default exclusions
EXCLUDED_DIRS = {
    ".git", "node_modules", "dist", "build", ".next", "venv", ".venv",
    "__pycache__", "coverage", "out", "public"
}

DEFAULT_BACKUP_BASE = ".github/uid_fixer_backups"

def is_binary(data: bytes) -> bool:
    # quick heuristic: if file contains a null byte, treat as binary
    return b'\x00' in data

def make_backup_path(base_backup_dir: Path, target_path: Path, timestamp: str) -> Path:
    rel = target_path.relative_to(Path.cwd())
    backup_path = base_backup_dir / timestamp / rel
    backup_path.parent.mkdir(parents=True, exist_ok=True)
    return backup_path

def find_and_replace(root_dir: Path, backup_dir: Path):
    old_b = OLD_UID.encode("utf-8")
    new_b = NEW_UID.encode("utf-8")
    timestamp = datetime.datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    replaced_files = []
    total_replacements = 0

    for dirpath, dirnames, filenames in os.walk(root_dir):
        # prune excluded directories in-place
        dirnames[:] = [d for d in dirnames if d not in EXCLUDED_DIRS]
        for fname in filenames:
            fp = Path(dirpath) / fname
            try:
                with fp.open("rb") as fh:
                    data = fh.read()
            except Exception as e:
                print(f"⚠️  Skipping (can't read): {fp} — {e}")
                continue

            if is_binary(data):
                # don't touch binaries
                continue

            if old_b in data:
                count = data.count(old_b)
                backup_path = make_backup_path(backup_dir, fp, timestamp)
                shutil.copy2(fp, backup_path)
                new_data = data.replace(old_b, new_b)
                try:
                    with fp.open("wb") as fh:
                        fh.write(new_data)
                except Exception as e:
                    print(f"❌ Failed writing to {fp}: {e}")
                    # try to restore from backup
                    shutil.copy2(backup_path, fp)
                    continue

                replaced_files.append(str(fp))
                total_replacements += count
                print(f"✅ Replaced {count} occurrence(s) in: {fp}")

    return replaced_files, total_replacements, timestamp

def try_git_commit(msg: str):
    # stage, commit and push only if repo exists
    try:
        # check if this is inside a git repo
        subprocess.run(["git", "rev-parse", "--is-inside-work-tree"], check=True, stdout=subprocess.DEVNULL)
    except subprocess.CalledProcessError:
        print("ℹ️  Not a git repo (or git not installed) — skipping commit.")
        return False

    # configure minimal identity if not set
    try:
        subprocess.run(["git", "config", "--get", "user.name"], check=True, stdout=subprocess.DEVNULL)
    except subprocess.CalledProcessError:
        subprocess.run(["git", "config", "user.name", "uid-fixer-bot"], check=True)
        subprocess.run(["git", "config", "user.email", "uid-fixer-bot@example.com"], check=True)

    # add, but exclude backup dir so backups are not committed
    subprocess.run(["git", "add", "-A"], check=True)
    # remove backups from staged, if any (defensive)
    subprocess.run(["git", "reset", "--", DEFAULT_BACKUP_BASE], check=False)

    # commit if staged changes exist
    status = subprocess.run(["git", "diff", "--cached", "--quiet"])
    if status.returncode == 0:
        print("ℹ️  No staged changes to commit.")
        return False

    subprocess.run(["git", "commit", "-m", msg], check=True)
    # push
    try:
        subprocess.run(["git", "push"], check=True)
    except subprocess.CalledProcessError as e:
        print(f"⚠️  git push failed: {e}")
        return False
    return True

def main():
    p = argparse.ArgumentParser(description="Replace an old UID with a new UID across the repo.")
    p.add_argument("--root", default=".", help="Root directory to scan (default: current dir)")
    p.add_argument("--backup-dir", default=DEFAULT_BACKUP_BASE, help=f"Where to store backups (default: {DEFAULT_BACKUP_BASE})")
    p.add_argument("--commit", action="store_true", help="If set, git commit & push changes (local git)")
    p.add_argument("--commit-message", default="chore(uid-fix): replace old admin UID", help="Commit message when --commit is used")
    args = p.parse_args()

    root = Path(args.root).resolve()
    backup = Path(args.backup_dir).resolve()
    backup.mkdir(parents=True, exist_ok=True)

    print(f"🔎 Scanning {root} (excluding: {', '.join(sorted(EXCLUDED_DIRS))})")
    replaced_files, total_replacements, ts = find_and_replace(root, backup)

    if not replaced_files:
        print("✅ No occurrences of the old UID were found.")
        return 0

    print(f"\n🎯 Summary: replaced {total_replacements} occurrence(s) in {len(replaced_files)} file(s).")
    print(f"📁 Backups stored under: {backup / ts}")

    if args.commit:
        success = try_git_commit(args.commit_message)
        if success:
            print("✅ Changes committed and pushed.")
        else:
            print("⚠️  Changes were not pushed (see messages above).")

    return 0

if __name__ == "__main__":
    sys.exit(main())
