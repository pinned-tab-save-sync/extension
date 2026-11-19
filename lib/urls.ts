/** Website URL used for extension auth pages and the security settings link. */
export const AUTH_URL = (import.meta.env.VITE_AUTH_URL || "http://localhost:8000").replace(/\/$/, "");

/** The website's dashboard, opened from the popup's logo. */
export const WEBSITE_DASHBOARD_URL = `${AUTH_URL}/dashboard`;

/** The public website, opened from the popup's logo in a local-only build. */
export const WEBSITE_HOME_URL = "https://pinnedtabsaveandsync.com/";

/** Direct link to the website security settings page (password, 2FA, passkeys). */
export const WEBSITE_SECURITY_URL = `${AUTH_URL}/settings/security`;
