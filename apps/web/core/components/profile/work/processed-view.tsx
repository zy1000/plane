/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useSearchParams } from "react-router";
import { useTranslation } from "@plane/i18n";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@plane/propel/button";
import { EIssuesStoreType } from "@plane/types";
// components
import { IssuePeekOverview } from "@/components/issues/peek-overview";
// hooks
import { useSaveUserWorkPreferences, useUserWorkProcessed, useUserWorkSummary } from "@/hooks/use-user-work";
// types
import type { TUserWorkProcessedDays, TUserWorkType } from "@/types/user-work";
import { USER_WORK_TYPES } from "@/types/user-work";
// local
import { ownerOptions } from "./pending-view";
import { useIssuesStoreContextValue } from "./use-issues-store-context";
import { useOpenWorkRow } from "./use-open-work-row";
import { ViewSettingsDrawer } from "./view-settings-drawer";
import type { TWorkGroupBy } from "./work-groups";
import { groupRows } from "./work-groups";
import { WorkTable, buildColumns } from "./work-table";
import { WorkGroupByMenu, WorkMultiSelectMenu, WorkSearch, WorkTimeRangeMenu, WorkToolbar } from "./work-toolbar";
import { WORK_TYPE_ALL, WorkTypeRail } from "./work-type-rail";
import { sortTypes } from "./work-types";

const PAGE_SIZE = 20;
const isWorkType = (value: string | null): value is TUserWorkType =>
  !!value && (USER_WORK_TYPES as readonly string[]).includes(value);

/** 已处理：按我做过的处理动作列出，服务端按时间范围 + 分页，页内按处理日期分段 */
export const ProfileProcessedView = observer(function ProfileProcessedView() {
  const { workspaceSlug, userId } = useParams();
  const ws = String(workspaceSlug);
  const uid = String(userId);
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const StoreProvider = useIssuesStoreContextValue(EIssuesStoreType.PROFILE);

  const { summary } = useUserWorkSummary(ws, uid);
  const save = useSaveUserWorkPreferences(ws, uid);
  const config = summary?.config;
  const enabledTypes = useMemo(
    () => (config ? (Object.keys(config.processed.sources) as TUserWorkType[]).filter((key) => config.processed.sources[key]) : []),
    [config]
  );

  const typeParam = searchParams.get("type");
  const selectedType: string = isWorkType(typeParam) ? typeParam : WORK_TYPE_ALL;
  const [days, setDays] = useState<TUserWorkProcessedDays | null>(null);
  const [search, setSearch] = useState("");
  const [owners, setOwners] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<TWorkGroupBy | null>(null);
  const [page, setPage] = useState(1);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const effectiveDays = days ?? config?.processed.days ?? 30;
  useEffect(() => setPage(1), [selectedType, effectiveDays, search, owners]);

  const { data, isLoading } = useUserWorkProcessed(
    ws,
    uid,
    config
      ? {
          types: selectedType === WORK_TYPE_ALL ? undefined : [selectedType as TUserWorkType],
          search: search.trim() || undefined,
          owners,
          days: effectiveDays,
          page,
          page_size: PAGE_SIZE,
        }
      : {}
  );
  const rows = useMemo(() => data?.rows ?? [], [data]);

  const effectiveGroupBy: TWorkGroupBy = (() => {
    const base = groupBy ?? config?.processed.group_by ?? "date";
    return base === "type" && selectedType !== WORK_TYPE_ALL ? "none" : base;
  })();
  const groups = useMemo(() => groupRows(t, rows, effectiveGroupBy), [effectiveGroupBy, rows, t]);
  const columns = useMemo(() => buildColumns(t, "processed", null), [t]);
  const onOpen = useOpenWorkRow(ws);

  const railTypes = sortTypes(
    selectedType !== WORK_TYPE_ALL && !enabledTypes.includes(selectedType as TUserWorkType)
      ? [...enabledTypes, selectedType as TUserWorkType]
      : enabledTypes
  );
  const total = data?.total ?? 0;
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);
  const pageCount = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const groupOptions: TWorkGroupBy[] =
    selectedType === WORK_TYPE_ALL ? ["date", "type", "owner", "none"] : ["date", "owner", "none"];

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
          left={
            <>
              <WorkSearch value={search} onChange={setSearch} placeholder={t("profile.work.search_placeholder")} />
              <WorkTimeRangeMenu days={effectiveDays} onChange={setDays} />
            </>
          }
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
              {summary?.can_edit_config && (
                <Button variant="secondary" size="lg" onClick={() => setIsSettingsOpen(true)}>
                  {t("profile.work.buttons.view_settings")}
                </Button>
              )}
            </>
          }
        />
        <div className="flex min-h-0 flex-1">
          <WorkTypeRail types={railTypes} counts={data?.by_type ?? {}} selected={selectedType} onSelect={setType} />
          <WorkTable
            columns={columns}
            groups={groups}
            onOpen={onOpen}
            isLoading={isLoading && !data}
            emptyText={t("profile.work.empty.processed")}
            footer={
              <div className="flex h-11 shrink-0 items-center justify-between border-t border-subtle px-4 text-13 text-secondary">
                <span>{t("profile.work.pagination.range", { start, end, total })}</span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(value - 1, 1))} aria-label="上一页">
                    <ChevronLeft className="size-3.5" />
                  </Button>
                  <span className="min-w-[48px] text-center tabular-nums">
                    {page} / {pageCount}
                  </span>
                  <Button variant="ghost" size="sm" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(value + 1, pageCount))} aria-label="下一页">
                    <ChevronRight className="size-3.5" />
                  </Button>
                </div>
              </div>
            }
          />
        </div>
        <IssuePeekOverview />
        {summary?.can_edit_config && config && (
          <ViewSettingsDrawer
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            config={config}
            pendingCounts={summary.pending.by_type}
            processedCounts={data?.by_type}
            initialView="processed"
            onSave={save}
          />
        )}
      </div>
    </StoreProvider>
  );
});
