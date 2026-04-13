import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';

import * as Animation from 'resource:///org/gnome/shell/ui/animation.js';
import * as AuthPrompt from 'resource:///org/gnome/shell/gdm/authPrompt.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const PIN_LENGTH = 4;
const PIN_SPINNER_SIZE = 24;
const DEFAULT_SPINNER_STATUSES = new Set([
    AuthPrompt.AuthPromptStatus.VERIFYING,
    AuthPrompt.AuthPromptStatus.VERIFICATION_IN_PROGRESS,
]);

const PinPromptWidget = GObject.registerClass(
class PinPromptWidget extends St.BoxLayout {
    _init(authPrompt) {
        super._init({
            vertical: true,
            style_class: 'pin-widget-container',
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._authPrompt = authPrompt;
        this._entry = authPrompt._entry ?? null;
        this._mainBox = authPrompt._mainBox ?? null;
        this._cancelButton = authPrompt.cancelButton ?? null;
        this._defaultButtonWell = authPrompt._defaultButtonWell ?? null;
        this._pinBuffer = '';
        this._pinModeActive = false;
        this._pinSubmitted = false;
        this._textChangedId = 0;
        this._verificationStatusId = 0;
        this._promptedId = 0;
        this._resetId = 0;
        this._cancelButtonVisibleId = 0;
        this._defaultButtonWellVisibleId = 0;
        this._passwordFallbackPending = false;
        this._nativePasswordFallbackActive = false;
        this._lastHintText = null;
        this._isDestroying = false;
        this._entryOriginalXExpand = this._entry?.x_expand ?? true;
        this._cancelButtonOriginalVisible = this._cancelButton?.visible ?? true;
        this._cancelButtonOriginalOpacity = this._cancelButton?.opacity ?? 255;
        this._cancelButtonOriginalReactive = this._cancelButton?.reactive ?? false;
        this._cancelButtonOriginalCanFocus = this._cancelButton?.can_focus ?? false;
        this._defaultButtonWellOriginalVisible = this._defaultButtonWell?.visible ?? true;
        this._defaultButtonWellOriginalOpacity = this._defaultButtonWell?.opacity ?? 255;

        this._spinnerBin = new St.Bin({
            style_class: 'pin-spinner-bin',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._spinner = new Animation.Spinner(PIN_SPINNER_SIZE, {
            hideOnStop: true,
        });
        this._spinnerBin.set_child(this._spinner);
        this._spinner.stop();
        this._spinnerBin.hide();
        this.add_child(this._spinnerBin);

        this._dotsBox = new St.BoxLayout({
            style_class: 'pin-dots-box',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._dots = [];
        for (let i = 0; i < PIN_LENGTH; i++) {
            const dot = new St.Widget({style_class: 'pin-dot'});
            this._dots.push(dot);
            this._dotsBox.add_child(dot);
        }
        this.add_child(this._dotsBox);

        this._usePasswordButton = new St.Button({
            label: 'Use Password Instead',
            style_class: 'use-password-button',
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._usePasswordButton.connect('clicked', () => this._onUsePassword());
        this.add_child(this._usePasswordButton);

        this._usePinButton = new St.Button({
            label: 'Use PIN Instead',
            style_class: 'use-password-button use-pin-button',
            x_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });
        this._usePinButton.connect('clicked', () => this._onUsePin());
        this.add_child(this._usePinButton);

        this._backButton = new St.Button({
            label: 'Back',
            style_class: 'use-password-button pin-back-button',
            x_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });
        this._backButton.connect('clicked', () => this._onBack());
        this.add_child(this._backButton);

        this.connect('destroy', () => {
            this._isDestroying = true;
            this._restoreAuthPrompt();
        });
        this._enablePinMode();
    }

    _shouldShowBackButton() {
        return this._authPrompt._mode === AuthPrompt.AuthPromptMode.UNLOCK_OR_LOG_IN;
    }

    _enablePinMode() {
        const entry = this._entry;
        if (!entry)
            return;

        if (this._cancelButton && !this._cancelButtonVisibleId) {
            this._cancelButtonVisibleId = this._cancelButton.connect('notify::visible',
                () => this._syncBuiltInControls());
        }

        if (this._defaultButtonWell && !this._defaultButtonWellVisibleId) {
            this._defaultButtonWellVisibleId = this._defaultButtonWell.connect('notify::visible',
                () => this._syncBuiltInControls());
        }

        this._textChangedId = entry.clutter_text.connect('text-changed', () => {
            if (!this._pinModeActive)
                return;

            this._pinBuffer = entry.get_text();
            this._updateDots();

            if (this._pinBuffer.length < PIN_LENGTH) {
                this._pinSubmitted = false;
                this._syncSpinner();
            }

            if (this._pinBuffer.length === PIN_LENGTH)
                this._pinSubmitted = true;

            if (this._pinBuffer.length === PIN_LENGTH)
                entry.clutter_text.emit('activate');
        });

        this._verificationStatusId = this._authPrompt.connect('notify::verification-status',
            () => this._syncSpinner());

        this._promptedId = this._authPrompt.connect('prompted', () => this._syncModeFromPrompt());
        this._resetId = this._authPrompt.connect('reset', () => {
            this._pinBuffer = '';
            this._pinSubmitted = false;
            this._passwordFallbackPending = false;
            this._nativePasswordFallbackActive = false;
            this._lastHintText = null;
            this._updateDots();
            this._syncSpinner();
        });

        this._pinBuffer = entry.get_text();
        this._updateDots();
        this._showPinMode();
        this._syncModeFromPrompt();
        this._syncSpinner();
    }

    _showPinMode() {
        const entry = this._entry;
        if (!entry)
            return;

        this._nativePasswordFallbackActive = false;
        this._pinModeActive = true;
        this.show();
        this._dotsBox.show();
        this._usePasswordButton.show();
        this._usePinButton.hide();
        this._backButton.visible = this._shouldShowBackButton();

        entry.opacity = 0;
        entry.x_expand = false;
        entry.set_style('margin: 0; padding: 0; min-height: 0; height: 0; min-width: 0; width: 0; border: 0; box-shadow: none; font-size: 1px;');
        entry.grab_key_focus();

        this._syncBuiltInControls();
        this._syncSpinner();
    }

    _showPasswordMode() {
        const entry = this._entry;
        if (!entry)
            return;

        this._nativePasswordFallbackActive = false;
        this._pinModeActive = false;
        this.show();
        this._spinnerBin.hide();
        this._dotsBox.hide();
        this._usePasswordButton.hide();
        this._backButton.visible = this._shouldShowBackButton();
        this._usePinButton.show();

        entry.opacity = 255;
        entry.x_expand = this._entryOriginalXExpand;
        entry.set_style('');
        entry.grab_key_focus();

        this._syncPasswordModeControls();
        this._syncSpinner();
    }

    _showNativePasswordFallback() {
        const entry = this._entry;
        if (!entry)
            return;

        this._nativePasswordFallbackActive = true;
        this._pinModeActive = false;
        this.show();
        this._spinnerBin.hide();
        this._dotsBox.hide();
        this._usePasswordButton.hide();
        this._usePinButton.hide();
        this._backButton.visible = this._shouldShowBackButton();

        entry.opacity = 255;
        entry.x_expand = this._entryOriginalXExpand;
        entry.set_style('');
        entry.grab_key_focus();

        this._syncNativePasswordFallbackControls();
        this._syncSpinner();
    }

    _syncBuiltInControls() {
        if (this._nativePasswordFallbackActive) {
            this._syncNativePasswordFallbackControls();
            return;
        }

        if (!this._pinModeActive) {
            this._syncPasswordModeControls();
            return;
        }

        this._backButton.visible = this._shouldShowBackButton();

        if (this._cancelButton) {
            this._cancelButton.visible = false;
            this._cancelButton.opacity = 0;
            this._cancelButton.reactive = false;
            this._cancelButton.can_focus = false;
        }

        if (this._defaultButtonWell) {
            this._defaultButtonWell.visible = false;
            this._defaultButtonWell.opacity = 0;
        }
    }

    _restoreBuiltInControlsForPasswordMode() {
        if (this._cancelButton) {
            this._cancelButton.visible = this._cancelButtonOriginalVisible;
            this._cancelButton.opacity = this._cancelButtonOriginalOpacity;
            this._cancelButton.reactive = this._cancelButtonOriginalReactive;
            this._cancelButton.can_focus = this._cancelButtonOriginalCanFocus;
        }

        if (this._defaultButtonWell) {
            this._defaultButtonWell.visible = this._defaultButtonWellOriginalVisible;
            this._defaultButtonWell.opacity = this._defaultButtonWellOriginalOpacity;
        }
    }

    _syncPasswordModeControls() {
        if (this._nativePasswordFallbackActive)
            return;

        this._restoreBuiltInControlsForPasswordMode();

        if (this._shouldShowBackButton() && this._cancelButton) {
            this._cancelButton.visible = false;
            this._cancelButton.opacity = 0;
            this._cancelButton.reactive = false;
            this._cancelButton.can_focus = false;
        }
    }

    _syncNativePasswordFallbackControls() {
        this._restoreBuiltInControlsForPasswordMode();
        this._backButton.visible = this._shouldShowBackButton();

        if (this._cancelButton) {
            this._cancelButton.opacity = 0;
            this._cancelButton.reactive = false;
            this._cancelButton.can_focus = false;
        }
    }

    _syncModeFromPrompt() {
        const entry = this._entry;
        if (!entry)
            return;

        const hintText = entry.hint_text ?? '';
        if (!hintText || hintText === this._lastHintText)
            return;

        this._lastHintText = hintText;

        if (hintText === 'PIN') {
            this._passwordFallbackPending = false;
            this._showPinMode();
            return;
        }

        this._passwordFallbackPending = false;

        if (this._nativePasswordFallbackActive) {
            this._showNativePasswordFallback();
            return;
        }

        this._showPasswordMode();
    }

    _restoreAuthPrompt() {
        if (!this._authPrompt)
            return;

        this._pinModeActive = false;

        const entry = this._entry;
        if (entry) {
            if (this._textChangedId) {
                entry.clutter_text.disconnect(this._textChangedId);
                this._textChangedId = 0;
            }

            entry.opacity = 255;
            entry.x_expand = this._entryOriginalXExpand;
            entry.set_style('');
        }

        if (this._verificationStatusId) {
            this._authPrompt.disconnect(this._verificationStatusId);
            this._verificationStatusId = 0;
        }

        if (this._promptedId) {
            this._authPrompt.disconnect(this._promptedId);
            this._promptedId = 0;
        }

        if (this._resetId) {
            this._authPrompt.disconnect(this._resetId);
            this._resetId = 0;
        }

        if (this._cancelButtonVisibleId) {
            this._cancelButton.disconnect(this._cancelButtonVisibleId);
            this._cancelButtonVisibleId = 0;
        }

        if (this._defaultButtonWellVisibleId) {
            this._defaultButtonWell.disconnect(this._defaultButtonWellVisibleId);
            this._defaultButtonWellVisibleId = 0;
        }

        if (this._cancelButton) {
            this._cancelButton.visible = this._cancelButtonOriginalVisible;
            this._cancelButton.opacity = this._cancelButtonOriginalOpacity;
            this._cancelButton.reactive = this._cancelButtonOriginalReactive;
            this._cancelButton.can_focus = this._cancelButtonOriginalCanFocus;
        }

        if (this._defaultButtonWell) {
            this._defaultButtonWell.visible = this._defaultButtonWellOriginalVisible;
            this._defaultButtonWell.opacity = this._defaultButtonWellOriginalOpacity;
        }

        if (!this._isDestroying) {
            try {
                this._spinner.stop();
            } catch (_error) {
                // Spinner actors may already be tearing down during greeter resets.
            }
        }
        this._pinSubmitted = false;
        this._passwordFallbackPending = false;
        this._nativePasswordFallbackActive = false;
        this._lastHintText = null;

        if (DEFAULT_SPINNER_STATUSES.has(this._authPrompt.verificationStatus) &&
            this._authPrompt.startSpinning) {
            this._authPrompt.startSpinning();
        }
    }

    _syncSpinner() {
        if (this._isDestroying)
            return;

        if (this._pinSubmitted &&
            DEFAULT_SPINNER_STATUSES.has(this._authPrompt.verificationStatus)) {
            try {
                this._spinnerBin.show();
                this._spinner.play();
            } catch (_error) {
            }
            return;
        }

        try {
            this._spinner.stop();
        } catch (_error) {
        }
        this._spinnerBin.hide();

        if (!DEFAULT_SPINNER_STATUSES.has(this._authPrompt.verificationStatus))
            this._pinSubmitted = false;
    }

    _updateDots() {
        for (let i = 0; i < PIN_LENGTH; i++) {
            if (i < this._pinBuffer.length)
                this._dots[i].add_style_class_name('pin-dot-filled');
            else
                this._dots[i].remove_style_class_name('pin-dot-filled');
        }
    }

    _onUsePassword() {
        if (this._passwordFallbackPending)
            return;

        this._pinSubmitted = false;
        this._passwordFallbackPending = true;
        this._syncSpinner();

        const entry = this._entry;
        if (!entry)
            return;

        if (this._shouldShowBackButton())
            this._showNativePasswordFallback();

        entry.set_text('');
        entry.clutter_text.emit('activate');
    }

    _onUsePin() {
        this._pinBuffer = '';
        this._pinSubmitted = false;
        this._passwordFallbackPending = false;
        this._lastHintText = null;
        this._updateDots();

        if (this._entry)
            this._entry.set_text('');

        this._showPinMode();
        this._authPrompt.verificationStatus = AuthPrompt.AuthPromptStatus.VERIFICATION_IN_PROGRESS;
        this._authPrompt.cancel();
    }

    _onBack() {
        if (this._nativePasswordFallbackActive && this._cancelButton) {
            this._cancelButton.emit('clicked', 1);
            return;
        }

        this._pinBuffer = '';
        this._pinSubmitted = false;
        this._passwordFallbackPending = false;
        this._nativePasswordFallbackActive = false;
        this._lastHintText = null;
        this._updateDots();

        if (this._entry)
            this._entry.set_text('');

        this._authPrompt.cancel();
    }
});

export default class GdmPinLoginExtension extends Extension {
    enable() {
        this._currentAuthPrompt = null;
        this._sourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
            const authPrompt = this._findAuthPrompt();

            if (authPrompt !== this._currentAuthPrompt) {
                this._removePinPrompt(this._currentAuthPrompt);
                this._currentAuthPrompt = authPrompt;
            }

            if (authPrompt && !authPrompt._pinPromptWidget)
                this._injectPinPrompt(authPrompt);

            return GLib.SOURCE_CONTINUE;
        });
    }

    disable() {
        if (this._sourceId) {
            GLib.source_remove(this._sourceId);
            this._sourceId = null;
        }

        this._removePinPrompt(this._currentAuthPrompt);
        this._currentAuthPrompt = null;
    }

    _findAuthPrompt() {
        if (Main.screenShield?._dialog?._authPrompt)
            return Main.screenShield._dialog._authPrompt;

        if (Main.loginDialog?._authPrompt)
            return Main.loginDialog._authPrompt;

        return null;
    }

    _injectPinPrompt(authPrompt) {
        if (!authPrompt || authPrompt._pinPromptWidget)
            return;

        const pinPrompt = new PinPromptWidget(authPrompt);

        if (authPrompt._capsLockWarningLabel)
            authPrompt.insert_child_below(pinPrompt, authPrompt._capsLockWarningLabel);
        else
            authPrompt.add_child(pinPrompt);

        authPrompt._pinPromptWidget = pinPrompt;
    }

    _removePinPrompt(authPrompt) {
        if (!authPrompt?._pinPromptWidget)
            return;

        authPrompt._pinPromptWidget.destroy();
        authPrompt._pinPromptWidget = null;
    }
}
