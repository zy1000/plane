import { useRef } from "react";
import type { Ref } from "react";
import { Combobox } from "@headlessui/react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { ChevronDownIcon } from "@plane/propel/icons";
import { Avatar, Input } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
// hooks
import { useWorkspaceInvitableUsers } from "@/hooks/use-workspace-invitable-users";

type TInvitationEmailComboboxProps = {
  workspaceSlug: string;
  id: string;
  name: string;
  value: string;
  onChange: (email: string) => void;
  inputRef: Ref<HTMLInputElement>;
  hasError: boolean;
  placeholder: string;
  excludeEmails?: string[];
};

/**
 * 邀请弹窗的邮箱输入框：可手动输入任意邮箱，也可从「尚未加入本工作区的本地用户」中下拉选择。
 * 表单值始终等于输入框内容；只有按 Enter 或点击选项时才用所选用户的邮箱回填。
 */
export function InvitationEmailCombobox(props: TInvitationEmailComboboxProps) {
  const { workspaceSlug, id, name, value, onChange, inputRef, hasError, placeholder, excludeEmails } = props;
  // plane hooks
  const { t } = useTranslation();
  // refs
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Headless UI 在 Tab / 失焦时会自动选中高亮的首项，这会覆盖手填的邮箱；
  // 这里只在用户明确按 Enter 或点击选项时才接受选中值
  const selectIntentRef = useRef(false);
  // derived values
  const { users, isLoading } = useWorkspaceInvitableUsers(workspaceSlug, value);
  const options = excludeEmails?.length ? users.filter((user) => !excludeEmails.includes(user.email)) : users;

  const armSelect = () => {
    selectIntentRef.current = true;
    setTimeout(() => {
      selectIntentRef.current = false;
    }, 0);
  };

  const handleSelect = (email: string) => {
    if (!selectIntentRef.current) return;
    selectIntentRef.current = false;
    onChange(email);
  };

  return (
    <Combobox as="div" className="relative w-full" value={value} onChange={handleSelect}>
      {({ open }) => (
        <>
          <Combobox.Input
            as={Input}
            id={id}
            name={name}
            type="text"
            ref={inputRef}
            hasError={hasError}
            placeholder={placeholder}
            className="w-full pr-8 text-caption-sm-regular sm:text-body-xs-regular"
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") armSelect();
            }}
            onClick={() => {
              if (!open) buttonRef.current?.click();
            }}
          />
          <Combobox.Button
            ref={buttonRef}
            className="absolute inset-y-0 right-0 flex items-center pr-2 text-tertiary"
          >
            <ChevronDownIcon className="h-3.5 w-3.5" />
          </Combobox.Button>
          <Combobox.Options className="vertical-scrollbar scrollbar-xs absolute top-full left-0 z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border-[0.5px] border-subtle-1 bg-surface-1 p-2 text-11 shadow-raised-200 focus:outline-none">
            {isLoading ? (
              <p className="px-1.5 py-1 text-placeholder italic">{t("common.loading")}</p>
            ) : options.length === 0 ? (
              <p className="px-1.5 py-1 text-placeholder italic">{t("common.search.no_matching_results")}</p>
            ) : (
              options.map((user) => (
                <Combobox.Option
                  key={user.id}
                  value={user.email}
                  onClick={armSelect}
                  className={({ active }) =>
                    cn("flex w-full cursor-pointer items-center gap-2 truncate rounded-sm px-1 py-1.5 select-none", {
                      "bg-layer-transparent-hover": active,
                    })
                  }
                >
                  <Avatar
                    name={user.display_name}
                    src={getFileURL(user.avatar_url ?? "")}
                    size="sm"
                    showTooltip={false}
                  />
                  <span className="truncate">{user.display_name}</span>
                  <span className="truncate text-tertiary">{user.email}</span>
                </Combobox.Option>
              ))
            )}
          </Combobox.Options>
        </>
      )}
    </Combobox>
  );
}
