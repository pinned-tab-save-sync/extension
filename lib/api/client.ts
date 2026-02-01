import { clearAuthToken, clearStoredUser, getAuthToken } from "../storage/auth";
import type { ApiError } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { skipAuth = false, ...fetchOptions } = options;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(fetchOptions.headers as Record<string, string>),
    };

    if (!skipAuth) {
      const token = await getAuthToken();
      console.log("[API Client] Token present:", !!token);
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }

    const url = `${this.baseUrl}${endpoint}`;
    console.log("[API Client] Request:", fetchOptions.method || "GET", url);

    let response: Response;
    try {
      response = await fetch(url, {
        ...fetchOptions,
        headers,
      });
    } catch (error) {
      // Network failure (fetch throws TypeError on network issues)
      console.error("[API Client] Network error:", error);
      throw new NetworkError("Unable to connect to server");
    }

    console.log("[API Client] Response status:", response.status);

    if (response.status === 401 && !skipAuth) {
      await clearAuthToken();
      await clearStoredUser();
      throw new ApiClientError("Unauthorized", 401);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const data = await response.json();

    if (!response.ok) {
      const error = data as ApiError;
      throw new ApiClientError(error.message || "An error occurred", response.status, error.errors);
    }

    return data as T;
  }

  async get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "GET" });
  }

  async post<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "DELETE" });
  }
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public errors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export class NetworkError extends Error {
  constructor(message: string = "Unable to connect to server") {
    super(message);
    this.name = "NetworkError";
  }
}

export const apiClient = new ApiClient();
