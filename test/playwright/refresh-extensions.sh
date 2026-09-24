#!/usr/bin/env bash
# Regenerate ~/.playwright-mcp/config.json to load Chrome extensions via STABLE
# symlinks under ~/.playwright-mcp/ext/, instead of raw versioned paths.
#
# Run this on a Mac that has not driven BBO from Playwright before: pwrun.mjs
# loads the extensions through those symlinks, and until they exist it has
# nothing to load. It reads the extensions out of the Chrome profile of
# whoever runs it, so each person gets their own copies of their own installs;
# nothing here is specific to one machine. Needs `jq`.
#
# `node pwrun.mjs --check` says whether this worked.
#
# Why symlinks
# ------------
# Chrome stores each extension under a version folder (e.g. .../<id>/1.5.1_0)
# and silently auto-updates it (-> 1.5.4_0), deleting the old folder. If
# config.json baked in the raw versioned path, that path breaks on every
# update — and because the Playwright MCP server reads config.json ONCE at
# startup and caches it, you'd keep getting Chrome's blocking modal
# "Failed to load extension from: . Manifest file is missing or unreadable"
# (which flashes in the Dock and hangs the launch until dismissed) until the
# MCP server was restarted.
#
# With symlinks, config.json points at ~/.playwright-mcp/ext/<id> — a path that
# NEVER changes. This script just repoints that symlink to the current version
# folder. So after an extension update you only re-run THIS script; you do NOT
# need to restart/reconnect the MCP, because the paths in config.json are
# unchanged and the symlinks now resolve to the new version.
#
# (One-time: the FIRST switch from raw paths to symlinks does change config.json,
# so reconnect the Playwright MCP once after that migration. From then on it's
# refresh-only, no restart.)
#
# Run this whenever an extension updates (or on a schedule). Edit EXTENSIONS to
# add/remove entries.

set -euo pipefail

CHROME_EXT_DIR="$HOME/Library/Application Support/Google/Chrome/Default/Extensions"
MCP_DIR="$HOME/.playwright-mcp"
LINK_DIR="$MCP_DIR/ext"
USER_DATA_DIR="$MCP_DIR/bbo-profile"
CONFIG_PATH="$MCP_DIR/config.json"

# id<TAB>friendly-name — friendly-name is for diagnostic output only
EXTENSIONS=(
  "bfgapanhaiakopfngbjiapbcgdgojoed	PBS with BBA Compare"
  "bjgihidachainhhhilkeemegdhehnlcf	BBOalert"
  # BBO Helper — deliberately NOT loaded in the Playwright profile.
  # Extensions loaded via --load-extension are re-installed on every Chrome
  # launch, so chrome.runtime.onInstalled fires with reason "install" each
  # time. BBO Helper's handler (service.js) only guards against
  # d.previousVersion === version, which is undefined on a real install, so
  # it opened lifecycle/install.html in a new tab on every single session.
  # Re-enable by uncommenting if it is ever needed for automated testing.
  # "jlhdaeggmepllmioeamkmnmemmfiogjd	BBO Helper"
  "kokhaneonlmnbgbnlohmbkgeahbjanbj	Bridge Solver"
  "omcdgcoibkfkiikoniabecnbbacmhfij	BBO Extractor"
)

mkdir -p "$LINK_DIR"

paths=()
missing=()

for row in "${EXTENSIONS[@]}"; do
  id="${row%%	*}"
  name="${row#*	}"
  # Most recent version subdir by mtime.
  ver_dir=$(ls -td "$CHROME_EXT_DIR/$id"/*/ 2>/dev/null | head -1 || true)
  link="$LINK_DIR/$id"
  if [ -n "$ver_dir" ] && [ -f "${ver_dir%/}/manifest.json" ]; then
    ver_dir="${ver_dir%/}"
    ver=$(basename "$ver_dir")
    ln -sfn "$ver_dir" "$link"   # atomically (re)point the stable symlink
    printf '  %-32s %-12s %s\n' "$name" "$ver" "OK -> ext/$id"
    paths+=("$link")
  else
    printf '  %-32s %-12s %s\n' "$name" "-" "MISSING (skipped)"
    missing+=("$name ($id)")
    rm -f "$link"                # drop any dangling link so Chrome won't choke
  fi
done

if [ "${#paths[@]}" -eq 0 ]; then
  echo "No extensions resolved — refusing to write empty config." >&2
  exit 1
fi

# Comma-joined stable symlink paths for --load-extension / --disable-extensions-except.
joined=$(IFS=,; echo "${paths[*]}")

jq -n \
  --arg userDataDir "$USER_DATA_DIR" \
  --arg disableArg "--disable-extensions-except=$joined" \
  --arg loadArg "--load-extension=$joined" \
  '{
    browser: {
      browserName: "chromium",
      userDataDir: $userDataDir,
      launchOptions: {
        args: [$disableArg, $loadArg]
      }
    }
  }' > "$CONFIG_PATH.tmp"

mv "$CONFIG_PATH.tmp" "$CONFIG_PATH"
echo
echo "Wrote $CONFIG_PATH (extensions loaded via stable symlinks in $LINK_DIR)"

if [ "${#missing[@]}" -gt 0 ]; then
  echo
  echo "Note: ${#missing[@]} extension(s) not installed and skipped:"
  for m in "${missing[@]}"; do echo "  - $m"; done
fi
