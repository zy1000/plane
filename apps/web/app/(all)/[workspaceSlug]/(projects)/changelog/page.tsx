import { ChangelogPage } from "@/modules/changelog";
import type { Route } from "./+types/page";

export default function WorkspaceChangelogRoute({ params }: Route.ComponentProps) {
  return <ChangelogPage workspaceSlug={params.workspaceSlug} />;
}
