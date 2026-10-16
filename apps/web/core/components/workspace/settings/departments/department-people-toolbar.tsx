import { useTranslation } from "@plane/i18n";
import { SearchIcon } from "@plane/propel/icons";
import type { TDepartmentLeaderOption, TDepartmentLoginFilter } from "@plane/types";
import { CustomSearchSelect, CustomSelect, ToggleSwitch } from "@plane/ui";
import { DEPARTMENTS_I18N as I18N } from "./helpers";

type Props = {
  search: string;
  onSearchChange: (value: string) => void;
  leaders: TDepartmentLeaderOption[];
  leader: string | null;
  onLeaderChange: (value: string | null) => void;
  login: TDepartmentLoginFilter | null;
  onLoginChange: (value: TDepartmentLoginFilter | null) => void;
  /** 只有三级组织显示「包含子部门」 */
  showIncludeChildren: boolean;
  includeChildren: boolean;
  onIncludeChildrenChange: (value: boolean) => void;
};

const ALL = "__all__";
const FILTER_BUTTON = "flex h-9 items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-3 text-13 text-secondary hover:bg-layer-1-hover";

export function DepartmentPeopleToolbar(props: Props) {
  const {
    search,
    onSearchChange,
    leaders,
    leader,
    onLeaderChange,
    login,
    onLoginChange,
    showIncludeChildren,
    includeChildren,
    onIncludeChildrenChange,
  } = props;
  const { t } = useTranslation();
  const leaderName = leaders.find((item) => item.id === leader)?.display_name;
  const loginLabels: Record<string, string> = {
    [ALL]: t(`${I18N}.people.login_all`),
    ever: t(`${I18N}.people.login_ever`),
    never: t(`${I18N}.people.login_never`),
  };

  const leaderOptions = [
    { value: ALL, query: t(`${I18N}.people.all_leaders`), content: <span className="text-13">{t(`${I18N}.people.all_leaders`)}</span> },
    ...leaders.map((item) => ({
      value: item.id,
      query: item.display_name,
      content: (
        <span className="flex w-full items-center justify-between gap-3 text-13">
          <span className="truncate">{item.display_name}</span>
          <span className="shrink-0 text-12 tabular-nums text-tertiary">{item.count}</span>
        </span>
      ),
    })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex h-9 w-72 max-w-full items-center gap-2 rounded-md border border-subtle bg-surface-1 px-2.5">
        <SearchIcon className="size-3.5 shrink-0 text-placeholder" />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t(`${I18N}.people.search_placeholder`)}
          aria-label={t(`${I18N}.people.search_placeholder`)}
          className="min-w-0 flex-1 border-none bg-transparent text-13 outline-none placeholder:text-placeholder"
        />
      </label>
      <CustomSearchSelect
        value={leader ?? ALL}
        onChange={(value: string) => onLeaderChange(value === ALL ? null : value)}
        options={leaderOptions}
        customButton={
          <span className={FILTER_BUTTON}>
            {t(`${I18N}.people.leader`)}
            {leaderName && <span className="font-medium text-primary">：{leaderName}</span>}
          </span>
        }
        customButtonClassName="rounded-md"
        maxHeight="md"
        placement="bottom-start"
        disabled={leaders.length === 0}
      />
      <CustomSelect
        value={login ?? ALL}
        onChange={(value: string) => onLoginChange(value === ALL ? null : (value as TDepartmentLoginFilter))}
        customButton={
          <span className={FILTER_BUTTON}>
            {t(`${I18N}.people.last_login`)}
            {login && <span className="font-medium text-primary">：{loginLabels[login]}</span>}
          </span>
        }
        customButtonClassName="rounded-md"
        placement="bottom-start"
      >
        {[ALL, "ever", "never"].map((value) => (
          <CustomSelect.Option key={value} value={value}>
            <span className="text-13">{loginLabels[value]}</span>
          </CustomSelect.Option>
        ))}
      </CustomSelect>
      {showIncludeChildren && (
        <div className="ml-auto flex items-center gap-2 text-13 text-secondary">
          <ToggleSwitch value={includeChildren} onChange={onIncludeChildrenChange} label={t(`${I18N}.people.include_children`)} />
          {t(`${I18N}.people.include_children`)}
        </div>
      )}
    </div>
  );
}
