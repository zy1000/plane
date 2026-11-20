/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router";
import useSWR, { mutate as globalMutate } from "swr";
import { Search } from "lucide-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import {
  MY_SUBSCRIPTION_TYPES,
  MY_SUBSCRIPTION_TYPE_LABELS,
  NOTIFY_MODE_LABELS,
  NotifyModeTag,
  formatNotifyDate,
} from "@/components/notify";
import { DictionaryItemsPagination } from "@/components/workspace/settings/data-dictionaries/dictionary-items-pagination";
import { NotifyService } from "@/services/notify.service";
import type { TMySubscription, TMySubscriptionType, TNotifyMode } from "@/types/notify";
import { MySubscriptionModeModal } from "./my-subscription-mode-modal";

const notifyService = new NotifyService();
const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
const GRID =
  "grid grid-cols-[minmax(170px,1fr)_68px_minmax(96px,132px)_72px_92px_104px] items-center gap-x-3 px-4";
const OP_LINK = "text-14 whitespace-nowrap hover:underline";
const SELECT = "h-9 max-w-56 truncate rounded-lg border border-subtle bg-surface-1 px-2.5 text-14 text-primary outline-none";

type Props = {
  workspaceSlug: string;
  onBack: () => void;
};

/** 个人设置 › 通知 › 我的订阅：我在各类对象上的订阅，一处改接收方式、取消订阅 */
export function MyNotifySubscriptions({ workspaceSlug, onBack }: Props) {
  const [type, setType] = useState<TMySubscriptionType | "all">("all");
  const [mode, setMode] = useState<TNotifyMode | "">("");
  const [projectId, setProjectId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  const [editing, setEditing] = useState<TMySubscription | null>(null);

  // 输入停下来再查，别每敲一个字发一次请求
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(keyword.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  const { data, mutate } = useSWR(
    ["MY_NOTIFY_SUBSCRIPTIONS", workspaceSlug, type, mode, projectId, search, page, pageSize],
    () =>
      notifyService.mySubscriptions(workspaceSlug, {
        type: type === "all" ? undefined : type,
        mode: mode || undefined,
        project_id: projectId || undefined,
        search: search || undefined,
        page,
        per_page: pageSize,
      }),
    { keepPreviousData: true, shouldRetryOnError: false }
  );

  const refresh = async () => {
    await mutate();
    void globalMutate(`MY_NOTIFY_SUBSCRIPTION_COUNTS_${workspaceSlug}`);
  };

  const handleRemove = async (row: TMySubscription) => {
    try {
      await notifyService.removeMySubscription(workspaceSlug, row.type, row.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已取消订阅" });
      await refresh();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "取消订阅失败", message: "请稍后重试" });
    }
  };

  const counts = data?.counts;
  const totalAll = counts ? MY_SUBSCRIPTION_TYPES.reduce((sum, key) => sum + (counts[key] ?? 0), 0) : 0;
  const pills: { key: TMySubscriptionType | "all"; label: string; count: number }[] = [
    { key: "all", label: "全部", count: totalAll },
    ...MY_SUBSCRIPTION_TYPES.map((key) => ({ key, label: MY_SUBSCRIPTION_TYPE_LABELS[key], count: counts?.[key] ?? 0 })),
  ];
  const total = data?.total ?? 0;
  const rows = data?.results ?? [];

  return (
    <div className="flex size-full flex-col gap-5">
      <h6 className="text-h6-medium text-primary">
        <button type="button" className="text-tertiary hover:text-primary" onClick={onBack}>
          通知
        </button>
        <span className="mx-2.5 font-normal text-placeholder">/</span>
        我的订阅
      </h6>

      <div className="flex flex-wrap gap-2">
        {pills.map((pill) => (
          <button
            key={pill.key}
            type="button"
            aria-pressed={type === pill.key}
            className={cn(
              "inline-flex h-[34px] items-center gap-1.5 rounded-lg border px-3.5 text-14 whitespace-nowrap",
              type === pill.key
                ? "border-accent-subtle bg-accent-subtle font-medium text-accent-primary"
                : "border-subtle text-secondary hover:bg-layer-1-hover"
            )}
            onClick={() => {
              setType(pill.key);
              setPage(1);
            }}
          >
            {pill.label}
            <span className="text-12 tabular-nums">{pill.count}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <label className="flex h-9 w-64 items-center gap-2 rounded-lg border border-subtle bg-surface-1 px-3 focus-within:border-accent-strong">
          <Search className="size-4 shrink-0 text-placeholder" />
          <input
            className="min-w-0 flex-1 bg-transparent text-14 text-primary outline-none placeholder:text-placeholder"
            placeholder="搜索名称"
            aria-label="搜索名称"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </label>
        <select
          className={SELECT}
          aria-label="所属项目"
          value={projectId}
          onChange={(event) => {
            setProjectId(event.target.value);
            setPage(1);
          }}
        >
          <option value="">所属项目：全部</option>
          {(data?.projects ?? []).map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <select
          className={SELECT}
          aria-label="接收方式"
          value={mode}
          onChange={(event) => {
            setMode(event.target.value as TNotifyMode | "");
            setPage(1);
          }}
        >
          <option value="">接收方式：全部</option>
          <option value="instant">{NOTIFY_MODE_LABELS.instant}</option>
          <option value="digest">{NOTIFY_MODE_LABELS.digest}</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-subtle bg-surface-1">
        <div className="overflow-x-auto">
          <div className="min-w-[700px]">
            <div className={cn(GRID, "h-11 border-b border-subtle bg-layer-1 text-13 font-medium text-tertiary")}>
              <span>名称</span>
              <span>类型</span>
              <span>所属项目</span>
              <span>接收方式</span>
              <span>订阅时间</span>
              <span className="flex justify-end">操作</span>
            </div>
            {!data ? (
              <Loader className="flex flex-col gap-2 p-4">
                {[0, 1, 2, 3].map((index) => (
                  <Loader.Item key={index} height="38px" />
                ))}
              </Loader>
            ) : rows.length === 0 ? (
              <div className="py-12 text-center text-13 text-tertiary">暂无订阅</div>
            ) : (
              rows.map((row) => (
                <div
                  key={`${row.type}-${row.id}`}
                  className={cn(GRID, "h-[54px] border-b border-subtle text-14 last:border-b-0 hover:bg-layer-1-hover")}
                >
                  <span className="min-w-0 truncate">
                    {row.code && <span className="mr-2 text-secondary tabular-nums">{row.code}</span>}
                    {row.url_path ? (
                      <Link to={row.url_path} className="text-primary hover:underline">
                        {row.name}
                      </Link>
                    ) : (
                      <span className="text-primary">{row.name}</span>
                    )}
                  </span>
                  <span className="text-secondary">{MY_SUBSCRIPTION_TYPE_LABELS[row.type]}</span>
                  <span className="truncate text-secondary">{row.project_name || "—"}</span>
                  <span>
                    <NotifyModeTag mode={row.mode} />
                  </span>
                  <span className="whitespace-nowrap text-tertiary tabular-nums">
                    {formatNotifyDate(row.created_at)}
                  </span>
                  <span className="flex items-center justify-end gap-3.5">
                    <button type="button" className={`${OP_LINK} text-accent-primary`} onClick={() => setEditing(row)}>
                      编辑
                    </button>
                    <button
                      type="button"
                      className={`${OP_LINK} text-secondary hover:text-danger-primary`}
                      onClick={() => void handleRemove(row)}
                    >
                      取消订阅
                    </button>
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
        <DictionaryItemsPagination
          total={total}
          page={page}
          pageCount={Math.max(1, Math.ceil(total / pageSize))}
          pageSize={pageSize}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </div>

      <MySubscriptionModeModal
        subscription={editing}
        onClose={() => setEditing(null)}
        onSubmit={async (row, nextMode) => {
          await notifyService.updateMySubscription(workspaceSlug, row.type, row.id, nextMode);
          await refresh();
        }}
      />
    </div>
  );
}
