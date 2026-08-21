import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Check, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import type { FollowEntityType } from "@/lib/discovery";
import { getSafeReturnTo } from "@/lib/safe-return-to";
import { orpc } from "@/utils/orpc";

interface FollowButtonProps {
  kind: FollowEntityType;
  entityId: string;
  initialIsFollowing?: boolean;
  returnTo?: string;
}

export function useSyncedFollowState(entityId: string, authoritativeState: boolean) {
  const [localState, setLocalState] = useState(authoritativeState);
  useEffect(() => setLocalState(authoritativeState), [entityId, authoritativeState]);
  return [localState, setLocalState] as const;
}

export function FollowButton({
  kind,
  entityId,
  initialIsFollowing = false,
  returnTo,
}: FollowButtonProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const [localState, setLocalState] = useSyncedFollowState(entityId, initialIsFollowing);
  const toggle = useMutation({
    ...orpc.following.toggle.mutationOptions(),
    onMutate: () => {
      const previous = localState;
      setLocalState((current) => !current);
      return { previous };
    },
    onSuccess: (result) => setLocalState(result.isFollowing),
    onError: (_error, _input, context) => {
      setLocalState(context?.previous ?? initialIsFollowing);
      toast.error("Could not update your follows.");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: orpc.following.key() });
      void queryClient.invalidateQueries({ queryKey: orpc.artists.key() });
      void queryClient.invalidateQueries({ queryKey: orpc.galleries.key() });
      void queryClient.invalidateQueries({ queryKey: orpc.styles.key() });
    },
  });

  const isFollowing = localState;
  const iconTransition =
    "absolute inset-0 transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none";

  return (
    <button
      type="button"
      aria-pressed={isFollowing}
      aria-busy={toggle.isPending}
      disabled={isSessionPending || toggle.isPending}
      className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-neutral-100 py-2 pr-3 pl-2 text-base font-medium text-neutral-950 transition-[background-color,scale] duration-150 ease-out hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 active:not-disabled:scale-[0.96] disabled:cursor-wait disabled:opacity-60 sm:h-9 sm:text-sm"
      onClick={() => {
        if (!session) {
          const currentPath = `${window.location.pathname}${window.location.search}`;
          void navigate({
            to: "/login",
            search: { redirect: getSafeReturnTo(returnTo ?? currentPath) },
          });
          return;
        }
        toggle.mutate({ kind, id: entityId });
      }}
    >
      <span aria-hidden="true" className="relative size-4 shrink-0">
        <Plus
          className={`${iconTransition} size-4 stroke-neutral-950 ${isFollowing ? "scale-[0.25] opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-0"}`}
        />
        <Check
          className={`${iconTransition} size-4 stroke-neutral-950 ${isFollowing ? "scale-100 opacity-100 blur-0" : "scale-[0.25] opacity-0 blur-[4px]"}`}
        />
      </span>
      {isFollowing ? "Following" : "Follow"}
    </button>
  );
}
