import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import type { Matcher } from "@plane/propel/calendar";
import { Calendar } from "@plane/propel/calendar";
import { Popover } from "@plane/propel/popover";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IUserLite, TProjectStage } from "@plane/types";
import { PROJECT_STAGE_MAX_DURATION_DAYS } from "@plane/types";
import { Avatar } from "@plane/ui";
import { getDate, getFileURL, renderFormattedPayloadDate } from "@plane/utils";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { useUserProfile } from "@/hooks/store/user";
import { parseDurationDays } from "./project-stage-schedule";

const I18N = "project_stage";

/**
 * 表格格子左右各留了 px-3，可点的按钮反向撑出去，悬停底色铺满整格（同阶段评审表格）。
 * 字号与文字色都写成整串、不过 cn()：两个都是 text-*，会被当成同一组互相吞掉。
 */
const FILL_BUTTON =
  "-mx-3 flex h-full w-[calc(100%+1.5rem)] min-w-0 cursor-pointer items-center px-3 text-left outline-none hover:bg-layer-transparent-hover data-[popup-open]:bg-layer-transparent-hover";

const TEXT = {
  normal: "text-13 tabular-nums text-secondary",
  muted: "text-13 tabular-nums text-placeholder",
  late: "text-13 tabular-nums text-danger-primary",
};

export const Empty = () => <span className="text-13 text-placeholder">—</span>;

export const Person = ({ user, unassigned }: { user: IUserLite | null; unassigned: string }) =>
  user ? (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar size="sm" name={user.display_name} src={getFileURL(user.avatar_url ?? "")} showTooltip={false} />
      <span className="truncate text-13 text-secondary">{user.display_name}</span>
    </span>
  ) : (
    <span className="flex min-w-0 items-center gap-2">
      <span className="size-5 shrink-0 rounded-full border border-dashed border-strong" />
      <span className="truncate text-13 text-placeholder">{unassigned}</span>
    </span>
  );

const toastInvalid = (title: string, message: string) => setToast({ type: TOAST_TYPE.ERROR, title, message });

/** 负责人：点格子出成员下拉；再点一次当前负责人就是取消指定（同项目负责人下拉） */
export const ProjectStageOwnerCell = ({
  stage,
  projectId,
  unassigned,
  onChange,
}: {
  stage: TProjectStage;
  projectId: string;
  unassigned: string;
  onChange?: (ownerId: string | null) => void;
}) => {
  const person = <Person user={stage.owner_detail} unassigned={unassigned} />;
  if (!onChange) return person;
  return (
    <MemberDropdown
      multiple={false}
      projectId={projectId}
      value={stage.owner_id}
      onChange={(next) => onChange(next === stage.owner_id ? null : next)}
      button={person}
      buttonVariant="transparent-with-text"
      className="h-full w-full min-w-0"
      buttonContainerClassName={FILL_BUTTON}
      placement="bottom-start"
    />
  );
};

/**
 * 计划开始 / 结束：点格子出日历，选中即存。可清空的（结束）再点一次已选日期或点「清除」就清掉；
 * 不可清空的（开始，必填）忽略取消选中。可选范围由调用方按父阶段与另一头日期算好。
 */
export const ProjectStageDateCell = observer(function ProjectStageDateCell({
  value,
  isLate = false,
  minDate,
  maxDate,
  clearable,
  onChange,
}: {
  value: string | null;
  isLate?: boolean;
  minDate?: string | null;
  maxDate?: string | null;
  clearable: boolean;
  onChange?: (date: string | null) => void;
}) {
  const { t } = useTranslation();
  const { data: profile } = useUserProfile();
  const [isOpen, setIsOpen] = useState(false);

  const text = value ? <span className={isLate ? TEXT.late : TEXT.normal}>{value}</span> : <Empty />;
  if (!onChange) return text;

  const commit = (next: string | null) => {
    setIsOpen(false);
    if (next === value || (next === null && !clearable)) return;
    onChange(next);
  };
  const disabledDays: Matcher[] = [];
  const min = getDate(minDate ?? undefined);
  const max = getDate(maxDate ?? undefined);
  if (min) disabledDays.push({ before: min });
  if (max) disabledDays.push({ after: max });

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Button className={FILL_BUTTON}>{text}</Popover.Button>
      <Popover.Panel
        placement="bottom-start"
        sideOffset={4}
        className="z-30 rounded-md border-[0.5px] border-subtle-1 bg-surface-1 shadow-overlay-200"
      >
        <Calendar
          className="p-3 text-12"
          captionLayout="dropdown"
          mode="single"
          selected={getDate(value)}
          defaultMonth={getDate(value) ?? min ?? max}
          onSelect={(date: Date | undefined) => commit(date ? (renderFormattedPayloadDate(date) ?? null) : null)}
          disabled={disabledDays}
          showOutsideDays
          fixedWeeks
          weekStartsOn={profile?.start_of_the_week}
        />
        {clearable && value && (
          <div className="flex justify-end border-t border-subtle px-3 py-2">
            <button type="button" className="text-12 text-tertiary hover:text-primary" onClick={() => commit(null)}>
              {t("common.clear")}
            </button>
          </div>
        )}
      </Popover.Panel>
    </Popover>
  );
});

