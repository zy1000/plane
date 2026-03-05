import { observer } from "mobx-react";
import emptyModule from "@/app/assets/empty-state/module.svg?url";
import { EmptyState } from "@/components/common/empty-state";
import { PageHead } from "@/components/core/page-title";
import { useAppRouter } from "@/hooks/use-app-router";
import type { Route } from "./+types/page";

function ModuleOverviewEntryPage({ params }: Route.ComponentProps) {
  const router = useAppRouter();
  const { workspaceSlug, projectId, moduleId } = params;

  return (
    <>
      <PageHead title="Module Overview" />
      <EmptyState
        image={emptyModule}
        title="Module overview placeholder"
        description="This is a placeholder page. Use the button below to open the module work item details."
        primaryButton={{
          text: "Open module details",
          onClick: () => router.push(`/${workspaceSlug}/projects/${projectId}/modules/${moduleId}`),
        }}
      />
    </>
  );
}

export default observer(ModuleOverviewEntryPage);
