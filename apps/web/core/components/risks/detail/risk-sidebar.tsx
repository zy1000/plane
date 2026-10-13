import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CircleDot,
  Factory,
  Tag,
  UserRound,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { ERiskCategory, IUserLite, TRiskDetail, TUpdateRiskPayload } from "@plane/types";
import { ERiskStatus, RISK_CATEGORIES, RISK_STATUSES } from "@plane/types";
import { Avatar, AvatarGroup, CustomSelect } from "@plane/ui";
import { cn, getDate, getFileURL, renderFormattedDate, renderFormattedDateTime, renderFormattedPayloadDate } from "@plane/utils";
import { DateDropdown } from "@/components/dropdowns/date";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { useMember } from "@/hooks/store/use-member";
import { INLINE_FIELD_CLASS } from "../../stage-reviews/detail/stage-review-content";
import { RiskStatusBadge } from "../badges";
import { RISK_I18N, riskCategoryLabelKey } from "../constants";

/** 计划处理日期早于今天、而风险还没走到终态，算逾期 */
const OPEN_STATUSES: ERiskStatus[] = [ERiskStatus.DRAFT, ERiskStatus.PENDING_ASSESSMENT, ERiskStatus.TRACKING];

/**
 * 一组属性一张白卡片：标题 + 若干行。右栏灰底上排三张卡片，内容多少都不挤。
 * 卡片里不再套有底色的块（会像两层卡片）。口径同阶段评审右栏。
 */
const Card = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="flex flex-col rounded-xl border border-subtle bg-surface-1 px-3.5 pt-0.5 pb-2">
    <h5 className="flex h-9.5 items-center text-12 font-semibold tracking-wide text-tertiary">{title}</h5>
    {children}
  </section>
);

/** 一行一项：图标 + 标签固定 92px，值靠左成一列，行高 38 —— 标签 13 号灰、值 14 号黑 */
const Row = ({
  icon: Icon,
  label,
  hint,
  children,
}: {
  icon: LucideIcon;
  label: string;
  /** 标签后的小字，如「自动计算」 */
  hint?: string;
  children: ReactNode;
}) => (
  <div className="grid min-h-9.5 grid-cols-[92px_minmax(0,1fr)] items-center">
    <span className="flex min-w-0 items-center gap-2 text-13 text-tertiary">
      <Icon className="size-3.75 shrink-0 text-placeholder" strokeWidth={1.8} />
      <span className="min-w-0 truncate">
        {label}
        {hint && <span className="ml-1 text-11 text-placeholder">{hint}</span>}
      </span>
    </span>
    <div className="min-w-0 text-14 text-primary">{children}</div>
  </div>
);

/** 只读态的空值：一律灰字「未设置」（日期另有「未关闭」占位） */
const Unset = ({ text }: { text: string }) => <span className="text-placeholder">{text}</span>;

/** 中文界面日期写成「2026年10月6日」，其它语言沿用 renderFormattedDate 的默认格式 */
const fullDateToken = (locale: string) => (locale.toLowerCase().startsWith("zh") ? "yyyy年M月d日" : undefined);

/**
 * 就地编辑的下拉：能改是无边框的 CustomSelect（悬停浅底），不能改是纯文本。
 * `clearable` 在选项最前面加一项「未设置」，选它就是清空（值为空串，与后端的 `""` 一致）。
 */
const InlineSelect = <T extends string | number>({
  value,
  options,
  placeholder,
  clearable = false,
  editable,
  onChange,
}: {
  value: T | "";
  options: { value: T; label: ReactNode }[];
  placeholder: string;
  clearable?: boolean;
  editable: boolean;
  onChange: (next: T | "") => void;
}) => {
  const { t } = useTranslation();
  const current = options.find((option) => option.value === value);
  if (!editable) {
    return <div className="flex min-h-7 items-center">{current?.label ?? <Unset text={t(`${RISK_I18N}.detail.unset`)} />}</div>;
  }
  return (
    <CustomSelect
      value={value}
      onChange={(next: T | "") => {
        if (next !== value) onChange(next);
      }}
      label={current?.label ?? <span className="text-placeholder">{placeholder}</span>}
      buttonClassName={cn(INLINE_FIELD_CLASS, "justify-start")}
      optionsClassName="min-w-[180px]"
      maxHeight="lg"
      noChevron
    >
      {clearable && (
        <CustomSelect.Option value="">
          <span className="text-placeholder">{t(`${RISK_I18N}.detail.unset`)}</span>
        </CustomSelect.Option>
      )}
      {options.map((option) => (
        <CustomSelect.Option key={String(option.value)} value={option.value}>
          {option.label}
        </CustomSelect.Option>
      ))}
    </CustomSelect>
  );
};

