/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * 项目需求网格里的「阶段」列。两端派生、中间人工：
 *
 * - 已立项 / 已排期 / 已发布由服务端按关联事实重算（见后端
 *   utils/requirement_project.recalculate_stage），手填不了。
 * - 研发中 / 研发完毕只由人写 —— 「东西做没做完」没有任何关联事实能可靠推断。
 *   有 onChange 且未锁定时这一列是下拉，否则退回只读胶囊。
 *
 * 下拉可选项只有三项（MANUAL_REQUIREMENT_PROJECT_STAGES）：研发中、研发完毕，
 * 外加「已排期」当撤销键 —— 服务端收到它会走归一，没有迭代关联的会落回已立项，
 * 所以调用方要用返回值刷新，不能乐观地按选中值渲染。
 *
 * 锁定（locked）= 需求挂在在途发布单上。此时整行阶段不可改，服务端同样会以
 * REQUIREMENT_IN_LIVE_RELEASE 拒绝 —— 想改先从发布单里移出去。
 *
 * 阶段与 Requirement.status（全局交付进度）是正交的两根轴：同一条需求可以在 A 项目
 * 已发布、在 B 项目还没开工，所以它长在关联行上而不是需求本体上。
 */
import { useTranslation } from "@plane/i18n";
import type { TRequirementProjectStage } from "@plane/types";
import { MANUAL_REQUIREMENT_PROJECT_STAGES } from "@plane/types";
import { CustomSelect, Tooltip } from "@plane/ui";
import { cn } from "@plane/utils";

/** 阶段是有序推进的，配色跟着「越靠后越接近完成」走 */
export const REQUIREMENT_STAGE_PILL: Record<TRequirementProjectStage, string> = {
  linked: "bg-layer-3 text-secondary",
  planned: "bg-accent-subtle text-accent-primary",
  in_progress: "bg-warning-subtle text-warning-primary",
  done: "bg-success-subtle text-success-primary",
  released: "bg-success-subtle text-success-primary",
};

/** chip 变体的色点。底色换成白底描边后，档位差别改由这颗点承担 */
const REQUIREMENT_STAGE_DOT: Record<TRequirementProjectStage, string> = {
  linked: "bg-tertiary",
  planned: "bg-accent-primary",
  in_progress: "bg-warning-primary",
  done: "bg-success-primary",
  released: "bg-success-primary",
};

/**
 * pill = 密集网格里的着色胶囊（项目需求网格在用）。
 * chip = 与工作项行右侧 DropdownButton（border-with-text）同壳：
 * h-5 / rounded-sm / border-[0.5px] border-strong / px-1.5 / caption，
 * 色点承担档位差异。用在「一行工作项/需求」并排出现的地方（迭代范围页）。
 */
export type TRequirementStageVariant = "pill" | "chip";

type TProps = {
  stage: TRequirementProjectStage;
  /** 最新有效迭代关联的迭代名；planned 档的推导依据，无名字时回退到 linked 文案 */
  latestCycleName?: string | null;
  /** 最新在途/已发布发布单名；released 档的推导依据 */
  latestReleaseName?: string | null;
  /** 已排期但关联迭代已结束。时间盒到期不降档，只加黄点并在 tooltip 里说明 */
  carryover?: boolean;
  /** 传了才是下拉；不传恒只读（容器列表、无权限的行都走这条） */
  onChange?: (stage: TRequirementProjectStage) => void;
  /** 挂在在途发布单上，或正在提交中 */
  locked?: boolean;
  /** 锁定原因，追加进 tooltip */
  lockedReason?: string;
  variant?: TRequirementStageVariant;
};

export const ProjectRequirementStageCell = ({
  stage,
  latestCycleName,
  latestReleaseName,
  carryover = false,
  onChange,
  locked = false,
  lockedReason,
  variant = "pill",
}: TProps) => {
  const { t } = useTranslation();

  /** 推导依据。带名字的档在名字缺失时回退到「已关联到本项目」，不留空洞 */
  const reason = (() => {
    switch (stage) {
      case "planned":
        return latestCycleName
          ? t("project_requirements.stage_reason.planned", { name: latestCycleName })
          : t("project_requirements.stage_reason.linked");
      case "released":
        return latestReleaseName
          ? t("project_requirements.stage_reason.released", { name: latestReleaseName })
          : t("project_requirements.stage_reason.linked");
      default:
        // linked / in_progress / done 的文案不带插值
        return t(`project_requirements.stage_reason.${stage}`);
    }
  })();

  const showCarryover = stage === "planned" && carryover;
  const tooltipContent = [
    reason,
    showCarryover ? t("project_requirements.stage_carryover") : null,
    locked ? (lockedReason ?? t("project_requirements.stage_locked_hint")) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const pill = (
    <span className="inline-flex max-w-full items-center gap-1">
      {variant === "chip" ? (
        <span className="inline-flex h-5 min-w-0 max-w-full items-center gap-1.5 whitespace-nowrap rounded-sm border-[0.5px] border-strong px-1.5 text-caption-md-medium text-secondary">
          <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", REQUIREMENT_STAGE_DOT[stage])} />
          <span className="truncate">{t(`project_requirements.stage.${stage}`)}</span>
        </span>
      ) : (
        <span
          className={cn(
            "inline-flex h-5 min-w-0 max-w-full items-center gap-1 whitespace-nowrap rounded px-1.5 text-11 font-medium",
            REQUIREMENT_STAGE_PILL[stage]
          )}
        >
          <span className="truncate">{t(`project_requirements.stage.${stage}`)}</span>
        </span>
      )}
      {/* 迭代已结束仍停在已排期：黄点提醒，不降档（carryover 语义） */}
      {showCarryover && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-warning-primary" />}
    </span>
  );

  if (!onChange || locked)
    return (
      <Tooltip tooltipContent={tooltipContent} position="top">
        {pill}
      </Tooltip>
    );

  return (
    <CustomSelect
      customButton={
        <Tooltip tooltipContent={tooltipContent} position="top">
          <span className="cursor-pointer">{pill}</span>
        </Tooltip>
      }
      value={stage}
      onChange={(next: TRequirementProjectStage) => onChange(next)}
      maxHeight="lg"
    >
      {MANUAL_REQUIREMENT_PROJECT_STAGES.map((option) => (
        <CustomSelect.Option key={option} value={option}>
          <div className="flex items-center gap-2">
            <span
              className={cn("inline-flex h-4 w-1 shrink-0 rounded-full", REQUIREMENT_STAGE_PILL[option])}
              aria-hidden
            />
            {t(`project_requirements.stage.${option}`)}
          </div>
        </CustomSelect.Option>
      ))}
    </CustomSelect>
  );
};
