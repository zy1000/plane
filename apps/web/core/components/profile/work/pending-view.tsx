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
import { Button } from "@plane/propel/button";
import { EIssuesStoreType } from "@plane/types";
// components
import { IssuePeekOverview } from "@/components/issues/peek-overview";
// hooks
import { useIssuesStoreContextValue } from "./use-issues-store-context";
import { useSaveUserWorkPreferences, useUserWorkPending, useUserWorkSummary } from "@/hooks/use-user-work";
// types
import type { TUserWorkQuickBucket, TUserWorkRow, TUserWorkType } from "@/types/user-work";
import { USER_WORK_TYPES } from "@/types/user-work";
// local
import { useOpenWorkRow } from "./use-open-work-row";
import { ViewSettingsDrawer } from "./view-settings-drawer";
import type { TWorkGroupBy } from "./work-groups";
import { groupRows, sortRows } from "./work-groups";
import { WorkTable, buildColumns } from "./work-table";
import {
  WorkGroupByMenu,
  WorkMultiSelectMenu,
  WorkQuickChips,
  WorkScopeChip,
  WorkSearch,
  WorkToolbar,
} from "./work-toolbar";
import { WORK_TYPE_ALL, WorkTypeRail } from "./work-type-rail";
import { WORK_SCOPES, isWorkScope, rowQuickBucket, sortTypes } from "./work-types";

const QUICK_BUCKETS: TUserWorkQuickBucket[] = ["overdue", "today", "week", "unscheduled"];
const isQuickBucket = (value: string | null | undefined): value is TUserWorkQuickBucket =>
  QUICK_BUCKETS.includes(value as TUserWorkQuickBucket);
const isWorkType = (value: string | null): value is TUserWorkType =>
  !!value && (USER_WORK_TYPES as readonly string[]).includes(value);

export const ownerOptions = (rows: TUserWorkRow[]) => {
  const map = new Map<string, { key: string; label: string; count: number }>();
  rows.forEach((row) => {
    if (!row.owner) return;
    const current = map.get(row.owner.id);
    if (current) current.count += 1;
    else map.set(row.owner.id, { key: row.owner.id, label: row.owner.name, count: 1 });
  });
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-CN"));
};

export const matchesSearch = (row: TUserWorkRow, needle: string) =>
  !needle ||
  (row.title ?? "").toLowerCase().includes(needle) ||
  (row.code ?? "").toLowerCase().includes(needle);

/**
 * 待处理：左栏按工作类型，右侧统一表；类型 / 快捷筛选挂在 URL 上（摘要页的焦点卡带参数跳进来），
 * 搜索 / 所属 / 分组是页内状态；分组与排序的默认值来自视图设置。
 */
