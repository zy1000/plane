import { useEffect, useRef, useState } from "react";
import { Columns3, ListFilter, Rows3, User, Users, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@plane/propel/button";
import { EViewAccess } from "@plane/types";
import { Checkbox, EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import type { TSaveViewInput, TViewSummaryRow } from "./types";

type TSaveViewModalProps = {
  isOpen: boolean;
  mode: "create" | "edit";
  initialName?: string;
  initialAccess?: EViewAccess;
  initialIsDefault?: boolean;
  summary?: TViewSummaryRow[];
  onClose: () => void;
  onSubmit: (input: TSaveViewInput) => Promise<void> | void;
};

const ACCESS_OPTIONS: { value: EViewAccess; label: string; icon: LucideIcon }[] = [
  { value: EViewAccess.PRIVATE, label: "仅自己", icon: User },
  { value: EViewAccess.PUBLIC, label: "项目所有成员", icon: Users },
];

const SUMMARY_ICONS: Record<TViewSummaryRow["kind"], LucideIcon> = {
  filters: ListFilter,
  layout: Rows3,
  properties: Columns3,
};

const SummaryRow = ({ row }: { row: TViewSummaryRow }) => {
  const Icon = SUMMARY_ICONS[row.kind];
  return (
    <div className="flex min-h-11 items-center gap-3 border-b border-subtle px-3.5 py-2 text-13 last:border-b-0">
      <Icon className="size-4 shrink-0 text-tertiary" />
      <span className="w-14 shrink-0 text-secondary">{row.label}</span>
      <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
        {row.chips?.map((chip) => (
          <span
            key={chip}
            className="inline-flex h-5.5 shrink-0 items-center rounded border border-subtle bg-surface-1 px-2 text-12 text-primary"
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
    onClose,
    onSubmit,
  } = props;
  // state
  const [name, setName] = useState(initialName);
  const [access, setAccess] = useState<EViewAccess>(initialAccess);
  const [isDefault, setIsDefault] = useState(initialIsDefault);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName(initialName);
    setAccess(initialAccess);
    setIsDefault(initialIsDefault);
    setIsSubmitting(false);
  }, [isOpen, initialName, initialAccess, initialIsDefault]);

  const canSubmit = name.trim().length > 0 && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), access, isDefault });
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
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-layer-1 p-1" role="radiogroup" aria-label="谁能看到">
              {ACCESS_OPTIONS.map((option) => {
                const selected = access === option.value;
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setAccess(option.value)}
                    className={cn(
                      "flex h-9 items-center justify-center gap-2 rounded-md text-13 transition-colors",
                      selected
                        ? "bg-surface-1 font-semibold text-primary shadow-raised-100"
                        : "font-medium text-secondary hover:text-primary"
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {mode === "create" && summary && summary.length > 0 && (
            <div>
              <div className="mb-2 text-13 font-semibold text-primary">会记住这些设置</div>
              <div className="rounded-lg border border-subtle bg-surface-2">
                {summary.map((row) => (
                  <SummaryRow key={row.kind} row={row} />
                ))}
              </div>
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
