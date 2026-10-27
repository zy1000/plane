import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  CircleDot,
  Factory,
  Tag,
  UserRound,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { ERiskCategory, IUserLite, TRiskDetail } from "@plane/types";
import { ERiskStatus, RISK_CATEGORIES, RISK_STATUSES } from "@plane/types";
import { Avatar, AvatarGroup } from "@plane/ui";
import { cn, getDate, getFileURL, renderFormattedPayloadDate } from "@plane/utils";
import { DateDropdown } from "@/components/dropdowns/date";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { useMember } from "@/hooks/store/use-member";
import {
  RISK_I18N,
  RISK_STATUS_STYLE,
  formatRiskDate,
  formatRiskDateTime,
  riskCategoryLabelKey,
  riskStatusLabelKey,
} from "../constants";
import type { TRiskEditSession } from "./use-risk-edit-session";
import {
  DETAIL_LABEL_CLASS,
  EDIT_DROPDOWN_ARROW_CLASS,
  EDIT_DROPDOWN_BUTTON_CLASS,
  MISSING_CLASS,
  RiskEditSelect,
} from "./risk-detail-fields";

/** 计划处理日期早于今天、而风险还没走到终态，算逾期 */
const OPEN_STATUSES: ERiskStatus[] = [ERiskStatus.DRAFT, ERiskStatus.PENDING_ASSESSMENT, ERiskStatus.TRACKING];

const DAY_MS = 24 * 60 * 60 * 1000;

/** 一组属性一张白卡片：标题（与正文区块标题同一档：13 号加粗）+ 若干行 */
const Card = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="flex flex-col rounded-xl border border-subtle bg-surface-1 px-3.5 pt-0.5 pb-2">
    <h5 className="flex h-9.5 items-center text-13 font-semibold text-secondary">{title}</h5>
    {children}
  </section>
);

/** 一行一项：图标 + 标签 6rem（同正文标签列），值 14 号；编辑态必填挂红 * */
const Row = ({
  icon: Icon,
  label,
  required = false,
  isEditing,
  children,
}: {
  icon: LucideIcon;
  label: string;
  required?: boolean;
  isEditing: boolean;
  children: ReactNode;
}) => (
  <div className={cn("grid grid-cols-[6rem_minmax(0,1fr)] items-center", isEditing ? "min-h-10.5" : "min-h-9.5")}>
    <span className={cn(DETAIL_LABEL_CLASS, "flex min-w-0 items-center gap-2")}>
      <Icon className="size-3.75 shrink-0 text-placeholder" strokeWidth={1.8} />
      <span className="min-w-0 truncate">
        {label}
        {isEditing && required && <span className="ml-0.5 text-danger-primary">*</span>}
      </span>
    </span>
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-14 text-primary">{children}</div>
  </div>
);

/** 查看态的空值：灰字 */
const Placeholder = ({ text }: { text: string }) => <span className="text-placeholder">{text}</span>;

/** 一个人：头像 + 名字 */
const Person = ({ user }: { user: IUserLite }) => (
  <span className="flex min-w-0 items-center gap-2">
    <Avatar size="md" name={user.display_name} src={getFileURL(user.avatar_url ?? "")} showTooltip={false} />
    <span className="truncate">{user.display_name}</span>
  </span>
);

/** 几个人：叠头像 + 「、」连起来的名字 */
const People = ({ users }: { users: IUserLite[] }) => (
  <span className="flex min-w-0 items-center gap-2" title={users.map((user) => user.display_name).join("、")}>
    <span className="shrink-0">
      <AvatarGroup size="md" max={3} showTooltip={false}>
        {users.map((user) => (
          <Avatar key={user.id} size="md" name={user.display_name} src={getFileURL(user.avatar_url ?? "")} />
        ))}
      </AvatarGroup>
    </span>
    <span className="truncate">{users.map((user) => user.display_name).join("、")}</span>
  </span>
);

/** 编辑态的日期：带边框的日期下拉，写法同查看态（2026-10-24） */
const EditDate = ({
  value,
  minDate,
  clearable,
  missing,
  onChange,
}: {
  value: string | null;
  minDate?: string | null;
  clearable: boolean;
  missing?: boolean;
  onChange: (next: string | null) => void;
}) => {
  const { t } = useTranslation();
  return (
    <DateDropdown
      value={getDate(value)}
      minDate={getDate(minDate)}
      onChange={(next) => onChange(next ? (renderFormattedPayloadDate(next) ?? null) : null)}
      className="w-full min-w-0"
      placeholder={t(`${RISK_I18N}.form.date_placeholder`)}
      formatToken="yyyy-MM-dd"
      buttonVariant="border-with-text"
      buttonContainerClassName="w-full text-left"
      buttonClassName={cn(EDIT_DROPDOWN_BUTTON_CLASS, missing && MISSING_CLASS)}
      labelClassName={cn("!text-14 !font-normal tabular-nums", !value && "text-placeholder")}
      dropdownArrow
      dropdownArrowClassName={EDIT_DROPDOWN_ARROW_CLASS}
      hideIcon
      isClearable={clearable}
    />
  );
};

