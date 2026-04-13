#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; }

EXTENSION_UUID="gdm-pin-login@panda-dev.ubuntu"

get_home_dir() {
    getent passwd "$1" | cut -d: -f6
}

run_gsettings_for_user() {
    local target_user="$1"
    shift

    local target_home
    target_home="$(get_home_dir "$target_user")"

    if [ -z "$target_home" ]; then
        return 1
    fi

    runuser -u "$target_user" -- env HOME="$target_home" XDG_CONFIG_HOME="$target_home/.config" dbus-run-session gsettings "$@"
}

update_enabled_extensions_list() {
    local action="$1"

    python3 - "$action" "$EXTENSION_UUID" <<'PY'
import ast
import sys

action = sys.argv[1]
uuid = sys.argv[2]
raw = sys.stdin.read().strip() or '@as []'

if raw.startswith('@as '):
    raw = raw[4:]

try:
    extensions = ast.literal_eval(raw)
except Exception:
    extensions = []

if not isinstance(extensions, list):
    extensions = []

if action == 'remove':
    extensions = [extension for extension in extensions if extension != uuid]
elif action == 'add':
    if uuid not in extensions:
        extensions.append(uuid)

print(repr(extensions))
PY
}

disable_extension_for_account() {
    local target_user="$1"
    local label="$2"

    if ! id "$target_user" &>/dev/null; then
        return 0
    fi

    local current_extensions
    if ! current_extensions="$(run_gsettings_for_user "$target_user" get org.gnome.shell enabled-extensions 2>/dev/null)"; then
        return 0
    fi

    local updated_extensions
    updated_extensions="$(printf '%s' "$current_extensions" | update_enabled_extensions_list remove)"

    if run_gsettings_for_user "$target_user" set org.gnome.shell enabled-extensions "$updated_extensions" 2>/dev/null; then
        info "Extension disabled for $label"
    fi
}

if [ "$EUID" -ne 0 ]; then
    error "Please run as root: sudo ./uninstall.sh"
    exit 1
fi

REAL_USER="${SUDO_USER:-$(logname 2>/dev/null || echo '')}"
REAL_HOME=$(eval echo "~$REAL_USER")

echo "Uninstalling Ubuntu PIN Login..."

# Remove PAM module
ARCH=$(dpkg-architecture -qDEB_HOST_MULTIARCH 2>/dev/null || echo "x86_64-linux-gnu")
rm -f "/lib/${ARCH}/security/pam_pin.so"
rm -f "/lib/security/pam_pin.so"
info "PAM module removed"

# Remove GNOME Shell extension
disable_extension_for_account "$REAL_USER" "$REAL_USER"
disable_extension_for_account "gdm" "the GDM login screen"
rm -rf "/usr/share/gnome-shell/extensions/${EXTENSION_UUID}"
rm -rf "$REAL_HOME/.local/share/gnome-shell/extensions/${EXTENSION_UUID}"
info "GNOME Shell extension removed"

# Remove settings app
rm -f /usr/bin/ubuntu-pin-login-settings
rm -rf /usr/libexec/ubuntu-pin-login
rm -f /usr/share/applications/ubuntu-pin-login-settings.desktop
info "Settings app removed"

# Remove Polkit policy
rm -f /usr/share/polkit-1/actions/com.ubuntu.pin-login.policy
info "Polkit policy removed"

# Remove PAM config line
PAM_FILE="/etc/pam.d/gdm-password"
if [ -f "$PAM_FILE" ] && grep -q "pam_pin.so" "$PAM_FILE"; then
    sed -i '/pam_pin.so/d' "$PAM_FILE"
    info "PAM configuration cleaned"
fi

echo ""
echo -e "${GREEN}Uninstall complete.${NC}"
echo "Note: PIN data in /etc/gdm-pin/ was preserved. Remove manually if desired:"
echo "  sudo rm -rf /etc/gdm-pin"
