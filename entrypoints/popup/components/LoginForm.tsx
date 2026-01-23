import { useState } from "react";
import type { ValidationErrors } from "@/lib/types";

interface LoginFormProps {
  onSubmit: (email: string, password: string) => Promise<boolean>;
  onSwitchToRegister: () => void;
  isLoading: boolean;
  error: string | null;
  validationErrors: ValidationErrors | null;
}

export function LoginForm({
  onSubmit,
  onSwitchToRegister,
  isLoading,
  error,
  validationErrors,
}: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(email, password);
  };

  const getFieldError = (field: string): string | null => {
    if (!validationErrors) return null;
    const errors = validationErrors[field];
    return errors && errors.length > 0 ? errors[0] : null;
  };

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      <h2>Login</h2>

      {error && !validationErrors && <p className="error-message">{error}</p>}

      <div className="form-group">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          disabled={isLoading}
        />
        {getFieldError("email") && (
          <p className="field-error">{getFieldError("email")}</p>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Your password"
          required
          disabled={isLoading}
        />
        {getFieldError("password") && (
          <p className="field-error">{getFieldError("password")}</p>
        )}
      </div>

      <button type="submit" className="submit-btn" disabled={isLoading}>
        {isLoading ? "Logging in..." : "Login"}
      </button>

      <p className="switch-auth">
        Don't have an account?{" "}
        <button
          type="button"
          onClick={onSwitchToRegister}
          className="link-btn"
          disabled={isLoading}
        >
          Register
        </button>
      </p>
    </form>
  );
}
