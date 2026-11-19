/**
 * Whether this build is local only: no account, sign-in or sync, and no website or API to talk to.
 * On unless `VITE_LOCAL_ONLY=false` is set at build time, so a build with no `.env` works offline.
 */
export const IS_LOCAL_ONLY = import.meta.env.VITE_LOCAL_ONLY !== "false";
