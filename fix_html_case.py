import os
import re

def lowercase_html_filenames_and_links(root="."):
    for dirpath, _, filenames in os.walk(root):
        for filename in filenames:
            # Step 1: Rename HTML files to lowercase
            if filename.lower().endswith(".html"):
                old_path = os.path.join(dirpath, filename)
                new_filename = filename.lower()
                new_path = os.path.join(dirpath, new_filename)

                if old_path != new_path:
                    os.rename(old_path, new_path)
                    print(f"Renamed: {old_path} → {new_path}")

    # Step 2: Fix href/src references in all HTML files
    pattern = re.compile(r'(href|src)=["\']([^"\']+?\.html)["\']', re.IGNORECASE)

    for dirpath, _, filenames in os.walk(root):
        for filename in filenames:
            if filename.endswith(".html"):
                path = os.path.join(dirpath, filename)
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()

                updated_content = pattern.sub(
                    lambda m: f'{m.group(1)}="{m.group(2).lower()}"',
                    content
                )

                if content != updated_content:
                    with open(path, "w", encoding="utf-8") as f:
                        f.write(updated_content)
                    print(f"Updated references in: {path}")

if __name__ == "__main__":
    lowercase_html_filenames_and_links()
