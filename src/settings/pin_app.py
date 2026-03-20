#!/usr/bin/env python3
import sys
import subprocess
import gi
gi.require_version('Gtk', '4.0')
gi.require_version('Adw', '1')
from gi.repository import Gtk, Adw, Gio, GLib

class PinLoginSettings(Adw.Application):
    def __init__(self):
        super().__init__(application_id='com.ubuntu.pinlogin.settings',
                         flags=Gio.ApplicationFlags.FLAGS_NONE)

    def do_activate(self):
        window = Adw.ApplicationWindow(application=self, title="Ubuntu PIN Login Settings")
        window.set_default_size(400, 300)

        # Create a container box for header + content
        main_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)

        # Add Libadwaita HeaderBar to give it a native top bar
        header_bar = Adw.HeaderBar()
        main_box.append(header_bar)

        # Content Box
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=20)
        box.set_margin_top(32)
        box.set_margin_bottom(32)
        box.set_margin_start(32)
        box.set_margin_end(32)
        main_box.append(box)

        header = Gtk.Label(label="Manage PIN Login")
        header.set_css_classes(["title-1"])
        box.append(header)

        desc = Gtk.Label(label="Set up a PIN to sign in quickly on the lock screen.")
        box.append(desc)

        self.pin_entry = Gtk.PasswordEntry()
        box.append(self.pin_entry)

        set_btn = Gtk.Button(label="Set PIN")
        set_btn.set_css_classes(["suggested-action", "pill"])
        set_btn.connect('clicked', self.on_set_pin)
        box.append(set_btn)

        remove_btn = Gtk.Button(label="Remove PIN")
        remove_btn.set_css_classes(["destructive-action", "pill"])
        remove_btn.connect('clicked', self.on_remove_pin)
        box.append(remove_btn)

        self.status_label = Gtk.Label(label="")
        box.append(self.status_label)

        window.set_content(main_box)
        window.present()

    def on_set_pin(self, button):
        pin = self.pin_entry.get_text()
        if not pin:
            return
            
        if not pin.isdigit() or len(pin) != 4:
            self.status_label.set_label("Error: PIN must be exactly 4 numbers.")
            return
        
        user = GLib.get_user_name()
        import os
        helper_path = "/usr/libexec/ubuntu-pin-login/pin_helper.py"
        if not os.path.exists(helper_path):
            helper_path = os.path.join(os.path.dirname(__file__), "pin_helper.py")
        
        try:
            self.status_label.set_label("Authenticating...")
            p = subprocess.Popen(['pkexec', helper_path, 'set', user], stdin=subprocess.PIPE, text=True)
            p.communicate(input=pin)
            if p.returncode == 0:
                self.pin_entry.set_text("")
                self.status_label.set_label("PIN Successfully Set!")
            else:
                self.status_label.set_label("Failed to set PIN.")
        except Exception as e:
            self.status_label.set_label(f"Error: {e}")

    def on_remove_pin(self, button):
        user = GLib.get_user_name()
        import os
        helper_path = "/usr/libexec/ubuntu-pin-login/pin_helper.py"
        if not os.path.exists(helper_path):
            helper_path = os.path.join(os.path.dirname(__file__), "pin_helper.py")
        
        try:
            self.status_label.set_label("Authenticating...")
            p = subprocess.Popen(['pkexec', helper_path, 'remove', user])
            p.communicate()
            if p.returncode == 0:
                self.status_label.set_label("PIN Removed Successfully!")
            else:
                self.status_label.set_label("Failed to remove PIN.")
        except Exception as e:
            self.status_label.set_label(f"Error: {e}")

if __name__ == '__main__':
    app = PinLoginSettings()
    app.run(sys.argv)
