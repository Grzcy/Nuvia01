#!/usr/bin/env python3
import argparse
import base64
import csv
import json
import os
import sys
import urllib.error
import urllib.request
from typing import Dict, List, Optional, Tuple

GITHUB_API = "https://api.github.com"


def build_headers(accept: str, token: Optional[str]) -> Dict[str, str]:
    headers = {
        "Accept": accept,
        "User-Agent": "github-scan-cli/1.0",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def http_get(url: str, accept: str, token: Optional[str], timeout: int = 30) -> Tuple[int, bytes, Dict[str, str]]:
    req = urllib.request.Request(url, headers=build_headers(accept, token))
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            status = resp.getcode() or 200
            data = resp.read()
            headers = {k.lower(): v for k, v in resp.headers.items()}
            return status, data, headers
    except urllib.error.HTTPError as e:
        status = e.code
        data = e.read() if e.fp else b""
        return status, data, {}
    except urllib.error.URLError as e:
        return 0, str(e).encode("utf-8", errors="replace"), {}


def fetch_repo(owner: str, repo: str, token: Optional[str]) -> Dict:
    url = f"{GITHUB_API}/repos/{owner}/{repo}"
    status, data, _ = http_get(url, "application/vnd.github+json", token)
    if status == 404:
        return {"error": "not_found", "status": 404}
    if status != 200:
        msg = None
        try:
            msg = json.loads(data.decode("utf-8", errors="replace")).get("message")
        except Exception:
            msg = data.decode("utf-8", errors="replace")
        return {"error": "http_error", "status": status, "message": msg}
    try:
        return json.loads(data.decode("utf-8", errors="replace"))
    except Exception as exc:
        return {"error": "json_decode_error", "status": status, "message": str(exc)}


def fetch_readme_json(owner: str, repo: str, token: Optional[str]) -> Dict:
    url = f"{GITHUB_API}/repos/{owner}/{repo}/readme"
    status, data, _ = http_get(url, "application/vnd.github+json", token)
    if status == 404:
        return {"error": "readme_not_found", "status": 404}
    if status != 200:
        msg = None
        try:
            msg = json.loads(data.decode("utf-8", errors="replace")).get("message")
        except Exception:
            msg = data.decode("utf-8", errors="replace")
        return {"error": "http_error", "status": status, "message": msg}
    try:
        return json.loads(data.decode("utf-8", errors="replace"))
    except Exception as exc:
        return {"error": "json_decode_error", "status": status, "message": str(exc)}


def fetch_readme_html(owner: str, repo: str, token: Optional[str]) -> Optional[str]:
    url = f"{GITHUB_API}/repos/{owner}/{repo}/readme"
    status, data, _ = http_get(url, "application/vnd.github.v3.html", token)
    if status == 404:
        return None
    if status != 200:
        return None
    return data.decode("utf-8", errors="replace")


def decode_readme_content(readme_json: Dict, mode: str) -> Optional[str]:
    if not readme_json or "content" not in readme_json or readme_json.get("encoding") != "base64":
        return None
    try:
        raw_bytes = base64.b64decode(readme_json["content"], validate=False)
    except Exception:
        return None
    if mode == "raw":
        return raw_bytes.decode("utf-8", errors="replace")
    return None


def parse_repo_slug(slug: str) -> Tuple[str, str]:
    if "/" not in slug:
        raise ValueError(f"Invalid repo slug '{slug}'. Expected 'owner/repo'.")
    owner, repo = slug.split("/", 1)
    if not owner or not repo:
        raise ValueError(f"Invalid repo slug '{slug}'. Expected 'owner/repo'.")
    return owner, repo


def collect_record(slug: str, readme_mode: str, token: Optional[str]) -> Dict:
    owner, repo = parse_repo_slug(slug)
    repo_json = fetch_repo(owner, repo, token)
    record: Dict = {
        "slug": slug,
        "status": repo_json.get("status", 200),
    }
    if "error" in repo_json:
        record["error"] = repo_json.get("error")
        if "message" in repo_json:
            record["message"] = repo_json.get("message")
        return record

    record.update({
        "id": repo_json.get("id"),
        "name": repo_json.get("name"),
        "full_name": repo_json.get("full_name"),
        "private": repo_json.get("private"),
        "owner_login": (repo_json.get("owner") or {}).get("login"),
        "description": repo_json.get("description"),
        "fork": repo_json.get("fork"),
        "created_at": repo_json.get("created_at"),
        "updated_at": repo_json.get("updated_at"),
        "pushed_at": repo_json.get("pushed_at"),
        "homepage": repo_json.get("homepage"),
        "size": repo_json.get("size"),
        "stargazers_count": repo_json.get("stargazers_count"),
        "watchers_count": repo_json.get("watchers_count"),
        "language": repo_json.get("language"),
        "has_issues": repo_json.get("has_issues"),
        "has_projects": repo_json.get("has_projects"),
        "has_downloads": repo_json.get("has_downloads"),
        "has_wiki": repo_json.get("has_wiki"),
        "has_pages": repo_json.get("has_pages"),
        "forks_count": repo_json.get("forks_count"),
        "archived": repo_json.get("archived"),
        "disabled": repo_json.get("disabled"),
        "open_issues_count": repo_json.get("open_issues_count"),
        "license": (repo_json.get("license") or {}).get("spdx_id"),
        "allow_forking": repo_json.get("allow_forking"),
        "is_template": repo_json.get("is_template"),
        "web_commit_signoff_required": repo_json.get("web_commit_signoff_required"),
        "topics": ",".join(repo_json.get("topics") or []),
        "visibility": repo_json.get("visibility"),
        "forks": repo_json.get("forks"),
        "open_issues": repo_json.get("open_issues"),
        "watchers": repo_json.get("watchers"),
        "default_branch": repo_json.get("default_branch"),
        "html_url": repo_json.get("html_url"),
    })

    if readme_mode == "raw":
        readme_json = fetch_readme_json(owner, repo, token)
        if "error" not in readme_json:
            record["readme_raw"] = decode_readme_content(readme_json, mode="raw")
        else:
            record["readme_error"] = readme_json.get("error")
            if readme_json.get("message"):
                record["readme_message"] = readme_json.get("message")
    elif readme_mode == "html":
        html = fetch_readme_html(owner, repo, token)
        record["readme_html"] = html

    return record


essential_keys_for_csv = [
    "slug",
    "status",
    "full_name",
    "description",
    "stargazers_count",
    "forks_count",
    "open_issues_count",
    "license",
    "topics",
    "default_branch",
    "html_url",
]


def output_json(records: List[Dict], pretty: bool, ndjson: bool) -> None:
    if ndjson:
        for rec in records:
            print(json.dumps(rec, ensure_ascii=False))
        return
    if pretty:
        print(json.dumps(records, ensure_ascii=False, indent=2))
    else:
        print(json.dumps(records, ensure_ascii=False))


def output_csv(records: List[Dict]) -> None:
    if not records:
        return
    keys = sorted({key for rec in records for key in rec.keys()})
    writer = csv.DictWriter(sys.stdout, fieldnames=keys)
    writer.writeheader()
    for rec in records:
        writer.writerow({k: rec.get(k, "") for k in keys})


def read_repos_from_file(path: str) -> List[str]:
    with open(path, "r", encoding="utf-8") as f:
        return [line.strip() for line in f if line.strip() and not line.strip().startswith("#")]


def main() -> None:
    parser = argparse.ArgumentParser(description="Scan GitHub repository main pages (metadata + README)")
    src = parser.add_mutually_exclusive_group(required=True)
    src.add_argument("--repos", nargs="*", help="List of owner/repo slugs")
    src.add_argument("--file", help="File with one owner/repo per line")

    parser.add_argument("--readme", choices=["html", "raw", "none"], default="html", help="Include README content mode")
    parser.add_argument("--format", choices=["json", "csv"], default="json")
    parser.add_argument("--ndjson", action="store_true", help="Output JSON as newline-delimited records")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON")
    parser.add_argument("--token", help="GitHub token (overrides GITHUB_TOKEN env)")
    args = parser.parse_args()

    token = args.token or os.getenv("GITHUB_TOKEN")

    slugs: List[str] = []
    if args.repos:
        slugs.extend(args.repos)
    if args.file:
        slugs.extend(read_repos_from_file(args.file))

    records: List[Dict] = []
    for slug in slugs:
        try:
            records.append(collect_record(slug, args.readme, token))
        except Exception as exc:
            records.append({"slug": slug, "error": str(exc)})

    if args.format == "json":
        output_json(records, pretty=args.pretty, ndjson=args.ndjson)
    else:
        output_csv(records)


if __name__ == "__main__":
    main()