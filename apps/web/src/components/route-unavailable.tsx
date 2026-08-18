import { useRouter } from "@tanstack/react-router";

type RouteUnavailableProps = {
  title: string;
  message: string;
};

export function RouteUnavailable({ title, message }: RouteUnavailableProps) {
  const router = useRouter();

  return (
    <div className="isolate flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-white p-6 text-neutral-950">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <h1 className="text-balance text-2xl font-medium tracking-tight">{title}</h1>
        <p className="text-pretty text-base text-neutral-600 sm:text-sm">{message}</p>
        <button
          type="button"
          className="min-h-10 rounded-lg bg-neutral-950 px-3.5 text-base font-medium text-white transition-transform duration-150 ease-out outline-none active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-950 sm:text-sm"
          onClick={() => void router.invalidate()}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
