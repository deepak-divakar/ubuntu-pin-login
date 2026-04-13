#!/bin/bash
set -e

# ============================================================
# Ubuntu PIN Login - Installer
# Supports Ubuntu 24.04+ with GNOME 45/46/47
# ============================================================

EXTENSION_UUID="gdm-pin-login@panda-dev.ubuntu"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---- Color helpers ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; }

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

if action == 'add':
    if uuid not in extensions:
        extensions.append(uuid)
elif action == 'remove':
    extensions = [extension for extension in extensions if extension != uuid]

print(repr(extensions))
PY
}

enable_extension_for_account() {
    local target_user="$1"
    local label="$2"

    if ! id "$target_user" &>/dev/null; then
        warn "$label account '$target_user' not found; skipping extension enable"
        return 0
    fi

    local current_extensions
    if ! current_extensions="$(run_gsettings_for_user "$target_user" get org.gnome.shell enabled-extensions 2>/dev/null)"; then
        warn "Could not read enabled extensions for $label; skipping"
        return 0
    fi

    local updated_extensions
    updated_extensions="$(printf '%s' "$current_extensions" | update_enabled_extensions_list add)"

    if run_gsettings_for_user "$target_user" set org.gnome.shell enabled-extensions "$updated_extensions" 2>/dev/null; then
        if [ "$target_user" = "gdm" ]; then
            run_gsettings_for_user "$target_user" set org.gnome.shell disable-user-extensions false 2>/dev/null || true
        fi
        info "Extension enabled for $label"
    else
        warn "Could not enable extension for $label automatically"
    fi
}

# ---- Root check ----
if [ "$EUID" -ne 0 ]; then
    error "Please run as root: sudo ./install.sh"
    exit 1
fi

# ---- Detect the real user who invoked sudo ----
REAL_USER="${SUDO_USER:-$(logname 2>/dev/null || echo '')}"
if [ -z "$REAL_USER" ] || [ "$REAL_USER" = "root" ]; then
    error "Could not detect the real user. Please run with: sudo ./install.sh"
    exit 1
fi
REAL_HOME=$(eval echo "~$REAL_USER")
info "Detected user: $REAL_USER (home: $REAL_HOME)"

# ---- Check dependencies ----
echo ""
echo "Checking dependencies..."
MISSING_DEPS=()

if ! dpkg -s libpam0g-dev &>/dev/null; then
    MISSING_DEPS+=("libpam0g-dev")
fi
if ! dpkg -s build-essential &>/dev/null; then
    MISSING_DEPS+=("build-essential")
fi
if ! dpkg -s libcrypt-dev &>/dev/null; then
    MISSING_DEPS+=("libcrypt-dev")
fi
if ! command -v python3 &>/dev/null; then
    MISSING_DEPS+=("python3")
fi

