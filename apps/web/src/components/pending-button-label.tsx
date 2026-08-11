import { cn } from "@art/ui/lib/utils";
import { LoaderCircle } from "lucide-react";

interface PendingButtonLabelProps {
  idle: string;
  isPending: boolean;
  pending: string;
}

const iconTransition =
  "transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none";

export function PendingButtonLabel({ idle, isPending, pending }: PendingButtonLabelProps) {
  return (
    <span className="relative inline-grid place-items-center">
      <span
        aria-hidden="true"
        className={cn(
          "col-start-1 row-start-1",
          iconTransition,
          isPending ? "scale-[0.25] opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-0",
        )}
      >
        {idle}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "col-start-1 row-start-1 inline-flex items-center gap-2",
          iconTransition,
          isPending ? "scale-100 opacity-100 blur-0" : "scale-[0.25] opacity-0 blur-[4px]",
        )}
      >
        <LoaderCircle
          className={cn("size-4 shrink-0", isPending && "animate-spin motion-reduce:animate-none")}
        />
        {pending}
      </span>
      <span className="sr-only" aria-live="polite">
        {isPending ? pending : idle}
      </span>
    </span>
  );
}