/** 一个人：头像 + 名字；没人是灰字 */
const Person = ({ user, empty }: { user: IUserLite | null; empty: string }) =>
  user ? (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar size="md" name={user.display_name} src={getFileURL(user.avatar_url ?? "")} showTooltip={false} />
      <span className="truncate">{user.display_name}</span>
    </span>
  ) : (
    <Unset text={empty} />
  );

/** 提出人 / 责任人：必填，单选，不允许清掉（下拉里再点一次已选的人会回 null，忽略） */
const MemberField = ({
  projectId,
  value,
  detail,
  editable,
  placeholder,
  onChange,
}: {
  projectId: string;
  value: string | null;
  detail: IUserLite | null;
  editable: boolean;
  placeholder: string;
  onChange: (userId: string) => void;
}) => {
  const { t } = useTranslation();
  if (!editable) return <Person user={detail} empty={t(`${RISK_I18N}.detail.unset`)} />;
  return (
    <MemberDropdown
      multiple={false}
      value={value}
      onChange={(next) => {
        if (next && next !== value) onChange(next);
      }}
      projectId={projectId}
      placeholder={placeholder}
      buttonVariant="transparent-with-text"
      buttonContainerClassName="w-full"
      buttonClassName={cn(INLINE_FIELD_CLASS, "gap-2 text-14")}
      labelClassName="text-14"
      showUserDetails
    />
  );
};

/**
 * 干系人：多选。下拉每勾一个人就回调一次，而保存是异步的 —— 连点两个人时第二下拿到的还是旧名单，
 * 会把第一个人盖掉。所以勾选先落在本地草稿里，**关上下拉才保存一次**。
 */
