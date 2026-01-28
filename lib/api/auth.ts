import { apiClient } from "./client";
import type { User } from "../types";

export async function logout(): Promise<void> {
  await apiClient.post("/logout");
}

export async function getCurrentUser(): Promise<User> {
  const response = await apiClient.get<{ data: User }>("/user");
  return response.data;
}
