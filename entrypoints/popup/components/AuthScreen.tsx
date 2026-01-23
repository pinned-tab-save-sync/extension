import { useState } from "react";
import type { ValidationErrors } from "@/lib/types";
import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";

type AuthMode = "login" | "register";

interface AuthScreenProps {
  onLogin: (email: string, password: string) => Promise<boolean>;
  onRegister: (
    email: string,
    password: string,
    passwordConfirmation: string
  ) => Promise<boolean>;
  isLoading: boolean;
  error: string | null;
  validationErrors: ValidationErrors | null;
  onClearError: () => void;
  onCancel: () => void;
}

export function AuthScreen({
  onLogin,
  onRegister,
  isLoading,
  error,
  validationErrors,
  onClearError,
  onCancel,
}: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>("register");

  const handleSwitchToRegister = () => {
    onClearError();
    setMode("register");
  };

  const handleSwitchToLogin = () => {
    onClearError();
    setMode("login");
  };

  return (
    <div className="auth-screen">
      <button onClick={onCancel} className="back-btn" disabled={isLoading}>
        &larr; Back
      </button>
      <h1>Pinned Tab Save & Sync</h1>
      {mode === "login" ? (
        <LoginForm
          onSubmit={onLogin}
          onSwitchToRegister={handleSwitchToRegister}
          isLoading={isLoading}
          error={error}
          validationErrors={validationErrors}
        />
      ) : (
        <RegisterForm
          onSubmit={onRegister}
          onSwitchToLogin={handleSwitchToLogin}
          isLoading={isLoading}
          error={error}
          validationErrors={validationErrors}
        />
      )}
    </div>
  );
}