/** 编辑态的单选成员（提出人 / 责任人 必填，下拉里再点一次已选的人会回 null，忽略） */
const EditMember = ({
  projectId,
  value,
  missing,
  onChange,
}: {
  projectId: string;
  value: string | null;
  missing: boolean;
  onChange: (userId: string) => void;
}) => {
  const { t } = useTranslation();
  return (
    <MemberDropdown
      multiple={false}
      value={value}
      onChange={(next) => {
        if (next && next !== value) onChange(next);
      }}
      projectId={projectId}
      className="w-full min-w-0"
      placeholder={t(`${RISK_I18N}.form.member_placeholder`)}
      buttonVariant="border-with-text"
      buttonContainerClassName="w-full"
      buttonClassName={cn(EDIT_DROPDOWN_BUTTON_CLASS, "gap-2", missing && MISSING_CLASS)}
      labelClassName="text-14"
      dropdownArrow
      dropdownArrowClassName={EDIT_DROPDOWN_ARROW_CLASS}
      showUserDetails
    />
  );
};

/**
 * 右栏：灰底上三张白卡片（基本信息 / 人员 / 日期），末尾两行小字是创建与更新信息。
 * 查看时全是纯文本；顶栏点「编辑」后换成带边框的下拉，改动进草稿，与正文一起保存。
 */
