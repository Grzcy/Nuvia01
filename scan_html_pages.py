#!/usr/bin/env python3
import os
import re
import sys
import csv
from typing import Dict, List

ROOT = "."

TITLE_RE = re.compile(r"<title\b[^>]*>(.*?)</title>", re.I | re.S)
HREF_RE = re.compile(r"<a\b[^>]*href=([\"\'])(.*?)\1", re.I)
SCRIPT_RE = re.compile(r"<script\b", re.I)
SCRIPT_SRC_RE = re.compile(r"<script\b[^>]*src=([\"\'])(.*?)\1", re.I)
LINK_STYLESHEET_RE = re.compile(r"<link\b[^>]*rel=([\"\'])(?:stylesheet|preload)\1", re.I)
IMG_RE = re.compile(r"<img\b[^>]*src=([\"\'])(.*?)\1", re.I)
META_VIEWPORT_RE = re.compile(r"<meta\b[^>]*name=([\"\'])viewport\1", re.I)
DOCTYPE_RE = re.compile(r"<!doctype html>", re.I)


def find_html_files(root: str) -> List[str]:
    html_files: List[str] = []
    for dirpath, dirnames, filenames in os.walk(root):
        # skip .git
        if ".git" in dirnames:
            dirnames.remove(".git")
        for fname in filenames:
            if fname.lower().endswith(".html"):
                html_files.append(os.path.join(dirpath, fname))
    return sorted(html_files)


def analyze_html(path: str) -> Dict[str, str]:
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except Exception as exc:
        return {
            "file": path,
            "size_bytes": "",
            "lines": "",
            "title": f"ERROR: {exc}",
            "has_doctype": "",
            "has_meta_viewport": "",
            "num_links": "",
            "num_external_links": "",
            "num_scripts": "",
            "num_scripts_with_src": "",
            "num_stylesheets": "",
            "num_images": "",
        }

    size_bytes = os.path.getsize(path)
    lines = content.count("\n") + 1

    title_match = TITLE_RE.search(content)
    title = title_match.group(1).strip() if title_match else ""
    title = re.sub(r"\s+", " ", title)

    links = HREF_RE.findall(content)
    link_targets = [t[1] for t in links]
    external_links = [u for u in link_targets if u.lower().startswith(("http://", "https://"))]

    num_scripts = len(SCRIPT_RE.findall(content))
    scripts_with_src = [m[1] for m in SCRIPT_SRC_RE.findall(content)]

    stylesheets = LINK_STYLESHEET_RE.findall(content)
    images = IMG_RE.findall(content)

    has_viewport = bool(META_VIEWPORT_RE.search(content))
    has_doctype = bool(DOCTYPE_RE.search(content))

    return {
        "file": path,
        "size_bytes": str(size_bytes),
        "lines": str(lines),
        "title": title,
        "has_doctype": "yes" if has_doctype else "no",
        "has_meta_viewport": "yes" if has_viewport else "no",
        "num_links": str(len(link_targets)),
        "num_external_links": str(len(external_links)),
        "num_scripts": str(num_scripts),
        "num_scripts_with_src": str(len(scripts_with_src)),
        "num_stylesheets": str(len(stylesheets)),
        "num_images": str(len(images)),
    }


def main() -> None:
    files = find_html_files(ROOT)
    fieldnames = [
        "file",
        "size_bytes",
        "lines",
        "title",
        "has_doctype",
        "has_meta_viewport",
        "num_links",
        "num_external_links",
        "num_scripts",
        "num_scripts_with_src",
        "num_stylesheets",
        "num_images",
    ]
    writer = csv.DictWriter(sys.stdout, fieldnames=fieldnames)
    writer.writeheader()
    for path in files:
        row = analyze_html(path)
        writer.writerow(row)


if __name__ == "__main__":
    main()