if [ ${#MISSING_DEPS[@]} -gt 0 ]; then
    warn "Installing missing dependencies: ${MISSING_DEPS[*]}"
    apt-get update -qq
    apt-get install -y -qq "${MISSING_DEPS[@]}"
fi
info "All dependencies satisfied."

# ---- Detect PAM library path (multi-arch support) ----
ARCH=$(dpkg-architecture -qDEB_HOST_MULTIARCH 2>/dev/null || echo "x86_64-linux-gnu")
PAM_LIB_DIR="/lib/${ARCH}/security"
if [ ! -d "$PAM_LIB_DIR" ]; then
    # Fallback for non-standard layouts
    PAM_LIB_DIR="/lib/security"
    mkdir -p "$PAM_LIB_DIR"
fi
info "PAM library directory: $PAM_LIB_DIR"

# ---- 1. Build and Install PAM Module ----
echo ""
echo "═══════════════════════════════════════════"
echo "  Step 1: Building PAM Module (pam_pin.so)"
echo "═══════════════════════════════════════════"
cd "$SCRIPT_DIR/src/pam"
make clean && make
install -D -m 0644 pam_pin.so "$PAM_LIB_DIR/pam_pin.so"
cd "$SCRIPT_DIR"
info "PAM module installed to $PAM_LIB_DIR/pam_pin.so"

# ---- 2. Install GNOME Shell Extension (system-wide + user) ----
echo ""
echo "═══════════════════════════════════════════"
echo "  Step 2: Installing GNOME Shell Extension"
echo "═══════════════════════════════════════════"

# System-wide (for GDM login screen)
SYS_EXT_DIR="/usr/share/gnome-shell/extensions/${EXTENSION_UUID}"
mkdir -p "$SYS_EXT_DIR"
cp "$SCRIPT_DIR/extension/extension.js"  "$SYS_EXT_DIR/"
cp "$SCRIPT_DIR/extension/metadata.json" "$SYS_EXT_DIR/"
cp "$SCRIPT_DIR/extension/stylesheet.css" "$SYS_EXT_DIR/"
chmod 644 "$SYS_EXT_DIR"/*
info "System extension installed to $SYS_EXT_DIR"

# User-local (for lock screen in user session)
USER_EXT_DIR="$REAL_HOME/.local/share/gnome-shell/extensions/${EXTENSION_UUID}"
# Remove any stale symlinks
rm -rf "$USER_EXT_DIR"
mkdir -p "$USER_EXT_DIR"
cp "$SCRIPT_DIR/extension/extension.js"  "$USER_EXT_DIR/"
cp "$SCRIPT_DIR/extension/metadata.json" "$USER_EXT_DIR/"
cp "$SCRIPT_DIR/extension/stylesheet.css" "$USER_EXT_DIR/"
chown -R "$REAL_USER:$REAL_USER" "$USER_EXT_DIR"
info "User extension installed to $USER_EXT_DIR"

# Enable the extension for the user and the GDM login screen
enable_extension_for_account "$REAL_USER" "$REAL_USER"
enable_extension_for_account "gdm" "the GDM login screen"

# ---- 3. Install PIN Settings App ----
echo ""
echo "═══════════════════════════════════════════"
echo "  Step 3: Installing PIN Settings App"
echo "═══════════════════════════════════════════"
mkdir -p /usr/libexec/ubuntu-pin-login
install -m 0755 "$SCRIPT_DIR/src/settings/pin_helper.py" /usr/libexec/ubuntu-pin-login/
install -m 0755 "$SCRIPT_DIR/src/settings/pin_app.py"    /usr/bin/ubuntu-pin-login-settings
info "Settings app installed"

# Create .desktop entry
cat <<EOF > /usr/share/applications/ubuntu-pin-login-settings.desktop
[Desktop Entry]
Name=PIN Login Settings
Comment=Configure your lock screen PIN
Exec=/usr/bin/ubuntu-pin-login-settings
Icon=dialog-password
Terminal=false
Type=Application
Categories=Settings;System;
EOF
info "Desktop entry created"

# ---- 4. Install Polkit Policy ----
echo ""
echo "═══════════════════════════════════════════"
echo "  Step 4: Installing Polkit Policy"
echo "═══════════════════════════════════════════"
install -m 0644 "$SCRIPT_DIR/src/settings/com.ubuntu.pin-login.policy" /usr/share/polkit-1/actions/
info "Polkit policy installed"

# ---- 5. Create PIN storage directory ----
mkdir -p /etc/gdm-pin
chmod 755 /etc/gdm-pin
info "PIN storage directory created (/etc/gdm-pin)"

# ---- 6. Configure PAM (automatic, safe) ----
echo ""
echo "═══════════════════════════════════════════"
echo "  Step 5: Configuring PAM"
echo "═══════════════════════════════════════════"

PAM_FILE="/etc/pam.d/gdm-password"
PAM_LINE="auth    sufficient      pam_pin.so"

if [ -f "$PAM_FILE" ]; then
    if grep -q "pam_pin.so" "$PAM_FILE"; then
        info "PAM already configured (pam_pin.so found in $PAM_FILE)"
    else
        # Insert our line immediately before @include common-auth
        cp "$PAM_FILE" "${PAM_FILE}.bak.$(date +%Y%m%d%H%M%S)"
        sed -i "/@include common-auth/i $PAM_LINE" "$PAM_FILE"
        info "PAM configured automatically. Backup saved as ${PAM_FILE}.bak.*"
    fi
else
    warn "PAM file $PAM_FILE not found. You may need to configure PAM manually."
    warn "Add this line BEFORE '@include common-auth' in your GDM PAM config:"
    warn "  auth    sufficient      pam_pin.so"
fi

# ---- Done ----
echo ""
echo "═══════════════════════════════════════════"
echo -e "  ${GREEN}Installation Complete!${NC}"
echo "═══════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "  1. Open 'PIN Login Settings' from your app launcher to set your PIN"
echo "  2. Log out and log back in to activate the extension in both user and GDM sessions"
echo "  3. Test both the login screen and the lock screen PIN input"
echo ""
echo "To uninstall, run: sudo ./uninstall.sh"
echo ""
