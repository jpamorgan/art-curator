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
import { useState } from "react";
import { toast } from "sonner";

import { PendingButtonLabel } from "@/components/pending-button-label";
import { authClient } from "@/lib/auth-client";
import { signOutAndNavigate } from "@/lib/auth-actions";
import { clearPrivateArtCache } from "@/lib/private-art-cache";
import type { PublicUserSession } from "@/lib/public-session";

export default function UserMenu({ initialSession }: { initialSession: PublicUserSession | null }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: clientSession, isPending } = authClient.useSession();
  const session = isPending ? initialSession : clientSession;
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (isPending && initialSession === undefined) {
    return <Skeleton className="h-10 w-20 rounded-full bg-neutral-100" aria-hidden="true" />;
  }

  if (!session) {
    return (
      <Link
        to="/login"
        search={{ redirect: "/favorites" }}
        className="inline-flex min-h-10 items-center rounded-full bg-neutral-100 px-3 text-base font-medium text-neutral-950 transition-transform duration-150 ease-out outline-none active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 sm:text-sm"
      >
        Log in
      </Link>
    );
  }

  const accountLabel = session.user.name.trim() || session.user.email.split("@")[0];

  async function handleSignOut() {
    setIsSigningOut(true);
    const error = await signOutAndNavigate({
      signOut: () => authClient.signOut(),
      clearPrivateArt: () => clearPrivateArtCache(queryClient, null),
      navigate: (options) => navigate(options),
    });
    if (error) {
      setIsSigningOut(false);
      toast.error(error);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-busy={isSigningOut}
            className="min-h-10 max-w-48 truncate rounded-full bg-neutral-100 px-3 text-base font-medium text-neutral-950 transition-transform duration-150 ease-out outline-none active:not-disabled:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 disabled:cursor-wait sm:text-sm"
            disabled={isSigningOut}
          />
        }
      >
        <PendingButtonLabel idle={accountLabel} pending="Logging out…" isPending={isSigningOut} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-56 rounded-xl bg-white p-1 text-neutral-950 shadow-lg ring-1 ring-black/10"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5 px-2 py-2 text-base text-neutral-500 sm:text-sm">
            <span className="truncate font-medium text-neutral-950">{accountLabel}</span>
            <span className="truncate">{session.user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-black/10" />
          <DropdownMenuItem
            render={<Link to="/favorites" />}
            className="min-h-10 rounded-lg px-2 text-base focus:bg-neutral-100 sm:text-sm"
          >
            Favorites
          </DropdownMenuItem>
          <DropdownMenuItem
            aria-busy={isSigningOut}
            disabled={isSigningOut}
            className="min-h-10 rounded-lg px-2 text-base focus:bg-neutral-100 sm:text-sm"
            onClick={() => {
              void handleSignOut();
            }}
          >
            <PendingButtonLabel idle="Log out" pending="Logging out…" isPending={isSigningOut} />
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
