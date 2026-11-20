/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn } from "@plane/utils";
import { MY_SUBSCRIPTION_TYPES, MY_SUBSCRIPTION_TYPE_LABELS } from "@/components/notify";
import { ProfileSettingsHeading } from "@/components/settings/profile/heading";
import { EmailSettingsLoader } from "@/components/ui/loader/settings/email";
import { NotifyService } from "@/services/notify.service";
import type { TNotifyPreference } from "@/types/notify";

const notifyService = new NotifyService();
const PREFERENCE_KEY = "CURRENT_USER_NOTIFY_PREFERENCE";

type TChoice = { value: string; label: string };
type TRow = {
  title: string;
  events: string;
  /** 不填 = 固定即时，不能改 */
  field?: keyof TNotifyPreference;
  choices?: TChoice[];
};

const INSTANT: TChoice = { value: "instant", label: "即时" };
const DIGEST: TChoice = { value: "digest", label: "每日摘要" };
const NONE: TChoice = { value: "none", label: "不接收" };

const ROWS: TRow[] = [
  { title: "待我审批", events: "审批、签批、审核、评审、复核" },
  { title: "指派与提及", events: "指派给我、提及我、退回给我", field: "assign_mode", choices: [INSTANT, DIGEST] },
  {
    title: "我发起事项的结果",
    events: "审批通过、审批驳回、评审结论",
    field: "result_mode",
    choices: [INSTANT, DIGEST, NONE],
  },
  { title: "知会", events: "订阅对象的变更与评论、迭代与发布动态", field: "inform_mode", choices: [DIGEST, NONE] },
];

const GRID = "grid grid-cols-[150px_minmax(0,1fr)_264px] items-center gap-x-4 px-5";

function Segmented(props: { label: string; value: string; choices: TChoice[]; onChange: (value: string) => void }) {
  const { label, value, choices, onChange } = props;
  return (
    <span
      className="inline-flex w-fit overflow-hidden rounded-lg border border-subtle"
      role="radiogroup"
      aria-label={label}
    >
      {choices.map((choice, index) => {
        const isSelected = choice.value === value;
        return (
          <button
            key={choice.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            className={cn(
              "h-9 w-[88px] text-14 transition-colors",
              index > 0 && "border-l border-subtle",
              isSelected ? "bg-accent-primary font-medium text-on-color" : "text-secondary hover:bg-layer-1-hover"
            )}
            onClick={() => !isSelected && onChange(choice.value)}
          >
            {choice.label}
          </button>
        );
      })}
    </span>
  );
}

type Props = {
  /** 当前工作区；没有时不显示「我的订阅」 */
  workspaceSlug?: string;
  onManageSubscriptions: () => void;
};

/** 个人设置 › 通知：四类邮件各选一种接收方式 + 我的订阅计数 */
export function NotifyPreferenceSettings({ workspaceSlug, onManageSubscriptions }: Props) {
  const { data, mutate } = useSWR(PREFERENCE_KEY, () => notifyService.preference());
  const { data: subscriptions } = useSWR(
    workspaceSlug ? `MY_NOTIFY_SUBSCRIPTION_COUNTS_${workspaceSlug}` : null,
    () => notifyService.mySubscriptions(workspaceSlug as string, { per_page: 1 }),
    { shouldRetryOnError: false }
  );

  if (!data) return <EmailSettingsLoader />;

  const handleChange = async (field: keyof TNotifyPreference, value: string) => {
    const previous = data;
    try {
      await mutate({ ...data, [field]: value }, { revalidate: false });
      await mutate(await notifyService.updatePreference({ [field]: value } as Partial<TNotifyPreference>), {
        revalidate: false,
      });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "接收方式已更新" });
    } catch {
      await mutate(previous, { revalidate: false });
      setToast({ type: TOAST_TYPE.ERROR, title: "更新失败", message: "请稍后重试" });
    }
  };

  return (
    <div className="flex size-full flex-col gap-7">
      <ProfileSettingsHeading title="通知" />

      <section className="flex flex-col gap-3">
        <h3 className="text-16 font-semibold text-primary">接收方式</h3>
        <div className="overflow-x-auto rounded-xl border border-subtle bg-surface-1">
          <div className="min-w-[720px]">
            <div className={cn(GRID, "h-11 border-b border-subtle bg-layer-1 text-13 font-medium text-tertiary")}>
              <span>类别</span>
              <span>包含事件</span>
              <span>邮件</span>
            </div>
            {ROWS.map((row) => (
              <div key={row.title} className={cn(GRID, "h-[68px] border-b border-subtle text-14 last:border-b-0")}>
                <span className="font-medium text-primary">{row.title}</span>
                <span className="text-secondary">{row.events}</span>
                {row.field && row.choices ? (
                  <Segmented
                    label={`${row.title} 邮件`}
                    value={data[row.field]}
                    choices={row.choices}
                    onChange={(value) => void handleChange(row.field as keyof TNotifyPreference, value)}
                  />
                ) : (
                  <span className="flex items-center gap-2.5">
                    <span className="inline-flex h-9 w-[88px] items-center justify-center rounded-lg bg-accent-subtle text-14 font-medium text-accent-primary">
                      即时
                    </span>
                    <span className="text-13 text-tertiary">固定</span>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {workspaceSlug && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-16 font-semibold text-primary">我的订阅</h3>
            <button
              type="button"
              className="text-14 font-medium text-accent-primary hover:underline"
              onClick={onManageSubscriptions}
            >
              管理
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2.5 md:grid-cols-6">
            {MY_SUBSCRIPTION_TYPES.map((type) => (
              <div key={type} className="rounded-xl border border-subtle bg-surface-1 px-4 py-3">
                <div className="text-13 whitespace-nowrap text-tertiary">{MY_SUBSCRIPTION_TYPE_LABELS[type]}</div>
                <div className="text-20 leading-snug font-semibold text-primary tabular-nums">
                  {subscriptions ? (subscriptions.counts[type] ?? 0) : "—"}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
