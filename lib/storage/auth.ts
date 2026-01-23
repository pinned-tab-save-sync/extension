import type { User } from "../types";

const AUTH_TOKEN_KEY = "authToken";
const STORED_USER_KEY = "storedUser";

export async function getAuthToken(): Promise<string | null> {
  const result = await browser.storage.local.get(AUTH_TOKEN_KEY);
  const token = result[AUTH_TOKEN_KEY];
  return typeof token === "string" ? token : null;
}

export async function setAuthToken(token: string): Promise<void> {
  await browser.storage.local.set({ [AUTH_TOKEN_KEY]: token });
}

export async function clearAuthToken(): Promise<void> {
  await browser.storage.local.remove(AUTH_TOKEN_KEY);
}

export async function getStoredUser(): Promise<User | null> {
  const result = await browser.storage.local.get(STORED_USER_KEY);
  const user = result[STORED_USER_KEY];
  if (user && typeof user === "object" && "id" in user && "email" in user) {
    return user as User;
  }
  return null;
}

export async function setStoredUser(user: User): Promise<void> {
  await browser.storage.local.set({ [STORED_USER_KEY]: user });
}

export async function clearStoredUser(): Promise<void> {
  await browser.storage.local.remove(STORED_USER_KEY);
}
