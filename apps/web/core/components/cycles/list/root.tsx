import React, { useMemo } from "react";
import { observer } from "mobx-react";
import { Disclosure } from "@headlessui/react";
// components
import { CYCLE_STATUS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { ContentWrapper, ERowVariant } from "@plane/ui";
import { ListLayout } from "@/components/core/list";
import { ActiveCycleRoot } from "@/plane-web/components/cycles";
import { useCycle } from "@/hooks/store/use-cycle";
import type { TCycleGroups } from "@plane/types";
// local imports
import { CyclePeekOverview } from "../cycle-peek-overview";
import { CycleListGroupHeader } from "./cycle-list-group-header";
import { CyclesListMap } from "./cycles-list-map";

export interface ICyclesList {
  cycleIds: string[];
  workspaceSlug: string;
  projectId: string;
  isArchived?: boolean;
}

export const CyclesList = observer(function CyclesList(props: ICyclesList) {
  const { cycleIds, workspaceSlug, projectId, isArchived = false } = props;
  const { t } = useTranslation();
  const { getCycleById } = useCycle();

  const getStatusTitle = (status: TCycleGroups) =>
    t(CYCLE_STATUS.find((s) => s.value === status)?.i18n_title ?? status);

  const groupedCycleIds = useMemo(() => {
    const groups: Record<TCycleGroups, string[]> = {
      not_started: [],
      in_progress: [],
      delayed: [],
      completed: [],
      cancelled: [],
    };

    cycleIds.forEach((cycleId) => {
      const cycle = getCycleById(cycleId);
      const status = cycle?.status ?? "not_started";
      (groups[status] ?? groups.not_started).push(cycleId);
    });

    return groups;
  }, [cycleIds, getCycleById]);

  return (
    <ContentWrapper variant={ERowVariant.HUGGING} className="flex-row">
      <ListLayout>
        {isArchived ? (
          <>
            <CyclesListMap cycleIds={cycleIds} projectId={projectId} workspaceSlug={workspaceSlug} />
          </>
        ) : (
          <>
            <Disclosure as="div" className="flex flex-shrink-0 flex-col" defaultOpen>
              {({ open }) => (
                <>
                  <Disclosure.Button className="sticky top-0 z-[2] w-full flex-shrink-0 border-b border-custom-border-200 bg-custom-background-90 cursor-pointer">
                    <CycleListGroupHeader
                      title={getStatusTitle("in_progress")}
                      type="in_progress"
                      count={groupedCycleIds.in_progress.length}
                      showCount
                      isExpanded={open}
                    />
                  </Disclosure.Button>
                  <Disclosure.Panel>
                    <ActiveCycleRoot
                      workspaceSlug={workspaceSlug}
                      projectId={projectId}
                      cycleIds={groupedCycleIds.in_progress}
                      showHeader={false}
                    />
                  </Disclosure.Panel>
                </>
              )}
            </Disclosure>

            <Disclosure as="div" className="flex flex-shrink-0 flex-col">
              {({ open }) => (
                <>
                  <Disclosure.Button className="sticky top-0 z-[2] w-full flex-shrink-0 border-b border-custom-border-200 bg-custom-background-90 cursor-pointer">
                    <CycleListGroupHeader
                      title={getStatusTitle("not_started")}
                      type="not_started"
                      count={groupedCycleIds.not_started.length}
                      showCount
                      isExpanded={open}
                    />
                  </Disclosure.Button>
                  <Disclosure.Panel>
                    <ActiveCycleRoot
                      workspaceSlug={workspaceSlug}
                      projectId={projectId}
                      cycleIds={groupedCycleIds.not_started}
                      showHeader={false}
                      filterToInProgress={false}
                      showEmptyState={false}
                    />
                  </Disclosure.Panel>
                </>
              )}
            </Disclosure>

            <Disclosure as="div" className="flex flex-shrink-0 flex-col">
              {({ open }) => (
                <>
                  <Disclosure.Button className="sticky top-0 z-[2] w-full flex-shrink-0 border-b border-custom-border-200 bg-custom-background-90 cursor-pointer">
                    <CycleListGroupHeader
                      title={getStatusTitle("delayed")}
                      type="delayed"
                      count={groupedCycleIds.delayed.length}
                      showCount
                      isExpanded={open}
                    />
                  </Disclosure.Button>
                  <Disclosure.Panel>
                    <ActiveCycleRoot
                      workspaceSlug={workspaceSlug}
                      projectId={projectId}
                      cycleIds={groupedCycleIds.delayed}
                      showHeader={false}
                      filterToInProgress={false}
                      showEmptyState={false}
                    />
                  </Disclosure.Panel>
                </>
              )}
            </Disclosure>

            <Disclosure as="div" className="flex flex-shrink-0 flex-col">
              {({ open }) => (
                <>
                  <Disclosure.Button className="sticky top-0 z-[2] w-full flex-shrink-0 border-b border-custom-border-200 bg-custom-background-90 cursor-pointer">
                    <CycleListGroupHeader
                      title={getStatusTitle("completed")}
                      type="completed"
                      count={groupedCycleIds.completed.length}
                      showCount
                      isExpanded={open}
                    />
                  </Disclosure.Button>
                  <Disclosure.Panel>
                    <ActiveCycleRoot
                      workspaceSlug={workspaceSlug}
                      projectId={projectId}
                      cycleIds={groupedCycleIds.completed}
                      showHeader={false}
                      filterToInProgress={false}
                      showEmptyState={false}
                    />
                  </Disclosure.Panel>
                </>
              )}
            </Disclosure>

            <Disclosure as="div" className="flex flex-shrink-0 flex-col pb-7">
              {({ open }) => (
                <>
                  <Disclosure.Button className="sticky top-0 z-[2] w-full flex-shrink-0 border-b border-custom-border-200 bg-custom-background-90 cursor-pointer">
                    <CycleListGroupHeader
                      title={getStatusTitle("cancelled")}
                      type="cancelled"
                      count={groupedCycleIds.cancelled.length}
                      showCount
                      isExpanded={open}
                    />
                  </Disclosure.Button>
                  <Disclosure.Panel>
                    <ActiveCycleRoot
                      workspaceSlug={workspaceSlug}
                      projectId={projectId}
                      cycleIds={groupedCycleIds.cancelled}
                      showHeader={false}
                      filterToInProgress={false}
                      showEmptyState={false}
                    />
                  </Disclosure.Panel>
                </>
              )}
            </Disclosure>
          </>
        )}
      </ListLayout>
      <CyclePeekOverview projectId={projectId} workspaceSlug={workspaceSlug} isArchived={isArchived} />
    </ContentWrapper>
  );
});
