import { useMemo } from "react";
import { Lock } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TRequirementApprovalType, IUserLite } from "@plane/types";
import { Avatar } from "@plane/ui";
import { getFileURL } from "@plane/utils";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { RequirementApprovalSettings, SettingsField } from "./requirement-approval-settings";

/**
 * 审批配置的草稿。
 *
 * 没有 status 也没有 current_version —— 状态与版本现在长在每一条需求上，这里只回答
 * 「谁能批、要几个人批」。
 */
export type TRequirementSettingsDraft = {
  owner_id: string;
  approver_ids: string[];
  approval_type: TRequirementApprovalType;
  required_count: number | null;
};

/** 列出来的审批人名字上限，再多就折成「等 N 人」，免得摘要句被撑成一段 */
const SUMMARY_NAME_LIMIT = 4;

type TRequirementSettingsPanelProps = {
  draft: TRequirementSettingsDraft;
  /** 改配置比改需求更窄：没权限时整页只读 */
  readOnly?: boolean;
  memberOptions: IUserLite[];
  onChange: (draft: TRequirementSettingsDraft) => void;
};

/**
 * 这套配置生效之后是什么样，用一句话写出来。
 *
 * 这一页唯一的产出就是一条规则。与其让人从「审批人」「通过规则」「最少人数」三个控件里
 * 自己在脑子里拼，不如直接把拼好的结果放在最上面，随配置实时改写。
 */
function RuleSummary({
  draft,
  memberOptions,
}: {
  draft: TRequirementSettingsDraft;
  memberOptions: IUserLite[];
}) {
  const { t } = useTranslation();

  const names = useMemo(() => {
    const resolved = draft.approver_ids
      .map((id) => memberOptions.find((member) => member.id === id)?.display_name)
      .filter((name): name is string => Boolean(name));
    if (resolved.length <= SUMMARY_NAME_LIMIT) return resolved.join("、");
    return [
      resolved.slice(0, SUMMARY_NAME_LIMIT).join("、"),
      t("workspace_products.requirements.configuration.summary.more", {
        count: resolved.length - SUMMARY_NAME_LIMIT,
      }),
    ].join(" ");
  }, [draft.approver_ids, memberOptions, t]);

  if (!draft.approver_ids.length) {
    return (
      <p className="rounded-md border border-warning-subtle bg-warning-subtle/40 px-3.5 py-3 text-13 leading-6 text-warning-primary">
        {t("workspace_products.requirements.configuration.summary.empty")}
      </p>
    );
  }

  return (
    <p className="rounded-md border border-subtle bg-layer-1 px-3.5 py-3 text-13 leading-6 text-primary">
      {t(`workspace_products.requirements.configuration.summary.${draft.approval_type}`, {
        approvers: names,
        count: draft.required_count ?? 1,
      })}
    </p>
  );
}

/** 只读态给结果，不给一排灰掉的控件 —— 只读与禁用是两回事 */
function ReadOnlyValues({
  draft,
  memberOptions,
}: {
  draft: TRequirementSettingsDraft;
  memberOptions: IUserLite[];
}) {
  const { t } = useTranslation();
  const owner = memberOptions.find((member) => member.id === draft.owner_id);
  const approvers = draft.approver_ids
    .map((id) => memberOptions.find((member) => member.id === id))
    .filter((member): member is IUserLite => Boolean(member));

  const chip = (member: IUserLite) => (
    <span key={member.id} className="flex h-6 items-center gap-1.5 rounded bg-layer-2 px-1.5 text-11 text-primary">
      <Avatar name={member.display_name} src={getFileURL(member.avatar_url ?? "")} size="sm" className="shrink-0" />
      <span className="max-w-32 truncate">{member.display_name}</span>
    </span>
  );

  return (
    <>
      <SettingsField label={t("workspace_products.requirements.fields.owner")}>
        <div className="pt-0.5">{owner ? chip(owner) : <span className="text-12 text-placeholder">—</span>}</div>
      </SettingsField>
      <SettingsField label={t("workspace_products.requirements.fields.approvers")}>
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {approvers.length ? (
            approvers.map(chip)
          ) : (
            <span className="text-12 text-placeholder">
              {t("workspace_products.requirements.approval.unconfigured")}
            </span>
          )}
        </div>
      </SettingsField>
      <SettingsField label={t("workspace_products.requirements.fields.approval_rule")}>
        <p className="pt-1 text-12 text-primary">
          {t(`workspace_products.requirements.configuration.rule_short.${draft.approval_type}`, {
            count: draft.required_count ?? 1,
          })}
        </p>
      </SettingsField>
      <div className="mt-5 flex items-start gap-2 rounded-md bg-layer-1 px-3 py-2.5 text-12 text-secondary">
        <Lock className="mt-0.5 size-3.5 shrink-0 text-tertiary" />
        {t("workspace_products.requirements.configuration.read_only_hint")}
      </div>
    </>
  );
}

