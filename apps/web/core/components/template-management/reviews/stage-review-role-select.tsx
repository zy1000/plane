import { useMemo } from "react";
import { ChevronDown, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TDataDictionaryItem } from "@plane/types";
import { CustomSearchSelect } from "@plane/ui";

type Props = {
  /** 角色名称（不是 id）：模板与评审快照存的都是名称，找人时按名称对上工作区角色 */
  value: string;
  /** 工作区角色（设置 › 角色） */
  jobRoles: TDataDictionaryItem[];
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

const I18N = "workspace_templates.reviews.form";

/** 评审模板的发起者 / 主导者 / 审核者：从工作区角色里单选，可清空 */
export function StageReviewRoleSelect({ value, jobRoles, placeholder, disabled = false, onChange }: Props) {
  const { t } = useTranslation();
  const options = useMemo(
    () => jobRoles.map((role) => ({ value: role.label, query: role.label, content: role.label })),
    [jobRoles]
  );
  // 存量模板上的角色后来被改名或删除：照原样显示并标出来，生成评审时这个角色带不出人
  const isMissing = Boolean(value) && jobRoles.length > 0 && !jobRoles.some((role) => role.label === value);

  return (
    <div className="flex flex-col gap-1">
      <CustomSearchSelect
        value={value || undefined}
        onChange={(next: string | null) => onChange(next ?? "")}
        options={options}
        multiple={false}
        disabled={disabled}
        searchPlaceholder={t("search")}
        noResultsMessage={t("no_matching_results")}
        customButtonClassName="hover:bg-transparent"
        customButton={
          <div
            className={`flex h-9 w-full items-center gap-2 rounded-md border bg-surface-1 px-2.5 text-14 ${
              isMissing ? "border-danger-strong" : "border-subtle"
            }`}
          >
            <span className={`min-w-0 flex-1 truncate text-left ${value ? "text-primary" : "text-placeholder"}`}>
              {value || placeholder}
            </span>
            {value && !disabled && (
              // 外层 CustomSearchSelect 本身是 button，这里不能再嵌 button
              <span
                role="button"
                tabIndex={0}
                aria-label={t(`${I18N}.role_clear`)}
                className="grid size-4 shrink-0 place-items-center rounded text-tertiary hover:text-primary"
                onClick={(event) => {
                  event.stopPropagation();
                  onChange("");
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  event.stopPropagation();
                  onChange("");
                }}
              >
                <X className="size-3" />
              </span>
            )}
            <ChevronDown className="size-3.5 shrink-0 text-tertiary" aria-hidden />
          </div>
        }
      />
      {isMissing && <p className="text-12 leading-5 text-danger-primary">{t(`${I18N}.role_missing`)}</p>}
    </div>
  );
}
