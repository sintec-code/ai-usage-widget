#!/usr/bin/env bash
set -euo pipefail

PACKAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/package"
readonly PACKAGE_DIR
readonly PLUGIN_ID="com.github.sinteccode.aiusage"
readonly VIEWER_SECONDS=15

HOME="$(mktemp -d)"
XDG_RUNTIME_DIR="$(mktemp -d)"
XDG_CACHE_HOME="$(mktemp -d)"
XDG_CONFIG_HOME="$(mktemp -d)"
XDG_DATA_HOME="$(mktemp -d)"
QT_FORCE_STDERR_LOGGING=1
export HOME XDG_RUNTIME_DIR XDG_CACHE_HOME XDG_CONFIG_HOME XDG_DATA_HOME QT_FORCE_STDERR_LOGGING
chmod 700 "$XDG_RUNTIME_DIR"

kpackagetool6 -t Plasma/Applet -i "$PACKAGE_DIR" >/dev/null

check_access_time_is_tracked() {
  local probe="$HOME/access-time-probe"
  printf 'probe\n' > "$probe"
  local before
  before="$(stat -c '%X' "$probe")"
  sleep 1
  cat "$probe" > /dev/null
  if [[ "$(stat -c '%X' "$probe")" -eq "$before" ]]; then
    printf 'not ok - access time not tracked, the no read check cannot work here\n'
    exit 1
  fi
}

check_access_time_is_tracked

claude_file="$HOME/.config/Claude/plan-usage-history.json"
mkdir -p "$(dirname "$claude_file")"
printf '{"version":2,"samples":[]}\n' > "$claude_file"
read_before="$(stat -c '%X' "$claude_file")"
sleep 1

log="$(mktemp)"
timeout -s KILL $((VIEWER_SECONDS + 5)) dbus-run-session -- timeout -s KILL "$VIEWER_SECONDS" plasmawindowed "$PLUGIN_ID" > "$log" 2>&1 || true

failures=0
if grep -n -E "plasmoids/$PLUGIN_ID|TypeError|ReferenceError|SyntaxError" "$log"; then
  printf 'not ok - the widget QML printed warnings or errors\n'
  failures=$((failures + 1))
else
  printf 'ok - the widget loaded without QML warnings or errors\n'
fi

if [[ ! -e "$XDG_CONFIG_HOME/ai-usage-widgetrc" ]]; then
  printf 'ok - with the default settings the widget wrote no settings file\n'
else
  printf 'not ok - with the default settings the widget wrote %s\n' "$XDG_CONFIG_HOME/ai-usage-widgetrc"
  failures=$((failures + 1))
fi

if [[ "$(stat -c '%X' "$claude_file")" -eq "$read_before" ]]; then
  printf 'ok - with the default settings the widget read no file, no service is on\n'
else
  printf 'not ok - with the default settings the widget read the Claude file\n'
  failures=$((failures + 1))
fi

[[ $failures -eq 0 ]]
