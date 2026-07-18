/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { Check, ChevronDown, UsersRound } from "lucide-react";
import { PROJECT_ERROR_MESSAGES, isProjectPermissionError } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { ChevronDownIcon, CloseIcon, PlusIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IProjectRole } from "@plane/types";
import { EUserProjectRoles } from "@plane/types";
import { Avatar, CustomSearchSelect, EModalPosition, EModalWidth, ModalCore, MultiSelectDropdown } from "@plane/ui";
import { getFileURL } from "@plane/utils";
import { useMember } from "@/hooks/store/use-member";
import { useProjectGroups } from "@/hooks/store/use-project-groups";
import { useProjectRoles } from "@/hooks/store/use-project-roles";
import { TeamMemberPicker } from "./team-member-picker";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  projectId: string;
  workspaceSlug: string;
};

type TMemberForm = {
  role_ids: string[];
  member_id: string;
};

type FormValues = {
  members: TMemberForm[];
};

const emptyMember = (): TMemberForm => ({ role_ids: [], member_id: "" });
const defaultValues: FormValues = { members: [emptyMember()] };

export const SendProjectInvitationModal = observer(function SendProjectInvitationModal({
  isOpen,
  onClose,
  onSuccess,
  projectId,
  workspaceSlug,
}: Props) {
  const { t } = useTranslation();
  const [view, setView] = useState<"form" | "team-picker">("form");
  const {
    project: { getProjectMemberDetails, bulkAddMembersToProject },
    workspace: { workspaceMemberIds, getWorkspaceMemberDetails },
  } = useMember();
  const { roles, isLoading: isRolesLoading, fetchRoles } = useProjectRoles(workspaceSlug, projectId);
  const {
    groups,
    isLoading: isGroupsLoading,
    error: groupsError,
    fetchGroups,
    getGroupMembers,
    loadGroupMembers,
  } = useProjectGroups(workspaceSlug, projectId);

  const {
    formState: { errors, isSubmitting },
    reset,
    handleSubmit,
    control,
    getValues,
  } = useForm<FormValues>({ defaultValues });
  const { fields, append, remove, replace } = useFieldArray({ control, name: "members" });
  const watchedMembers = useWatch({ control, name: "members" }) ?? [];

  const uninvitedPeople = useMemo(
    () =>
      workspaceMemberIds?.filter((userId) => {
        const projectMemberDetails = getProjectMemberDetails(userId, projectId);
        const isInvited = projectMemberDetails?.member.id && projectMemberDetails?.original_role;
        return !isInvited;
      }) ?? [],
    [getProjectMemberDetails, projectId, workspaceMemberIds]
  );
  const selectedMemberIds = new Set(
    watchedMembers.map((item) => item?.member_id).filter((memberId): memberId is string => Boolean(memberId))
  );
  const roleOptions = useMemo(() => roles.map((role) => ({ value: role.id, data: role })), [roles]);

  const getInheritedRoles = (memberId: string): { groupName: string; roles: IProjectRole[] }[] => {
    if (!memberId) return [];
    const member = getWorkspaceMemberDetails(memberId);
    if (!member) return [];
    return groups
      .filter((group) => member.group_ids?.includes(group.id) && group.grants.length > 0)
      .map((group) => ({ groupName: group.name, roles: group.grants.map((grant) => grant.role_detail) }));
  };

  const onSubmit = async (formData: FormValues) => {
    if (!workspaceSlug || !projectId || isSubmitting) return;
    const payload = {
      members: formData.members.map((member) => ({
        member_id: member.member_id,
        role: EUserProjectRoles.MEMBER,
        role_ids: member.role_ids ?? [],
      })),
    };

    try {
      await bulkAddMembersToProject(workspaceSlug, projectId, payload);
      onSuccess?.();
      onClose();
      setToast({ title: "成功", type: TOAST_TYPE.SUCCESS, message: "成员添加成功。" });
    } catch (error) {
      if (isProjectPermissionError(error)) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title),
          message: PROJECT_ERROR_MESSAGES.permissionError.i18n_message
            ? t(PROJECT_ERROR_MESSAGES.permissionError.i18n_message)
            : undefined,
        });
      } else {
        setToast({ type: TOAST_TYPE.ERROR, title: t("common.error.label"), message: "出现错误，请重试。" });
      }
    } finally {
      reset(defaultValues);
      setView("form");
    }
  };

  const handleClose = () => {
    onClose();
    const timeout = setTimeout(() => {
      reset(defaultValues);
      setView("form");
      clearTimeout(timeout);
    }, 500);
  };

  const handleImportMembers = (memberIds: string[]) => {
    const currentMembers = getValues("members");
    const filledMembers = currentMembers.filter((member) => member.member_id);
    const existingIds = new Set(filledMembers.map((member) => member.member_id));
    const importedMembers = memberIds
      .filter((memberId) => !existingIds.has(memberId))
      .map((memberId) => ({ member_id: memberId, role_ids: [] }));
    replace([...filledMembers, ...importedMembers]);
    setView("form");
  };

  useEffect(() => {
    if (fields.length === 0) append(emptyMember());
  }, [append, fields.length]);

  useEffect(() => {
    if (!isOpen) return;
    void Promise.all([fetchRoles(), fetchGroups()]);
  }, [fetchGroups, fetchRoles, isOpen]);

  const getMemberOptions = (currentMemberId: string) =>
    uninvitedPeople
      .filter((userId) => userId === currentMemberId || !selectedMemberIds.has(userId))
      .map((userId) => {
        const memberDetails = getWorkspaceMemberDetails(userId);
        if (!memberDetails?.member) return undefined;
        return {
          value: memberDetails.member.id,
          query: `${memberDetails.member.first_name} ${memberDetails.member.last_name} ${memberDetails.member.display_name.toLowerCase()} ${memberDetails.member.email}`,
          content: (
            <div className="flex w-full items-center gap-2">
              <Avatar
                name={memberDetails.member.display_name}
                src={getFileURL(memberDetails.member.avatar_url ?? "")}
              />
              <div className="min-w-0">
                <p className="truncate text-13 text-primary">{memberDetails.member.display_name}</p>
                <p className="truncate text-11 text-tertiary">{memberDetails.member.email}</p>
              </div>
            </div>
          ),
        };
      })
      .filter((option): option is NonNullable<typeof option> => Boolean(option));

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={handleClose}
      position={EModalPosition.CENTER}
      width={view === "team-picker" ? EModalWidth.XXXXL : EModalWidth.XXXL}
    >
      {view === "team-picker" ? (
        <TeamMemberPicker
          groups={groups}
          isGroupsLoading={isGroupsLoading}
          groupsError={groupsError}
          excludedMemberIds={selectedMemberIds}
          getGroupMembers={getGroupMembers}
          loadGroupMembers={loadGroupMembers}
          onBack={() => setView("form")}
          onConfirm={handleImportMembers}
        />
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="flex max-h-[min(85vh,48rem)] flex-col">
          <div className="border-b border-subtle px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-16 font-medium text-primary">
                  {t("project_settings.members.invite_members.title")}
                </h3>
              </div>
              <Button
                variant="secondary"
                type="button"
                prependIcon={<UsersRound />}
                onClick={() => setView("team-picker")}
              >
                从团队导入
              </Button>
            </div>
          </div>

          <div className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div className="space-y-3">
              {fields.map((field, index) => {
                const memberId = watchedMembers[index]?.member_id ?? "";
                const inheritedRoles = getInheritedRoles(memberId);
                return (
                  <div key={field.id}>
                    <div className="grid grid-cols-[minmax(0,1fr)_18rem_1.5rem] items-start gap-3">
                      <div className="flex min-w-0 flex-col gap-1">
                        <Controller
                          control={control}
                          name={`members.${index}.member_id`}
                          rules={{ required: "请选择成员" }}
                          render={({ field: { value, onChange } }) => {
                            const selectedMember = getWorkspaceMemberDetails(value);
                            return (
                              <CustomSearchSelect
                                value={value}
                                customButton={
                                  <button
                                    type="button"
                                    className="flex w-full items-center justify-between gap-2 rounded-md border border-subtle px-3 py-2 text-left text-13 text-secondary shadow-sm hover:bg-layer-1 hover:text-primary focus:outline-none"
                                  >
                                    {value ? (
                                      <div className="flex min-w-0 items-center gap-2">
                                        <Avatar
                                          name={selectedMember?.member.display_name}
                                          src={getFileURL(selectedMember?.member.avatar_url ?? "")}
                                        />
                                        <span className="truncate">{selectedMember?.member.display_name}</span>
                                      </div>
                                    ) : (
                                      <span className="py-0.5">选择成员</span>
                                    )}
                                    <ChevronDownIcon className="size-3 shrink-0" aria-hidden="true" />
                                  </button>
                                }
                                onChange={onChange}
                                options={getMemberOptions(value)}
                                optionsClassName="w-72"
                              />
                            );
                          }}
                        />
                        {errors.members?.[index]?.member_id && (
                          <span className="px-1 text-11 text-danger-primary">
                            {errors.members[index]?.member_id?.message}
                          </span>
                        )}
                      </div>

                      <Controller
                        name={`members.${index}.role_ids`}
                        control={control}
                        render={({ field: roleField }) => {
                          const selectedIds = roleField.value ?? [];
                          const selectedNames = roles
                            .filter((role) => selectedIds.includes(role.id))
                            .map((role) => role.name);
                          const buttonLabel = isRolesLoading
                            ? "加载中…"
                            : selectedNames.length === 0
                              ? "选择角色"
                              : selectedNames.length === 1
                                ? selectedNames[0]
                                : `${selectedNames[0]} +${selectedNames.length - 1}`;
                          return (
                            <MultiSelectDropdown
                              value={selectedIds}
                              onChange={roleField.onChange}
                              options={roleOptions}
                              disableSorting
                              disabled={isRolesLoading}
                              keyExtractor={(option) => option.data.id}
                              queryArray={["name"]}
                              inputPlaceholder="搜索角色…"
                              containerClassName="w-full"
                              buttonContainerClassName="w-full"
                              optionsContainerClassName="w-72"
                              buttonContent={() => (
                                <div className="flex w-full items-center justify-between gap-1 rounded-md border border-subtle px-3 py-2.5 text-left text-13 text-secondary shadow-sm hover:bg-layer-1 hover:text-primary">
                                  <span className="truncate">{buttonLabel}</span>
                                  <ChevronDown className="size-3 shrink-0" aria-hidden="true" />
                                </div>
                              )}
                              renderItem={({ value, selected }) => {
                                const role = roles.find((item) => item.id === value);
                                if (!role) return null;
                                return (
                                  <div className="flex w-full items-center justify-between gap-2 truncate text-13">
                                    <span className="truncate">{role.name}</span>
                                    {selected && <Check className="size-3 shrink-0" />}
                                  </div>
                                );
                              }}
                            />
                          );
                        }}
                      />

                      <button
                        type="button"
                        onClick={() => remove(index)}
                        disabled={fields.length === 1}
                        className="mt-2 flex size-6 items-center justify-center rounded text-placeholder hover:bg-layer-1-hover hover:text-primary disabled:invisible"
                        aria-label="移除成员"
                      >
                        <CloseIcon className="size-4" />
                      </button>
                    </div>

                    {memberId && (
                      <div className="mt-2 border-t border-subtle pt-2 text-11">
                        {inheritedRoles.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-secondary">
                            <span className="text-tertiary">将继承</span>
                            {inheritedRoles.map((source) => (
                              <span
                                key={source.groupName}
                                className="rounded-full bg-accent-subtle px-2 py-0.5 text-accent-primary"
                              >
                                {source.roles.map((role) => role.name).join("、")} · {source.groupName}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-tertiary">当前没有可继承的团队角色；仍可不分配直接角色。</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-subtle px-5 py-4">
            <button
              type="button"
              className="flex items-center gap-2 bg-transparent py-2 pr-3 text-13 font-medium text-accent-primary outline-accent-strong"
              onClick={() => append(emptyMember())}
            >
              <PlusIcon className="size-4" />
              {t("common.add_more")}
            </button>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="lg" onClick={handleClose}>
                {t("cancel")}
              </Button>
              <Button variant="primary" size="lg" type="submit" loading={isSubmitting}>
                {isSubmitting
                  ? `${fields.length > 1 ? t("add_members") : t("add_member")}…`
                  : fields.length > 1
                    ? t("add_members")
                    : t("add_member")}
              </Button>
            </div>
          </div>
        </form>
      )}
    </ModalCore>
  );
});
