import { Fragment, useState } from "react";
import type { ReactNode } from "react";
import { Listbox, Portal } from "@headlessui/react";
import { usePopper } from "react-popper";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@plane/utils";

export type TFieldChoice = {
  key: string;
  label: string;
  /** 标签前的图标（如工作项类型图标） */
  icon?: ReactNode;
  disabled?: boolean;
  /** 选项右侧的灰字，如「已添加」 */
  hint?: string;
  /** 分组名：与上一项不同时在它前面画分组标题 */
  group?: string;
};

type Props = {
  label: string;
  choices: TFieldChoice[];
  placeholder?: string;
  disabled?: boolean;
  /** 下拉面板默认与触发框同宽，触发框窄时用它撑开 */
  panelMinWidth?: number;
  /**
   * 触发器的样子：`field` 带边框的选择框（默认）；`cell` 铺满表格单元格、无边框；
   * `link` 文字按钮，只显示 placeholder，用来从列表里挑一项执行（如「添加条件」）。
   */
  variant?: "field" | "cell" | "link";
  /** 已选标签的颜色：`accent` 用于结果列 */
  tone?: "neutral" | "accent";
} & (
  | { multiple: true; value: string[]; onChange: (value: string[]) => void }
  | { multiple?: false; value: string; onChange: (value: string) => void }
);

const TRIGGER = {
  field:
    "flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-subtle bg-surface-1 px-3 py-1.5 text-left text-14 text-primary outline-none hover:border-strong focus-visible:border-accent-strong disabled:cursor-not-allowed disabled:opacity-50",
  cell: "flex min-h-[52px] w-full items-center px-3 py-2.5 text-left text-14 text-primary outline-none hover:bg-layer-1-hover focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:ring-inset disabled:cursor-not-allowed disabled:hover:bg-transparent",
  link: "rounded text-14 font-medium text-accent-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent-strong disabled:cursor-not-allowed disabled:text-tertiary disabled:no-underline",
};

/** Portaled, keyboard-accessible selection shared by field configuration and its preview. */
export function FieldChoiceSelect(props: Props) {
  const {
    label,
    choices,
    placeholder = "请选择",
    disabled,
    value,
    multiple,
    panelMinWidth = 0,
    variant = "field",
    tone = "neutral",
  } = props;
  const [reference, setReference] = useState<HTMLButtonElement | null>(null);
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const { styles, attributes } = usePopper(reference, panel, {
    placement: "bottom-start",
    strategy: "fixed",
    modifiers: [
      { name: "offset", options: { offset: [0, 4] } },
      { name: "preventOverflow", options: { padding: 12 } },
    ],
  });
  const selected = multiple ? value : value ? [value] : [];
  const chipClassName = `flex h-[26px] max-w-full min-w-0 items-center gap-1.5 rounded-md px-2 text-13 ${
    tone === "accent" ? "bg-accent-subtle text-accent-primary" : "bg-layer-1 text-primary"
  }`;
  return (
    <Listbox
      value={value}
      multiple={multiple}
      disabled={disabled}
      onChange={(next: string | string[]) => {
        if (props.multiple) props.onChange(next as string[]);
        else props.onChange(next as string);
      }}
    >
      {({ open }) => (
        <div className="min-w-0">
          <Listbox.Button
            ref={setReference}
            aria-label={label}
            className={cn(TRIGGER[variant], variant === "cell" && open && "ring-2 ring-accent-strong ring-inset")}
          >
            {variant === "link" ? (
              placeholder
            ) : (
              <>
                <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                  {selected.length ? (
                    selected.map((key) => {
                      const choice = choices.find((item) => item.key === key);
                      return (
                        <span
                          key={key}
                          className={multiple ? chipClassName : "flex max-w-full min-w-0 items-center gap-2"}
                        >
                          {choice?.icon}
                          <span className="truncate">{choice?.label ?? key}</span>
                        </span>
                      );
                    })
                  ) : (
                    <span className="text-secondary">{placeholder}</span>
                  )}
                </span>
                {variant === "field" && <ChevronDown className="size-4 shrink-0 text-tertiary" />}
              </>
            )}
          </Listbox.Button>
          {open && (
            <Portal>
              <Listbox.Options
                static
                ref={setPanel}
                style={{
                  ...styles.popper,
                  width: Math.max(reference?.offsetWidth ?? 0, panelMinWidth),
                  maxWidth: "calc(100vw - 24px)",
                }}
                {...attributes.popper}
                data-prevent-outside-click
                data-modal-wheel-scroll
                className="z-50 max-h-72 overflow-y-auto rounded-xl border border-subtle bg-surface-1 p-1.5 shadow-raised-200 outline-none"
              >
                {choices.length === 0 && <li className="px-2.5 py-3 text-14 text-secondary">暂无可选项</li>}
                {choices.map((choice, index) => (
                  <Fragment key={choice.key}>
                    {choice.group && choice.group !== choices[index - 1]?.group && (
                      <li
                        role="presentation"
                        className={`px-2.5 pt-2 pb-1 text-13 text-secondary ${index > 0 ? "mt-1.5 border-t border-subtle" : ""}`}
                      >
                        {choice.group}
                      </li>
                    )}
                    <Listbox.Option
                      value={choice.key}
                      disabled={choice.disabled}
                      className={({ active }) =>
                        cn(
                          "flex min-h-10 items-center gap-2.5 rounded-md px-2.5 py-2 text-14",
                          choice.disabled ? "cursor-not-allowed text-tertiary" : "cursor-pointer text-primary",
                          active && "bg-layer-1-hover"
                        )
                      }
                    >
                      {({ selected: checked }) => (
                        <>
                          {multiple && (
                            <span
                              className={`grid size-[18px] shrink-0 place-items-center rounded-[5px] ${
                                checked ? "bg-accent-primary" : "border-[1.5px] border-strong bg-surface-1"
                              }`}
                            >
                              {checked && <Check className="size-3 text-on-color" strokeWidth={3.2} />}
                            </span>
                          )}
                          <span className="flex min-w-0 flex-1 items-center gap-2">
                            {choice.icon}
                            <span className="min-w-0 break-words">{choice.label}</span>
                          </span>
                          {choice.hint ? (
                            <span className="shrink-0 text-13 text-tertiary">{choice.hint}</span>
                          ) : (
                            !multiple && checked && <Check className="size-4 shrink-0 text-accent-primary" />
                          )}
                        </>
                      )}
                    </Listbox.Option>
                  </Fragment>
                ))}
              </Listbox.Options>
            </Portal>
          )}
        </div>
      )}
    </Listbox>
  );
}
