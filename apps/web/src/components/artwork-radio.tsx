import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Radio, Sparkles } from "lucide-react";
import { useState } from "react";

import { RecommendationGallery } from "@/components/recommendation-gallery";
import { authClient } from "@/lib/auth-client";
import { DISCOVERY_LEVELS, type DiscoveryLevel } from "@/lib/discovery";
import { recommendationListOptions } from "@/lib/discovery-options";
import { orpc } from "@/utils/orpc";

interface ArtworkRadioProps {
  artworkId: string;
  artworkTitle: string;
}

export function ArtworkRadio({ artworkId, artworkTitle }: ArtworkRadioProps) {
  const { data: session } = authClient.useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [personalized, setPersonalized] = useState(true);
  const [discovery, setDiscovery] = useState<DiscoveryLevel>("balanced");
  const queryClient = useQueryClient();
  const radio = useInfiniteQuery({
    ...recommendationListOptions({
      seedArtworkId: artworkId,
      personalized: personalized && Boolean(session),
      userId: session?.user.id ?? null,
      discovery,
      limit: 12,
    }),
    enabled: isOpen,
  });
  const setHidden = useMutation({
    ...orpc.recommendations.setHidden.mutationOptions(),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: orpc.recommendations.key() });
    },
  });
  const items = radio.data?.pages.flatMap((page) => page.items) ?? [];

  if (!isOpen) {
    return (
      <section className="border-t border-black/10 px-3 py-10 sm:px-5 sm:py-14">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="max-w-[22ch] text-balance text-2xl font-medium tracking-tight sm:text-xl">
              Keep exploring from this work
            </h2>
            <p className="max-w-[62ch] break-words text-pretty text-base text-neutral-600 sm:text-sm">
              Start a visual radio station anchored by {artworkTitle}.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-lg bg-neutral-950 py-2 pr-3 pl-2 text-base font-medium text-white transition-transform duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 active:scale-[0.96] sm:text-sm lg:h-9"
            onClick={() => setIsOpen(true)}
          >
            <Radio aria-hidden="true" className="size-4 shrink-0 stroke-white" />
            Start artwork radio
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="border-t border-black/10 py-10 sm:py-14" aria-labelledby="radio-heading">
      <div className="flex flex-col gap-5 px-3 sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <h2
              id="radio-heading"
              className="max-w-[22ch] text-balance text-2xl font-medium tracking-tight sm:text-xl"
            >
              Artwork radio
            </h2>
            <p className="max-w-[62ch] break-words text-pretty text-base text-neutral-600 sm:text-sm">
              Anchored by {artworkTitle}. Adjust how far the station wanders.
            </p>
          </div>

          <div className="grid min-w-0 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <fieldset className="grid min-w-0 grid-cols-3 rounded-xl bg-neutral-100 p-1 sm:flex">
              <legend className="sr-only">Discovery level</legend>
              {DISCOVERY_LEVELS.map((level) => (
                <label key={level} className="relative shrink-0">
                  <input
                    type="radio"
                    name={`radio-discovery-${artworkId}`}
                    value={level}
                    checked={discovery === level}
                    className="peer sr-only"
                    onChange={() => setDiscovery(level)}
                  />
                  <span className="flex h-12 cursor-pointer items-center justify-center rounded-lg px-1 text-sm text-neutral-600 peer-checked:bg-white peer-checked:text-neutral-950 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-0 peer-focus-visible:outline-neutral-950 min-[360px]:px-2 min-[360px]:text-base sm:px-2.5 sm:text-sm sm:pointer-fine:h-10 lg:h-8">
                    {level === "familiar"
                      ? "Familiar"
                      : level === "balanced"
                        ? "Balanced"
                        : "Adventurous"}
                  </span>
                </label>
              ))}
            </fieldset>

            <label className="flex h-12 items-center gap-2 rounded-lg px-2.5 text-base text-neutral-700 sm:text-sm lg:h-9">
              <span className="group relative inline-flex w-11 shrink-0 rounded-full bg-neutral-200 p-0.5 inset-ring inset-ring-neutral-950/5 outline-offset-2 transition-colors duration-200 ease-in-out has-checked:bg-neutral-950 has-focus-visible:outline-2 has-focus-visible:outline-neutral-950 sm:w-9">
                <span className="aspect-square w-1/2 rounded-full bg-white ring-1 ring-neutral-950/5 shadow-xs transition-transform duration-200 ease-in-out group-has-checked:translate-x-full" />
                <input
                  type="checkbox"
                  name="personalized-radio"
                  className="absolute inset-0 size-full appearance-none focus:outline-hidden"
                  checked={personalized && Boolean(session)}
                  disabled={!session}
                  onChange={(event) => setPersonalized(event.currentTarget.checked)}
                />
              </span>
              Personalized
            </label>
          </div>
        </div>
      </div>

      <RecommendationGallery
        recommendations={items}
        canHide={Boolean(session)}
        isLoading={radio.isPending}
        isError={radio.isError}
        isRetrying={radio.isFetching}
        errorMessage={radio.error?.message}
        onRetry={() => void radio.refetch()}
        hasNextPage={radio.hasNextPage}
        fetchNextPage={radio.fetchNextPage}
        isFetchingNextPage={radio.isFetchingNextPage}
        isFetchNextPageError={radio.isFetchNextPageError}
        onHide={(targetArtworkId) =>
          setHidden.mutateAsync({ artworkId: targetArtworkId, hidden: true })
        }
        onUndoHide={(targetArtworkId) =>
          setHidden.mutateAsync({ artworkId: targetArtworkId, hidden: false })
        }
        emptyMessage="No radio matches are available yet."
      />

      {!session ? (
        <p className="flex items-center gap-1.5 px-3 text-pretty text-base text-neutral-500 sm:px-5 sm:text-sm">
          <Sparkles aria-hidden="true" className="size-4 shrink-0 stroke-neutral-500" />
          Log in to blend this station with your saved favorites.
        </p>
      ) : null}
    </section>
  );
}
