import { ReleasenotePage } from "@/modules/releasenote";
import type { Route } from "./+types/page";

export default function WorkspaceReleasenoteRoute({ params }: Route.ComponentProps) {
  return <ReleasenotePage workspaceSlug={params.workspaceSlug} />;
}
