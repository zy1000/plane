import { observer } from "mobx-react";
import { PageHead } from "@/components/core/page-title";
import { ModuleDetailContent } from "@/components/modules/module-detail-content";
import type { Route } from "./+types/page";

function ModuleOverviewEntryPage({ params }: Route.ComponentProps) {
  const { moduleId } = params;

  return (
    <>
      <PageHead title="Module Overview" />
      {moduleId ? <ModuleDetailContent moduleId={moduleId.toString()} isOpen /> : null}
    </>
  );
}

export default observer(ModuleOverviewEntryPage);
