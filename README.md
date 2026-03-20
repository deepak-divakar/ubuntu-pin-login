# Ubuntu PIN Login

A complete, seamless PIN login system for Ubuntu 24.04 and GNOME Shell, inspired by Windows Hello. 

This project integrates safely with the Linux PAM authentication stack and the GNOME login/lock screen to allow fast sign-ins using a numeric PIN without typing your full password.

---

## ⚠️ Security Warning

**This software is intended STRICTLY for personal laptops and single-user home machines.** 

A 4-digit PIN is inherently insecure and provides minimal entropy (only 10,000 possible combinations). It is computationally trivial to brute-force a 4-digit PIN if an attacker gains physical or network access to the machine. 

Do **not** use this on shared computers, corporate workstations, servers, or any device containing highly sensitive unencrypted data. You assume all risks associated with reducing your local authentication security.

---

## Features

![Lock Screen PIN Input](https://github.com/user-attachments/assets/fe87cdae-12c4-46f2-a084-5f6ace5dd1b8)

- **Blazing Fast Login**: Unlock your screen instantly with a PIN.
- **Sleek 4-Dot UI**: Replaces the standard password box on the lock screen with a clean, modern 4-dot visual indicator.
- **Keyboard Native**: Simply type your PIN on your physical keyboard. The dots fill up automatically as you type.
- **Auto-Submit**: The system instantly logs you in the moment you type the 4th digit. No need to press `Enter`.
- **Seamless Password Fallback**: A convenient "Use Password Instead" button instantly reverts the UI back to the standard GNOME password box, allowing you to sign in with your full password anytime.
- **GUI Settings Manager**: Includes a beautiful GTK4/Libadwaita app for securely setting or removing your PIN.

---

## Prerequisites

- **OS**: Ubuntu 24.04 LTS (or compatible Debian-based distros)
- **Desktop Environment**: GNOME 45, 46, or 47 (Wayland or X11)
- **Dependencies**: Tested and automatically installed via the install script (`libpam0g-dev`, `build-essential`, `libcrypt-dev`, `python3-gi`).

---

## Installation

1. Clone or download this repository to your machine.
2. Open a terminal in the folder containing this code.
3. Run the universal installation script:

```bash
sudo ./install.sh
```

**What the script does:**
- Compiles the backend `pam_pin.so` C module.
- Installs the extension into the correct system (`/usr/share/`) and user (`~/.local/share/`) directories.
- Installs the Settings application and Polkit privileges.
- Safely configures `/etc/pam.d/gdm-password` to accept PINs.

---

## Usage

**1. Set up your PIN:**
- Open your application launcher and search for **PIN Login Settings**.

![PIN Settings Application](https://github.com/user-attachments/assets/7c42831e-37bc-488c-b503-ca0597074064)

- Open the app, type a 4-digit PIN, and click **Set PIN**. 
- You will be prompted for your admin password to securely save the hash.

**2. Reload GNOME Shell:**
- Wayland users: **Log out** completely and log back in to load the extension. (X11 users can press `Alt+F2`, type `r`, and hit Enter).

**3. Test the Lock Screen:**
- Lock your screen (`Super + L`) or let it go to sleep.
- Swipe up to reveal the login prompt. You will see 4 empty dots.
- Type your 4-digit PIN. You're in!

---

## How It Works

1. **The Backend (`pam_pin.so`)**: A custom PAM authentication module written in C. It prompts the system for a PIN, hashes it using `crypt` (SHA-512), and compares it against your stored hash. If it matches, the PAM stack instantly approves the login.
2. **The Frontend (`GNOME Extension`)**: A native GNOME Shell Extension that listens for the lock screen. It visually hides the real password box and overlays a 4-dot visualizer. As you type, it tracks the keystrokes and forwards them to the underlying PAM prompt.
3. **The Configuration Manager (`GTK4 App`)**: A Python-based Libadwaita app that acts as a user-friendly frontend to generate the SHA-512 hashes and write them to `/etc/gdm-pin/` using a Polkit-authorized elevated helper script.

---

## Uninstallation

To completely remove all traces of the PIN login system, simply run:

```bash
sudo ./uninstall.sh
```

Log out and log back in for the changes to apply.

*(Note: Your hashed PIN data in `/etc/gdm-pin/` is preserved just in case you reinstall. You can safely delete that folder manually if you wish).*

---

## 🚫 Disclaimer

This project modifies core Linux authentication components (`pam`) and overrides GNOME login UI files at the system level. 

**This software has not been rigorously tested across all Linux distributions, GNOME shell versions, or hardware configurations. It is provided "AS IS".** 

By running the installation scripts, you acknowledge that you are modifying your authentication stack entirely **at your own risk**.

---

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
