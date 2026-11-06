/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useSearchParams } from "react-router";
import { useTranslation } from "@plane/i18n";
import { EIssuesStoreType } from "@plane/types";
// components
import { IssuePeekOverview } from "@/components/issues/peek-overview";
// hooks
import { useUserWorkInitiated } from "@/hooks/use-user-work";
// types
import type { TUserWorkType } from "@/types/user-work";
import { USER_WORK_INITIATED_TYPES } from "@/types/user-work";
// local
import { matchesSearch, ownerOptions } from "./pending-view";
import { useIssuesStoreContextValue } from "./use-issues-store-context";
import { useOpenWorkRow } from "./use-open-work-row";
import type { TWorkGroupBy } from "./work-groups";
import { groupRows } from "./work-groups";
import { WorkTable, buildColumns } from "./work-table";
import { WorkGroupByMenu, WorkMultiSelectMenu, WorkSearch, WorkToolbar } from "./work-toolbar";
import { WORK_TYPE_ALL, WorkTypeRail } from "./work-type-rail";

/** 我发起的：我创建且未闭环的工作项 / 缺陷 / 需求，加上我提交、还在等别人表态的单子 */
export const ProfileInitiatedView = observer(function ProfileInitiatedView() {
  const { workspaceSlug, userId } = useParams();
  const ws = String(workspaceSlug);
  const uid = String(userId);
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const StoreProvider = useIssuesStoreContextValue(EIssuesStoreType.PROFILE);

  const typeParam = searchParams.get("type");
  const selectedType: string = USER_WORK_INITIATED_TYPES.includes(typeParam as TUserWorkType)
    ? (typeParam as string)
    : WORK_TYPE_ALL;
  const [search, setSearch] = useState("");
  const [owners, setOwners] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<TWorkGroupBy | null>(null);

  const { data, isLoading } = useUserWorkInitiated(ws, uid, {});
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const needle = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          (selectedType === WORK_TYPE_ALL || row.type === selectedType) &&
          matchesSearch(row, needle) &&
          (owners.length === 0 || (row.owner && owners.includes(row.owner.id)))
      ),
    [needle, owners, rows, selectedType]
  );

  const effectiveGroupBy: TWorkGroupBy = (() => {
    const base = groupBy ?? "type";
    return base === "type" && selectedType !== WORK_TYPE_ALL ? "none" : base;
  })();
  const groups = useMemo(() => groupRows(t, filtered, effectiveGroupBy), [effectiveGroupBy, filtered, t]);
  const columns = useMemo(() => buildColumns(t, "initiated", null), [t]);
  const onOpen = useOpenWorkRow(ws);
  const groupOptions: TWorkGroupBy[] = selectedType === WORK_TYPE_ALL ? ["type", "owner", "none"] : ["owner", "none"];

  const setType = (type: string) => {
    const next = new URLSearchParams(searchParams);
    if (type === WORK_TYPE_ALL) next.delete("type");
    else next.set("type", type);
    setSearchParams(next, { replace: true });
  };

  return (
    <StoreProvider>
      <div className="flex h-full w-full flex-col overflow-hidden">
        <WorkToolbar
          left={<WorkSearch value={search} onChange={setSearch} placeholder={t("profile.work.search_placeholder")} />}
          right={
            <>
              <WorkMultiSelectMenu
                label={t("profile.work.buttons.filter")}
                options={ownerOptions(rows)}
                selected={owners}
                onChange={setOwners}
                allLabel={t("profile.work.filter.all_owners")}
              />
              <WorkGroupByMenu value={effectiveGroupBy} options={groupOptions} onChange={setGroupBy} />
            </>
          }
        />
        <div className="flex min-h-0 flex-1">
          <WorkTypeRail
            types={USER_WORK_INITIATED_TYPES}
            counts={data?.by_type ?? {}}
            selected={selectedType}
            onSelect={setType}
          />
          <WorkTable
            columns={columns}
            groups={groups}
            onOpen={onOpen}
            isLoading={isLoading && !data}
            emptyText={t("profile.work.empty.initiated")}
          />
        </div>
        <IssuePeekOverview />
      </div>
    </StoreProvider>
  );
});
