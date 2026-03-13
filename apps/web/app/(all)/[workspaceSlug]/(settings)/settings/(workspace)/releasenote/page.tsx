import { ReleasenoteAdminPage } from "@/modules/releasenote";
import type { Route } from "./+types/page";

export default function WorkspaceReleasenoteAdminRoute({ params }: Route.ComponentProps) {
  return <ReleasenoteAdminPage workspaceSlug={params.workspaceSlug} />;
}
