import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Controller } from "react-hook-form";
import {
  CircleDot,
  Database,
  GitFork,
  Layers3,
  Package,
  Paperclip,
  SignalHigh,
  UserCircle2,
  Users,
} from "lucide-react";
import { PriorityIcon } from "@plane/propel/icons";
import { CustomSelect, Input } from "@plane/ui";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { useProductMembers } from "@/hooks/store/use-product-members";
import type { useStructuredRequirementDraft } from "@/hooks/store/use-structured-requirement-draft";
import type { TRequirementModule, TRequirementStatus } from "@/services/requirement.service";
import { RequirementAttachmentsField } from "./requirement-attachments-field";
import { RequirementStatusBadge } from "./requirement-review-panels";

type TDraftSession = ReturnType<typeof useStructuredRequirementDraft>;

const priorities = [
  { value: "urgent" as const, label: "紧急" },
  { value: "high" as const, label: "高" },
  { value: "medium" as const, label: "中" },
  { value: "low" as const, label: "低" },
  { value: "none" as const, label: "无" },
];

function PropertyField(props: { icon: typeof SignalHigh; label: string; children: ReactNode }) {
  const { children, icon: Icon, label } = props;
  return (
    <div className="grid gap-1.5 py-2.5">
      <label className="flex items-center gap-1.5 text-11 font-medium text-secondary">
        <Icon className="size-3.5 text-tertiary" />
        {label}
      </label>
      {children}
    </div>
  );
}

