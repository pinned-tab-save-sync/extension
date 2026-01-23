import { apiClient } from "./client";
import type { AuthResponse, User } from "../types";

export async function register(
  name: string,
  email: string,
  password: string,
  passwordConfirmation: string
): Promise<AuthResponse> {
  return apiClient.post<AuthResponse>(
    "/register",
    {
      name,
      email,
      password,
      password_confirmation: passwordConfirmation,
    },
    { skipAuth: true }
  );
}

export async function login(
  email: string,
  password: string
): Promise<AuthResponse> {
  return apiClient.post<AuthResponse>(
    "/login",
    { email, password },
    { skipAuth: true }
  );
}

export async function logout(): Promise<void> {
  await apiClient.post("/logout");
}

export async function getCurrentUser(): Promise<User> {
  const response = await apiClient.get<{ data: User }>("/user");
  return response.data;
}
