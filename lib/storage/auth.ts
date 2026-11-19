import type { User } from "../types";
import { STORAGE_KEYS } from "./keys";

export async function getAuthToken(): Promise<string | null> {
  const result = await browser.storage.local.get(STORAGE_KEYS.AUTH_TOKEN);
  const token = result[STORAGE_KEYS.AUTH_TOKEN];
  return typeof token === "string" ? token : null;
}

export async function setAuthToken(token: string): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEYS.AUTH_TOKEN]: token });
}

export async function clearAuthToken(): Promise<void> {
  await browser.storage.local.remove(STORAGE_KEYS.AUTH_TOKEN);
}

export async function getStoredUser(): Promise<User | null> {
  const result = await browser.storage.local.get(STORAGE_KEYS.STORED_USER);
  const user = result[STORAGE_KEYS.STORED_USER];
  if (user && typeof user === "object" && "id" in user && "email" in user) {
    return user as User;
  }
  return null;
}

export async function setStoredUser(user: User): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEYS.STORED_USER]: user });
}

export async function clearStoredUser(): Promise<void> {
  await browser.storage.local.remove(STORAGE_KEYS.STORED_USER);
}
