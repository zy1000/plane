import { Fragment } from "react";
import { Check, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { useTranslation } from "@plane/i18n";
import { Popover } from "@plane/propel/popover";
import type { IUserLite, TStageReviewActivity, TStageReviewDetail } from "@plane/types";
import { EStageReviewResult, EStageReviewStatus, STAGE_REVIEW_STATUS_ORDER } from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";

const I18N = "stage_review";

type TTone = "accent" | "warning" | "success" | "danger";

/** 当前步的颜色：跟状态药丸同一套「离完成还有多远」的配色，未评审用主色表示「就在这」 */
const CURRENT_TONE: Record<EStageReviewStatus, TTone> = {
  [EStageReviewStatus.NOT_STARTED]: "accent",
  [EStageReviewStatus.IN_REVIEW]: "warning",
  [EStageReviewStatus.IN_APPROVAL]: "accent",
  [EStageReviewStatus.COMPLETED]: "success",
};

/** 实心点 + 外圈光晕。光晕用浅一档的同色，避免在浅灰胶囊上糊成一团 */
const TONE_CLASS: Record<TTone, string> = {
  accent: "bg-accent-primary shadow-[0_0_0_3px_var(--bg-accent-subtle-active)]",
  warning: "bg-warning-primary shadow-[0_0_0_3px_var(--bg-warning-subtle)]",
  success: "bg-success-primary shadow-[0_0_0_3px_var(--bg-success-subtle-1)]",
  danger: "bg-danger-primary shadow-[0_0_0_3px_var(--bg-danger-subtle-hover)]",
};

type TStepState = "past" | "current" | "future";

/**
 * 每一步的日期：走过的步取「从它出发」那条状态记录（old_value）的时间；当前步是已评审时取
 * 「进入已评审」的时间。只看状态记录（不通过是 field=result 的记录，不参与），退回再前进
 * 会有多条，都取最近一条。
 */
export const useStepDates = (detail: TStageReviewDetail, activities: TStageReviewActivity[]) => {
  const enteredAt = new Map<string, string>();
  const leftAt = new Map<string, string>();
  const keepLatest = (map: Map<string, string>, key: string | null, at: string) => {
    if (!key) return;
    const previous = map.get(key);
    if (!previous || previous < at) map.set(key, at);
  };
  for (const activity of activities) {
    if (activity.field !== "status") continue;
    keepLatest(enteredAt, activity.new_value, activity.created_at);
    keepLatest(leftAt, activity.old_value, activity.created_at);
  }
  const shortDate = (iso: string | undefined) => (iso ? format(new Date(iso), "MM-dd") : undefined);
  const currentIndex = STAGE_REVIEW_STATUS_ORDER.indexOf(detail.status);

  return STAGE_REVIEW_STATUS_ORDER.map((step, index) => {
    if (step === EStageReviewStatus.COMPLETED && step === detail.status) return shortDate(enteredAt.get(step));
    return index < currentIndex ? shortDate(leftAt.get(step)) : undefined;
  });
};

/** 一步的圆点：走过的绿勾、当前的实心点 + 光晕（已评审也是绿勾）、没到的空心圈 */
const StepMark = ({ state, tone, isDone }: { state: TStepState; tone: TTone; isDone: boolean }) => {
  if (state === "future") {
    return <span className="size-2.25 shrink-0 rounded-full border-[1.5px] border-strong-1" />;
  }
  if (state === "past" || isDone) {
    return (
      <span
        className={cn(
          "grid size-3.5 shrink-0 place-items-center rounded-full bg-success-primary text-on-color",
          state === "current" && TONE_CLASS.success
        )}
      >
        <Check className="size-2.25" strokeWidth={3.5} />
      </span>
    );
  }
  return (
    <span className={cn("grid size-3.5 shrink-0 place-items-center rounded-full", TONE_CLASS[tone])}>
      <span className="size-1.25 rounded-full bg-surface-1" />
    </span>
  );
};

/** 浮层里的一串人：头像 + 名字，放不下就换行；没人写「未指定」 */
const PeopleChips = ({ users, label }: { users: IUserLite[]; label: string }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-12 text-tertiary">{label}</span>
      {users.length === 0 ? (
        <span className="text-13 text-placeholder">{t(`${I18N}.detail.unassigned`)}</span>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {users.map((user) => (
            <span
              key={user.id}
              className="inline-flex h-6.5 max-w-full items-center gap-1.5 rounded-full bg-layer-1 pr-2.5 pl-0.75 text-13 text-primary"
            >
              <Avatar size="sm" name={user.display_name} src={getFileURL(user.avatar_url ?? "")} showTooltip={false} />
              <span className="truncate">{user.display_name}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * 四步进度：一条浅灰胶囊里四个点 + 短连线，只**读**当前走到哪一步 —— 状态只能由标题行右侧的
 * 主按钮推进。点开是「评审进度」浮层：每步的日期，评审中 / 审核中由谁负责（负责人、审核人
 * 都可能是多个人，所以人名不放在胶囊里）。
 *
 * 唯一由结论带来的特例：评审中且上次不通过，当前点红色，浮层里写一句待整改重提。
 */
export const StageReviewStepper = ({ detail, dates }: { detail: TStageReviewDetail; dates: (string | undefined)[] }) => {
  const { t } = useTranslation();
  const currentIndex = STAGE_REVIEW_STATUS_ORDER.indexOf(detail.status);
  const isRejected = detail.status === EStageReviewStatus.IN_REVIEW && detail.result === EStageReviewResult.REJECTED;
  const currentTone = isRejected ? "danger" : CURRENT_TONE[detail.status];
  const isDone = detail.status === EStageReviewStatus.COMPLETED;
  const stateOf = (index: number): TStepState =>
    index < currentIndex ? "past" : index === currentIndex ? "current" : "future";
  const label = t(`${I18N}.detail.progress_open`);

  return (
    <Popover>
      <Popover.Button
        aria-label={label}
        title={label}
        className={cn(
          "group flex h-8.5 shrink-0 cursor-pointer items-center gap-2.5 rounded-full bg-layer-1 pr-2.5 pl-3.5 outline-none transition",
          "hover:bg-layer-2 focus-visible:ring-1 focus-visible:ring-accent-strong data-[popup-open]:bg-layer-2"
        )}
      >
        {STAGE_REVIEW_STATUS_ORDER.map((step, index) => {
          const state = stateOf(index);
          return (
            <Fragment key={step}>
              {index > 0 && (
                <span
                  className={cn(
                    "h-[1.5px] w-5 shrink-0 rounded-full bg-(--border-color-strong-1)",
                    index <= currentIndex && "bg-success-primary"
                  )}
                />
              )}
              <span
                className={cn(
                  "flex items-center gap-1.75 text-13 whitespace-nowrap",
                  state === "past" && "text-secondary",
                  state === "current" && "font-semibold text-primary",
                  state === "future" && "text-tertiary"
                )}
              >
                <StepMark state={state} tone={currentTone} isDone={isDone} />
                {t(`${I18N}.status.${step}`)}
              </span>
            </Fragment>
          );
        })}
        <ChevronDown className="size-3.5 shrink-0 text-tertiary transition-transform group-data-[popup-open]:rotate-180" />
      </Popover.Button>
      <Popover.Panel
        placement="bottom-end"
        sideOffset={6}
        positionerClassName="z-30"
        className="w-90 max-w-[calc(100vw-2rem)] rounded-xl border border-subtle bg-surface-1 px-4 pt-3.5 pb-3 shadow-overlay-200"
      >
        <div className="mb-2.5 text-13 font-semibold text-primary">{t(`${I18N}.detail.progress_title`)}</div>
        {STAGE_REVIEW_STATUS_ORDER.map((step, index) => {
          const state = stateOf(index);
          const isLast = index === STAGE_REVIEW_STATUS_ORDER.length - 1;
          const right = dates[index] ?? (state === "current" ? t(`${I18N}.detail.progress_current`) : undefined);
          return (
            <div key={step} className="grid grid-cols-[22px_minmax(0,1fr)] gap-x-2.5">
              <div className="flex flex-col items-center gap-1 pt-0.5">
                <StepMark state={state} tone={currentTone} isDone={isDone} />
                {!isLast && (
                  <span
                    className={cn(
                      "min-h-2.5 w-[1.5px] flex-1 rounded-full bg-(--border-color-strong-1)",
                      index < currentIndex && "bg-success-primary"
                    )}
                  />
                )}
              </div>
              <div className={cn("flex min-w-0 flex-col gap-1.5", !isLast && "pb-3")}>
                <div className="flex min-h-4.5 items-center justify-between gap-3 text-13">
                  <span
                    className={cn(
                      state === "past" && "text-secondary",
                      state === "current" && "font-semibold text-primary",
                      state === "future" && "text-tertiary"
                    )}
                  >
                    {t(`${I18N}.status.${step}`)}
                  </span>
                  {right && <span className="shrink-0 text-12 text-tertiary tabular-nums">{right}</span>}
                </div>
                {step === EStageReviewStatus.IN_REVIEW && isRejected && (
                  <span className="text-12 text-danger-primary">{t(`${I18N}.detail.step_rejected`)}</span>
                )}
                {step === EStageReviewStatus.IN_REVIEW && (
                  <PeopleChips users={detail.leader_details} label={t(`${I18N}.detail.progress_leaders`)} />
                )}
                {step === EStageReviewStatus.IN_APPROVAL && (
                  <PeopleChips users={detail.auditor_details} label={t(`${I18N}.detail.progress_auditors`)} />
                )}
              </div>
            </div>
          );
        })}
      </Popover.Panel>
    </Popover>
  );
};
