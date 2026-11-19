/** A random string of URL-safe base64 characters from `byteCount` random bytes. */
export function randomUrlSafeString(byteCount: number): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteCount)));
}

/**
 * A PKCE pair: the verifier stays in the extension, the S256 challenge goes to the website. The
 * website hands back a one-time code that only exchanges for a token alongside the verifier.
 */
export async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomUrlSafeString(32);

  return { verifier, challenge: await pkceChallengeFor(verifier) };
}

/** base64url(sha256(verifier)), unpadded (RFC 7636 S256). */
export async function pkceChallengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));

  return base64Url(new Uint8Array(digest));
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
