import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ArtGallery, type ArtGalleryProps } from "@/components/art-gallery";
import type { ArtworkCardData } from "@/components/artwork-card";
import type { RecommendationItem } from "@/lib/discovery";
import { orpc } from "@/utils/orpc";

type TrackingEvent = { recommendationToken: string; type: "impression" | "open" };

export function createRecommendationTracker(send: (events: TrackingEvent[]) => void, delay = 400) {
  const pending: TrackingEvent[] = [];
  const impressions = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    while (pending.length > 0) send(pending.splice(0, 50));
  };

  const queue = (event: TrackingEvent) => {
    if (event.type === "open") {
      send([event]);
      return;
    }
    if (impressions.has(event.recommendationToken)) return;
    impressions.add(event.recommendationToken);
    pending.push(event);
    timer ??= setTimeout(flush, delay);
  };

  return { queue, flush, dispose: flush };
}

export async function undoAfterHide(hideRequest: Promise<unknown>, undo: () => Promise<unknown>) {
  try {
    await hideRequest;
  } catch {
    return false;
  }
  await undo();
  return true;
}

interface RecommendationGalleryProps extends Omit<
  ArtGalleryProps,
  "items" | "recommendationReasons" | "onNotForMe"
> {
  recommendations: RecommendationItem[];
  canHide?: boolean;
  onHide?: (artworkId: string) => Promise<unknown>;
  onUndoHide?: (artworkId: string) => Promise<unknown>;
}

export function RecommendationGallery({
  recommendations,
  canHide = false,
  onHide,
  onUndoHide,
  ...galleryProps
}: RecommendationGalleryProps) {
  const [locallyHidden, setLocallyHidden] = useState<Set<string>>(() => new Set());
  const { mutate: trackEvents } = useMutation(orpc.recommendations.track.mutationOptions());
  const trackEventsRef = useRef(trackEvents);
  trackEventsRef.current = trackEvents;
  const trackerRef = useRef<ReturnType<typeof createRecommendationTracker> | null>(null);
  trackerRef.current ??= createRecommendationTracker((events) =>
    trackEventsRef.current({ events }),
  );
  const hideRequests = useRef<Map<string, Promise<unknown>>>(new Map());
  const visibleRecommendations = useMemo(
    () => recommendations.filter((item) => !locallyHidden.has(item.artwork.id)),
    [locallyHidden, recommendations],
  );
  const reasons = useMemo(
    () => new Map(visibleRecommendations.map((item) => [item.artwork.id, item.reason])),
    [visibleRecommendations],
  );
  const tokens = useMemo(
    () => new Map(recommendations.map((item) => [item.artwork.id, item.recommendationToken])),
    [recommendations],
  );

  const queueTracking = useCallback(
    (artworkId: string, type: TrackingEvent["type"]) => {
      const recommendationToken = tokens.get(artworkId);
      if (!recommendationToken) return;
      trackerRef.current?.queue({ recommendationToken, type });
    },
    [tokens],
  );

  useEffect(() => {
    const flush = () => trackerRef.current?.flush();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      trackerRef.current?.dispose();
    };
  }, []);

  const hide = (artwork: ArtworkCardData) => {
    setLocallyHidden((current) => new Set(current).add(artwork.id));
    const hideRequest = onHide?.(artwork.id) ?? Promise.resolve();
    hideRequests.current.set(artwork.id, hideRequest);
    void hideRequest.catch(() => {
      setLocallyHidden((current) => {
        const next = new Set(current);
        next.delete(artwork.id);
        return next;
      });
      toast.error("Could not update your recommendations.");
    });

    toast(`${artwork.title} hidden`, {
      description: "We’ll use this to improve future recommendations.",
      action: {
        label: "Undo",
        onClick: () => {
          setLocallyHidden((current) => {
            const next = new Set(current);
            next.delete(artwork.id);
            return next;
          });
          const pendingHide = hideRequests.current.get(artwork.id) ?? Promise.resolve();
          void undoAfterHide(pendingHide, () => onUndoHide?.(artwork.id) ?? Promise.resolve())
            .catch(() => {
              setLocallyHidden((current) => new Set(current).add(artwork.id));
              toast.error("Could not undo that change.");
            })
            .finally(() => hideRequests.current.delete(artwork.id));
        },
      },
    });
  };

  return (
    <ArtGallery
      {...galleryProps}
      items={visibleRecommendations.map((item) => item.artwork)}
      recommendationReasons={reasons}
      onNotForMe={canHide ? hide : undefined}
      onImpression={(artwork) => queueTracking(artwork.id, "impression")}
      onOpen={(artwork) => queueTracking(artwork.id, "open")}
    />
  );
}