const StakeholdersField = ({
  projectId,
  value,
  details,
  editable,
  onChange,
}: {
  projectId: string;
  value: string[];
  details: IUserLite[];
  editable: boolean;
  onChange: (userIds: string[]) => void;
}) => {
  const { t } = useTranslation();
  const { getUserDetails } = useMember();
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  const valueKey = value.join(",");
  useEffect(() => {
    draftRef.current = value;
    setDraft(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueKey]);

  const draftUsers = draft.flatMap((id) => details.find((user) => user.id === id) ?? getUserDetails(id) ?? []);
  const people =
    draftUsers.length === 0 ? (
      <Unset text={editable ? t(`${RISK_I18N}.form.members_placeholder`) : t(`${RISK_I18N}.detail.unset`)} />
    ) : (
      <span className="flex min-w-0 items-center gap-2" title={draftUsers.map((user) => user.display_name).join("、")}>
        <span className="shrink-0">
          <AvatarGroup size="md" max={3} showTooltip={false}>
            {draftUsers.map((user) => (
              <Avatar key={user.id} size="md" name={user.display_name} src={getFileURL(user.avatar_url ?? "")} />
            ))}
          </AvatarGroup>
        </span>
        <span className="truncate">{draftUsers.map((user) => user.display_name).join("、")}</span>
      </span>
    );

  if (!editable) return <div className="flex min-h-7 items-center">{people}</div>;
  return (
    <MemberDropdown
      multiple
      value={draft}
      onChange={(next) => {
        draftRef.current = next;
        setDraft(next);
      }}
      onClose={() => {
        const next = draftRef.current;
        if (next.length !== value.length || next.some((id) => !value.includes(id))) onChange(next);
      }}
      projectId={projectId}
      buttonVariant="transparent-with-text"
      buttonContainerClassName="w-full"
      button={<span className={cn(INLINE_FIELD_CLASS, "flex items-center text-14")}>{people}</span>}
    />
  );
};

/** 是 / 否 两个小按钮：再点一次已选的那个 = 清掉（null，「未填」） */
const YesNoField = ({
  value,
  editable,
  onChange,
}: {
  value: boolean | null;
  editable: boolean;
  onChange: (next: boolean | null) => void;
}) => {
  const { t } = useTranslation();
  if (!editable) {
    return value === null ? (
      <Unset text={t(`${RISK_I18N}.yes_no.unset`)} />
    ) : (
      <span>{t(`${RISK_I18N}.yes_no.${value ? "yes" : "no"}`)}</span>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      {[true, false].map((option) => {
        const isActive = value === option;
        return (
          <button
            key={String(option)}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(isActive ? null : option)}
            className={cn(
              "h-6.5 min-w-11 rounded-md border px-2.5 text-13 transition",
              isActive
                ? "border-accent-strong bg-accent-subtle font-medium text-accent-primary"
                : "border-subtle text-tertiary hover:bg-layer-1 hover:text-secondary"
            )}
          >
            {t(`${RISK_I18N}.yes_no.${option ? "yes" : "no"}`)}
          </button>
        );
      })}
    </div>
  );
};

/** 日期：能改是紧凑的日期按钮，不能改是纯文本；`danger` 时红字（计划处理逾期） */
const DateField = ({
  value,
  minDate,
  editable,
  clearable = false,
  placeholder,
  danger = false,
  onChange,
}: {
  value: string | null;
  minDate?: string | null;
  editable: boolean;
  clearable?: boolean;
  placeholder: string;
  danger?: boolean;
  onChange: (next: string | null) => void;
}) => {
  const { currentLocale } = useTranslation();
  const formatToken = fullDateToken(currentLocale);
  if (!editable) {
    return value ? (
      <span className={cn("tabular-nums", danger && "text-danger-primary")}>{renderFormattedDate(value, formatToken)}</span>
    ) : (
      <Unset text={placeholder} />
    );
  }
  return (
    <DateDropdown
      value={getDate(value)}
      minDate={getDate(minDate)}
      onChange={(next) => onChange(next ? (renderFormattedPayloadDate(next) ?? null) : null)}
      placeholder={placeholder}
      formatToken={formatToken}
      buttonVariant="transparent-with-text"
      buttonContainerClassName="w-full text-left"
      buttonClassName={cn(
        "group h-7 w-full gap-1 rounded-md border border-transparent bg-transparent px-2 text-14 tabular-nums hover:bg-layer-1",
        // 字号与颜色不能进同一个 cn 分组：颜色单独一段
        !value && "text-placeholder",
        value && danger && "text-danger-primary"
      )}
      clearIconClassName="hidden group-hover:block"
      hideIcon
      isClearable={clearable}
    />
  );
};

/**
 * 抽屉右栏：分组同新建弹窗右栏 —— 灰底上三张白卡片（基本信息 / 人员 / 日期），末尾两行小字是创建与更新信息。
 * 评估、风险损失、触发因素、管理策略都在正文（见 risk-content）。
 * 所有字段就地编辑、改了直接保存（顶栏显示保存状态）；访客只读。
 */
export const RiskSidebar = ({
  projectId,
  detail,
  editable,
  onUpdate,
}: {
  projectId: string;
  detail: TRiskDetail;
  editable: boolean;
  onUpdate: (payload: TUpdateRiskPayload) => void;
}) => {
  const { t, currentLocale } = useTranslation();
  const { getUserDetails } = useMember();

  const today = renderFormattedPayloadDate(new Date()) ?? "";
  const plannedDate = detail.planned_handle_date;
  const isPlanOverdue = Boolean(plannedDate && plannedDate < today && OPEN_STATUSES.includes(detail.status));
  const creatorName =
    (detail.created_by && getUserDetails(detail.created_by)?.display_name) || t(`${RISK_I18N}.activity.unknown_user`);

  return (
    <aside
      className={cn(
        "flex w-full shrink-0 flex-col gap-3 overflow-y-auto bg-layer-1 p-4",
        // 窄屏时属性栏落到正文下面，分隔线跟着从左边转到上边
        "border-t border-subtle lg:w-[312px] lg:border-t-0 lg:border-l"
      )}
    >
      <Card title={t(`${RISK_I18N}.groups.basic`)}>
        <Row icon={CircleDot} label={t(`${RISK_I18N}.fields.status`)}>
          <InlineSelect
            value={detail.status}
            options={RISK_STATUSES.map((status) => ({ value: status, label: <RiskStatusBadge status={status} /> }))}
            placeholder={t(`${RISK_I18N}.form.select_placeholder`)}
            editable={editable}
            onChange={(next) => next && onUpdate({ status: next })}
          />
        </Row>
        <Row icon={Tag} label={t(`${RISK_I18N}.fields.category`)}>
          <InlineSelect
            value={detail.category}
            options={RISK_CATEGORIES.map((category) => ({ value: category, label: t(riskCategoryLabelKey(category)) }))}
            placeholder={t(`${RISK_I18N}.form.select_placeholder`)}
            clearable
            editable={editable}
            onChange={(next) => onUpdate({ category: next as ERiskCategory | "" })}
          />
        </Row>
        <Row icon={Factory} label={t(`${RISK_I18N}.fields.is_in_risk_production_short`)}>
          <YesNoField
            value={detail.is_in_risk_production}
            editable={editable}
            onChange={(next) => onUpdate({ is_in_risk_production: next })}
          />
        </Row>
      </Card>

      <Card title={t(`${RISK_I18N}.groups.people`)}>
        <Row icon={UserRound} label={t(`${RISK_I18N}.fields.proposer`)}>
          <MemberField
            projectId={projectId}
            value={detail.proposer}
            detail={detail.proposer_detail}
            editable={editable}
            placeholder={t(`${RISK_I18N}.form.member_placeholder`)}
            onChange={(userId) => onUpdate({ proposer_id: userId })}
          />
        </Row>
        <Row icon={UserRoundCheck} label={t(`${RISK_I18N}.fields.owner`)}>
          <MemberField
            projectId={projectId}
            value={detail.owner}
            detail={detail.owner_detail}
            editable={editable}
            placeholder={t(`${RISK_I18N}.form.member_placeholder`)}
            onChange={(userId) => onUpdate({ owner_id: userId })}
          />
        </Row>
        <Row icon={Users} label={t(`${RISK_I18N}.fields.stakeholders_short`)}>
          <StakeholdersField
            projectId={projectId}
            value={detail.stakeholder_ids}
            details={detail.stakeholder_details}
            editable={editable}
            onChange={(userIds) => onUpdate({ stakeholder_ids: userIds })}
          />
        </Row>
      </Card>

      <Card title={t(`${RISK_I18N}.groups.dates`)}>
        <Row icon={CalendarDays} label={t(`${RISK_I18N}.fields.proposed_date`)}>
          <DateField
            value={detail.proposed_date}
            editable={editable}
            placeholder={t(`${RISK_I18N}.form.date_placeholder`)}
            onChange={(next) => next && onUpdate({ proposed_date: next })}
          />
        </Row>
        <Row icon={CalendarClock} label={t(`${RISK_I18N}.fields.planned_handle_date_short`)}>
          <DateField
            value={detail.planned_handle_date}
            editable={editable}
            clearable
            danger={isPlanOverdue}
            placeholder={t(`${RISK_I18N}.form.date_placeholder`)}
            onChange={(next) => onUpdate({ planned_handle_date: next })}
          />
        </Row>
        {/* 实际关闭不能早于提出时间：后端也会拦（RISK_CLOSE_BEFORE_PROPOSED），这里先挡住 */}
        <Row icon={CalendarCheck2} label={t(`${RISK_I18N}.fields.actual_close_date_short`)}>
          <DateField
            value={detail.actual_close_date}
            minDate={detail.proposed_date}
            editable={editable}
            clearable
            placeholder={t(`${RISK_I18N}.detail.not_closed`)}
            onChange={(next) => onUpdate({ actual_close_date: next })}
          />
        </Row>
      </Card>

      {/* 创建与更新信息：查证用的两行小字，跟在卡片后面，不钉到最底 */}
      <p className="flex flex-col gap-0.5 px-1 text-12 leading-relaxed text-placeholder">
        <span>
          {t(`${RISK_I18N}.detail.created_meta`, {
            name: creatorName,
            date: renderFormattedDate(detail.created_at, fullDateToken(currentLocale)),
          })}
        </span>
        <span className="tabular-nums">
          {t(`${RISK_I18N}.detail.updated_meta`, { date: renderFormattedDateTime(detail.updated_at) })}
        </span>
      </p>
    </aside>
  );
};
