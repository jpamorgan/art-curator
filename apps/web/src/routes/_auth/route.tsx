import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { RouteUnavailable } from "@/components/route-unavailable";

export const Route = createFileRoute("/_auth")({
  component: AuthLayout,
  beforeLoad: ({ context, location }) => {
    const session = context.session;
    if (!session) {
      throw redirect({
        to: "/login",
        search: {
          redirect: location.href,
        },
      });
    }
    return { session };
  },
  errorComponent: () => (
    <RouteUnavailable title="Favorites unavailable" message="Your saved art could not be loaded." />
  ),
});

function AuthLayout() {
  return <Outlet />;
}
