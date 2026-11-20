/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import useSWR from "swr";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { formatNotifyDateTime } from "@/components/notify";
import { DictionaryItemsPagination } from "@/components/workspace/settings/data-dictionaries/dictionary-items-pagination";
import { PermissionGroupSearch } from "@/components/workspace/settings/permission-groups/ui";
import { NotifyService } from "@/services/notify.service";
import type { TNotifyMail, TNotifyMailKind, TNotifyMailStatus, TNotifyMailsQuery } from "@/types/notify";

const notifyService = new NotifyService();
const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
const GRID =
  "grid grid-cols-[112px_minmax(72px,100px)_76px_minmax(220px,1.6fr)_92px_minmax(160px,1fr)_52px] items-center gap-x-4 px-5";
const SELECT = "h-9 rounded-lg border border-subtle bg-surface-1 px-2.5 text-14 text-primary outline-none";

const STATUS_LABELS: Record<TNotifyMailStatus, string> = {
  sent: "已发送",
  failed: "发送失败",
  no_recipient: "无收件人",
  pending: "待发送",
};
const STATUS_TONES: Record<TNotifyMailStatus, string> = {
  sent: "bg-success-subtle text-success-primary",
  failed: "bg-danger-subtle text-danger-primary",
  no_recipient: "bg-warning-subtle text-warning-primary",
  pending: "bg-layer-1 text-secondary",
};
const KIND_LABELS: Record<TNotifyMailKind, string> = { instant: "即时", digest: "每日摘要" };
const RANGE_OPTIONS: { value: NonNullable<TNotifyMailsQuery["range"]> | ""; label: string }[] = [
  { value: "24h", label: "近 24 小时" },
  { value: "7d", label: "近 7 天" },
  { value: "30d", label: "近 30 天" },
  { value: "", label: "全部" },
];

