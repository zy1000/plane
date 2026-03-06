import { ChangelogAdminPage } from "@/modules/changelog";
import type { Route } from "./+types/page";

export default function WorkspaceChangelogAdminRoute({ params }: Route.ComponentProps) {
  return <ChangelogAdminPage workspaceSlug={params.workspaceSlug} />;
}
