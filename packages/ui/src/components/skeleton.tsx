import { cn } from "@art/ui/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden={props["aria-hidden"] ?? true}
      className={cn("relative isolate overflow-hidden rounded-none bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
