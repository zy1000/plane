import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TStageReviewDetail, TUpdateStageReviewPayload } from "@plane/types";
import { EStageReviewKind } from "@plane/types";
import { cn, getDate, renderFormattedDate, renderFormattedPayloadDate } from "@plane/utils";
import { DateDropdown } from "@/components/dropdowns/date";
import { StageReviewResultBadge } from "../badges";
import { RoleMemberSelect } from "./role-member-select";

const I18N = "stage_review";

/** 成品与组件版本只挂在「O阶段评审」上；生产方式与出货评估两种 O 阶段类型都有 */
const O_STAGE_KINDS: EStageReviewKind[] = [EStageReviewKind.O_STAGE_REVIEW, EStageReviewKind.O_STAGE_ACTIVITY];

const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-2.5">
    <h5 className="text-11 font-semibold tracking-wider text-placeholder">{title}</h5>
    {children}
  </div>
);

const Row = ({ label, children }: { label?: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-1">
    {label && <span className="text-11 text-tertiary">{label}</span>}
    <span className="min-w-0 text-13 text-primary">{children}</span>
  </div>
);

/** 就地编辑的一格：失焦提交，值没变不发请求 */
const InlineText = ({
  value,
  mono,
  placeholder,
  editable,
  onCommit,
}: {
  value: string;
  mono?: boolean;
  placeholder: string;
  editable: boolean;
  onCommit: (next: string) => void;
}) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  if (!editable) {
    return <span className={cn(mono && "tabular-nums", !value && "text-tertiary")}>{value || "—"}</span>;
  }
  return (
    <input
      value={draft}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      className={cn(
        "-mx-1.5 w-[calc(100%+0.75rem)] rounded border border-transparent bg-transparent px-1.5 py-0.5",
        "text-13 text-primary placeholder:text-tertiary hover:border-subtle focus:border-accent-strong focus:outline-none",
        mono && "tabular-nums"
      )}
    />
  );
};

/**
 * 抽屉右栏：「要查的东西」——属性、结论、O 阶段的成品与组件版本、来源。
 *
 * 和正文分开的理由很简单：产品、阶段、负责人、日期这些是**查**的，描述与工作指引是
 * **读**的。原来六个字段横铺两列，把最该读的内容挤到了首屏外。
 *
 * 状态与结论都不在这里改：状态只能由底部按钮一步步推进，结论只在「提交审核」那一刻
 * 写入（见 utils/stage_review.py）。这里只显示。
 */