function StatTile({ label, value, alert = false }: { label: string; value: number | undefined; alert?: boolean }) {
  const isAlert = alert && (value ?? 0) > 0;
  return (
    <div
      className={cn("rounded-xl border px-5 py-4", isAlert ? "border-danger-subtle bg-danger-subtle" : "border-subtle")}
    >
      <div className="text-13 text-tertiary">{label}</div>
      <div
        className={cn("text-24 leading-snug font-semibold tabular-nums", isAlert ? "text-danger-primary" : "text-primary")}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}

/**
 * 工作区设置 › 通知 › 发送记录：统一通知入口发出的每一封邮件，含失败和无收件人。
 * 失败的邮件系统会自动重试三次，仍失败的可以在这里手工「重发」。
 */
export function NotifyMailLogTab({ workspaceSlug, onChanged }: { workspaceSlug: string; onChanged?: () => void }) {
  const [status, setStatus] = useState<TNotifyMailStatus | "">("");
  const [kind, setKind] = useState<TNotifyMailKind | "">("");
  const [range, setRange] = useState<TNotifyMailsQuery["range"] | "">("24h");
  const [keyword, setKeyword] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  const [resendingId, setResendingId] = useState<string | null>(null);

  // 输入停下来再查
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(keyword.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  const { data, error, mutate } = useSWR(
    ["NOTIFY_MAILS", workspaceSlug, status, kind, range, search, page, pageSize],
    () =>
      notifyService.mails(workspaceSlug, {
        status: status || undefined,
        kind: kind || undefined,
        range: range || undefined,
        search: search || undefined,
        page,
        per_page: pageSize,
      }),
    { keepPreviousData: true, shouldRetryOnError: false }
  );

  const handleResend = async (mail: TNotifyMail) => {
    setResendingId(mail.id);
    try {
      await notifyService.resendMail(workspaceSlug, mail.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已重新排队", message: "邮件将在一分钟内重新发送" });
      await mutate();
      onChanged?.();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "重发失败", message: "请稍后重试" });
    } finally {
      setResendingId(null);
    }
  };

  const withPageReset =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(1);
    };

  const stats = data?.stats;
  const total = data?.total ?? 0;
  const rows = data?.results ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="近 24 小时已发送" value={stats?.sent_24h} />
        <StatTile label="发送失败" value={stats?.failed} alert />
        <StatTile label="近 7 天无收件人" value={stats?.no_recipient_7d} />
        <StatTile label="待发送" value={stats?.pending} />
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <PermissionGroupSearch value={keyword} onChange={setKeyword} placeholder="搜索收件人或主题" className="w-72" />
        <select
          className={SELECT}
          aria-label="状态"
          value={status}
          onChange={(event) => withPageReset(setStatus)(event.target.value as TNotifyMailStatus | "")}
        >
          <option value="">状态：全部</option>
          {(Object.keys(STATUS_LABELS) as TNotifyMailStatus[]).map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value]}
            </option>
          ))}
        </select>
        <select
          className={SELECT}
          aria-label="类型"
          value={kind}
          onChange={(event) => withPageReset(setKind)(event.target.value as TNotifyMailKind | "")}
        >
          <option value="">类型：全部</option>
          <option value="instant">{KIND_LABELS.instant}</option>
          <option value="digest">{KIND_LABELS.digest}</option>
        </select>
        <select
          className={SELECT}
          aria-label="时间"
          value={range ?? ""}
          onChange={(event) => withPageReset(setRange)(event.target.value as TNotifyMailsQuery["range"] | "")}
        >
          {RANGE_OPTIONS.map((option) => (
            <option key={option.value || "all"} value={option.value}>
              时间：{option.label}
            </option>
          ))}
        </select>
      </div>

      {error && !data ? (
        <div className="rounded-xl border border-subtle py-12 text-center text-13 text-secondary">加载失败，请刷新重试</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-subtle bg-surface-1">
          <div className="overflow-x-auto">
            <div className="min-w-[980px]">
              <div className={cn(GRID, "h-11 border-b border-subtle bg-layer-1 text-13 font-medium text-tertiary")}>
                <span>时间</span>
                <span>收件人</span>
                <span>类型</span>
                <span>主题</span>
                <span>状态</span>
                <span>说明</span>
                <span className="flex justify-end">操作</span>
              </div>
              {!data ? (
                <Loader className="flex flex-col gap-2 p-4">
                  {[0, 1, 2, 3].map((index) => (
                    <Loader.Item key={index} height="38px" />
                  ))}
                </Loader>
              ) : rows.length === 0 ? (
                <div className="py-12 text-center text-13 text-tertiary">暂无记录</div>
              ) : (
                rows.map((mail) => (
                  <div
                    key={mail.id}
                    className={cn(GRID, "h-[54px] border-b border-subtle text-14 last:border-b-0 hover:bg-layer-1-hover")}
                  >
                    <span className="whitespace-nowrap text-secondary tabular-nums">
                      {formatNotifyDateTime(mail.created_at)}
                    </span>
                    <span className="truncate text-primary">{mail.receiver_name || "—"}</span>
                    <span className="text-secondary">{KIND_LABELS[mail.kind]}</span>
                    <span className="truncate text-primary" title={mail.subject}>
                      {mail.subject}
                    </span>
                    <span>
                      <span
                        className={cn(
                          "inline-flex h-6 items-center rounded-md px-2 text-12 font-medium whitespace-nowrap",
                          STATUS_TONES[mail.status]
                        )}
                      >
                        {STATUS_LABELS[mail.status]}
                      </span>
                    </span>
                    <span className="truncate text-secondary" title={mail.reason}>
                      {mail.reason || "—"}
                    </span>
                    <span className="flex justify-end">
                      {mail.status === "failed" && (
                        <button
                          type="button"
                          className="text-14 text-accent-primary hover:underline disabled:cursor-not-allowed disabled:text-placeholder disabled:no-underline"
                          disabled={resendingId === mail.id}
                          onClick={() => void handleResend(mail)}
                        >
                          重发
                        </button>
                      )}
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
      )}
    </div>
  );
}