export function StructuredRequirementInfoEditor(props: {
  workspaceSlug: string;
  productId: string;
  requirementId: string;
  status: TRequirementStatus;
  currentVersion: number;
  modules: TRequirementModule[];
  session: TDraftSession;
  fetchParentOptions: (search?: string, exclude?: string) => Promise<{ id: string; name: string }[]>;
  children?: ReactNode;
}) {
  const {
    children,
    currentVersion,
    fetchParentOptions,
    modules,
    productId,
    requirementId,
    session,
    status,
    workspaceSlug,
  } = props;
  const [parentOptions, setParentOptions] = useState<{ id: string; name: string }[]>([]);
  const { eligibleMembers, fetchMembers } = useProductMembers(workspaceSlug, productId);
  const eligibleMemberIds = useMemo(() => eligibleMembers.map((member) => member.id), [eligibleMembers]);
  const {
    control,
    formState: { errors },
  } = session.form;

  useEffect(() => {
    void Promise.all([fetchMembers(), fetchParentOptions(undefined, requirementId)])
      .then(([, options]) => setParentOptions(options))
      .catch(() => undefined);
  }, [fetchMembers, fetchParentOptions, requirementId]);

  return (
    <div className="vertical-scrollbar flex h-full w-full overflow-auto">
      <div className="relative h-full min-w-0 flex-1 space-y-6 overflow-auto p-4 py-5">
        <section>
          <label htmlFor="structured-requirement-name" className="mb-1.5 block text-12 font-medium text-secondary">
            需求名称
          </label>
          <Controller
            name="name"
            control={control}
            rules={{ required: "请输入需求名称", maxLength: { value: 255, message: "不能超过 255 个字符" } }}
            render={({ field }) => (
              <Input
                {...field}
                id="structured-requirement-name"
                hasError={!!errors.name}
                placeholder="用一句话概括这个研发需求"
                className="h-10 w-full max-w-3xl text-14"
              />
            )}
          />
          {errors.name?.message && <p className="mt-1 text-11 text-danger-primary">{errors.name.message}</p>}
          <p className="mt-2 text-11 text-tertiary">基础信息会自动保存到当前修订草稿。</p>
        </section>

        {children}
      </div>

      <aside className="vertical-scrollbar scrollbar-sm h-full w-[400px] shrink-0 overflow-auto border-l border-subtle p-4 py-5">
        <h2 className="text-body-sm-semibold text-primary">属性</h2>
        <div className="mt-3 divide-y divide-subtle">
          <PropertyField icon={CircleDot} label="状态">
            <div className="flex h-9 items-center rounded-md border border-subtle bg-layer-1 px-3">
              <RequirementStatusBadge status={status} plain />
            </div>
          </PropertyField>
          <PropertyField icon={Layers3} label="当前版本">
            <div className="flex h-9 items-center rounded-md border border-subtle bg-layer-1 px-3 text-12 text-secondary">
              {currentVersion > 0 ? `V${currentVersion}` : "尚未生效"}
            </div>
          </PropertyField>
          <PropertyField icon={Database} label="内容模式">
            <div className="flex h-9 items-center rounded-md border border-subtle bg-layer-1 px-3 text-12 text-secondary">
              结构化需求
            </div>
          </PropertyField>
          <PropertyField icon={SignalHigh} label="优先级">
            <Controller
              name="priority"
              control={control}
              render={({ field }) => (
                <CustomSelect
                  value={field.value}
                  onChange={field.onChange}
                  label={
                    <span className="flex items-center gap-1.5">
                      <PriorityIcon priority={field.value} size={12} withContainer />
                      {priorities.find((item) => item.value === field.value)?.label ?? "无"}
                    </span>
                  }
                  buttonClassName="h-9 w-full"
                >
                  {priorities.map((item) => (
                    <CustomSelect.Option key={item.value} value={item.value}>
                      <span className="flex items-center gap-1.5">
                        <PriorityIcon priority={item.value} size={12} withContainer />
                        {item.label}
                      </span>
                    </CustomSelect.Option>
                  ))}
                </CustomSelect>
              )}
            />
          </PropertyField>
          <PropertyField icon={Package} label="所属模块">
            <Controller
              name="module"
              control={control}
              render={({ field }) => (
                <CustomSelect
                  value={field.value ?? ""}
                  onChange={(value: string) => field.onChange(value || null)}
                  label={modules.find((item) => item.id === field.value)?.name ?? "未分配"}
                  buttonClassName="h-9 w-full"
                >
                  <CustomSelect.Option value="">未分配</CustomSelect.Option>
                  {modules.map((item) => (
                    <CustomSelect.Option key={item.id} value={item.id}>
                      {item.name}
                    </CustomSelect.Option>
                  ))}
                </CustomSelect>
              )}
            />
          </PropertyField>
          <PropertyField icon={GitFork} label="父需求">
            <Controller
              name="parent"
              control={control}
              render={({ field }) => (
                <CustomSelect
                  value={field.value ?? ""}
                  onChange={(value: string) => field.onChange(value || null)}
                  label={parentOptions.find((item) => item.id === field.value)?.name ?? "无父需求"}
                  buttonClassName="h-9 w-full"
                >
                  <CustomSelect.Option value="">无父需求</CustomSelect.Option>
                  {parentOptions.map((item) => (
                    <CustomSelect.Option key={item.id} value={item.id}>
                      {item.name}
                    </CustomSelect.Option>
                  ))}
                </CustomSelect>
              )}
            />
          </PropertyField>
          <PropertyField icon={UserCircle2} label="负责人">
            <Controller
              name="assignee"
              control={control}
              render={({ field }) => (
                <MemberDropdown
                  memberIds={eligibleMemberIds}
                  value={field.value ?? null}
                  onChange={field.onChange}
                  multiple={false}
                  placeholder="未分配"
                  buttonVariant="border-with-text"
                  buttonContainerClassName="w-full"
                  buttonClassName="h-9 w-full justify-start"
                />
              )}
            />
          </PropertyField>
          <PropertyField icon={Users} label="评审人">
            <Controller
              name="reviewers"
              control={control}
              render={({ field }) => (
                <MemberDropdown
                  memberIds={eligibleMemberIds}
                  value={field.value ?? []}
                  onChange={field.onChange}
                  multiple
                  placeholder="选择评审人"
                  buttonVariant="border-with-text"
                  buttonContainerClassName="w-full"
                  buttonClassName="min-h-9 w-full justify-start"
                />
              )}
            />
            {errors.reviewers?.message && (
              <p className="mt-1 text-11 text-danger-primary">{errors.reviewers.message}</p>
            )}
          </PropertyField>
        </div>

        <section className="mt-5 border-t border-subtle pt-5">
          <h3 className="mb-2 flex items-center gap-1.5 text-12 font-medium text-secondary">
            <Paperclip className="size-3.5 text-tertiary" />
            附件
          </h3>
          <RequirementAttachmentsField
            workspaceSlug={workspaceSlug}
            productId={productId}
            requirementId={requirementId}
            attachments={session.attachments}
            onUpload={session.addAttachment}
            onRemove={session.removeAttachment}
          />
        </section>
      </aside>
    </div>
  );
}
