import { useState } from "react";
import { Listbox, Portal } from "@headlessui/react";
import { usePopper } from "react-popper";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@plane/utils";

export type TFieldChoice = { key: string; label: string };

type Props = {
  label: string;
  choices: TFieldChoice[];
  placeholder?: string;
  disabled?: boolean;
} & (
  | { multiple: true; value: string[]; onChange: (value: string[]) => void }
  | { multiple?: false; value: string; onChange: (value: string) => void }
);

/** Portaled, keyboard-accessible selection shared by field configuration and its preview. */
export function FieldChoiceSelect(props: Props) {
  const { label, choices, placeholder = "请选择", disabled, value, multiple } = props;
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
            className="flex min-h-9 w-full items-center justify-between gap-2 rounded-md border border-subtle bg-surface-1 px-2.5 py-1.5 text-left text-13 text-primary outline-none hover:border-strong focus-visible:border-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex min-w-0 flex-1 flex-wrap gap-1">
              {selected.length ? (
                selected.map((key) => (
                  <span
                    key={key}
                    className={cn("max-w-full truncate", multiple && "rounded bg-layer-1 px-1.5 py-0.5 text-12")}
                  >
                    {choices.find((choice) => choice.key === key)?.label ?? key}
                  </span>
                ))
              ) : (
                <span className="text-secondary">{placeholder}</span>
              )}
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-tertiary" />
          </Listbox.Button>
          {open && (
            <Portal>
              <Listbox.Options
                static
                ref={setPanel}
                style={{ ...styles.popper, width: reference?.offsetWidth, maxWidth: "calc(100vw - 24px)" }}
                {...attributes.popper}
                data-prevent-outside-click
                data-modal-wheel-scroll
                className="z-50 max-h-60 overflow-y-auto rounded-md border border-subtle bg-surface-1 p-1 shadow-raised-200 outline-none"
              >
                {choices.length === 0 && <li className="px-2 py-3 text-13 text-secondary">暂无可选项</li>}
                {choices.map((choice) => (
                  <Listbox.Option
                    key={choice.key}
                    value={choice.key}
                    className={({ active }) =>
                      cn(
                        "flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-2 text-13 text-primary",
                        active && "bg-layer-1-hover"
                      )
                    }
                  >
                    {({ selected: checked }) => (
                      <>
                        <span className="min-w-0 break-words">{choice.label}</span>
                        {checked && <Check className="size-3.5 shrink-0 text-accent-primary" />}
                      </>
                    )}
                  </Listbox.Option>
                ))}
              </Listbox.Options>
            </Portal>
          )}
        </div>
      )}
    </Listbox>
  );
}