export const RiskSidebar = ({
  projectId,
  detail,
  session,
}: {
  projectId: string;
  detail: TRiskDetail;
  session: TRiskEditSession;
}) => {
  const { t } = useTranslation();
  const { getUserDetails } = useMember();
  const { value, isEditing, patch, isMissing } = session;
  if (!value) return null;

  const notFilled = t(`${RISK_I18N}.detail.not_filled`);

  const today = renderFormattedPayloadDate(new Date()) ?? "";
  const plannedDate = detail.planned_handle_date;
  const overdueDays =
    plannedDate && plannedDate < today && OPEN_STATUSES.includes(detail.status)
      ? Math.round((Date.parse(today) - Date.parse(plannedDate)) / DAY_MS)
      : 0;
  const creatorName =
    (detail.created_by && getUserDetails(detail.created_by)?.display_name) || t(`${RISK_I18N}.activity.unknown_user`);

  const stakeholders = value.stakeholderIds.flatMap(
    (id) => detail.stakeholder_details.find((user) => user.id === id) ?? getUserDetails(id) ?? []
  );

  return (
    <aside
      className={cn(
        "flex w-full shrink-0 flex-col gap-3 overflow-y-auto bg-layer-1 p-4",
        // 窄屏时属性栏落到正文下面，分隔线跟着从左边转到上边
        "border-t border-subtle lg:w-80 lg:border-t-0 lg:border-l"
      )}
    >
      <Card title={t(`${RISK_I18N}.groups.basic`)}>
        <Row icon={CircleDot} label={t(`${RISK_I18N}.fields.status`)} required isEditing={isEditing}>
          {isEditing ? (
            <RiskEditSelect<ERiskStatus>
              value={value.status}
              options={RISK_STATUSES.map((status) => ({
                value: status,
                label: (
                  <>
                    <span className={cn("size-1.75 shrink-0 rounded-full", RISK_STATUS_STYLE[status].dot)} />
                    {t(riskStatusLabelKey(status))}
                  </>
                ),
              }))}
              onChange={(next) => next && patch({ status: next })}
            />
          ) : (
            <span className="flex items-center gap-2">
              <span className={cn("size-1.75 shrink-0 rounded-full", RISK_STATUS_STYLE[value.status].dot)} />
              {t(riskStatusLabelKey(value.status))}
            </span>
          )}
        </Row>
        <Row icon={Tag} label={t(`${RISK_I18N}.fields.category`)} isEditing={isEditing}>
          {isEditing ? (
            <RiskEditSelect<ERiskCategory>
              value={value.category}
              options={RISK_CATEGORIES.map((category) => ({ value: category, label: t(riskCategoryLabelKey(category)) }))}
              clearable
              onChange={(next) => patch({ category: next })}
            />
          ) : value.category ? (
            t(riskCategoryLabelKey(value.category))
          ) : (
            <Placeholder text={notFilled} />
          )}
        </Row>
        <Row icon={Factory} label={t(`${RISK_I18N}.fields.is_in_risk_production_short`)} isEditing={isEditing}>
          {isEditing ? (
            <RiskEditSelect<"yes" | "no">
              value={value.isInRiskProduction === null ? "" : value.isInRiskProduction ? "yes" : "no"}
              options={[
                { value: "yes", label: t(`${RISK_I18N}.yes_no.yes`) },
                { value: "no", label: t(`${RISK_I18N}.yes_no.no`) },
              ]}
              clearable
              onChange={(next) => patch({ isInRiskProduction: next === "" ? null : next === "yes" })}
            />
          ) : value.isInRiskProduction === null ? (
            <Placeholder text={notFilled} />
          ) : (
            t(`${RISK_I18N}.yes_no.${value.isInRiskProduction ? "yes" : "no"}`)
          )}
        </Row>
      </Card>

      <Card title={t(`${RISK_I18N}.groups.people`)}>
        <Row icon={UserRound} label={t(`${RISK_I18N}.fields.proposer`)} required isEditing={isEditing}>
          {isEditing ? (
            <EditMember
              projectId={projectId}
              value={value.proposerId}
              missing={isMissing("proposer_id")}
              onChange={(userId) => patch({ proposerId: userId })}
            />
          ) : detail.proposer_detail ? (
            <Person user={detail.proposer_detail} />
          ) : (
            <Placeholder text={notFilled} />
          )}
        </Row>
        <Row icon={UserRoundCheck} label={t(`${RISK_I18N}.fields.owner`)} required isEditing={isEditing}>
          {isEditing ? (
            <EditMember
              projectId={projectId}
              value={value.ownerId}
              missing={isMissing("owner_id")}
              onChange={(userId) => patch({ ownerId: userId })}
            />
          ) : detail.owner_detail ? (
            <Person user={detail.owner_detail} />
          ) : (
            <Placeholder text={notFilled} />
          )}
        </Row>
        <Row icon={Users} label={t(`${RISK_I18N}.fields.stakeholders_short`)} isEditing={isEditing}>
          {isEditing ? (
            <MemberDropdown
              multiple
              value={value.stakeholderIds}
              onChange={(next) => patch({ stakeholderIds: next })}
              projectId={projectId}
              className="w-full min-w-0"
              buttonVariant="border-with-text"
              buttonContainerClassName="w-full"
              button={
                <span className={cn(EDIT_DROPDOWN_BUTTON_CLASS, "flex min-w-0 items-center")}>
                  {stakeholders.length > 0 ? (
                    <People users={stakeholders} />
                  ) : (
                    <span className="truncate text-placeholder">{t(`${RISK_I18N}.form.members_placeholder`)}</span>
                  )}
                  <ChevronDown className={EDIT_DROPDOWN_ARROW_CLASS} />
                </span>
              }
            />
          ) : stakeholders.length > 0 ? (
            <People users={stakeholders} />
          ) : (
            <Placeholder text={notFilled} />
          )}
        </Row>
      </Card>

      <Card title={t(`${RISK_I18N}.groups.dates`)}>
        <Row icon={CalendarDays} label={t(`${RISK_I18N}.fields.proposed_date`)} required isEditing={isEditing}>
          {isEditing ? (
            <EditDate
              value={value.proposedDate}
              clearable={false}
              missing={isMissing("proposed_date")}
              onChange={(next) => next && patch({ proposedDate: next })}
            />
          ) : value.proposedDate ? (
            <span className="tabular-nums">{formatRiskDate(value.proposedDate)}</span>
          ) : (
            <Placeholder text={notFilled} />
          )}
        </Row>
        <Row icon={CalendarClock} label={t(`${RISK_I18N}.fields.planned_handle_date_short`)} isEditing={isEditing}>
          {isEditing ? (
            <EditDate value={value.plannedHandleDate} clearable onChange={(next) => patch({ plannedHandleDate: next })} />
          ) : value.plannedHandleDate ? (
            <>
              <span className="whitespace-nowrap tabular-nums">{formatRiskDate(value.plannedHandleDate)}</span>
              {overdueDays > 0 && (
                <span className="inline-flex h-5 shrink-0 items-center rounded-md bg-danger-subtle px-1.5 text-12 text-danger-primary">
                  {t(`${RISK_I18N}.detail.overdue_days`, { count: overdueDays })}
                </span>
              )}
            </>
          ) : (
            <Placeholder text={notFilled} />
          )}
        </Row>
        {/* 实际关闭不能早于提出时间：后端也会拦（RISK_CLOSE_BEFORE_PROPOSED），这里先挡住 */}
        <Row icon={CalendarCheck2} label={t(`${RISK_I18N}.fields.actual_close_date_short`)} isEditing={isEditing}>
          {isEditing ? (
            <EditDate
              value={value.actualCloseDate}
              minDate={value.proposedDate}
              clearable
              onChange={(next) => patch({ actualCloseDate: next })}
            />
          ) : value.actualCloseDate ? (
            <span className="tabular-nums">{formatRiskDate(value.actualCloseDate)}</span>
          ) : (
            <Placeholder text={t(`${RISK_I18N}.detail.not_closed`)} />
          )}
        </Row>
      </Card>

      {/* 创建与更新信息：查证用的两行小字，跟在卡片后面，不钉到最底 */}
      <p className="flex flex-col gap-0.5 px-1 text-12 leading-relaxed text-placeholder tabular-nums">
        <span>
          {t(`${RISK_I18N}.detail.created_meta`, { name: creatorName, date: formatRiskDateTime(detail.created_at) })}
        </span>
        <span>{t(`${RISK_I18N}.detail.updated_meta`, { date: formatRiskDateTime(detail.updated_at) })}</span>
      </p>
    </aside>
  );
};
