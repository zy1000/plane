"""需求变更审批与版本管理的契约测试。

覆盖的链路：首次发布（通过 / 驳回）、后续变更（工作副本隔离 / 通过 / 驳回）、
多人审批规则（ALL / N_OF_M / 任一拒绝）、审批期与已发布态禁写、撤回草稿的两种
语义、版本号递增、回滚。
"""

from uuid import uuid4

import pytest
from django.urls import reverse
from rest_framework import status

from plane.db.models import (
    Product,
    ProductMember,
    Requirement,
    RequirementApprovalAction,
    RequirementApprovalType,
    RequirementApprover,
    RequirementChangeStatus,
    RequirementChangeTargetKind,
    RequirementChangeType,
    RequirementDetail,
    RequirementDraft,
    RequirementDraftDetail,
    RequirementField,
    RequirementFieldType,
    RequirementStatus,
    RequirementVersion,
    WorkspaceMember,
)
from plane.tests.factories import UserFactory, WorkspaceFactory


@pytest.mark.contract
@pytest.mark.django_db
class TestRequirementChangeApp:
    def setup_method(self):
        self.owner = UserFactory(username=f"change-owner-{uuid4()}")
        self.workspace = WorkspaceFactory(owner=self.owner)
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            member=self.owner,
            role=20,
        )
        self.product = Product.objects.create(
            name=f"Change product {uuid4()}",
            workspace=self.workspace,
            owner=self.owner,
        )

    def add_member(self, role=15):
        user = UserFactory(username=f"change-member-{uuid4()}")
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            member=user,
            role=role,
        )
        ProductMember.objects.create(product=self.product, member=user)
        return user

    def create_requirement(self, *approvers, approval_type=None, required_count=None):
        requirement = Requirement.objects.create(
            workspace=self.workspace,
            product=self.product,
            title=f"Requirement {uuid4()}",
            owner=self.owner,
            approval_type=approval_type or RequirementApprovalType.ANY,
            required_count=required_count,
        )
        for index, approver in enumerate(approvers):
            RequirementApprover.objects.create(
                requirement=requirement,
                approver=approver,
                sort_order=index,
            )
        return requirement

    def add_field(self, requirement, name="Summary", **kwargs):
        return RequirementField.objects.create(
            requirement=requirement,
            name=name,
            field_type=kwargs.pop("field_type", RequirementFieldType.TEXT),
            **kwargs,
        )

    # --- URL helpers -----------------------------------------------------

    def url(self, name, **kwargs):
        return reverse(
            name,
            kwargs={"slug": self.workspace.slug, **kwargs},
        )

    def working_copy_url(self, requirement):
        return self.url("requirement-working-copy", requirement_id=requirement.id)

    def submit_url(self, requirement):
        return self.url(
            "requirement-change-request-submit", requirement_id=requirement.id
        )

    def act_url(self, requirement, change_request_id):
        return self.url(
            "requirement-change-request-act",
            requirement_id=requirement.id,
            pk=change_request_id,
        )

    def details_url(self, requirement):
        return self.url("requirement-details", requirement_id=requirement.id)

    def configuration_url(self, requirement):
        return self.url("requirement-configuration", pk=requirement.id)

    # --- flows -----------------------------------------------------------

    def submit(self, api_client, requirement, reason="变更原因"):
        return api_client.post(
            self.submit_url(requirement),
            {"reason": reason},
            format="json",
        )

    def approve(self, api_client, requirement, change_request_id, approver, comment=""):
        api_client.force_authenticate(user=approver)
        return api_client.post(
            self.act_url(requirement, change_request_id),
            {"action": RequirementApprovalAction.APPROVED, "comment": comment},
            format="json",
        )

    def reject(self, api_client, requirement, change_request_id, approver, comment=""):
        api_client.force_authenticate(user=approver)
        return api_client.post(
            self.act_url(requirement, change_request_id),
            {"action": RequirementApprovalAction.REJECTED, "comment": comment},
            format="json",
        )

    def publish(self, api_client, requirement, approver):
        """把一个全新需求推到 published，返回变更单 id。"""
        api_client.force_authenticate(user=self.owner)
        submit_response = self.submit(api_client, requirement, reason="首次发布")
        assert submit_response.status_code == status.HTTP_201_CREATED
        change_request_id = submit_response.data["id"]
        assert self.approve(
            api_client, requirement, change_request_id, approver
        ).status_code == status.HTTP_200_OK
        api_client.force_authenticate(user=self.owner)
        requirement.refresh_from_db()
        assert requirement.status == RequirementStatus.PUBLISHED
        return change_request_id

    def test_initial_publish_creates_first_version_and_freezes_content(
        self, api_client
    ):
        approver = self.add_member()
        requirement = self.create_requirement(approver)
        field = self.add_field(requirement)
        RequirementDetail.objects.create(
            requirement=requirement,
            data={str(field.id): "First"},
        )
        api_client.force_authenticate(user=self.owner)

        submit_response = self.submit(api_client, requirement, reason="首次发布")
        assert submit_response.status_code == status.HTTP_201_CREATED
        change_request_id = submit_response.data["id"]
        assert submit_response.data["request_kind"] == "initial_publish"
        assert submit_response.data["base_version"] is None
        # 首次发布没有基线，字段与明细都是新增
        assert submit_response.data["created_count"] == 2
        assert submit_response.data["updated_count"] == 0
        assert submit_response.data["deleted_count"] == 0

        requirement.refresh_from_db()
        assert requirement.status == RequirementStatus.IN_REVIEW

        # 审批期禁写
        assert (
            api_client.post(
                self.details_url(requirement),
                {"data": {str(field.id): "Blocked"}},
                format="json",
            ).status_code
            == status.HTTP_409_CONFLICT
        )

        approve_response = self.approve(
            api_client, requirement, change_request_id, approver, comment="同意"
        )
        assert approve_response.status_code == status.HTTP_200_OK
        assert approve_response.data["status"] == RequirementChangeStatus.APPROVED

        requirement.refresh_from_db()
        assert requirement.status == RequirementStatus.PUBLISHED
        assert requirement.current_version == 1

        version = RequirementVersion.objects.get(requirement=requirement, version=1)
        assert version.change_type == RequirementChangeType.CREATE
        assert version.snapshot["requirement"]["title"] == requirement.title
        assert [row["data"] for row in version.snapshot["details"]] == [
            {str(field.id): "First"}
        ]
        assert [str(item) for item in version.approved_by] == [str(approver.id)]

        # 已发布态禁写
        api_client.force_authenticate(user=self.owner)
        published_write = api_client.post(
            self.details_url(requirement),
            {"data": {str(field.id): "Blocked"}},
            format="json",
        )
        assert published_write.status_code == status.HTTP_409_CONFLICT
        assert published_write.data["code"] == "REQUIREMENT_PUBLISHED"

    def test_initial_publish_rejection_returns_to_draft_and_keeps_content(
        self, api_client
    ):
        approver = self.add_member()
        requirement = self.create_requirement(approver)
        field = self.add_field(requirement)
        RequirementDetail.objects.create(
            requirement=requirement,
            data={str(field.id): "Pending"},
        )
        api_client.force_authenticate(user=self.owner)

        change_request_id = self.submit(api_client, requirement).data["id"]
        reject_response = self.reject(
            api_client, requirement, change_request_id, approver, comment="需要补充"
        )
        assert reject_response.status_code == status.HTTP_200_OK
        assert reject_response.data["status"] == RequirementChangeStatus.REJECTED
        assert reject_response.data["rejected_count"] == 1

        requirement.refresh_from_db()
        assert requirement.status == RequirementStatus.DRAFT
        assert requirement.current_version is None
        assert not RequirementVersion.objects.filter(requirement=requirement).exists()

        # 驳回后可以继续改，正式表内容没有被动过
        api_client.force_authenticate(user=self.owner)
        assert RequirementDetail.objects.filter(requirement=requirement).count() == 1
        assert (
            api_client.post(
                self.details_url(requirement),
                {"data": {str(field.id): "Second"}},
                format="json",
            ).status_code
            == status.HTTP_201_CREATED
        )

    def test_change_flow_isolates_working_copy_until_approved(self, api_client):
        approver = self.add_member()
        requirement = self.create_requirement(approver)
        field = self.add_field(requirement)
        published_detail = RequirementDetail.objects.create(
            requirement=requirement,
            data={str(field.id): "Published"},
        )
        self.publish(api_client, requirement, approver)

        edit_response = api_client.post(self.working_copy_url(requirement))
        assert edit_response.status_code == status.HTTP_200_OK
        requirement.refresh_from_db()
        assert requirement.status == RequirementStatus.DRAFT
        assert requirement.current_version == 1

        draft = RequirementDraft.objects.get(requirement=requirement)
        assert draft.base_version == 1
        # 工作副本保留原 UUID，物化时直接复用为正式表主键
        assert [item.id for item in draft.details.all()] == [published_detail.id]

        # 明细的读写都落在工作副本上，正式表原封不动
        patch_response = api_client.patch(
            self.url(
                "requirement-detail-item",
                requirement_id=requirement.id,
                pk=published_detail.id,
            ),
            {"data": {str(field.id): "Changed"}, "version": 1},
            format="json",
        )
        assert patch_response.status_code == status.HTTP_200_OK
        published_detail.refresh_from_db()
        assert published_detail.data == {str(field.id): "Published"}
        assert RequirementDraftDetail.objects.get(
            draft=draft, id=published_detail.id
        ).data == {str(field.id): "Changed"}

        list_response = api_client.get(self.details_url(requirement))
        assert list_response.status_code == status.HTTP_200_OK
        assert [item["data"] for item in list_response.data["results"]] == [
            {str(field.id): "Changed"}
        ]
        assert [str(item["requirement_id"]) for item in list_response.data["results"]] == [
            str(requirement.id)
        ]

        submit_response = self.submit(api_client, requirement, reason="改一个值")
        assert submit_response.status_code == status.HTTP_201_CREATED
        change_request_id = submit_response.data["id"]
        assert submit_response.data["request_kind"] == "change"
        assert submit_response.data["base_version"] == 1
        assert submit_response.data["sequence_id"] == 2
        assert submit_response.data["updated_count"] == 1
        assert submit_response.data["changed_field_ids"] == [str(field.id)]

        detail_response = api_client.get(
            self.url(
                "requirement-change-request-detail",
                requirement_id=requirement.id,
                pk=change_request_id,
            )
        )
        assert detail_response.status_code == status.HTTP_200_OK
        assert detail_response.data["requirement_items"] == []
        assert detail_response.data["schema_items"] == []
        assert detail_response.data["detail_item_count"] == 1

        items_response = api_client.get(
            self.url(
                "requirement-change-request-items",
                requirement_id=requirement.id,
                pk=change_request_id,
            ),
            {"change_type": RequirementChangeType.UPDATE},
        )
        assert items_response.status_code == status.HTTP_200_OK
        assert items_response.data["total_count"] == 1
        item = items_response.data["results"][0]
        assert item["target_kind"] == RequirementChangeTargetKind.DETAIL_DATA
        assert item["before_snapshot"]["data"] == {str(field.id): "Published"}
        assert item["proposed_snapshot"]["data"] == {str(field.id): "Changed"}

        assert self.approve(
            api_client, requirement, change_request_id, approver
        ).status_code == status.HTTP_200_OK

        requirement.refresh_from_db()
        published_detail.refresh_from_db()
        assert requirement.status == RequirementStatus.PUBLISHED
        assert requirement.current_version == 2
        assert published_detail.data == {str(field.id): "Changed"}
        assert not RequirementDraft.objects.filter(requirement=requirement).exists()
        assert list(
            RequirementVersion.objects.filter(requirement=requirement)
            .order_by("version")
            .values_list("version", flat=True)
        ) == [1, 2]

    def test_change_rejection_keeps_working_copy_and_published_content(
        self, api_client
    ):
        approver = self.add_member()
        requirement = self.create_requirement(approver)
        field = self.add_field(requirement)
        published_detail = RequirementDetail.objects.create(
            requirement=requirement,
            data={str(field.id): "Published"},
        )
        self.publish(api_client, requirement, approver)

        api_client.post(self.working_copy_url(requirement))
        api_client.patch(
            self.url(
                "requirement-detail-item",
                requirement_id=requirement.id,
                pk=published_detail.id,
            ),
            {"data": {str(field.id): "Proposed"}, "version": 1},
            format="json",
        )
        change_request_id = self.submit(api_client, requirement).data["id"]
        assert self.reject(
            api_client, requirement, change_request_id, approver
        ).status_code == status.HTTP_200_OK

        requirement.refresh_from_db()
        published_detail.refresh_from_db()
        assert requirement.status == RequirementStatus.DRAFT
        assert requirement.current_version == 1
        assert published_detail.data == {str(field.id): "Published"}

        draft = RequirementDraft.objects.get(requirement=requirement)
        assert RequirementDraftDetail.objects.get(
            draft=draft, id=published_detail.id
        ).data == {str(field.id): "Proposed"}

    def test_all_approval_rule_requires_every_approver(self, api_client):
        first = self.add_member()
        second = self.add_member()
        requirement = self.create_requirement(
            first, second, approval_type=RequirementApprovalType.ALL
        )
        self.add_field(requirement)
        api_client.force_authenticate(user=self.owner)

        change_request_id = self.submit(api_client, requirement).data["id"]
        first_response = self.approve(api_client, requirement, change_request_id, first)
        assert first_response.status_code == status.HTTP_200_OK
        assert first_response.data["status"] == RequirementChangeStatus.PENDING
        assert first_response.data["approved_count"] == 1

        # 同一人不能重复表态
        repeat_response = self.approve(
            api_client, requirement, change_request_id, first
        )
        assert repeat_response.status_code == status.HTTP_409_CONFLICT
        assert repeat_response.data["code"] == "REQUIREMENT_ALREADY_ACTED"

        requirement.refresh_from_db()
        assert requirement.status == RequirementStatus.IN_REVIEW

        second_response = self.approve(
            api_client, requirement, change_request_id, second
        )
        assert second_response.data["status"] == RequirementChangeStatus.APPROVED
        requirement.refresh_from_db()
        assert requirement.status == RequirementStatus.PUBLISHED

    def test_approval_setting_change_takes_effect_from_the_next_request(
        self, api_client
    ):
        original_approver = self.add_member()
        added_approver = self.add_member()
        requirement = self.create_requirement(original_approver)
        self.add_field(requirement)
        self.publish(api_client, requirement, original_approver)

        api_client.force_authenticate(user=self.owner)
        assert (
            api_client.post(self.working_copy_url(requirement)).status_code
            == status.HTTP_200_OK
        )
        configuration = api_client.get(self.configuration_url(requirement)).data
        save_response = api_client.put(
            self.configuration_url(requirement),
            {
                "expected_updated_at": configuration["requirement"]["updated_at"],
                "requirement": {
                    "approval_type": RequirementApprovalType.ALL,
                    "approver_ids": [
                        str(original_approver.id),
                        str(added_approver.id),
                    ],
                },
                "fields": configuration["fields"],
            },
            format="json",
        )
        assert save_response.status_code == status.HTTP_200_OK

        # 修改审批设置的这一单仍由变更前已生效的配置审批。
        submit_response = self.submit(api_client, requirement, reason="调整审批设置")
        assert submit_response.status_code == status.HTTP_201_CREATED
        assert submit_response.data["approval_type"] == RequirementApprovalType.ANY
        assert submit_response.data["required_count"] is None
        assert [
            str(item["approver_id"]) for item in submit_response.data["approvals"]
        ] == [str(original_approver.id)]
        change_request_id = submit_response.data["id"]

        proposed_approver_response = self.approve(
            api_client,
            requirement,
            change_request_id,
            added_approver,
        )
        assert proposed_approver_response.status_code == status.HTTP_409_CONFLICT
        assert (
            proposed_approver_response.data["code"] == "REQUIREMENT_NOT_APPROVER"
        )
        assert (
            self.approve(
                api_client,
                requirement,
                change_request_id,
                original_approver,
            ).data["status"]
            == RequirementChangeStatus.APPROVED
        )

        requirement.refresh_from_db()
        assert requirement.approval_type == RequirementApprovalType.ALL
        assert list(
            requirement.approvers.order_by("sort_order").values_list(
                "approver_id", flat=True
            )
        ) == [original_approver.id, added_approver.id]

        # 上一单通过后，新配置才成为下一份变更单的审批快照。
        api_client.force_authenticate(user=self.owner)
        assert (
            api_client.post(self.working_copy_url(requirement)).status_code
            == status.HTTP_200_OK
        )
        assert (
            api_client.patch(
                self.url("requirement-detail", pk=requirement.id),
                {"title": "下一次变更"},
                format="json",
            ).status_code
            == status.HTTP_200_OK
        )
        next_submit_response = self.submit(
            api_client, requirement, reason="验证新审批设置"
        )
        assert next_submit_response.status_code == status.HTTP_201_CREATED
        assert next_submit_response.data["approval_type"] == RequirementApprovalType.ALL
        assert {
            str(item["approver_id"])
            for item in next_submit_response.data["approvals"]
        } == {str(original_approver.id), str(added_approver.id)}

        next_change_request_id = next_submit_response.data["id"]
        assert (
            self.approve(
                api_client,
                requirement,
                next_change_request_id,
                original_approver,
            ).data["status"]
            == RequirementChangeStatus.PENDING
        )
        assert (
            self.approve(
                api_client,
                requirement,
                next_change_request_id,
                added_approver,
            ).data["status"]
            == RequirementChangeStatus.APPROVED
        )

    def test_n_of_m_rule_and_single_rejection_blocks_the_change(self, api_client):
        first = self.add_member()
        second = self.add_member()
        third = self.add_member()
        requirement = self.create_requirement(
            first,
            second,
            third,
            approval_type=RequirementApprovalType.N_OF_M,
            required_count=2,
        )
        self.add_field(requirement)
        api_client.force_authenticate(user=self.owner)

        change_request_id = self.submit(api_client, requirement).data["id"]
        assert (
            self.approve(api_client, requirement, change_request_id, first).data[
                "status"
            ]
            == RequirementChangeStatus.PENDING
        )
        assert (
            self.approve(api_client, requirement, change_request_id, second).data[
                "status"
            ]
            == RequirementChangeStatus.APPROVED
        )
        requirement.refresh_from_db()
        assert requirement.status == RequirementStatus.PUBLISHED

        # 终态之后不接受任何表态
        late_response = self.approve(
            api_client, requirement, change_request_id, third
        )
        assert late_response.status_code == status.HTTP_409_CONFLICT
        assert late_response.data["code"] == "REQUIREMENT_CHANGE_CLOSED"

        # 换一个需求验证「任一拒绝立即驳回」
        rejected_requirement = self.create_requirement(
            first, second, approval_type=RequirementApprovalType.ALL
        )
        self.add_field(rejected_requirement)
        api_client.force_authenticate(user=self.owner)
        rejected_id = self.submit(api_client, rejected_requirement).data["id"]
        assert self.approve(
            api_client, rejected_requirement, rejected_id, first
        ).status_code == status.HTTP_200_OK
        assert (
            self.reject(api_client, rejected_requirement, rejected_id, second).data[
                "status"
            ]
            == RequirementChangeStatus.REJECTED
        )
        rejected_requirement.refresh_from_db()
        assert rejected_requirement.status == RequirementStatus.DRAFT

    def test_non_approver_cannot_act_and_submitter_can_withdraw(self, api_client):
        approver = self.add_member()
        outsider = self.add_member()
        requirement = self.create_requirement(approver)
        self.add_field(requirement)
        api_client.force_authenticate(user=self.owner)
        change_request_id = self.submit(api_client, requirement).data["id"]

        outsider_response = self.approve(
            api_client, requirement, change_request_id, outsider
        )
        assert outsider_response.status_code == status.HTTP_409_CONFLICT
        assert outsider_response.data["code"] == "REQUIREMENT_NOT_APPROVER"

        cancel_url = self.url(
            "requirement-change-request-cancel",
            requirement_id=requirement.id,
            pk=change_request_id,
        )
        api_client.force_authenticate(user=approver)
        assert api_client.post(cancel_url).status_code == status.HTTP_403_FORBIDDEN

        api_client.force_authenticate(user=self.owner)
        cancel_response = api_client.post(cancel_url)
        assert cancel_response.status_code == status.HTTP_200_OK
        assert cancel_response.data["status"] == RequirementChangeStatus.CANCELLED
        requirement.refresh_from_db()
        assert requirement.status == RequirementStatus.DRAFT

    def test_submit_requires_approvers_and_actual_changes(self, api_client):
        requirement = self.create_requirement()
        self.add_field(requirement)
        api_client.force_authenticate(user=self.owner)

        no_approver_response = self.submit(api_client, requirement)
        assert no_approver_response.status_code == status.HTTP_409_CONFLICT
        assert no_approver_response.data["code"] == "REQUIREMENT_APPROVER_REQUIRED"

        approver = self.add_member()
        RequirementApprover.objects.create(
            requirement=requirement,
            approver=approver,
            sort_order=0,
        )
        self.publish(api_client, requirement, approver)

        api_client.post(self.working_copy_url(requirement))
        empty_response = self.submit(api_client, requirement)
        assert empty_response.status_code == status.HTTP_409_CONFLICT
        assert empty_response.data["code"] == "REQUIREMENT_NO_CHANGES"

    def test_discard_draft_deletes_new_requirement_and_reverts_published_one(
        self, api_client
    ):
        approver = self.add_member()
        new_requirement = self.create_requirement(approver)
        api_client.force_authenticate(user=self.owner)

        delete_response = api_client.delete(self.working_copy_url(new_requirement))
        assert delete_response.status_code == status.HTTP_200_OK
        assert delete_response.data["outcome"] == "deleted"
        assert not Requirement.objects.filter(id=new_requirement.id).exists()

        published = self.create_requirement(approver)
        field = self.add_field(published)
        RequirementDetail.objects.create(
            requirement=published,
            data={str(field.id): "Published"},
        )
        self.publish(api_client, published, approver)

        api_client.post(self.working_copy_url(published))
        api_client.patch(
            self.url("requirement-detail", pk=published.id),
            {"title": "改过的标题"},
            format="json",
        )
        revert_response = api_client.delete(self.working_copy_url(published))
        assert revert_response.status_code == status.HTTP_200_OK
        assert revert_response.data["outcome"] == "reverted"

        published.refresh_from_db()
        assert published.status == RequirementStatus.PUBLISHED
        assert published.current_version == 1
        # meta 也要跟着回到上一版本
        assert published.title == RequirementVersion.objects.get(
            requirement=published, version=1
        ).snapshot["requirement"]["title"]
        assert not RequirementDraft.objects.filter(requirement=published).exists()

    def test_meta_change_shows_up_in_the_diff(self, api_client):
        approver = self.add_member()
        requirement = self.create_requirement(approver)
        self.add_field(requirement)
        self.publish(api_client, requirement, approver)

        api_client.post(self.working_copy_url(requirement))
        assert (
            api_client.patch(
                self.url("requirement-detail", pk=requirement.id),
                {"title": "新的标题"},
                format="json",
            ).status_code
            == status.HTTP_200_OK
        )
        submit_response = self.submit(api_client, requirement, reason="改标题")
        assert submit_response.status_code == status.HTTP_201_CREATED

        detail_response = api_client.get(
            self.url(
                "requirement-change-request-detail",
                requirement_id=requirement.id,
                pk=submit_response.data["id"],
            )
        )
        meta_items = detail_response.data["requirement_items"]
        assert [item["before_snapshot"]["field"] for item in meta_items] == ["title"]
        assert meta_items[0]["proposed_snapshot"]["value"] == "新的标题"

    def test_schema_change_flows_through_the_draft_layer(self, api_client):
        approver = self.add_member()
        requirement = self.create_requirement(approver)
        field = self.add_field(requirement)
        self.publish(api_client, requirement, approver)

        api_client.post(self.working_copy_url(requirement))
        configuration = api_client.get(self.configuration_url(requirement)).data
        client_id = f"new-field-{uuid4()}"
        save_response = api_client.put(
            self.configuration_url(requirement),
            {
                "expected_updated_at": configuration["requirement"]["updated_at"],
                "requirement": {},
                "fields": [
                    {
                        "id": str(field.id),
                        "name": "重命名的字段",
                        "field_type": RequirementFieldType.TEXT,
                        "is_required": False,
                        "is_active": True,
                        "config": {},
                        "default_value": None,
                        "children": [],
                    },
                    {
                        "client_id": client_id,
                        "name": "新增字段",
                        "field_type": RequirementFieldType.TEXT,
                        "is_required": False,
                        "is_active": True,
                        "config": {},
                        "default_value": None,
                        "children": [],
                    },
                ],
            },
            format="json",
        )
        assert save_response.status_code == status.HTTP_200_OK
        assert client_id in save_response.data["created_field_ids"]
        assert [item["name"] for item in save_response.data["fields"]] == [
            "重命名的字段",
            "新增字段",
        ]
        # 正式表还是发布时的样子
        assert [item.name for item in requirement.fields.all()] == ["Summary"]

        submit_response = self.submit(api_client, requirement, reason="改字段")
        change_request_id = submit_response.data["id"]
        assert submit_response.data["created_count"] == 1
        assert submit_response.data["updated_count"] == 1

        detail_response = api_client.get(
            self.url(
                "requirement-change-request-detail",
                requirement_id=requirement.id,
                pk=change_request_id,
            )
        )
        schema_items = detail_response.data["schema_items"]
        assert {item["change_type"] for item in schema_items} == {
            RequirementChangeType.CREATE,
            RequirementChangeType.UPDATE,
        }

        assert self.approve(
            api_client, requirement, change_request_id, approver
        ).status_code == status.HTTP_200_OK
        assert sorted(item.name for item in requirement.fields.all()) == sorted(
            ["重命名的字段", "新增字段"]
        )

    def test_field_reordering_is_a_submittable_schema_change(self, api_client):
        approver = self.add_member()
        requirement = self.create_requirement(approver)
        first_field = self.add_field(requirement, name="First", sort_order=1000)
        second_field = self.add_field(requirement, name="Second", sort_order=2000)
        self.publish(api_client, requirement, approver)

        api_client.post(self.working_copy_url(requirement))
        configuration = api_client.get(self.configuration_url(requirement)).data
        save_response = api_client.put(
            self.configuration_url(requirement),
            {
                "expected_updated_at": configuration["requirement"]["updated_at"],
                "requirement": {},
                "fields": list(reversed(configuration["fields"])),
            },
            format="json",
        )
        assert save_response.status_code == status.HTTP_200_OK
        assert [item["name"] for item in save_response.data["fields"]] == [
            "Second",
            "First",
        ]

        submit_response = self.submit(api_client, requirement, reason="调整字段顺序")
        assert submit_response.status_code == status.HTTP_201_CREATED
        assert submit_response.data["updated_count"] == 2

        detail_response = api_client.get(
            self.url(
                "requirement-change-request-detail",
                requirement_id=requirement.id,
                pk=submit_response.data["id"],
            )
        )
        schema_items = detail_response.data["schema_items"]
        assert {item["target_id"] for item in schema_items} == {
            str(first_field.id),
            str(second_field.id),
        }
        assert {
            (
                item["before_snapshot"]["sort_order"],
                item["proposed_snapshot"]["sort_order"],
            )
            for item in schema_items
        } == {(1000, 2000), (2000, 1000)}
        assert {
            (
                item["before_snapshot"]["position"],
                item["proposed_snapshot"]["position"],
            )
            for item in schema_items
        } == {(1, 2), (2, 1)}

        assert (
            self.approve(
                api_client,
                requirement,
                submit_response.data["id"],
                approver,
            ).status_code
            == status.HTTP_200_OK
        )
        assert list(
            requirement.fields.order_by("sort_order").values_list("name", flat=True)
        ) == ["Second", "First"]

    def test_version_snapshot_details_are_paginated_and_rollback_needs_approval(
        self, api_client
    ):
        approver = self.add_member()
        requirement = self.create_requirement(approver)
        field = self.add_field(requirement)
        detail = RequirementDetail.objects.create(
            requirement=requirement,
            data={str(field.id): "v1"},
        )
        self.publish(api_client, requirement, approver)

        api_client.post(self.working_copy_url(requirement))
        api_client.patch(
            self.url(
                "requirement-detail-item",
                requirement_id=requirement.id,
                pk=detail.id,
            ),
            {"data": {str(field.id): "v2"}, "version": 1},
            format="json",
        )
        change_request_id = self.submit(api_client, requirement).data["id"]
        self.approve(api_client, requirement, change_request_id, approver)
        api_client.force_authenticate(user=self.owner)

        versions_response = api_client.get(
            self.url("requirement-versions", requirement_id=requirement.id)
        )
        assert versions_response.status_code == status.HTTP_200_OK
        assert [item["version"] for item in versions_response.data["results"]] == [2, 1]

        snapshot_details = api_client.get(
            self.url(
                "requirement-version-details",
                requirement_id=requirement.id,
                version=1,
            ),
            {"per_page": 1},
        )
        assert snapshot_details.status_code == status.HTTP_200_OK
        assert snapshot_details.data["total_count"] == 1
        assert snapshot_details.data["results"][0]["data"] == {str(field.id): "v1"}
        assert snapshot_details.data["next_page_results"] is False

        rollback_response = api_client.post(
            self.url(
                "requirement-version-rollback",
                requirement_id=requirement.id,
                version=1,
            )
        )
        assert rollback_response.status_code == status.HTTP_200_OK

        requirement.refresh_from_db()
        detail.refresh_from_db()
        # 回滚只灌工作副本，正式表要等审批通过
        assert requirement.status == RequirementStatus.DRAFT
        assert requirement.current_version == 2
        assert detail.data == {str(field.id): "v2"}

        draft = RequirementDraft.objects.get(requirement=requirement)
        assert RequirementDraftDetail.objects.get(draft=draft, id=detail.id).data == {
            str(field.id): "v1"
        }

        rollback_change_id = self.submit(api_client, requirement, reason="回滚").data[
            "id"
        ]
        self.approve(api_client, requirement, rollback_change_id, approver)
        detail.refresh_from_db()
        requirement.refresh_from_db()
        assert detail.data == {str(field.id): "v1"}
        assert requirement.current_version == 3

    def test_version_rollback_is_blocked_while_a_change_is_under_review(
        self, api_client
    ):
        approver = self.add_member()
        requirement = self.create_requirement(approver)
        field = self.add_field(requirement)
        detail = RequirementDetail.objects.create(
            requirement=requirement,
            data={str(field.id): "published"},
        )
        self.publish(api_client, requirement, approver)

        assert (
            api_client.post(self.working_copy_url(requirement)).status_code
            == status.HTTP_200_OK
        )
        draft = RequirementDraft.objects.get(requirement=requirement)
        draft_detail = RequirementDraftDetail.objects.get(draft=draft, id=detail.id)
        draft_detail.data = {str(field.id): "pending"}
        draft_detail.save(update_fields=["data", "updated_at"])
        submit_response = self.submit(api_client, requirement, reason="待审核变更")
        assert submit_response.status_code == status.HTTP_201_CREATED

        rollback_response = api_client.post(
            self.url(
                "requirement-version-rollback",
                requirement_id=requirement.id,
                version=1,
            )
        )

        assert rollback_response.status_code == status.HTTP_409_CONFLICT
        assert rollback_response.data == {
            "error": (
                "Withdraw or complete the current review before rolling back "
                "this requirement."
            ),
            "code": "REQUIREMENT_IN_REVIEW",
        }
        requirement.refresh_from_db()
        draft_detail.refresh_from_db()
        assert requirement.status == RequirementStatus.IN_REVIEW
        assert requirement.current_version == 1
        assert draft_detail.data == {str(field.id): "pending"}
        assert RequirementVersion.objects.filter(requirement=requirement).count() == 1

    def test_version_compare_current_returns_all_diff_groups_and_paginated_details(
        self, api_client
    ):
        approver = self.add_member()
        requirement = self.create_requirement(approver)
        field = self.add_field(requirement, sort_order=1000)
        first_detail = RequirementDetail.objects.create(
            requirement=requirement,
            data={str(field.id): "First"},
            sort_order=1000,
        )
        second_detail = RequirementDetail.objects.create(
            requirement=requirement,
            data={str(field.id): "Second"},
            sort_order=2000,
        )
        self.publish(api_client, requirement, approver)

        api_client.force_authenticate(user=self.owner)
        assert (
            api_client.post(self.working_copy_url(requirement)).status_code
            == status.HTTP_200_OK
        )
        assert (
            api_client.patch(
                self.url("requirement-detail", pk=requirement.id),
                {"title": "Compared title"},
                format="json",
            ).status_code
            == status.HTTP_200_OK
        )

        configuration = api_client.get(self.configuration_url(requirement)).data
        client_id = f"compare-field-{uuid4()}"
        configuration_response = api_client.put(
            self.configuration_url(requirement),
            {
                "expected_updated_at": configuration["requirement"]["updated_at"],
                "requirement": {},
                "fields": [
                    {
                        **configuration["fields"][0],
                        "name": "Renamed summary",
                    },
                    {
                        "client_id": client_id,
                        "name": "Added field",
                        "field_type": RequirementFieldType.TEXT,
                        "is_required": False,
                        "is_active": True,
                        "config": {},
                        "default_value": None,
                        "children": [],
                    },
                ],
            },
            format="json",
        )
        assert configuration_response.status_code == status.HTTP_200_OK
        added_field_id = configuration_response.data["created_field_ids"][client_id]

        assert (
            api_client.patch(
                self.url(
                    "requirement-detail-item",
                    requirement_id=requirement.id,
                    pk=first_detail.id,
                ),
                {
                    "data": {
                        str(field.id): "First updated",
                        added_field_id: "Added value",
                    },
                    "version": 1,
                },
                format="json",
            ).status_code
            == status.HTTP_200_OK
        )
        assert (
            api_client.delete(
                self.url(
                    "requirement-detail-item",
                    requirement_id=requirement.id,
                    pk=second_detail.id,
                )
            ).status_code
            == status.HTTP_204_NO_CONTENT
        )
        created_detail_response = api_client.post(
            self.details_url(requirement),
            {
                "data": {
                    str(field.id): "Third",
                    added_field_id: "Created value",
                }
            },
            format="json",
        )
        assert created_detail_response.status_code == status.HTTP_201_CREATED

        change_request_id = self.submit(
            api_client, requirement, reason="Compare every group"
        ).data["id"]
        assert (
            self.approve(
                api_client,
                requirement,
                change_request_id,
                approver,
            ).status_code
            == status.HTTP_200_OK
        )
        api_client.force_authenticate(user=self.owner)

        compare_url = self.url(
            "requirement-version-compare-current",
            requirement_id=requirement.id,
            version=1,
        )
        response = api_client.get(compare_url, {"per_page": 1})
        assert response.status_code == status.HTTP_200_OK
        assert response.data["from_version"] == 1
        assert response.data["to_version"] == 2
        assert response.data["detail_item_count"] == 3
        assert response.data["total_count"] == 3
        assert response.data["count"] == 1
        assert response.data["next_page_results"] is True
        assert response.data["results"][0]["base_version"] == 1
        assert response.data["results"][0]["id"].startswith("detail_data:")

        meta_items = response.data["requirement_items"]
        assert [item["before_snapshot"]["field"] for item in meta_items] == [
            "title"
        ]
        assert meta_items[0]["proposed_snapshot"]["value"] == "Compared title"

        schema_items = response.data["schema_items"]
        assert {item["change_type"] for item in schema_items} == {
            RequirementChangeType.CREATE,
            RequirementChangeType.UPDATE,
        }
        assert {item["target_id"] for item in schema_items} == {
            str(field.id),
            added_field_id,
        }
        assert [item["name"] for item in response.data["to_fields_snapshot"]] == [
            "Renamed summary",
            "Added field",
        ]
        assert set(response.data["changed_field_ids"]) == {
            str(field.id),
            added_field_id,
        }

        created_only = api_client.get(
            compare_url,
            {"change_type": RequirementChangeType.CREATE},
        )
        assert created_only.status_code == status.HTTP_200_OK
        assert created_only.data["detail_item_count"] == 3
        assert created_only.data["total_count"] == 1
        assert [item["change_type"] for item in created_only.data["results"]] == [
            RequirementChangeType.CREATE
        ]

        invalid_filter = api_client.get(compare_url, {"change_type": "move"})
        assert invalid_filter.status_code == status.HTTP_400_BAD_REQUEST

        outsider = UserFactory(username=f"version-outsider-{uuid4()}")
        api_client.force_authenticate(user=outsider)
        assert api_client.get(compare_url).status_code == status.HTTP_404_NOT_FOUND

    def test_unpublished_requirement_cannot_compare_versions(self, api_client):
        approver = self.add_member()
        requirement = self.create_requirement(approver)
        api_client.force_authenticate(user=self.owner)

        response = api_client.get(
            self.url(
                "requirement-version-compare-current",
                requirement_id=requirement.id,
                version=1,
            )
        )
        assert response.status_code == status.HTTP_409_CONFLICT
        assert response.data["code"] == "REQUIREMENT_NOT_PUBLISHED"

    def test_version_compare_supports_arbitrary_to_version(self, api_client):
        approver = self.add_member()
        requirement = self.create_requirement(approver)
        field = self.add_field(requirement)
        RequirementDetail.objects.create(
            requirement=requirement,
            data={str(field.id): "First"},
        )
        self.publish(api_client, requirement, approver)

        def bump_version(title):
            api_client.force_authenticate(user=self.owner)
            assert (
                api_client.post(self.working_copy_url(requirement)).status_code
                == status.HTTP_200_OK
            )
            assert (
                api_client.patch(
                    self.url("requirement-detail", pk=requirement.id),
                    {"title": title},
                    format="json",
                ).status_code
                == status.HTTP_200_OK
            )
            change_request_id = self.submit(api_client, requirement).data["id"]
            assert (
                self.approve(
                    api_client, requirement, change_request_id, approver
                ).status_code
                == status.HTTP_200_OK
            )
            api_client.force_authenticate(user=self.owner)

        bump_version("Second title")
        bump_version("Third title")
        requirement.refresh_from_db()
        assert requirement.current_version == 3

        compare_url = self.url(
            "requirement-version-compare",
            requirement_id=requirement.id,
            version=1,
        )

        # 缺省 to_version 时与当前已发布版本对比
        default_response = api_client.get(compare_url)
        assert default_response.status_code == status.HTTP_200_OK
        assert default_response.data["from_version"] == 1
        assert default_response.data["to_version"] == 3

        # 显式指定任意目标版本
        explicit_response = api_client.get(compare_url, {"to_version": 2})
        assert explicit_response.status_code == status.HTTP_200_OK
        assert explicit_response.data["from_version"] == 1
        assert explicit_response.data["to_version"] == 2
        title_items = explicit_response.data["requirement_items"]
        assert [item["before_snapshot"]["field"] for item in title_items] == [
            "title"
        ]
        assert title_items[0]["proposed_snapshot"]["value"] == "Second title"

        # 允许反向对比（v2 → v1）
        reverse_response = api_client.get(
            self.url(
                "requirement-version-compare",
                requirement_id=requirement.id,
                version=2,
            ),
            {"to_version": 1},
        )
        assert reverse_response.status_code == status.HTTP_200_OK
        assert reverse_response.data["from_version"] == 2
        assert reverse_response.data["to_version"] == 1

        # 同版本对比、非法与缺失的目标版本
        assert (
            api_client.get(compare_url, {"to_version": 1}).status_code
            == status.HTTP_400_BAD_REQUEST
        )
        assert (
            api_client.get(compare_url, {"to_version": "abc"}).status_code
            == status.HTTP_400_BAD_REQUEST
        )
        assert (
            api_client.get(compare_url, {"to_version": 99}).status_code
            == status.HTTP_404_NOT_FOUND
        )

    def test_templates_stay_out_of_the_approval_flow(self, api_client):
        template = Requirement.objects.create(
            workspace=self.workspace,
            is_template=True,
            title=f"Template {uuid4()}",
            owner=self.owner,
        )
        api_client.force_authenticate(user=self.owner)

        assert (
            api_client.post(self.working_copy_url(template)).status_code
            == status.HTTP_400_BAD_REQUEST
        )
        assert (
            self.submit(api_client, template).status_code
            == status.HTTP_400_BAD_REQUEST
        )
        # 模板只定义字段，不再持有明细
        assert (
            api_client.post(
                self.details_url(template),
                {"data": {}},
                format="json",
            ).status_code
            == status.HTTP_404_NOT_FOUND
        )

    def test_requirement_payload_exposes_approval_state(self, api_client):
        approver = self.add_member()
        requirement = self.create_requirement(approver)
        self.add_field(requirement)
        api_client.force_authenticate(user=self.owner)
        change_request_id = self.submit(api_client, requirement).data["id"]

        list_url = reverse("requirements", kwargs={"slug": self.workspace.slug})
        owner_view = api_client.get(list_url, {"product_id": str(self.product.id)})
        payload = next(
            item for item in owner_view.data if str(item["id"]) == str(requirement.id)
        )
        assert payload["current_version"] is None
        assert payload["pending_change_request_id"] == str(change_request_id)
        assert payload["can_approve"] is False

        api_client.force_authenticate(user=approver)
        approver_view = api_client.get(list_url, {"product_id": str(self.product.id)})
        approver_payload = next(
            item
            for item in approver_view.data
            if str(item["id"]) == str(requirement.id)
        )
        assert approver_payload["can_approve"] is True
