import { useState } from "react";
import { observer } from "mobx-react";
import { CalendarDays } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { DateRange } from "@plane/propel/calendar";
import { Calendar } from "@plane/propel/calendar";
import { Popover } from "@plane/propel/popover";
import { getDate, renderFormattedPayloadDate } from "@plane/utils";
import { useUserProfile } from "@/hooks/store/user";

const shortDate = (value: string) => value.slice(5, 10);

/** 「09-28 → 10-03」，缺一头写「—」；两头都没有返回空串 */
export const formatPlanDates = (start: string | null, end: string | null) =>
  start || end ? [start, end].map((value) => (value ? shortDate(value) : "—")).join(" → ") : "";

// 字号与文字色写成整串：两个都是 text-*，过 cn() 会被当成同一组互相吞掉
const TEXT_CLASS = {
  normal: "truncate text-13 tabular-nums text-secondary",
  late: "truncate text-13 tabular-nums text-danger-primary",
};

/**
 * 列表「计划日期」格子：点开是区间日历，同工作项表格就地改。整格都是按钮，悬停底色铺满格子。
 *
 * 选的过程落在本地草稿里，**关上浮层才保存一次**：区间要点两下，每点一下就存的话第一下会把
 * 结束日期先清掉。没有日期时是灰色日历图标 + 列名；只读时只显示文字，没有就什么都不显示。
 */
export const StageReviewDatesCell = observer(function StageReviewDatesCell({
  start,
  end,
  isLate,
  placeholder,
  disabled,
  onChange,
}: {
  start: string | null;
  end: string | null;
  isLate: boolean;
  placeholder: string;
  disabled: boolean;
  onChange: (next: { start_date: string | null; end_date: string | null }) => void;
}) {
  const { t } = useTranslation();
  const { data: profile } = useUserProfile();
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(undefined);

  const text = formatPlanDates(start, end);
  if (disabled) return text ? <span className={isLate ? TEXT_CLASS.late : TEXT_CLASS.normal}>{text}</span> : null;

  const toPayload = (value: Date | undefined) => (value ? renderFormattedPayloadDate(value) : null);
  const commit = (range: DateRange | undefined) => {
    const next = { start_date: toPayload(range?.from), end_date: toPayload(range?.to) };
    if (next.start_date !== start || next.end_date !== end) onChange(next);
  };

  const handleOpenChange = (open: boolean) => {
    if (open) setDraft({ from: getDate(start) ?? undefined, to: getDate(end) ?? undefined });
    else commit(draft);
    setIsOpen(open);
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <Popover.Button className="-mx-3 flex h-full w-[calc(100%+1.5rem)] min-w-0 cursor-pointer items-center px-3 text-left outline-none hover:bg-layer-transparent-hover data-[popup-open]:bg-layer-transparent-hover">
        {text ? (
          <span className={isLate ? TEXT_CLASS.late : TEXT_CLASS.normal}>{text}</span>
        ) : (
          <span className="flex min-w-0 items-center gap-1.5 text-placeholder">
            <CalendarDays className="mx-1 size-3 shrink-0" />
            <span className="truncate text-13">{placeholder}</span>
          </span>
        )}
      </Popover.Button>
      <Popover.Panel
        placement="bottom-start"
        sideOffset={4}
        className="z-30 rounded-md border-[0.5px] border-subtle-1 bg-surface-1 shadow-overlay-200"
      >
        <Calendar
          className="p-3 text-12"
          captionLayout="dropdown"
          mode="range"
          selected={draft}
          onSelect={setDraft}
          showOutsideDays
          fixedWeeks
          weekStartsOn={profile?.start_of_the_week}
        />
        <div className="flex justify-end border-t border-subtle px-3 py-2">
          <button
            type="button"
            className="text-12 text-tertiary hover:text-primary"
            onClick={() => {
              setDraft(undefined);
              commit(undefined);
              setIsOpen(false);
            }}
          >
            {t("common.clear")}
          </button>
        </div>
      </Popover.Panel>
    </Popover>
  );
});
