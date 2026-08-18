import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@art/ui/components/dropdown-menu";
import { Skeleton } from "@art/ui/components/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { LoaderCircle, LogOut, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { signOutAndNavigate } from "@/lib/auth-actions";
import { clearPrivateArtCache } from "@/lib/private-art-cache";
import type { PublicUserSession } from "@/lib/public-session";

const stateTransition =
  "transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getUnavatarUrl(email: string) {
  const normalizedEmail = normalizeEmail(email);
  return crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(normalizedEmail))
    .then((digest) => {
      const hash = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      return `https://unavatar.io/gravatar/${hash}`;
    });
}

export function getAvatarInitials(name: string, email: string) {
  const nameParts = name.trim().split(/\s+/u).filter(Boolean);
  const initials = nameParts
    .slice(0, 2)
    .map((part) => Array.from(part)[0])
    .join("");
  const fallback = Array.from(email.trim().split("@")[0] || "A")[0] || "A";
  return (initials || fallback).toLocaleUpperCase();
}

function AccountAvatar({ email, name }: { email: string; name: string }) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [hasImageError, setHasImageError] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    setAvatarUrl(null);
    setHasImageError(false);

    void getUnavatarUrl(email)
      .then((url) => {
        if (isCurrent) setAvatarUrl(url);
      })
      .catch(() => {
        if (isCurrent) setHasImageError(true);
      });

    return () => {
      isCurrent = false;
    };
  }, [email]);

  const avatarClassName =
    "size-8 rounded-full outline-1 -outline-offset-1 outline-[rgba(0,0,0,0.1)]";

  if (!avatarUrl || hasImageError) {
    return (
      <span
        data-slot="avatar-fallback"
        aria-hidden="true"
        className={`${avatarClassName} inline-flex items-center justify-center bg-neutral-100 text-xs font-semibold text-neutral-700`}
      >
        {getAvatarInitials(name, email)}
      </span>
    );
  }

  return (
    <img
      data-slot="account-avatar"
      src={avatarUrl}
      alt=""
      width={32}
      height={32}
      draggable={false}
      referrerPolicy="no-referrer"
      className={`${avatarClassName} object-cover`}
      onError={() => setHasImageError(true)}
    />
  );
}

function SignOutContent({ isPending }: { isPending: boolean }) {
  return (
    <>
      <span aria-hidden="true" className="relative size-4 shrink-0">
        <LogOut
          className={`${stateTransition} absolute inset-0 size-4 ${
            isPending ? "scale-[0.25] opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-0"
          }`}
        />
        <LoaderCircle
          className={`${stateTransition} absolute inset-0 size-4 ${
            isPending
              ? "scale-100 animate-spin opacity-100 blur-0 motion-reduce:animate-none"
              : "scale-[0.25] opacity-0 blur-[4px]"
          }`}
        />
      </span>
      <span aria-hidden="true" className="relative inline-grid">
        <span
          className={`${stateTransition} col-start-1 row-start-1 ${
            isPending ? "scale-[0.25] opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-0"
          }`}
        >
          Logout
        </span>
        <span
          className={`${stateTransition} col-start-1 row-start-1 ${
            isPending ? "scale-100 opacity-100 blur-0" : "scale-[0.25] opacity-0 blur-[4px]"
          }`}
        >
          Logging out…
        </span>
      </span>
      <span className="sr-only" aria-live="polite">
        {isPending ? "Logging out…" : "Logout"}
      </span>
    </>
  );
}

export default function UserMenu({ initialSession }: { initialSession: PublicUserSession | null }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: clientSession, isPending } = authClient.useSession();
  const session = isPending ? initialSession : clientSession;

  if (isPending && initialSession === undefined) {
    return <Skeleton className="size-10 rounded-full bg-neutral-100" aria-hidden="true" />;
  }

  if (!session) {
    return (
      <Link
        to="/login"
        search={{ redirect: "/" }}
        aria-label="Log in"
        className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-full text-neutral-700 transition-[background-color,color,scale] duration-150 ease-out outline-none hover:bg-neutral-100 hover:text-neutral-950 active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-neutral-950"
      >
        <UserRound aria-hidden="true" className="size-5 shrink-0 stroke-current" />
      </Link>
    );
  }

  return (
    <AuthenticatedUserMenu
      session={session}
      signOut={() => authClient.signOut()}
      clearPrivateArt={() => clearPrivateArtCache(queryClient, null)}
      navigate={(options) => navigate(options)}
    />
  );
}

type SignOutDependencies = Parameters<typeof signOutAndNavigate>[0];

export function AuthenticatedUserMenu({
  clearPrivateArt,
  navigate,
  reportError = (message) => toast.error(message),
  session,
  signOut,
}: {
  clearPrivateArt: SignOutDependencies["clearPrivateArt"];
  navigate: SignOutDependencies["navigate"];
  reportError?: (message: string) => void;
  session: PublicUserSession;
  signOut: SignOutDependencies["signOut"];
}) {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const isMounted = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const accountLabel = session.user.name.trim() || session.user.email.split("@")[0];

  async function handleSignOut() {
    setIsSigningOut(true);
    let error: string | null;
    try {
      error = await signOutAndNavigate({
        signOut,
        clearPrivateArt,
        navigate,
      });
    } catch {
      error = "Could not log out.";
    }
    if (error && isMounted.current) {
      setIsSigningOut(false);
      reportError(error);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`Account menu for ${accountLabel}`}
            aria-busy={isSigningOut}
            className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-full transition-[background-color,scale] duration-150 ease-out outline-none hover:bg-neutral-100 active:not-disabled:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-neutral-950 disabled:cursor-wait"
            disabled={isSigningOut}
          />
        }
      >
        <AccountAvatar
          key={`${session.user.id}:${normalizeEmail(session.user.email)}`}
          name={session.user.name}
          email={session.user.email}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-64 rounded-2xl bg-white p-1 text-neutral-950 shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_1px_2px_-1px_rgba(0,0,0,0.08),0_8px_24px_-8px_rgba(0,0,0,0.18)]"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex min-w-0 flex-col gap-0.5 px-3 py-2.5 text-sm font-normal text-neutral-500">
            <span className="block truncate font-medium text-neutral-950">{accountLabel}</span>
            <span className="block truncate">{session.user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="my-1 bg-black/10" />
          <DropdownMenuItem
            aria-busy={isSigningOut}
            disabled={isSigningOut}
            closeOnClick={false}
            className="min-h-10 cursor-pointer rounded-xl px-3 text-sm transition-[background-color,color] duration-150 ease-out focus:bg-neutral-100"
            onClick={() => {
              void handleSignOut();
            }}
          >
            <SignOutContent isPending={isSigningOut} />
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
