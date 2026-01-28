import { Button } from "./ui/Button";

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
    <div className="min-w-[350px] min-h-[200px] p-4 font-sans text-white/85 bg-[#242424]">
      <Button
        variant="outline"
        onClick={onCancel}
        className="mb-3 hover:border-indigo-500 hover:text-indigo-500"
      >
        &larr; Back
      </Button>
      <h1 className="text-2xl mb-4 text-center">Pinned Tab Save & Sync</h1>

      <div className="text-center">
        <p className="text-sm mb-6 text-gray-400">
          Sign in or create an account to sync your pinned tabs across all your
          browsers and devices.
        </p>

        <div className="flex flex-col gap-3 mb-6">
          <Button variant="primary" fullWidth onClick={onOpenLogin}>
            Sign In
          </Button>
          <Button variant="secondary" fullWidth onClick={onOpenRegister}>
            Create Account
          </Button>
        </div>

        <p className="text-xs text-gray-500 italic">
          A new tab will open for you to sign in securely.
        </p>
      </div>
    </div>
  );
}