export const StageReviewSidebar = ({
  workspaceSlug,
  projectId,
  detail,
  editable,
  onUpdate,
}: {
  workspaceSlug: string;
  projectId: string;
  detail: TStageReviewDetail;
  editable: boolean;
  onUpdate: (payload: TUpdateStageReviewPayload) => void;
}) => {
  const { t } = useTranslation();
  const isOStage = O_STAGE_KINDS.includes(detail.kind);
  const hasFinishedGoods = detail.kind === EStageReviewKind.O_STAGE_REVIEW;
  const goods = detail.finished_goods;

  return (
    <aside className={cn(
        "flex w-full shrink-0 flex-col gap-4 overflow-y-auto bg-layer-1 px-4 py-4",
        // 窄屏时属性栏落到正文下面，分隔线跟着从左边转到上边
        "border-t border-subtle lg:w-80 lg:border-t-0 lg:border-l"
      )}>
      <Group title={t(`${I18N}.detail.properties`)}>
        <Row label={t(`${I18N}.fields.product`)}>{detail.product_detail?.name ?? "—"}</Row>
        <Row label={t(`${I18N}.fields.stage`)}>{detail.stage_detail?.label ?? "—"}</Row>
        <Row label={t(`${I18N}.fields.leader`)}>
          <RoleMemberSelect
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            reviewId={detail.id}
            role="leader"
            value={detail.leader_id}
            valueDetail={detail.leader_detail}
            disabled={!editable}
            onChange={(userId) => onUpdate({ leader: userId })}
          />
        </Row>
        <Row label={t(`${I18N}.fields.auditor`)}>
          <RoleMemberSelect
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            reviewId={detail.id}
            role="auditor"
            value={detail.auditor_id}
            valueDetail={detail.auditor_detail}
            disabled={!editable}
            onChange={(userId) => onUpdate({ auditor: userId })}
          />
        </Row>
        <Row label={t(`${I18N}.fields.plan_date`)}>
          {editable ? (
            <span className="flex items-center gap-1">
              <DateDropdown
                value={getDate(detail.start_date)}
                // 开始不能晚于结束，反过来同理 —— 后端 clean() 也会拦，这里先挡住
                maxDate={getDate(detail.end_date)}
                onChange={(value) => onUpdate({ start_date: value ? renderFormattedPayloadDate(value) : null })}
                placeholder={t(`${I18N}.fields.start_date`)}
                buttonVariant="transparent-with-text"
                buttonClassName="px-1 text-13"
                hideIcon
                isClearable
              />
              <span className="text-tertiary">→</span>
              <DateDropdown
                value={getDate(detail.end_date)}
                minDate={getDate(detail.start_date)}
                onChange={(value) => onUpdate({ end_date: value ? renderFormattedPayloadDate(value) : null })}
                placeholder={t(`${I18N}.fields.end_date`)}
                buttonVariant="transparent-with-text"
                buttonClassName="px-1 text-13"
                hideIcon
                isClearable
              />
            </span>
          ) : (
            <span className="tabular-nums">
              {detail.start_date || detail.end_date
                ? `${detail.start_date ? renderFormattedDate(detail.start_date) : "—"} → ${
                    detail.end_date ? renderFormattedDate(detail.end_date) : "—"
                  }`
                : "—"}
            </span>
          )}
        </Row>
      </Group>

      <span className="border-t border-subtle" />

      <Group title={t(`${I18N}.detail.conclusion`)}>
        <Row label={t(`${I18N}.table.result`)}>
          {detail.result ? (
            <StageReviewResultBadge result={detail.result} />
          ) : (
            <span className="text-13 text-tertiary">{t(`${I18N}.detail.result_pending`)}</span>
          )}
        </Row>
        {isOStage && detail.production_mode && (
          <Row label={t(`${I18N}.submit.production_mode`)}>
            {t(`${I18N}.production_mode.${detail.production_mode}`)}
          </Row>
        )}
        {isOStage && detail.shipment_assessment && (
          <Row label={t(`${I18N}.submit.shipment_assessment`)}>
            {t(`${I18N}.shipment_assessment.${detail.shipment_assessment}`)}
          </Row>
        )}
      </Group>

      {hasFinishedGoods && (
        <>
          <span className="border-t border-subtle" />
          <Group title={t(`${I18N}.detail.finished_goods`)}>
            <Row label={t(`${I18N}.fields.akf_code`)}>
              <InlineText
                value={goods.akf_code}
                mono
                editable={editable}
                placeholder="AKF…"
                onCommit={(next) => onUpdate({ akf_code: next })}
              />
            </Row>
            <Row label={t(`${I18N}.fields.production_quantity`)}>
              <InlineText
                value={goods.production_quantity === null ? "" : String(goods.production_quantity)}
                mono
                editable={editable}
                placeholder="0"
                onCommit={(next) => {
                  const parsed = Number(next.replace(/[,\s]/g, ""));
                  // 填了非数字就当没改：那一列是 PositiveInteger，送过去只会拿到 400
                  if (next.trim() === "") onUpdate({ production_quantity: null });
                  else if (Number.isFinite(parsed) && parsed >= 0) onUpdate({ production_quantity: parsed });
                }}
              />
            </Row>
            <Row label={t(`${I18N}.fields.product_config`)}>
              <InlineText
                value={goods.product_config}
                mono
                editable={editable}
                placeholder="KF…"
                onCommit={(next) => onUpdate({ product_config: next })}
              />
            </Row>
            <Row label={t(`${I18N}.fields.baseline_archive_code`)}>
              <InlineText
                value={goods.baseline_archive_code}
                mono
                editable={editable}
                placeholder="PDL-…"
                onCommit={(next) => onUpdate({ baseline_archive_code: next })}
              />
            </Row>
            <Row label={t(`${I18N}.fields.components`)}>
              {editable ? (
                <InlineText
                  // 四个固定值的场景，做成标签编辑器不划算，用顿号分隔
                  value={goods.components.join("、")}
                  editable
                  placeholder={t(`${I18N}.detail.components_placeholder`)}
                  onCommit={(next) =>
                    onUpdate({
                      components: next
                        .split(/[、,，]/)
                        .map((item) => item.trim())
                        .filter(Boolean),
                    })
                  }
                />
              ) : goods.components.length === 0 ? (
                <span className="text-13 text-tertiary">—</span>
              ) : (
                <span className="flex flex-wrap gap-1.5">
                  {goods.components.map((component) => (
                    <span key={component} className="rounded border border-subtle px-1.5 py-0.5 text-11 text-secondary">
                      {component}
                    </span>
                  ))}
                </span>
              )}
            </Row>
          </Group>

          <Group title={t(`${I18N}.detail.component_versions`)}>
            {editable ? (
              <textarea
                defaultValue={detail.component_versions.version}
                placeholder={t(`${I18N}.detail.component_version_placeholder`)}
                onBlur={(event) => {
                  if (event.target.value !== detail.component_versions.version) {
                    onUpdate({ component_version: event.target.value });
                  }
                }}
                className={cn(
                  "min-h-16 w-full rounded-lg border border-subtle bg-surface-1 px-2.5 py-2 text-12 leading-relaxed",
                  "text-primary placeholder:text-tertiary focus:border-accent-strong focus:outline-none"
                )}
              />
            ) : (
              <p className="text-12 leading-relaxed whitespace-pre-line text-secondary">
                {detail.component_versions.version || "—"}
              </p>
            )}
          </Group>
        </>
      )}

      <span className="border-t border-subtle" />

      <Group title={t(`${I18N}.detail.source`)}>
        <Row>
          <span className="flex items-center gap-1.5 text-12 text-secondary">
            <UserRound className="size-3.5 text-tertiary" />
            {detail.is_manual ? t(`${I18N}.detail.source_manual`) : t(`${I18N}.detail.source_tailoring`)}
          </span>
        </Row>
        {/* 角色名是模板快照：负责人没解析出人时，至少知道该去找哪个岗位 */}
        {(detail.leader_role || detail.auditor_role) && (
          <Row>
            <span className="text-12 leading-relaxed text-tertiary">
              {[
                detail.leader_role && t(`${I18N}.detail.role_leader`, { role: detail.leader_role }),
                detail.auditor_role && t(`${I18N}.detail.role_auditor`, { role: detail.auditor_role }),
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </Row>
        )}
        <Row>
          <span className="text-12 tabular-nums text-tertiary">
            {t(`${I18N}.detail.created_at`, { date: renderFormattedDate(detail.created_at) })}
          </span>
        </Row>
      </Group>
    </aside>
  );
};
