import { describe, it, expect } from "vitest";
import { createPkcePair, pkceChallengeFor, randomUrlSafeString } from "./pkce";

describe("PKCE", () => {
  it("matches the RFC 7636 S256 example", async () => {
    expect(await pkceChallengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("makes a verifier the website accepts and its challenge", async () => {
    const { verifier, challenge } = await createPkcePair();

    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toBe(await pkceChallengeFor(verifier));
  });

  it("makes random URL-safe strings", () => {
    expect(randomUrlSafeString(24)).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(randomUrlSafeString(24)).not.toBe(randomUrlSafeString(24));
  });
});
