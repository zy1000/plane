import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Blend, Columns3, ListFilter, Rows3, User, Users, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@plane/propel/button";
import { EViewAccess } from "@plane/types";
import { Checkbox, EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { ModeViewBadge } from "./mode-view";
import type { TSaveViewInput, TViewSummaryRow } from "./types";

/** 「谁能看到」的第三项：存到研发模式，跟随该模式的项目都能看到 */
export type TSaveViewModeOption = {
  name: string;
  /** 跟随该模式的项目数，没拉回来时不写数字 */
  followingCount?: number;
  /** 「缺陷页」「工作项页」… */
  pageLabel: string;
};

type TVisibility = "private" | "public" | "mode";

type TSaveViewModalProps = {
  isOpen: boolean;
  mode: "create" | "edit";
  initialName?: string;
  initialAccess?: EViewAccess;
  initialIsDefault?: boolean;
  summary?: TViewSummaryRow[];
  /** 只在新建、且有研发模式编辑权限的跟随项目里传 */
  modeOption?: TSaveViewModeOption;
  /** 当前筛选里本项目自有的属性名（迭代 / 模块 / 发布 / 标签），选研发模式时不能带 */
  blockedFilterLabels?: string[];
  onClose: () => void;
  onSubmit: (input: TSaveViewInput) => Promise<void> | void;
};

const VISIBILITY_OPTIONS: { value: TVisibility; label: string; icon: LucideIcon }[] = [
  { value: "private", label: "仅自己", icon: User },
  { value: "public", label: "项目所有成员", icon: Users },
  { value: "mode", label: "研发模式全部项目", icon: Blend },
];

const EMPTY_LABELS: string[] = [];

const SUMMARY_ICONS: Record<TViewSummaryRow["kind"], LucideIcon> = {
  filters: ListFilter,
  layout: Rows3,
  properties: Columns3,
};

const SummaryRow = ({ row, blockedLabels }: { row: TViewSummaryRow; blockedLabels: string[] }) => {
  const Icon = SUMMARY_ICONS[row.kind];
  return (
    <div className="flex min-h-11 items-center gap-3 border-b border-subtle px-3.5 py-2 text-13 last:border-b-0">
      <Icon className="size-4 shrink-0 text-tertiary" />
      <span className="w-14 shrink-0 text-secondary">{row.label}</span>
      <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
        {row.chips?.map((chip) => (
          <span
            key={chip}
            className={cn(
              "inline-flex h-5.5 shrink-0 items-center rounded border px-2 text-12",
              blockedLabels.includes(chip)
                ? "border-warning-subtle bg-warning-subtle font-medium text-warning-primary"
                : "border-subtle bg-surface-1 text-primary"
            )}
          >
            {chip}
          </span>
        ))}
        <span className={cn("truncate", row.chips?.length ? "pl-0.5 text-12 text-tertiary" : "text-primary")}>
          {row.text}
        </span>
      </span>
    </div>
  );
};

export const SaveViewModal = (props: TSaveViewModalProps) => {
  const {
    isOpen,
    mode,
    initialName = "",
    initialAccess = EViewAccess.PRIVATE,
    initialIsDefault = false,
    summary,
    modeOption,
    blockedFilterLabels = EMPTY_LABELS,
    onClose,
    onSubmit,
  } = props;
  // state
  const [name, setName] = useState(initialName);
  const [visibility, setVisibility] = useState<TVisibility>(
    initialAccess === EViewAccess.PUBLIC ? "public" : "private"
  );
  const [isDefault, setIsDefault] = useState(initialIsDefault);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName(initialName);
    setVisibility(initialAccess === EViewAccess.PUBLIC ? "public" : "private");
    setIsDefault(initialIsDefault);
    setIsSubmitting(false);
  }, [isOpen, initialName, initialAccess, initialIsDefault]);

  const showModeOption = mode === "create" && !!modeOption;
  const toMode = showModeOption && visibility === "mode";
  const blockedLabels = toMode ? blockedFilterLabels : EMPTY_LABELS;
  const options = showModeOption ? VISIBILITY_OPTIONS : VISIBILITY_OPTIONS.slice(0, 2);
  const canSubmit = name.trim().length > 0 && !isSubmitting && blockedLabels.length === 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        access: visibility === "private" ? EViewAccess.PRIVATE : EViewAccess.PUBLIC,
        isDefault,
        shareToMode: toMode,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={onClose}
      position={EModalPosition.CENTER}
      width={EModalWidth.LG}
      initialFocus={inputRef}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
        className="flex flex-col"
      >
        <div className="flex items-center justify-between px-6 pt-5">
          <h3 className="text-18 font-semibold text-primary">{mode === "create" ? "存为新视图" : "编辑视图"}</h3>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1.5 grid size-8 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-5.5 px-6 pt-5.5">
          <div>
            <label htmlFor="in-page-view-name" className="mb-2 block text-13 font-semibold text-primary">
              视图名称
            </label>
            <Input
              id="in-page-view-name"
              ref={inputRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：本迭代待办"
              inputSize="md"
              className="h-10 w-full rounded-lg text-14"
              maxLength={255}
            />
          </div>

          <div>
            <div className="mb-2 text-13 font-semibold text-primary">谁能看到</div>
            <div
              className={cn("grid gap-1 rounded-lg bg-layer-1 p-1", showModeOption ? "grid-cols-3" : "grid-cols-2")}
              role="radiogroup"
              aria-label="谁能看到"
            >
              {options.map((option) => {
                const selected = visibility === option.value;
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setVisibility(option.value)}
                    className={cn(
                      "flex h-9 items-center justify-center gap-2 rounded-md text-13 whitespace-nowrap transition-colors",
                      selected
                        ? "bg-surface-1 font-semibold text-primary shadow-raised-100"
                        : "font-medium text-secondary hover:text-primary"
                    )}
                  >
                    <Icon
                      className={cn("size-4 shrink-0", selected && option.value === "mode" && "text-warning-primary")}
                    />
                    {option.label}
                  </button>
                );
              })}
            </div>
            {toMode && modeOption && (
              <div className="mt-2.5 flex items-center gap-2 text-13 text-secondary">
                <ModeViewBadge />
                <span>
                  <span className="font-semibold text-primary">{modeOption.name}</span>下
                  {modeOption.followingCount !== undefined ? (
                    <>
                      {" "}
                      <span className="font-semibold text-primary tabular-nums">{modeOption.followingCount}</span> 个项目
                    </>
                  ) : (
                    "所有跟随项目"
                  )}
                  的{modeOption.pageLabel}都会出现这个视图
                </span>
              </div>
            )}
          </div>

          {mode === "create" && summary && summary.length > 0 && (
            <div>
              <div className="mb-2 text-13 font-semibold text-primary">会记住这些设置</div>
              <div className="rounded-lg border border-subtle bg-surface-2">
                {summary.map((row) => (
                  <SummaryRow key={row.kind} row={row} blockedLabels={blockedLabels} />
                ))}
              </div>
            </div>
          )}

          {blockedLabels.length > 0 && (
            <div className="-mt-2.5 flex items-center gap-2 text-13 text-warning-primary">
              <AlertTriangle className="size-4 shrink-0" />
              {blockedLabels.join("、")}是本项目自己的，去掉后才能存到研发模式
            </div>
          )}

          <label htmlFor="in-page-view-default" className="flex w-fit cursor-pointer items-center gap-2.5">
            <Checkbox
              id="in-page-view-default"
              checked={isDefault}
              onChange={(event) => setIsDefault(event.target.checked)}
            />
            <span className="text-13 text-primary">设为我的默认视图</span>
          </label>
        </div>

        <div className="flex justify-end gap-2.5 px-6 pt-6.5 pb-5.5">
          <Button variant="secondary" size="xl" type="button" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" size="xl" type="submit" disabled={!canSubmit} loading={isSubmitting}>
            {mode === "create" ? "保存视图" : "保存"}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
};
