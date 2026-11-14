"""Opt-in, path-only watcher for Arena live-world activity."""
from __future__ import annotations
import argparse, json, subprocess, time, urllib.request
from pathlib import Path

def is_safe_path(path: str) -> bool:
    import fnmatch
    name = Path(path).name.lower()
    return bool(path) and not Path(path).is_absolute() and ".." not in Path(path).parts and ".git" not in Path(path).parts and not any(fnmatch.fnmatch(name, pat) for pat in (".env*", "*.pem", "*.key", "id_rsa*", "credentials*", "*.p12"))

def changed_paths(repo: Path) -> list[str]:
    output = subprocess.check_output(["git", "-C", str(repo), "status", "--porcelain"], text=True)
    return [line[3:].replace("\\", "/") for line in output.splitlines() if len(line) > 3 and is_safe_path(line[3:].replace("\\", "/"))]

def branch(repo: Path) -> str:
    return subprocess.check_output(["git", "-C", str(repo), "rev-parse", "--abbrev-ref", "HEAD"], text=True).strip()

def post(server: str, token: str, session: str, events: list[dict]) -> None:
    request = urllib.request.Request(f"{server.rstrip('/')}/arena/sessions/{session}/activity", data=json.dumps({"events": events}).encode(), headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(request, timeout=10) as response: print(response.read().decode())

def main() -> None:
    parser = argparse.ArgumentParser(); parser.add_argument("--server", required=True); parser.add_argument("--token", required=True); parser.add_argument("--session", required=True); parser.add_argument("--repo", default="."); parser.add_argument("--interval", type=float, default=5); parser.add_argument("--once", action="store_true"); parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(); repo = Path(args.repo).resolve(); confirmed = False
    while True:
        events = [{"path": p, "type": "edit", "branch": branch(repo), "source": "watcher"} for p in changed_paths(repo)]
        if not confirmed:
            print(json.dumps({"will_send": events}, indent=2));
            if input('Type "yes" to begin sending path-only events: ') != "yes": return
            confirmed = True
        if events and not args.dry_run: post(args.server, args.token, args.session, events)
        if args.dry_run: print(json.dumps({"would_send": events}))
        if args.once: return
        time.sleep(args.interval)

if __name__ == "__main__": main()
