import { useEffect, useRef, useState } from "react";
import { Check, Globe, User, X } from "lucide-react";
import { Button } from "@plane/propel/button";
import { EViewAccess } from "@plane/types";
import { EModalPosition, EModalWidth, Input, ModalCore, ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
import type { TSaveViewInput, TViewSummaryRow } from "./types";

type TSaveViewModalProps = {
  isOpen: boolean;
  mode: "create" | "edit";
  /** 「以后打开xx页直接落在这个视图」里的 xx */
  pageLabel: string;
  initialName?: string;
  initialAccess?: EViewAccess;
  initialIsDefault?: boolean;
  summary?: TViewSummaryRow[];
  onClose: () => void;
  onSubmit: (input: TSaveViewInput) => Promise<void> | void;
};

const ACCESS_OPTIONS: { value: EViewAccess; label: string; description: string; icon: typeof Globe }[] = [
  { value: EViewAccess.PRIVATE, label: "个人视图", description: "只有你看得到，随时可改", icon: User },
  { value: EViewAccess.PUBLIC, label: "公共视图", description: "项目成员都能看到，你和项目管理员可改", icon: Globe },
];

export const SaveViewModal = (props: TSaveViewModalProps) => {
  const {
    isOpen,
    mode,
    pageLabel,
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
          <h3 className="text-lg font-semibold text-primary">{mode === "create" ? "保存为视图" : "编辑视图"}</h3>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-tertiary hover:bg-layer-2-hover hover:text-primary"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 pt-5">
          <label htmlFor="in-page-view-name" className="mb-2 block text-sm font-semibold text-secondary">
            视图名称
          </label>
          <Input
            id="in-page-view-name"
            ref={inputRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：本迭代待办"
            inputSize="md"
            className="w-full"
            maxLength={255}
          />
        </div>

        <div className="px-6 pt-5">
          <div className="mb-2 text-sm font-semibold text-secondary">谁能看到</div>
          <div className="grid grid-cols-2 gap-2.5">
            {ACCESS_OPTIONS.map((option) => {
              const selected = access === option.value;
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setAccess(option.value)}
                  className={cn(
                    "flex gap-3 rounded-lg border p-3 text-left transition-colors",
                    selected ? "border-accent-strong bg-accent-subtle" : "border-subtle hover:bg-layer-2-hover"
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border",
                      selected ? "border-accent-strong bg-accent-primary" : "border-strong"
                    )}
                  >
                    {selected && <Check className="h-2.5 w-2.5 text-on-color" strokeWidth={3} />}
                  </span>
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                      <Icon className={cn("h-3.5 w-3.5", selected ? "text-accent-primary" : "text-tertiary")} />
                      {option.label}
                    </span>
                    <span className="text-xs leading-relaxed text-tertiary">{option.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {mode === "create" && summary && summary.length > 0 && (
          <div className="px-6 pt-5">
            <div className="mb-2 text-sm font-semibold text-secondary">这个视图会记住</div>
            <div className="divide-y divide-subtle rounded-lg border border-subtle bg-surface-2">
              {summary.map((row) => (
                <div key={row.label} className="flex items-start gap-2.5 px-3.5 py-2.5 text-sm">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-primary" />
                  <span className="w-20 shrink-0 font-semibold text-primary">{row.label}</span>
                  <span className="min-w-0 text-secondary">{row.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mx-6 mt-5 flex items-center justify-between rounded-lg border border-subtle px-3.5 py-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-primary">设为我的默认视图</span>
            <span className="text-xs text-tertiary">以后打开{pageLabel}页直接落在这个视图</span>
          </div>
          <ToggleSwitch value={isDefault} onChange={setIsDefault} size="md" />
        </div>

        <div className="flex justify-end gap-2.5 px-6 pb-5 pt-5">
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
