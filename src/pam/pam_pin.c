#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <crypt.h>
#include <security/pam_appl.h>
#include <security/pam_modules.h>
#include <security/pam_ext.h>

#define PIN_DIR "/etc/gdm-pin"

PAM_EXTERN int pam_sm_authenticate(pam_handle_t *pamh, int flags, int argc, const char **argv) {
    (void)flags;
    (void)argc;
    (void)argv;
    
    const char *user;
    int retval;
    char pin_path[256];
    FILE *fp;
    char stored_hash[256];
    char *pin = NULL;

    // Get the user attempting to authenticate
    retval = pam_get_user(pamh, &user, NULL);
    if (retval != PAM_SUCCESS || user == NULL) {
        return PAM_USER_UNKNOWN;
    }

    // Check if the pin file exists
    snprintf(pin_path, sizeof(pin_path), "%s/%s", PIN_DIR, user);
    if (access(pin_path, R_OK) != 0) {
        // No PIN configured for this user
        return PAM_IGNORE; // Ignore, let other modules (like pam_unix) handle
    }

    // Read stored hash
    fp = fopen(pin_path, "r");
    if (!fp) {
        return PAM_AUTHINFO_UNAVAIL;
    }
    if (!fgets(stored_hash, sizeof(stored_hash), fp)) {
        fclose(fp);
        return PAM_AUTHINFO_UNAVAIL;
    }
    fclose(fp);

    // Remove trailing newline
    size_t len = strlen(stored_hash);
    if (len > 0 && stored_hash[len - 1] == '\n') {
        stored_hash[len - 1] = '\0';
    }

    // Ask for PIN
    retval = pam_prompt(pamh, PAM_PROMPT_ECHO_OFF, &pin, "PIN: ");
    if (retval != PAM_SUCCESS || pin == NULL) {
        return PAM_AUTH_ERR;
    }

    // If the user just pressed Enter (empty PIN), fallback to Password
    if (strlen(pin) == 0) {
        memset(pin, 0, strlen(pin));
        free(pin);
        return PAM_IGNORE;
    }

    // Validate PIN against hash
    char *computed_hash = crypt(pin, stored_hash);
    
    // Securely erase the PIN from memory
    memset(pin, 0, strlen(pin));
    free(pin);

    if (computed_hash && strcmp(computed_hash, stored_hash) == 0) {
        return PAM_SUCCESS;
    }

    return PAM_AUTH_ERR;
}

PAM_EXTERN int pam_sm_setcred(pam_handle_t *pamh, int flags, int argc, const char **argv) {
    (void)pamh;
    (void)flags;
    (void)argc;
    (void)argv;
    return PAM_SUCCESS;
}
