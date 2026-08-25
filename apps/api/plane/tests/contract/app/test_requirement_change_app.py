"""需求审批的契约测试 —— 审批的单位是**一条需求**。

一条需求的生命周期：

    draft ──提交──> in_review ──通过──> approved（写 v1；status 是另一根轴，不动）
                              ──驳回/撤回──> draft（内容原样保留）

最重要的一条是 test_reviewing_one_requirement_does_not_block_the_others：整个改造的
第一目的就是让「A 提交了需求 A 的评审」不再冻结产品下的其它需求。
"""

from uuid import uuid4

import pytest
from django.urls import reverse
from rest_framework import status

from plane.db.models import (
    Notification,
    Product,
    ProductMember,
    Requirement,
    RequirementBaseline,
    RequirementType,
    RequirementTypeSchemaRevision,
    RequirementVersion,
    WorkspaceMember,
)
from plane.tests.factories import UserFactory, WorkspaceFactory


class RequirementApprovalHarness:
    """两个测试类共用的建产品 / 建需求 / 提交 / 审批脚手架。

    刻意不叫 Test* —— 否则 pytest 会把继承来的用例在每个子类里再跑一遍。
    """

    def setup_method(self):
        self.owner = UserFactory(username=f"req-change-owner-{uuid4()}")
        self.approver = UserFactory(username=f"req-change-approver-{uuid4()}")
        self.workspace = WorkspaceFactory(owner=self.owner)
        for member in (self.owner, self.approver):
            WorkspaceMember.objects.create(
                workspace=self.workspace, member=member, role=20
            )
        self.product = Product.objects.create(
            name=f"Requirement product {uuid4()}",
            identifier=f"P{uuid4().hex[:7].upper()}",
            workspace=self.workspace,
            owner=self.owner,
        )
        ProductMember.objects.create(product=self.product, member=self.approver)

    # --- helpers -------------------------------------------------------

    def url(self, name, **kwargs):
        return reverse(
            name,
            kwargs={"slug": self.workspace.slug, "product_id": self.product.id, **kwargs},
        )

    def workspace_url(self, name, **kwargs):
        return reverse(name, kwargs={"slug": self.workspace.slug, **kwargs})

    def requirements_url(self):
        return self.url("product-requirements")

    def create_requirement_type(self, api_client):
        response = api_client.post(
            self.workspace_url("requirement-types"),
            {"name": f"Requirement type {uuid4()}"},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        return response.data["id"]

    def add_requirement(self, api_client, type_id, title, *, parent_id=None):
        """标题现在是行上的真实列，走 builtin 而不是 data。"""
        builtin = {"title": title}
        if parent_id:
            builtin["parent_id"] = str(parent_id)
        response = api_client.post(
            self.requirements_url(),
            {"requirement_type_id": type_id, "data": {}, "builtin": builtin},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        return response.data

    def fetch_requirement(self, api_client, requirement_id):
        response = api_client.get(self.requirements_url(), {"ids": str(requirement_id)})
        assert response.status_code == status.HTTP_200_OK, response.data
        return response.data["results"][0]

    def submit(
        self,
        api_client,
        requirement_ids,
        *,
        change_type=None,
        reason="变更说明",
        approver_ids=None,
        approval_type="any",
        required_count=None,
    ):
        """评审人与规则随每次提交给定；默认指定 self.approver、任一通过。"""
        payload = {
            "reason": reason,
            "approval_type": approval_type,
            "required_count": required_count,
            "approver_ids": (
                [str(self.approver.id)] if approver_ids is None else approver_ids
            ),
            "items": [
                {
                    "requirement_id": str(requirement_id),
                    **({"change_type": change_type} if change_type else {}),
                }
                for requirement_id in requirement_ids
            ],
        }
        return api_client.post(
            self.url("requirement-change-requests"), payload, format="json"
        )

    def submit_ok(self, api_client, requirement_ids, **kwargs):
        response = self.submit(api_client, requirement_ids, **kwargs)
        assert response.status_code == status.HTTP_201_CREATED, response.data
        return response.data

    def act(self, api_client, change_request_id, action="approved", *, revert=False):
        api_client.force_authenticate(user=self.approver)
        response = api_client.post(
            self.url("requirement-change-request-act", pk=change_request_id),
            {"action": action, "revert": revert},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK, response.data
        api_client.force_authenticate(user=self.owner)
        return response.data

    def patch_requirement(self, api_client, requirement, title):
        return api_client.patch(
            f"{self.requirements_url()}{requirement['id']}/",
            {
                "data": requirement["data"],
                "builtin": {"title": title},
                "version": requirement["version"],
            },
            format="json",
        )

    def set_fields(self, api_client, type_id, fields, *, confirm_data_loss=False):
        """整套字段结构原地替换 —— 配置端点收的是完整字段树，不是增量。"""
        requirement_type = RequirementType.objects.get(id=type_id)
        response = api_client.put(
            self.workspace_url("requirement-type-configuration", pk=type_id),
            {
                "expected_updated_at": requirement_type.updated_at.isoformat(),
                "fields": fields,
                "confirm_data_loss": confirm_data_loss,
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK, response.data
        return response.data

    def add_field(self, api_client, type_id, name):
        payload = self.set_fields(
            api_client,
            type_id,
            [
                {
                    "name": name,
                    "field_type": "text",
                    "is_required": False,
                    "is_active": True,
                    "show_in_library": True,
                    "config": {},
                    "default_value": None,
                    "children": [],
                }
            ],
        )
        return payload["fields"][0]

    def patch_builtin(self, api_client, requirement, **builtin):
        """发任意内置列 —— patch_requirement 写死了只发 title。"""
        return api_client.patch(
            f"{self.requirements_url()}{requirement['id']}/",
            {
                "data": requirement["data"],
                "builtin": {"title": requirement["title"], **builtin},
                "version": requirement["version"],
            },
            format="json",
        )

    def approve_one(self, api_client, type_id, title, *, parent_id=None):
        """建一条需求并让它通过审批，返回通过后的行。"""
        row = self.add_requirement(api_client, type_id, title, parent_id=parent_id)
        change_request = self.submit_ok(api_client, [row["id"]])
        self.act(api_client, change_request["id"])
        return self.fetch_requirement(api_client, row["id"])


@pytest.mark.contract
@pytest.mark.django_db
class TestRequirementApprovalApp(RequirementApprovalHarness):
    def test_submit_requires_an_approver_unless_no_review(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        row = self.add_requirement(api_client, type_id, "无审批人")

        response = self.submit(api_client, [row["id"]], approver_ids=[])

        assert response.status_code == status.HTTP_400_BAD_REQUEST, response.data
        assert "approver_ids" in response.data

    def test_n_of_m_required_count_cannot_exceed_approvers(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        row = self.add_requirement(api_client, type_id, "人数越界")

        response = self.submit(
            api_client, [row["id"]], approval_type="n_of_m", required_count=2
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST, response.data
        assert "required_count" in response.data

    def test_approvers_must_be_product_members(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        row = self.add_requirement(api_client, type_id, "外人审批")
        outsider = UserFactory(username=f"req-change-outsider-{uuid4()}")

        response = self.submit(api_client, [row["id"]], approver_ids=[str(outsider.id)])

        assert response.status_code == status.HTTP_409_CONFLICT, response.data
        assert response.data["code"] == "REQUIREMENT_APPROVER_INVALID"
        assert response.data["approver_ids"] == [str(outsider.id)]

    def test_no_review_rule_applies_on_submit(self, api_client):
        """无需评审：提交即通过 —— 不建审批行、不锁行、不发「请审批」通知。"""
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        row = self.add_requirement(api_client, type_id, "免审需求")

        change_request = self.submit_ok(
            api_client, [row["id"]], approval_type="none", approver_ids=[]
        )

        assert change_request["status"] == "approved"
        assert change_request["approval_type"] == "none"
        assert change_request["approvals"] == []
        assert change_request["completed_at"] is not None

        stored = Requirement.objects.get(id=row["id"])
        assert stored.approved_version == 1
        assert stored.pending_change_item_id is None
        assert RequirementVersion.objects.filter(target_id=row["id"], version=1).exists()
        assert self.fetch_requirement(api_client, row["id"])["approval_state"] == "approved"
        assert not Notification.objects.filter(
            entity_identifier=change_request["id"]
        ).exists()

        # 已经结单，没人能再对它表态
        api_client.force_authenticate(user=self.approver)
        acted = api_client.post(
            self.url("requirement-change-request-act", pk=change_request["id"]),
            {"action": "approved"},
            format="json",
        )
        assert acted.status_code == status.HTTP_409_CONFLICT, acted.data
        assert acted.data["code"] == "REQUIREMENT_CHANGE_CLOSED"

    def test_approval_writes_v1_and_confirms_the_row(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        row = self.add_requirement(api_client, type_id, "短信验证码登录")
        assert row["approval_state"] == "draft"
        assert row["status"] == "not_started"

        change_request = self.submit_ok(api_client, [row["id"]])
        assert change_request["requirement_count"] == 1
        assert change_request["created_count"] == 1

        locked = self.fetch_requirement(api_client, row["id"])
        assert locked["approval_state"] == "in_review"
        assert locked["is_locked"] is True

        self.act(api_client, change_request["id"])

        stored = Requirement.objects.get(id=row["id"])
        assert stored.approved_version == 1
        assert stored.status == "not_started"
        assert stored.pending_change_item_id is None
        version = RequirementVersion.objects.get(target_id=row["id"], version=1)
        assert version.change_type == "create"
        assert version.snapshot["title"] == "短信验证码登录"
        # 版本必须指得回当时的字段结构，否则一年后打开旧版会拿今天的表头渲染
        assert version.schema_revision_id is not None

    def test_reviewing_one_requirement_does_not_block_the_others(self, api_client):
        """整个改造的第一目的：产品级冻结没有了。"""
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        first = self.add_requirement(api_client, type_id, "需求 A")
        second = self.add_requirement(api_client, type_id, "需求 B")

        self.submit_ok(api_client, [first["id"]])

        blocked = self.patch_requirement(api_client, first, "需求 A（改）")
        assert blocked.status_code == status.HTTP_409_CONFLICT, blocked.data
        assert blocked.data["code"] == "REQUIREMENT_IN_REVIEW"

        allowed = self.patch_requirement(api_client, second, "需求 B（改）")
        assert allowed.status_code == status.HTTP_200_OK, allowed.data
        assert allowed.data["title"] == "需求 B（改）"

    def test_two_requirements_produce_two_independent_change_requests(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        first = self.add_requirement(api_client, type_id, "需求 A")
        second = self.add_requirement(api_client, type_id, "需求 B")

        first_cr = self.submit_ok(api_client, [first["id"]])
        second_cr = self.submit_ok(api_client, [second["id"]])

        assert first_cr["id"] != second_cr["id"]
        assert [first_cr["sequence_id"], second_cr["sequence_id"]] == [1, 2]

        self.act(api_client, first_cr["id"])
        assert Requirement.objects.get(id=first["id"]).approved_version == 1
        assert Requirement.objects.get(id=second["id"]).approved_version is None

    def test_one_change_request_can_cover_several_requirements(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        first = self.add_requirement(api_client, type_id, "需求 A")
        second = self.add_requirement(api_client, type_id, "需求 B")

        change_request = self.submit_ok(api_client, [first["id"], second["id"]])
        assert change_request["requirement_count"] == 2

        self.act(api_client, change_request["id"])

        # 原子通过：一张单里的 N 条一起落版本
        assert Requirement.objects.get(id=first["id"]).approved_version == 1
        assert Requirement.objects.get(id=second["id"]).approved_version == 1

    def test_a_requirement_cannot_be_in_two_pending_change_requests(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        row = self.add_requirement(api_client, type_id, "需求 A")
        self.submit_ok(api_client, [row["id"]])

        response = self.submit(api_client, [row["id"]])

        assert response.status_code == status.HTTP_409_CONFLICT, response.data
        assert response.data["code"] == "REQUIREMENT_ALREADY_IN_REVIEW"

    def test_reject_keeps_the_content_and_allows_resubmit(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        row = self.add_requirement(api_client, type_id, "会被驳回")

        change_request = self.submit_ok(api_client, [row["id"]])
        self.act(api_client, change_request["id"], action="rejected")

        stored = Requirement.objects.get(id=row["id"])
        # 驳回只清指针，内容一个字都不动 —— 从来没有第二份副本
        assert stored.title == "会被驳回"
        assert stored.pending_change_item_id is None
        assert stored.approved_version is None

        current = self.fetch_requirement(api_client, row["id"])
        updated = self.patch_requirement(api_client, current, "改好了")
        assert updated.status_code == status.HTTP_200_OK, updated.data
        again = self.submit_ok(api_client, [row["id"]])
        assert again["id"] != change_request["id"]

    def test_modified_state_after_approval(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        approved = self.approve_one(api_client, type_id, "已确认的需求")
        assert approved["approval_state"] == "approved"

        self.patch_requirement(api_client, approved, "已确认后又改了")

        changed = self.fetch_requirement(api_client, approved["id"])
        assert changed["approval_state"] == "modified"
        assert changed["approved_version"] == 1

        change_request = self.submit_ok(api_client, [approved["id"]])
        assert change_request["updated_count"] == 1
        self.act(api_client, change_request["id"])
        assert Requirement.objects.get(id=approved["id"]).approved_version == 2

    def test_draft_deletes_directly_but_approved_needs_review(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)

        draft_row = self.add_requirement(api_client, type_id, "打错的一行")
        deleted = api_client.delete(f"{self.requirements_url()}{draft_row['id']}/")
        assert deleted.status_code == status.HTTP_204_NO_CONTENT, deleted.data

        approved = self.approve_one(api_client, type_id, "已确认的需求")
        blocked = api_client.delete(f"{self.requirements_url()}{approved['id']}/")
        assert blocked.status_code == status.HTTP_409_CONFLICT, blocked.data
        assert blocked.data["code"] == "REQUIREMENT_DELETE_NEEDS_APPROVAL"

        change_request = self.submit_ok(
            api_client, [approved["id"]], change_type="delete"
        )
        assert change_request["deleted_count"] == 1
        self.act(api_client, change_request["id"])
        assert not Requirement.objects.filter(id=approved["id"]).exists()
        # 墓碑版本留着 —— target_id 是裸 UUID，历史不追随删除
        assert RequirementVersion.objects.filter(
            target_id=approved["id"], change_type="delete"
        ).exists()

    def test_deleting_a_parent_pulls_the_subtree_into_the_same_change_request(
        self, api_client
    ):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        parent = self.approve_one(api_client, type_id, "父需求")
        child = self.approve_one(
            api_client, type_id, "子需求", parent_id=parent["id"]
        )

        change_request = self.submit_ok(
            api_client, [parent["id"]], change_type="delete"
        )

        # 已通过审批的后代进同一张单 —— 不允许静默把子需求变成孤儿
        assert change_request["deleted_count"] == 2
        self.act(api_client, change_request["id"])
        assert not Requirement.objects.filter(id=parent["id"]).exists()
        assert not Requirement.objects.filter(id=child["id"]).exists()

    def test_schema_change_keeps_confirmed_rows_and_shows_up_in_the_trail(
        self, api_client
    ):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        approved = self.approve_one(api_client, type_id, "已确认的需求")

        requirement_type = RequirementType.objects.get(id=type_id)
        revisions_before = RequirementTypeSchemaRevision.objects.filter(
            requirement_type_id=type_id
        ).count()
        response = api_client.put(
            self.workspace_url("requirement-type-configuration", pk=type_id),
            {
                "expected_updated_at": requirement_type.updated_at.isoformat(),
                "fields": [
                    {
                        "name": "验收标准",
                        "field_type": "text",
                        "is_required": False,
                        "is_active": True,
                        "show_in_library": True,
                        "config": {},
                        "default_value": None,
                        "children": [],
                    }
                ],
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK, response.data

        # 字段结构变更立即生效，但**不动**已确认需求的状态
        stored = Requirement.objects.get(id=approved["id"])
        assert stored.status == "not_started"
        assert stored.approved_version == 1

        # 一次类型编辑只写**一行**修订，不给该类型下每条需求各写一行
        assert (
            RequirementTypeSchemaRevision.objects.filter(
                requirement_type_id=type_id
            ).count()
            == revisions_before + 1
        )

        trail = api_client.get(
            self.url("product-requirement-trail", requirement_id=approved["id"])
        )
        assert trail.status_code == status.HTTP_200_OK, trail.data
        kinds = {entry["kind"] for entry in trail.data["results"]}
        assert kinds == {"content", "schema"}

    def test_approval_flow_notifies_the_right_people(self, api_client):
        """改造之前这套流程一条通知都没有。下沉到条目之后审批人面对的是 N 张小单，
        不通知就只能靠人主动去列表里轮询。"""
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        row = self.add_requirement(api_client, type_id, "需要审批的需求")

        change_request = self.submit_ok(api_client, [row["id"]])

        # 提交 -> 通知审批人，不通知提交人自己
        requested = Notification.objects.filter(
            entity_identifier=change_request["id"],
            sender="in_app:requirement_approval:requested",
        )
        assert list(requested.values_list("receiver_id", flat=True)) == [self.approver.id]
        payload = requested.first().data
        # 前端卡片以 data.issue_activity.field 作为渲染开关，缺了整张卡片静默不渲染
        assert payload["issue_activity"]["field"] == "requirement_approval_request"
        assert payload["requirement_change_request"]["requirement_titles"] == ["需要审批的需求"]
        # 需求归产品不归项目，这类通知的 project 恒为空
        assert requested.first().project_id is None

        self.act(api_client, change_request["id"])

        # 通过 -> 通知提交人，不通知刚点完通过的审批人
        approved = Notification.objects.filter(
            entity_identifier=change_request["id"],
            sender="in_app:requirement_approval:approved",
        )
        assert list(approved.values_list("receiver_id", flat=True)) == [self.owner.id]

    def test_withdraw_notifies_pending_approvers(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        row = self.add_requirement(api_client, type_id, "会被撤回的需求")
        change_request = self.submit_ok(api_client, [row["id"]])

        api_client.post(
            self.url("requirement-change-request-cancel", pk=change_request["id"]),
            format="json",
        )

        withdrawn = Notification.objects.filter(
            entity_identifier=change_request["id"],
            sender="in_app:requirement_approval:withdrawn",
        )
        # 还没表态的审批人该知道这张单已经作废，免得对着它发呆
        assert list(withdrawn.values_list("receiver_id", flat=True)) == [self.approver.id]

    def test_only_the_submitter_can_withdraw(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        row = self.add_requirement(api_client, type_id, "需求 A")
        change_request = self.submit_ok(api_client, [row["id"]])

        api_client.force_authenticate(user=self.approver)
        forbidden = api_client.post(
            self.url("requirement-change-request-cancel", pk=change_request["id"]),
            format="json",
        )
        assert forbidden.status_code == status.HTTP_403_FORBIDDEN, forbidden.data

        api_client.force_authenticate(user=self.owner)
        cancelled = api_client.post(
            self.url("requirement-change-request-cancel", pk=change_request["id"]),
            format="json",
        )
        assert cancelled.status_code == status.HTTP_200_OK, cancelled.data
        # 撤回与驳回在行上完全相同：只清指针
        assert Requirement.objects.get(id=row["id"]).pending_change_item_id is None


@pytest.mark.contract
@pytest.mark.django_db
class TestRequirementBaselineApp(RequirementApprovalHarness):
    """基线快照 —— 一组 (需求, 版本) 的不可变命名快照。

    复用上面那套 setup 与 helper：基线的每条测试都要先把需求推过审批，不然它根本进不了
    基线。
    """

    def create_baseline(self, api_client, name, *, preview=False, **payload):
        url = self.url("requirement-baselines")
        if preview:
            url = f"{url}?preview=1"
        return api_client.post(
            url, {"name": name, **payload}, format="json"
        )

    def test_baseline_only_collects_approved_requirements(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        approved = self.approve_one(api_client, type_id, "已确认的需求")
        draft = self.add_requirement(api_client, type_id, "还没过审的草稿")

        response = self.create_baseline(api_client, "R1.0")

        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert response.data["entry_count"] == 1
        # 没过审的必须**明说**漏掉了，否则用户会以为自己基线了一份并不存在的内容
        assert [item["requirement_id"] for item in response.data["skipped"]] == [
            str(draft["id"])
        ]
        assert response.data["skipped"][0]["reason"] == "no_approved_version"

        entries = api_client.get(
            self.url("requirement-baseline-requirements", pk=response.data["id"])
        )
        assert entries.status_code == status.HTTP_200_OK, entries.data
        assert [entry["requirement_id"] for entry in entries.data["results"]] == [
            str(approved["id"])
        ]
        assert entries.data["results"][0]["version_number"] == 1
        assert entries.data["results"][0]["snapshot"]["title"] == "已确认的需求"

    def test_preview_counts_without_writing(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        self.approve_one(api_client, type_id, "已确认的需求")
        self.add_requirement(api_client, type_id, "草稿")

        # 预览时还没起名 —— 要求先命名等于逼用户在不知道会纳入多少条之前就下决定
        preview = api_client.post(
            f"{self.url('requirement-baselines')}?preview=1", {}, format="json"
        )

        assert preview.status_code == status.HTTP_200_OK, preview.data
        assert preview.data["entry_count"] == 1
        assert len(preview.data["skipped"]) == 1
        assert RequirementBaseline.objects.filter(product=self.product).count() == 0

    def test_in_flight_requirements_are_pinned_to_their_last_approved_version(
        self, api_client
    ):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        approved = self.approve_one(api_client, type_id, "第一版")
        self.patch_requirement(api_client, approved, "第二版（未提交）")

        response = self.create_baseline(api_client, "R1.0")

        assert response.data["entry_count"] == 1
        # 收了 v1，但行上已经不是 v1 —— 这件事必须报告出来
        assert response.data["stale"] == [
            {
                "requirement_id": str(approved["id"]),
                "title": "第二版（未提交）",
                "version": 1,
                "reason": "modified",
            }
        ]
        entries = api_client.get(
            self.url("requirement-baseline-requirements", pk=response.data["id"])
        )
        assert entries.data["results"][0]["snapshot"]["title"] == "第一版"

    def test_baseline_content_does_not_follow_the_live_row(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        approved = self.approve_one(api_client, type_id, "第一版")
        baseline = self.create_baseline(api_client, "R1.0").data

        current = self.fetch_requirement(api_client, approved["id"])
        self.patch_requirement(api_client, current, "第二版")
        self.act(api_client, self.submit_ok(api_client, [approved["id"]])["id"])

        entries = api_client.get(
            self.url("requirement-baseline-requirements", pk=baseline["id"])
        )
        assert entries.data["results"][0]["snapshot"]["title"] == "第一版"

        # 内容不可改，能改的只有名字和说明
        renamed = api_client.patch(
            self.url("requirement-baseline-detail", pk=baseline["id"]),
            {"name": "R1.0 正式", "entry_count": 99},
            format="json",
        )
        assert renamed.status_code == status.HTTP_200_OK, renamed.data
        assert renamed.data["name"] == "R1.0 正式"
        assert renamed.data["entry_count"] == 1

    def test_compare_two_baselines(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        kept = self.approve_one(api_client, type_id, "不变的需求")
        changed = self.approve_one(api_client, type_id, "会改的需求")
        first = self.create_baseline(api_client, "R1.0").data

        current = self.fetch_requirement(api_client, changed["id"])
        self.patch_requirement(api_client, current, "会改的需求（改）")
        self.act(api_client, self.submit_ok(api_client, [changed["id"]])["id"])
        added = self.approve_one(api_client, type_id, "新增的需求")
        second = self.create_baseline(api_client, "R2.0").data

        response = api_client.get(
            self.url("requirement-baseline-compare", pk=first["id"]),
            {"to": second["id"]},
        )

        assert response.status_code == status.HTTP_200_OK, response.data
        by_target = {item["target_id"]: item for item in response.data["results"]}
        assert by_target[str(changed["id"])]["change_type"] == "update"
        assert by_target[str(changed["id"])]["before_snapshot"]["title"] == "会改的需求"
        assert by_target[str(changed["id"])]["proposed_snapshot"]["title"] == "会改的需求（改）"
        assert by_target[str(added["id"])]["change_type"] == "create"
        # 没动过的需求不该出现在差异里
        assert str(kept["id"]) not in by_target


@pytest.mark.contract
@pytest.mark.django_db
class TestRequirementApprovalInboxApp(RequirementApprovalHarness):
    """待我审批：跨产品聚合当前用户名下的变更单。

    下沉到按需求之后，一次评审从「一张大单」变成 N 张小单，待办是分散的 —— 通知解决
    「发生的那一刻告诉你」，收件箱解决「过两天回头还找得到」。
    """

    def inbox(self, api_client, **params):
        response = api_client.get(
            reverse("requirement-approval-inbox", kwargs={"slug": self.workspace.slug}),
            params,
        )
        assert response.status_code == status.HTTP_200_OK, response.data
        return response

    def test_inbox_lists_only_what_waits_on_me(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        row = self.add_requirement(api_client, type_id, "等审批的需求")
        change_request = self.submit_ok(api_client, [row["id"]])

        # 提交人自己的收件箱是空的 —— 他不是审批人
        assert self.inbox(api_client).data["pending_count"] == 0

        api_client.force_authenticate(user=self.approver)
        response = self.inbox(api_client)
        assert response.data["pending_count"] == 1
        assert response["X-Pending-Count"] == "1"
        entry = response.data["results"][0]
        assert entry["id"] == change_request["id"]
        # 跨产品的收件箱里只给 CR-3 这样的编号，人分不出是哪个产品的单
        assert entry["product_name"] == self.product.name
        assert entry["can_approve"] is True

    def test_acting_moves_the_request_from_pending_to_processed(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        row = self.add_requirement(api_client, type_id, "会被驳回的需求")
        change_request = self.submit_ok(api_client, [row["id"]])
        self.act(api_client, change_request["id"], action="rejected")

        api_client.force_authenticate(user=self.approver)
        assert self.inbox(api_client).data["pending_count"] == 0

        processed = self.inbox(api_client, tab="processed")
        assert [item["id"] for item in processed.data["results"]] == [change_request["id"]]
        # 已办要区分「我批了」和「我驳了」
        assert processed.data["results"][0]["my_action"] == "rejected"

    def test_inbox_can_be_narrowed_to_one_product(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        row = self.add_requirement(api_client, type_id, "A 产品的需求")
        self.submit_ok(api_client, [row["id"]])

        other_product = Product.objects.create(
            name=f"Other product {uuid4()}",
            identifier=f"O{uuid4().hex[:7].upper()}",
            workspace=self.workspace,
            owner=self.owner,
        )

        api_client.force_authenticate(user=self.approver)
        assert self.inbox(api_client, product_id=str(self.product.id)).data["pending_count"] == 1
        # 产品页头部的入口用 product_id 收窄，别的产品的单不该混进来
        assert self.inbox(api_client, product_id=str(other_product.id)).data["pending_count"] == 0

    def test_outsiders_cannot_read_the_inbox(self, api_client):
        outsider = UserFactory(username=f"req-outsider-{uuid4()}")
        api_client.force_authenticate(user=outsider)

        response = api_client.get(
            reverse("requirement-approval-inbox", kwargs={"slug": self.workspace.slug})
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN, response.data


@pytest.mark.contract
@pytest.mark.django_db
class TestRequirementRollbackApp(RequirementApprovalHarness):
    """回滚：把某个已通过版本的内容拷回活行。

    它**不撤销审批** —— 版本链一条不动，回滚完这条需求是 modified，要不要真的退回那一版
    由随后的评审说了算。
    """

    def rollback(self, api_client, requirement_id, version):
        return api_client.post(
            self.url("product-requirement-rollback", pk=requirement_id),
            {"version": version},
            format="json",
        )

    def test_rollback_restores_content_and_leaves_it_modified(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        row = self.approve_one(api_client, type_id, "第一版")
        self.patch_requirement(api_client, row, "第二版")
        self.act(api_client, self.submit_ok(api_client, [row["id"]])["id"])

        response = self.rollback(api_client, row["id"], 1)

        assert response.status_code == status.HTTP_200_OK, response.data
        assert response.data["title"] == "第一版"
        stored = Requirement.objects.get(id=row["id"])
        # 版本链一条不动，approved_version 也不变 —— 回滚只是一次普通编辑
        assert stored.approved_version == 2
        assert RequirementVersion.objects.filter(target_id=row["id"]).count() == 2
        assert self.fetch_requirement(api_client, row["id"])["approval_state"] == "modified"

    def test_rollback_to_the_approved_version_returns_to_approved(self, api_client):
        """「放弃改动」之后行必须回到已通过态。

        挂在「已改动·待提交」上的话，点提交会被 REQUIREMENT_NO_CHANGES 打回 —— 提示说
        回滚成功、状态说还有未提交的改动、提交又说没有改动，三句话互相打架。
        """
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        approved = self.approve_one(api_client, type_id, "第一版")
        self.patch_requirement(api_client, approved, "改错了")

        response = self.rollback(api_client, approved["id"], 1)

        assert response.status_code == status.HTTP_200_OK, response.data
        row = self.fetch_requirement(api_client, approved["id"])
        assert row["title"] == "第一版"
        assert row["approval_state"] == "approved"

    def test_rollback_to_an_older_version_still_needs_review(self, api_client):
        """回到的不是已通过那一版，内容就确实与已批准的不同 —— 仍要走评审。"""
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        approved = self.approve_one(api_client, type_id, "第一版")
        current = self.fetch_requirement(api_client, approved["id"])
        self.patch_requirement(api_client, current, "第二版")
        self.act(api_client, self.submit_ok(api_client, [approved["id"]])["id"])

        self.rollback(api_client, approved["id"], 1)

        row = self.fetch_requirement(api_client, approved["id"])
        assert row["title"] == "第一版"
        assert row["approval_state"] == "modified"
        assert row["can_submit_review"] is True

    def test_rolled_back_content_can_be_resubmitted(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        row = self.approve_one(api_client, type_id, "第一版")
        self.patch_requirement(api_client, row, "第二版")
        self.act(api_client, self.submit_ok(api_client, [row["id"]])["id"])
        self.rollback(api_client, row["id"], 1)

        change_request = self.submit_ok(api_client, [row["id"]])
        self.act(api_client, change_request["id"])

        version = RequirementVersion.objects.get(target_id=row["id"], version=3)
        assert version.snapshot["title"] == "第一版"

    def test_rollback_is_refused_while_in_review(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        row = self.approve_one(api_client, type_id, "第一版")
        current = self.fetch_requirement(api_client, row["id"])
        self.patch_requirement(api_client, current, "第二版")
        self.submit_ok(api_client, [row["id"]])

        response = self.rollback(api_client, row["id"], 1)

        assert response.status_code == status.HTTP_409_CONFLICT, response.data
        assert response.data["code"] == "REQUIREMENT_IN_REVIEW"
        # 被拒的回滚一个字都不该落地
        assert Requirement.objects.get(id=row["id"]).title == "第二版"

    def test_rollback_rejects_an_unknown_version(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        row = self.approve_one(api_client, type_id, "只有 v1")

        response = self.rollback(api_client, row["id"], 7)

        assert response.status_code == status.HTTP_409_CONFLICT, response.data
        assert response.data["code"] == "REQUIREMENT_VERSION_NOT_FOUND"

    def test_rollback_prunes_data_against_the_current_schema(self, api_client):
        """字段结构立即生效且不走审批：vK 当年填的字段今天可能已经没了。"""
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        field = self.add_field(api_client, type_id, "验收标准")
        row = self.add_requirement(api_client, type_id, "带字段的需求")
        filled = api_client.patch(
            f"{self.requirements_url()}{row['id']}/",
            {
                "data": {field["id"]: "必须支持短信"},
                "builtin": {"title": "带字段的需求"},
                "version": row["version"],
            },
            format="json",
        )
        assert filled.status_code == status.HTTP_200_OK, filled.data
        self.act(api_client, self.submit_ok(api_client, [row["id"]])["id"])
        assert RequirementVersion.objects.get(target_id=row["id"], version=1).snapshot["data"] == {
            field["id"]: "必须支持短信"
        }

        # 把那个字段删掉，再回滚到 v1
        self.set_fields(api_client, type_id, [], confirm_data_loss=True)
        response = self.rollback(api_client, row["id"], 1)

        assert response.status_code == status.HTTP_200_OK, response.data
        # 原样写回去等于往行里塞一堆读不出来的孤儿键
        assert Requirement.objects.get(id=row["id"]).data == {}


@pytest.mark.contract
@pytest.mark.django_db
class TestRequirementStatusAxisApp(RequirementApprovalHarness):
    """status 是**交付状态轴**，不是内容。

    它走独立的状态写入口（PATCH .../status/），内容 PATCH 写不进；它不进内容 diff，也不被
    内容回滚倒推回去。这三条合起来保证「研发做完了」永远不会伪装成「内容改过了」。
    """

    def test_status_from_the_client_is_ignored(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        approved = self.approve_one(api_client, type_id, "已确认的需求")

        response = self.patch_builtin(api_client, approved, status="released")

        assert response.status_code == status.HTTP_200_OK, response.data
        # 静默忽略而不是 400：网格的批量保存 payload 恒带全部八个内置列
        assert response.data["status"] == "not_started"
        assert Requirement.objects.get(id=approved["id"]).status == "not_started"
        # 内容一个字都没变，行不该被推进「已改动」
        assert self.fetch_requirement(api_client, approved["id"])["approval_state"] == "approved"

    def test_a_no_op_save_does_not_strand_the_row_in_modified(self, api_client):
        """空保存也会 +1 乐观锁，但内容没变就该判回「已通过」。

        不处理的话行会挂在「已改动·待提交」上，点提交又被 REQUIREMENT_NO_CHANGES 打回，
        是个走不出去的死胡同。
        """
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        approved = self.approve_one(api_client, type_id, "已确认的需求")

        self.patch_builtin(api_client, approved)

        row = self.fetch_requirement(api_client, approved["id"])
        assert row["approval_state"] == "approved"
        assert row["version"] > approved["version"]

    def test_a_no_op_save_never_launders_unreviewed_content(self, api_client):
        """本轮最危险的一条：空保存不能把「已改过但没提交」洗成「已通过」。

        少了「写入前已是 approved」这个守卫，先改标题再空保存就会把未审的标题判成已通过，
        而 can_submit_review 对 approved 的行返回 False —— 那份内容再也提交不上去。
        """
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        approved = self.approve_one(api_client, type_id, "第一版")
        self.patch_requirement(api_client, approved, "第二版（未提交）")

        changed = self.fetch_requirement(api_client, approved["id"])
        self.patch_builtin(api_client, changed)

        row = self.fetch_requirement(api_client, approved["id"])
        assert row["approval_state"] == "modified"
        assert row["can_submit_review"] is True
        # 提交入口还在，且提交得出去
        assert self.submit_ok(api_client, [approved["id"]])["updated_count"] == 1

    def test_status_is_not_part_of_the_change_diff(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        approved = self.approve_one(api_client, type_id, "已确认的需求")
        self.patch_builtin(api_client, approved, title="改了标题", status="released")

        change_request = self.submit_ok(api_client, [approved["id"]])

        assert change_request["changed_field_ids"] == ["title"]

    def test_rollback_does_not_touch_the_status(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        approved = self.approve_one(api_client, type_id, "第一版")
        # 直接改库里的 status —— 模拟状态写入口写进来的「已发布」
        Requirement.objects.filter(id=approved["id"]).update(status="released")
        current = self.fetch_requirement(api_client, approved["id"])
        self.patch_requirement(api_client, current, "第二版")
        self.act(api_client, self.submit_ok(api_client, [approved["id"]])["id"])

        response = api_client.post(
            self.url("product-requirement-rollback", pk=approved["id"]),
            {"version": 1},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK, response.data
        stored = Requirement.objects.get(id=approved["id"])
        assert stored.title == "第一版"
        # 内容退回那一版，研发进度不跟着倒退
        assert stored.status == "released"


@pytest.mark.contract
@pytest.mark.django_db
class TestRequirementRejectRevertApp(RequirementApprovalHarness):
    """驳回时的「撤销变更」—— 对应禅道评审结果里的同名选项。"""

    def test_reject_without_revert_keeps_the_content(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        approved = self.approve_one(api_client, type_id, "第一版")
        self.patch_requirement(api_client, approved, "第二版")

        self.act(api_client, self.submit_ok(api_client, [approved["id"]])["id"], action="rejected")

        # 默认驳回只清指针：多数驳回是「改一改再提」，不该把人的改动丢掉
        assert Requirement.objects.get(id=approved["id"]).title == "第二版"
        assert self.fetch_requirement(api_client, approved["id"])["approval_state"] == "modified"

    def test_reject_with_revert_restores_the_approved_content(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        approved = self.approve_one(api_client, type_id, "第一版")
        self.patch_requirement(api_client, approved, "第二版")

        self.act(
            api_client,
            self.submit_ok(api_client, [approved["id"]])["id"],
            action="rejected",
            revert=True,
        )

        assert Requirement.objects.get(id=approved["id"]).title == "第一版"
        # 内容与已通过的那一版一致了，但 version 变过 —— 仍是 modified，提交入口还在
        assert Requirement.objects.get(id=approved["id"]).approved_version == 1

    def test_reject_with_revert_leaves_a_new_requirement_as_draft(self, api_client):
        """新增被驳回时没有「上一版」可回，只能留在草稿。"""
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        row = self.add_requirement(api_client, type_id, "全新的需求")

        self.act(api_client, self.submit_ok(api_client, [row["id"]])["id"], action="rejected", revert=True)

        stored = Requirement.objects.get(id=row["id"])
        assert stored.title == "全新的需求"
        assert stored.approved_version is None
        assert stored.status == "not_started"