export const ProfilePendingView = observer(function ProfilePendingView() {
  const { workspaceSlug, userId } = useParams();
  const ws = String(workspaceSlug);
  const uid = String(userId);
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const StoreProvider = useIssuesStoreContextValue(EIssuesStoreType.PROFILE);

  const { summary } = useUserWorkSummary(ws, uid);
  const save = useSaveUserWorkPreferences(ws, uid);
  const config = summary?.config;
  const enabledTypes = summary?.pending.enabled_types ?? [];

  const typeParam = searchParams.get("type");
  const selectedType: string = isWorkType(typeParam) ? typeParam : WORK_TYPE_ALL;
  const quickParam = searchParams.get("quick");
  const quick = isQuickBucket(quickParam) ? quickParam : null;
  const scopeParam = searchParams.get("scope");
  const scope = isWorkScope(scopeParam) ? scopeParam : null;

  const [search, setSearch] = useState("");
  const [owners, setOwners] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<TWorkGroupBy | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const { data, isLoading } = useUserWorkPending(ws, uid, {
    types: scope
      ? WORK_SCOPES[scope].types
      : selectedType === WORK_TYPE_ALL
        ? undefined
        : [selectedType as TUserWorkType],
  });
  // 带范围（?scope=）时一次取回范围内全部类型，按待办动作筛；左栏选类型只在本地筛，不重新取
  const scopeRows = useMemo(() => {
    if (!scope) return null;
    const actions = WORK_SCOPES[scope].actions;
    return (data?.rows ?? []).filter((row) => !!row.action && actions.includes(row.action.key));
  }, [data, scope]);
  const rows = useMemo(() => {
    if (!scopeRows) return data?.rows ?? [];
    return selectedType === WORK_TYPE_ALL ? scopeRows : scopeRows.filter((row) => row.type === selectedType);
  }, [data, scopeRows, selectedType]);
  // 汇总接口只按类型 / 动作分别计数，范围内的左栏、快捷筛选条数就地按行算
  const scopeCounts = useMemo(() => {
    if (!scopeRows) return null;
    const byType: Partial<Record<TUserWorkType, number>> = {};
    const byQuick: Partial<Record<TUserWorkQuickBucket, number>> = {};
    scopeRows.forEach((row) => {
      const bucket = rowQuickBucket(row);
      if (isQuickBucket(bucket)) byQuick[bucket] = (byQuick[bucket] ?? 0) + 1;
      if (!quick || bucket === quick) byType[row.type] = (byType[row.type] ?? 0) + 1;
    });
    return { byType, byQuick };
  }, [quick, scopeRows]);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  const needle = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          (!quick || rowQuickBucket(row) === quick) &&
          matchesSearch(row, needle) &&
          (owners.length === 0 || (row.owner && owners.includes(row.owner.id)))
      ),
    [needle, owners, quick, rows]
  );

  const effectiveGroupBy: TWorkGroupBy = (() => {
    const base = groupBy ?? config?.pending.group_by ?? "type";
    return base === "type" && selectedType !== WORK_TYPE_ALL ? "none" : base;
  })();
  const groups = useMemo(() => {
    const sorted = sortRows(filtered, config?.pending.order_by ?? "due_date", config?.pending.overdue_first ?? true);
    return groupRows(t, sorted, effectiveGroupBy);
  }, [config, effectiveGroupBy, filtered, t]);

  const columns = useMemo(
    () => buildColumns(t, "pending", selectedType === WORK_TYPE_ALL ? null : selectedType),
    [selectedType, t]
  );
  const onOpen = useOpenWorkRow(ws);

  const railTypes = scope
    ? WORK_SCOPES[scope].types
    : sortTypes(
        selectedType !== WORK_TYPE_ALL && !enabledTypes.includes(selectedType as TUserWorkType)
          ? [...enabledTypes, selectedType as TUserWorkType]
          : enabledTypes
      );
  const railCounts = scopeCounts
    ? scopeCounts.byType
    : ((quick ? summary?.pending.quick[quick]?.by_type_all : summary?.pending.by_type) ?? {});
  const quickCounts = scopeCounts
    ? {
        overdue: scopeCounts.byQuick.overdue ?? 0,
        today: scopeCounts.byQuick.today ?? 0,
        week: scopeCounts.byQuick.week ?? 0,
        unscheduled: scopeCounts.byQuick.unscheduled ?? 0,
      }
    : {
        overdue: summary?.pending.quick.overdue.total ?? 0,
        today: summary?.pending.quick.today.total ?? 0,
        week: summary?.pending.quick.week.total ?? 0,
        unscheduled: summary?.pending.quick.unscheduled?.total ?? 0,
      };
  const groupOptions: TWorkGroupBy[] =
    selectedType === WORK_TYPE_ALL ? ["type", "owner", "due_date", "none"] : ["owner", "due_date", "none"];

  return (
    <StoreProvider>
      <div className="flex h-full w-full flex-col overflow-hidden">
        <WorkToolbar
          left={
            <>
              {scope && (
                <WorkScopeChip label={t(WORK_SCOPES[scope].labelKey)} onClear={() => setParam("scope", null)} />
              )}
              <WorkSearch value={search} onChange={setSearch} placeholder={t("profile.work.search_placeholder")} />
              <WorkQuickChips active={quick} counts={quickCounts} onChange={(bucket) => setParam("quick", bucket)} />
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
              <WorkGroupByMenu
                value={effectiveGroupBy === "none" && !groupBy && selectedType !== WORK_TYPE_ALL ? "none" : effectiveGroupBy}
                options={groupOptions}
                onChange={setGroupBy}
              />
              {summary?.can_edit_config && (
                <Button variant="secondary" size="lg" onClick={() => setIsSettingsOpen(true)}>
                  {t("profile.work.buttons.view_settings")}
                </Button>
              )}
            </>
          }
        />
        <div className="flex min-h-0 flex-1">
          <WorkTypeRail
            types={railTypes}
            counts={railCounts}
            selected={selectedType}
            onSelect={(type) => setParam("type", type === WORK_TYPE_ALL ? null : type)}
          />
          <WorkTable
            columns={columns}
            groups={groups}
            onOpen={onOpen}
            isLoading={isLoading && !data}
            emptyText={selectedType === WORK_TYPE_ALL ? t("profile.work.empty.pending") : t("profile.work.empty.type")}
          />
        </div>
        <IssuePeekOverview />
        {summary?.can_edit_config && config && (
          <ViewSettingsDrawer
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            config={config}
            pendingCounts={summary.pending.by_type}
            initialView="pending"
            onSave={save}
          />
        )}
      </div>
    </StoreProvider>
  );
});
