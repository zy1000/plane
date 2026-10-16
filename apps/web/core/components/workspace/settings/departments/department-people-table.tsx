import { useTranslation } from "@plane/i18n";
import type { TDepartmentPerson } from "@plane/types";
import { Avatar, Loader } from "@plane/ui";
import { getFileURL, renderFormattedDateTime } from "@plane/utils";
import { DictionaryItemsPagination } from "@/components/workspace/settings/data-dictionaries/dictionary-items-pagination";
import { DEPARTMENT_PAGE_SIZE_OPTIONS } from "@/hooks/store/use-departments";
import { DEPARTMENTS_I18N as I18N } from "./helpers";

type Props = {
  people: TDepartmentPerson[];
  total: number;
  isLoading: boolean;
  hasFilters: boolean;
  showDepartment: boolean;
  page: number;
  perPage: number;
  onPageChange: (page: number) => void;
  onPerPageChange: (size: number) => void;
};

const TH = "h-10 whitespace-nowrap border-b border-subtle bg-layer-1 px-3 text-left text-12 font-medium text-tertiary";
const TD = "h-14 truncate whitespace-nowrap border-b border-subtle px-3 text-13";

/** 「2026-09-04 09:35」：精确到分钟 */
const formatLastLogin = (value: string) => renderFormattedDateTime(value).slice(0, 16);

export function DepartmentPeopleTable(props: Props) {
  const { people, total, isLoading, hasFilters, showDepartment, page, perPage, onPageChange, onPerPageChange } = props;
  const { t } = useTranslation();
  const pageCount = Math.max(1, Math.ceil(total / perPage));

  const renderBody = () => {
    if (isLoading && people.length === 0) {
      return (
        <Loader className="flex flex-col gap-2 p-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Loader.Item key={index} height="40px" width="100%" />
          ))}
        </Loader>
      );
    }
    if (people.length === 0) {
      return (
        <p className="py-16 text-center text-13 text-tertiary">{t(`${I18N}.people.${hasFilters ? "no_match" : "empty"}`)}</p>
      );
    }
    return (
      // table-fixed：工号 / 最近登录定宽，姓名列占四分之一（邮箱作第二行），其余均分；长内容截断，保证最近登录不被挤出
      <table className={`w-full min-w-[720px] table-fixed border-collapse ${isLoading ? "opacity-60" : ""}`}>
        <thead className="sticky top-0 z-[1]">
          <tr>
            <th className={`${TH} w-[25%] pl-5`}>{t(`${I18N}.people.columns.name`)}</th>
            <th className={`${TH} w-[96px]`}>{t(`${I18N}.people.columns.employee_id`)}</th>
            {showDepartment && <th className={TH}>{t(`${I18N}.people.columns.department`)}</th>}
            <th className={TH}>{t(`${I18N}.people.columns.leader`)}</th>
            <th className={TH}>{t(`${I18N}.people.columns.ad_account`)}</th>
            <th className={`${TH} w-[172px] pr-5`}>{t(`${I18N}.people.columns.last_login`)}</th>
          </tr>
        </thead>
        <tbody>
          {people.map((person) => (
            <tr key={person.id} className="hover:bg-layer-transparent-hover">
              <td className={`${TD} pl-5`}>
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="shrink-0">
                    <Avatar name={person.display_name} src={getFileURL(person.avatar_url ?? "")} size={28} showTooltip={false} />
                  </span>
                  <span className="flex min-w-0 flex-col" title={`${person.display_name} · ${person.email}`}>
                    <span className="truncate font-medium text-primary">{person.display_name}</span>
                    <span className="truncate text-12 text-tertiary">{person.email}</span>
                  </span>
                </span>
              </td>
              <td className={`${TD} tabular-nums text-secondary`}>{person.employee_id || "—"}</td>
              {showDepartment && (
                <td className={TD}>
                  {person.department ? (
                    <span
                      className="inline-block h-6 max-w-full truncate rounded bg-layer-1 px-2 align-middle text-12 leading-6 text-secondary"
                      title={person.department.path}
                    >
                      {person.department.name}
                    </span>
                  ) : (
                    <span className="text-placeholder">—</span>
                  )}
                </td>
              )}
              <td className={TD}>
                {person.leader ? (
                  <span className="flex min-w-0 items-center gap-2 text-secondary" title={person.leader.display_name}>
                    <span className="shrink-0">
                      <Avatar name={person.leader.display_name} src={getFileURL(person.leader.avatar_url ?? "")} size={20} showTooltip={false} />
                    </span>
                    <span className="min-w-0 truncate">{person.leader.display_name}</span>
                  </span>
                ) : (
                  <span className="text-placeholder">—</span>
                )}
              </td>
              <td className={`${TD} text-secondary`} title={person.ad_account ?? undefined}>{person.ad_account || "—"}</td>
              <td className={`${TD} pr-5 tabular-nums`}>
                {person.last_login_time ? (
                  <span className="text-secondary">{formatLastLogin(person.last_login_time)}</span>
                ) : (
                  <span className="text-placeholder">{t(`${I18N}.people.never_logged_in`)}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <>
      <div className="vertical-scrollbar horizontal-scrollbar scrollbar-sm min-h-0 flex-1 overflow-auto border-t border-subtle">
        {renderBody()}
      </div>
      {total > 0 && (
        <DictionaryItemsPagination
          total={total}
          page={page}
          pageCount={pageCount}
          pageSize={perPage}
          pageSizeOptions={DEPARTMENT_PAGE_SIZE_OPTIONS}
          onPageChange={onPageChange}
          onPageSizeChange={onPerPageChange}
        />
      )}
    </>
  );
}
