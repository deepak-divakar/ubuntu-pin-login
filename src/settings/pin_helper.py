#!/usr/bin/env python3
import sys
import os
import crypt

PIN_DIR = "/etc/gdm-pin"

def main():
    if os.geteuid() != 0:
        print("Must run as root", file=sys.stderr)
        sys.exit(1)

    if len(sys.argv) < 3:
        print("Usage: pin_helper.py [set|remove] username", file=sys.stderr)
        sys.exit(1)

    action = sys.argv[1]
    user = sys.argv[2]
    
    # Securely setup directory
    os.makedirs(PIN_DIR, exist_ok=True, mode=0o755)
    
    pin_file = os.path.join(PIN_DIR, user)

    if action == "remove":
        if os.path.exists(pin_file):
            os.remove(pin_file)
        sys.exit(0)
    elif action == "set":
        # Read PIN from stdin
        pin = sys.stdin.read().strip()
        if not pin:
            print("Empty PIN", file=sys.stderr)
            sys.exit(1)
        
        # Hash it using SHA-512 crypt
        hashed = crypt.crypt(pin, crypt.mksalt(crypt.METHOD_SHA512))
        
        with open(pin_file, "w") as f:
            f.write(hashed + "\n")
        
        import pwd
        
        # Secure the file (allow the specific user to read it for lock screen usage)
        user_uid = pwd.getpwnam(user).pw_uid
        os.chown(pin_file, user_uid, -1)
        os.chmod(pin_file, 0o600)
        sys.exit(0)

if __name__ == '__main__':
    main()
