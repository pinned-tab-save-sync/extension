import { Cloud } from "lucide-react";
import type { User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/tooltip";

interface FooterProps {
  user: User | null;
  isAuthenticated: boolean;
  onLogout: () => void;
  onSignIn: () => void;
  onRegister: () => void;
}

/** Signed in: the account and a sign-out button. Signed out: a card offering to sign in and sync. */
export function Footer({ user, isAuthenticated, onLogout, onSignIn, onRegister }: FooterProps) {
  if (!isAuthenticated || !user) {
    return (
      <aside
        aria-label="Sync"
        className="mx-4 mt-2 mb-4 flex shrink-0 items-center gap-3.5 rounded-xl border bg-muted p-3.5 compact:mb-3 compact:gap-3 compact:p-2.5"
      >
        <span
          aria-hidden="true"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-badge text-badge-foreground compact:size-8"
        >
          <Cloud className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-semibold">Sync across browsers</span>
          <span className="text-xs text-muted-foreground">Your groups, on Chrome, Firefox and Edge.</span>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button type="button" variant="outline" size="sm" onClick={onSignIn}>
            Sign in
          </Button>
          <Button type="button" size="sm" onClick={onRegister} className="font-semibold">
            Sign up
          </Button>
        </div>
      </aside>
    );
  }

  const initial = (user.name || user.email).charAt(0).toUpperCase();

  return (
    <footer className="mt-2 flex shrink-0 items-center justify-between gap-3 border-t px-4 py-2.5 compact:mt-1 compact:py-1.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden="true"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-badge text-xs font-bold text-badge-foreground compact:size-6 compact:text-[11px]"
        >
          {initial}
        </span>
        <Hint label={user.email}>
          <span className="truncate text-[13px] text-muted-foreground">{user.email}</span>
        </Hint>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={onLogout}>
        Sign out
      </Button>
    </footer>
  );
}