/**
 * 审批配置页。
 *
 * 这一页只回答「谁能批、要几个人批」，所以是一条单列窄表单，不是一堆卡片 —— 表单不该
 * 比正文更宽，两个字段更不需要各自的卡片外壳与图标徽章。页内也不再重复一个标题：页签
 * 已经说过这是什么了。
 */
export function RequirementSettingsPanel({
  draft,
  readOnly = false,
  memberOptions,
  onChange,
}: TRequirementSettingsPanelProps) {
  const { t } = useTranslation();
  const memberIds = useMemo(() => memberOptions.map((member) => member.id), [memberOptions]);

  const updateDraft = (patch: Partial<TRequirementSettingsDraft>) => {
    if (readOnly) return;
    onChange({ ...draft, ...patch });
  };

  const handleApproverIdsChange = (nextApproverIds: string[]) => {
    if (draft.approval_type !== "n_of_m") {
      updateDraft({ approver_ids: nextApproverIds });
      return;
    }
    if (nextApproverIds.length === 0) {
      updateDraft({ approver_ids: [], approval_type: "any", required_count: null });
      return;
    }
    updateDraft({
      approver_ids: nextApproverIds,
      required_count: Math.min(Math.max(draft.required_count ?? 1, 1), nextApproverIds.length),
    });
  };

  const handleApprovalTypeChange = (approvalType: TRequirementApprovalType) =>
    updateDraft({
      approval_type: approvalType,
      required_count:
        approvalType === "n_of_m" ? Math.min(Math.max(draft.required_count ?? 1, 1), draft.approver_ids.length) : null,
    });

  // 父级（product-requirements-page.tsx:513）是行向 flex，缺 min-w-0 时下拉的固有宽度会把这里
  // 撑破，再被祖先的 overflow-hidden 裁掉而不是滚动。同位置的 loader 分支就带着它。
  return (
    <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-surface-1 px-5 py-8 md:px-8 md:py-10">
      {/*
        40rem ≈ 640px 且水平居中。
        限宽是为了让「标签列 + 控件」在一眼之内读完，不必左右横扫；居中是因为一块窄内容
        左钉在宽屏的角上会读成「掉在那儿了」，而不是「这一页就这么多」。
        底部的留白不填 —— 一共三个字段，设置页本来就短，塞东西只会变成凑数。
      */}
      <div className="mx-auto w-full max-w-[40rem]">
        <RuleSummary draft={draft} memberOptions={memberOptions} />

        <div className="mt-5">
          {readOnly ? (
            <ReadOnlyValues draft={draft} memberOptions={memberOptions} />
          ) : (
            <>
              <SettingsField
                label={t("workspace_products.requirements.fields.owner")}
                required
                help={t("workspace_products.requirements.configuration.owner_help")}
              >
                <MemberDropdown
                  multiple={false}
                  value={draft.owner_id || null}
                  onChange={(value) => updateDraft({ owner_id: value ?? "" })}
                  memberIds={memberIds}
                  buttonVariant="border-with-text"
                  className="w-full"
                  buttonClassName="h-8.5 w-full border !border-subtle bg-surface-1"
                  buttonContainerClassName="w-full"
                  placeholder={t("workspace_products.requirements.fields.select_owner")}
                  showUserDetails
                />
              </SettingsField>

              <RequirementApprovalSettings
                readOnly={readOnly}
                radioGroupName="product-requirement-inline-approval-type"
                memberOptions={memberOptions}
                approverIds={draft.approver_ids}
                approvalType={draft.approval_type}
                requiredCount={draft.required_count}
                onApproverIdsChange={handleApproverIdsChange}
                onApprovalTypeChange={handleApprovalTypeChange}
                onRequiredCountChange={(requiredCount) => updateDraft({ required_count: requiredCount })}
              />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
