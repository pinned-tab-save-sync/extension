import { useState } from "react";
import type { ValidationErrors } from "@/lib/types";

interface RegisterFormProps {
  onSubmit: (
    email: string,
    password: string,
    passwordConfirmation: string
  ) => Promise<boolean>;
  onSwitchToLogin: () => void;
  isLoading: boolean;
  error: string | null;
  validationErrors: ValidationErrors | null;
}

export function RegisterForm({
  onSubmit,
  onSwitchToLogin,
  isLoading,
  error,
  validationErrors,
}: RegisterFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(email, password, passwordConfirmation);
  };

  const getFieldError = (field: string): string | null => {
    if (!validationErrors) return null;
    const errors = validationErrors[field];
    return errors && errors.length > 0 ? errors[0] : null;
  };

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      <h2>Register</h2>

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

      <div className="form-group">
        <label htmlFor="password_confirmation">Confirm Password</label>
        <input
          id="password_confirmation"
          type="password"
          value={passwordConfirmation}
          onChange={(e) => setPasswordConfirmation(e.target.value)}
          placeholder="Confirm your password"
          required
          disabled={isLoading}
        />
        {getFieldError("password_confirmation") && (
          <p className="field-error">{getFieldError("password_confirmation")}</p>
        )}
      </div>

      <button type="submit" className="submit-btn" disabled={isLoading}>
        {isLoading ? "Creating account..." : "Register"}
      </button>

      <p className="switch-auth">
        Already have an account?{" "}
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="link-btn"
          disabled={isLoading}
        >
          Login
        </button>
      </p>
    </form>
  );
}
