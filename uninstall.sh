#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; }

EXTENSION_UUID="gdm-pin-login@panda-dev.ubuntu"

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
