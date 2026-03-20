import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const NumpadWidget = GObject.registerClass(
class NumpadWidget extends St.BoxLayout {
    _init(authPrompt) {
        super._init({
            vertical: true,
            style_class: 'pin-widget-container',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });

        this._authPrompt = authPrompt;
        this._pinBuffer = '';
        this._textChangedId = null;
        
        // 4 dots indicator block
        this._dotsBox = new St.BoxLayout({
            style_class: 'pin-dots-box',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });
        
        this._dots = [];
        for (let i = 0; i < 4; i++) {
            let dot = new St.Widget({ style_class: 'pin-dot' });
            this._dots.push(dot);
            this._dotsBox.add_child(dot);
        }
        this.add_child(this._dotsBox);
        
        // Use Password Button
        let usePasswordBtn = new St.Button({
            label: "Use Password Instead",
            style_class: 'use-password-button',
            x_align: Clutter.ActorAlign.CENTER
        });
        usePasswordBtn.connect('clicked', () => this._onUsePassword());
        this.add_child(usePasswordBtn);
        
        // Hide actual entry visually but keep it focused to capture keyboard input
        if (this._authPrompt._entry) {
            this._authPrompt._entry.opacity = 0;
            // minimize the visual height footprint 
            this._authPrompt._entry.set_style('margin: 0px; padding: 0px; min-height: 0px; height: 0px; border: 0px; box-shadow: none; font-size: 1px;');
            
            this._textChangedId = this._authPrompt._entry.clutter_text.connect('text-changed', () => {
                this._pinBuffer = this._authPrompt._entry.get_text();
                this._updateDots();
                
                // Auto-submit securely when 4 digits are typed
                if (this._pinBuffer.length === 4) {
                    this._authPrompt._entry.clutter_text.emit('activate');
                }
            });
        }
    }
    
    _updateDots() {
        for (let i = 0; i < 4; i++) {
            if (i < this._pinBuffer.length) {
                this._dots[i].add_style_class_name('pin-dot-filled');
            } else {
                this._dots[i].remove_style_class_name('pin-dot-filled');
            }
        }
    }
    
    _onUsePassword() {
        this.hide();
        if (this._authPrompt._entry) {
            // Restore entry visibility for standard password typing
            this._authPrompt._entry.opacity = 255;
            this._authPrompt._entry.set_style(''); // Wipe inline styles to restore sizing
            
            if (this._textChangedId) {
                this._authPrompt._entry.clutter_text.disconnect(this._textChangedId);
                this._textChangedId = null;
            }
            
            // Send empty PIN to PAM instantly to fallback
            this._authPrompt._entry.set_text('');
            this._authPrompt._entry.clutter_text.emit('activate');
        }
    }
});

export default class GdmPinLoginExtension extends Extension {
    enable() {
        this._waitForAuthPrompt();
    }

    disable() {
        if (this._sourceId) {
            GLib.source_remove(this._sourceId);
            this._sourceId = null;
        }
        this._removeNumpad();
    }

    _waitForAuthPrompt() {
        // Constantly poll every 500ms since AuthPrompt is initialized lazily when lock screen is swiped up
        this._sourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            let authPrompt = null;
            if (Main.screenShield && Main.screenShield._dialog && Main.screenShield._dialog._authPrompt) {
                authPrompt = Main.screenShield._dialog._authPrompt;
            } else if (Main.loginDialog && Main.loginDialog._authPrompt) {
                authPrompt = Main.loginDialog._authPrompt;
            }

            if (authPrompt && !authPrompt._numpadWidget) {
                this._injectNumpad(authPrompt);
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    _injectNumpad(authPrompt) {
        if (!authPrompt || authPrompt._numpadWidget) return;

        let numpad = new NumpadWidget(authPrompt);
        
        authPrompt.add_child(numpad);
        authPrompt._numpadWidget = numpad;
    }

    _removeNumpad() {
        let authPrompt = null;
        if (Main.screenShield && Main.screenShield._dialog && Main.screenShield._dialog._authPrompt) {
            authPrompt = Main.screenShield._dialog._authPrompt;
        } else if (Main.loginDialog && Main.loginDialog._authPrompt) {
            authPrompt = Main.loginDialog._authPrompt;
        }

        if (authPrompt && authPrompt._numpadWidget) {
            authPrompt._numpadWidget.destroy();
            authPrompt._numpadWidget = null;
        }
    }
}
