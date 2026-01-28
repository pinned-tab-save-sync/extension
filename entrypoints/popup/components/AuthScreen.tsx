interface AuthScreenProps {
  onOpenLogin: () => void;
  onOpenRegister: () => void;
  onCancel: () => void;
}

export function AuthScreen({
  onOpenLogin,
  onOpenRegister,
  onCancel,
}: AuthScreenProps) {
  return (
    <div className="auth-screen">
      <button onClick={onCancel} className="back-btn">
        &larr; Back
      </button>
      <h1>Pinned Tab Save & Sync</h1>

      <div className="auth-options">
        <p className="auth-description">
          Sign in or create an account to sync your pinned tabs across all your
          browsers and devices.
        </p>

        <div className="auth-buttons">
          <button onClick={onOpenLogin} className="submit-btn">
            Sign In
          </button>
          <button onClick={onOpenRegister} className="submit-btn secondary">
            Create Account
          </button>
        </div>

        <p className="auth-note">
          A new tab will open for you to sign in securely.
        </p>
      </div>
    </div>
  );
}
