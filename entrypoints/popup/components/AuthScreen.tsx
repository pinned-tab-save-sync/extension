import { Button } from "./ui/Button";
import { ThemeToggle } from "./ThemeToggle";
import type { ThemePreference } from "@/lib/storage/keys";

interface AuthScreenProps {
  onOpenLogin: () => void;
  onOpenRegister: () => void;
  onCancel: () => void;
  isDark: boolean;
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
}

export function AuthScreen({
  onOpenLogin,
  onOpenRegister,
  onCancel,
  isDark,
  theme,
  onThemeChange,
}: AuthScreenProps) {
  return (
    <div className={isDark ? "dark" : ""}>
      <div className="min-w-[550px] min-h-[200px] p-4 font-sans text-gray-900 dark:text-white/85 bg-white dark:bg-[#242424]">
        <div className="flex justify-between items-center mb-3">
          <Button
            variant="outline"
            onClick={onCancel}
            className="hover:border-indigo-500 hover:text-indigo-500"
          >
            &larr; Back
          </Button>
          <ThemeToggle theme={theme} onThemeChange={onThemeChange} />
        </div>
        <h1 className="text-2xl mb-4 text-center">Pinned Tab Save & Sync</h1>

        <div className="text-center">
          <p className="text-sm mb-6 text-gray-500 dark:text-gray-400">
            Sign in or create an account to sync your pinned tabs across all
            your browsers and devices.
          </p>

          <div className="flex flex-col gap-3 mb-6">
            <Button variant="primary" fullWidth onClick={onOpenLogin}>
              Sign In
            </Button>
            <Button variant="secondary" fullWidth onClick={onOpenRegister}>
              Create Account
            </Button>
          </div>

          <p className="text-xs text-gray-400 dark:text-gray-500 italic">
            A new tab will open for you to sign in securely.
          </p>
        </div>
      </div>
    </div>
  );
}
