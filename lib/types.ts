export interface User {
  id: number;
  name: string;
  email: string;
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface TabGroup {
  id: number;
  name: string;
  position: number;
}

export interface PinnedTab {
  id: number;
  url: string;
  title: string | null;
  favicon_url: string | null;
  group: TabGroup | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface TabGroups {
  [name: string]: string[];
}

export interface ApiError {
  message: string;
  errors?: Record<string, string[]>;
}

export interface ValidationErrors {
  [field: string]: string[];
}