/** 占比 / 周期共用：平时是文字，点了换成输入框；回车或失焦保存，Esc 放弃 */
const InlineNumberCell = ({
  initial,
  display,
  unit,
  step,
  onCommit,
}: {
  /** 进入编辑时输入框里的原文；没值是空串 */
  initial: string;
  display: ReactNode;
  unit: string;
  step: string;
  onCommit: (text: string) => void;
}) => {
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);
  const isEditing = draft !== null;

  useEffect(() => {
    if (isEditing) inputRef.current?.select();
  }, [isEditing]);

  if (!isEditing) {
    return (
      <button
        type="button"
        className={FILL_BUTTON}
        onClick={() => {
          cancelledRef.current = false;
          setDraft(initial);
        }}
      >
        {display}
      </button>
    );
  }

  const finish = () => {
    const text = draft.trim();
    setDraft(null);
    if (!cancelledRef.current && text !== initial) onCommit(text);
  };

  // 编辑态整格就是输入框：不另画边框，只保留悬停时那层底色，看起来是同一个格子
  return (
    <span className="relative -mx-3 flex h-full w-[calc(100%+1.5rem)] min-w-0 items-center bg-layer-transparent-hover">
      <input
        ref={inputRef}
        type="number"
        min={0}
        step={step}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={finish}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            cancelledRef.current = true;
            event.currentTarget.blur();
          }
        }}
        className="h-full w-full min-w-0 [appearance:textfield] border-0 bg-transparent pr-8 pl-3 text-13 tabular-nums text-primary outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <span className="pointer-events-none absolute right-3 text-12 text-tertiary">{unit}</span>
    </span>
  );
};

/**
 * 占比：只有叶子能填，有子阶段的显示子之和（灰字、只读）。超出可分配时不提交、弹提示，
 * 口径同编辑弹窗：可分配 = 剩余 + 这一行原来的占比。清空即不填。
 */
export const ProjectStageRatioCell = ({
  stage,
  hasChildren,
  workloadRemaining,
  onChange,
}: {
  stage: TProjectStage;
  hasChildren: boolean;
  workloadRemaining: number;
  onChange?: (ratio: string | null) => void;
}) => {
  const { t } = useTranslation();
  const value = stage.computed_workload_ratio;
  const display = value === null ? <Empty /> : <span className={hasChildren ? TEXT.muted : TEXT.normal}>{Number(value)}%</span>;
  if (hasChildren) {
    return <span title={t(`${I18N}.form.ratio_parent_hint`, { value: Number(value ?? 0) })}>{display}</span>;
  }
  if (!onChange) return display;

  const limit = Math.round((workloadRemaining + Number(stage.workload_ratio ?? 0)) * 100) / 100;
  return (
    <InlineNumberCell
      initial={stage.workload_ratio === null ? "" : Number(stage.workload_ratio).toString()}
      display={display}
      unit="%"
      step="0.01"
      onCommit={(text) => {
        if (text === "") return onChange(null);
        const ratio = Number(text);
        if (Number.isNaN(ratio) || ratio < 0 || Math.round(ratio * 100) > Math.round(limit * 100)) {
          toastInvalid(
            t(`${I18N}.toast.update_error`),
            t(`${I18N}.form.ratio_over_limit`, { remaining: Math.max(0, limit) })
          );
          return;
        }
        onChange(text);
      }}
    />
  );
};

/** 周期：改了结束跟着推（后端 resolve_schedule）；清空连结束一起清 */
export const ProjectStageDurationCell = ({
  stage,
  onChange,
}: {
  stage: TProjectStage;
  onChange?: (days: number | null) => void;
}) => {
  const { t } = useTranslation();
  const display =
    stage.duration_days !== null ? (
      <span className={TEXT.normal}>{t(`${I18N}.table.days`, { count: stage.duration_days })}</span>
    ) : (
      <Empty />
    );
  if (!onChange) return display;

  return (
    <InlineNumberCell
      initial={stage.duration_days === null ? "" : String(stage.duration_days)}
      display={display}
      unit={t(`${I18N}.form.duration_unit`)}
      step="1"
      onCommit={(text) => {
        const days = parseDurationDays(text);
        if (days === undefined) {
          toastInvalid(
            t(`${I18N}.toast.update_error`),
            t(`${I18N}.form.duration_invalid`, { max: PROJECT_STAGE_MAX_DURATION_DAYS })
          );
          return;
        }
        onChange(days);
      }}
    />
  );
};
