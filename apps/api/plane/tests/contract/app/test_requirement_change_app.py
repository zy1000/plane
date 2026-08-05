"""需求基线的变更审批与版本管理契约测试。

审批的单位是**基线**（一个产品的全部需求），所以这里验证的是：
draft --提交--> in_review --通过--> published（物化工作副本 + 写新版本）

以及重构新引入的两个派生值：每一行相对上一个已发布版本的 change_kind，
和「最后变更于 vN」的 last_changed_version。
"""

from uuid import uuid4

import pytest
from django.urls import reverse
from rest_framework import status

from plane.db.models import (
    Product,
    ProductMember,
    Requirement,
    RequirementBaseline,
    RequirementChangeTargetKind,
    RequirementVersion,
    WorkspaceMember,
)
from plane.tests.factories import UserFactory, WorkspaceFactory


@pytest.mark.contract
@pytest.mark.django_db
class TestRequirementChangeApp:
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
            workspace=self.workspace,
            owner=self.owner,
        )
        ProductMember.objects.create(product=self.product, member=self.approver)

    # --- helpers -------------------------------------------------------

    def url(self, name, **kwargs):
        return reverse(
            name, kwargs={"slug": self.workspace.slug, "product_id": self.product.id, **kwargs}
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

    def builtin_ids(self, api_client, type_id):
        response = api_client.get(
            self.workspace_url("requirement-type-configuration", pk=type_id)
        )
        return {
            field["builtin_key"]: field["id"]
            for field in response.data["fields"]
            if field.get("builtin_key")
        }

    def add_requirement(self, api_client, type_id, ids, title):
        response = api_client.post(
            self.requirements_url(),
            {
                "requirement_type_id": type_id,
                "data": {ids["title"]: title, ids["description"]: None},
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        return response.data

    def configure_approver(self, api_client):
        baseline = api_client.get(self.url("requirement-baseline")).data["baseline"]
        response = api_client.put(
            self.url("requirement-baseline"),
            {
                "expected_updated_at": baseline["updated_at"],
                "baseline": {
                    "owner_id": str(self.owner.id),
                    "approver_ids": [str(self.approver.id)],
                    "approval_type": "any",
                    "required_count": None,
                },
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK, response.data
        return response.data

    def submit(self, api_client, reason="首次发布"):
        response = api_client.post(
            f"{self.url('requirement-change-requests')}submit/",
            {"reason": reason},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        return response.data

    def approve(self, api_client, change_request_id):
        api_client.force_authenticate(user=self.approver)
        response = api_client.post(
            self.url("requirement-change-request-act", pk=change_request_id),
            {"action": "approved"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK, response.data
        api_client.force_authenticate(user=self.owner)
        return response.data

    def publish_first_version(self, api_client):
        """建两条需求并发布 v1，返回 (type_id, builtin ids, 两条需求)。"""
        type_id = self.create_requirement_type(api_client)
        ids = self.builtin_ids(api_client, type_id)
        first = self.add_requirement(api_client, type_id, ids, "短信验证码登录")
        second = self.add_requirement(api_client, type_id, ids, "扫码登录")
        self.configure_approver(api_client)
        change_request = self.submit(api_client)
        self.approve(api_client, change_request["id"])
        return type_id, ids, first, second

    # --- tests ---------------------------------------------------------

    def test_submit_requires_an_approver(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        ids = self.builtin_ids(api_client, type_id)
        self.add_requirement(api_client, type_id, ids, "无审批人")

        response = api_client.post(
            f"{self.url('requirement-change-requests')}submit/", {}, format="json"
        )

        assert response.status_code == status.HTTP_409_CONFLICT, response.data
        assert response.data["code"] == "REQUIREMENT_APPROVER_REQUIRED"

    def test_first_publish_freezes_a_version_and_stamps_every_row(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id, ids, first, second = self.publish_first_version(api_client)

        baseline = RequirementBaseline.objects.get(product=self.product)
        assert baseline.status == "published"
        assert baseline.current_version == 1

        version = RequirementVersion.objects.get(baseline=baseline, version=1)
        assert version.target_kind == RequirementChangeTargetKind.BASELINE
        assert {row["data"][ids["title"]] for row in version.snapshot["requirements"]} == {
            "短信验证码登录",
            "扫码登录",
        }
        # 首次发布：所有行都记为第 1 版
        assert set(
            Requirement.objects.filter(product=self.product).values_list(
                "last_changed_version", flat=True
            )
        ) == {1}

    def test_published_content_is_read_only_until_editing_starts(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id, ids, first, _ = self.publish_first_version(api_client)

        blocked = api_client.patch(
            f"{self.requirements_url()}{first['id']}/",
            {"data": {ids["title"]: "改不动", ids["description"]: None}, "version": first["version"]},
            format="json",
        )
        assert blocked.status_code == status.HTTP_409_CONFLICT, blocked.data
        assert blocked.data["code"] == "REQUIREMENT_PUBLISHED"

        started = api_client.post(f"{self.url('requirement-working-copy')}", format="json")
        assert started.status_code == status.HTTP_200_OK, started.data
        assert started.data["baseline"]["status"] == "draft"
        # 正式表仍持有已批准的内容
        assert Requirement.objects.get(id=first["id"]).title == "短信验证码登录"

    def test_change_kind_marks_rows_against_the_published_baseline(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id, ids, first, second = self.publish_first_version(api_client)
        api_client.post(f"{self.url('requirement-working-copy')}", format="json")

        api_client.patch(
            f"{self.requirements_url()}{first['id']}/",
            {
                "data": {ids["title"]: "短信验证码登录（改）", ids["description"]: None},
                "version": first["version"],
            },
            format="json",
        )
        self.add_requirement(api_client, type_id, ids, "新增：找回密码")

        rows = {
            item["title"]: item
            for item in api_client.get(self.requirements_url()).data["results"]
        }

        assert rows["短信验证码登录（改）"]["change_kind"] == "updated"
        assert rows["新增：找回密码"]["change_kind"] == "created"
        assert rows["扫码登录"]["change_kind"] is None

    def test_second_publish_only_bumps_rows_that_actually_changed(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id, ids, first, second = self.publish_first_version(api_client)
        api_client.post(f"{self.url('requirement-working-copy')}", format="json")
        api_client.patch(
            f"{self.requirements_url()}{first['id']}/",
            {
                "data": {ids["title"]: "短信验证码登录（改）", ids["description"]: None},
                "version": first["version"],
            },
            format="json",
        )

        change_request = self.submit(api_client, reason="调整登录方式")
        # 需求条目组的变更项走独立分页端点
        items = api_client.get(
            self.url("requirement-change-request-items", pk=change_request["id"])
        )
        assert items.status_code == status.HTTP_200_OK, items.data
        assert [item["change_type"] for item in items.data["results"]] == ["update"]
        assert items.data["results"][0]["target_id"] == str(first["id"])

        self.approve(api_client, change_request["id"])

        baseline = RequirementBaseline.objects.get(product=self.product)
        assert baseline.current_version == 2
        assert Requirement.objects.get(id=first["id"]).last_changed_version == 2
        # 没动过的行沿用上一版的版本号
        assert Requirement.objects.get(id=second["id"]).last_changed_version == 1

    def test_rejecting_a_change_request_returns_the_baseline_to_draft(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id, ids, first, _ = self.publish_first_version(api_client)
        api_client.post(f"{self.url('requirement-working-copy')}", format="json")
        api_client.patch(
            f"{self.requirements_url()}{first['id']}/",
            {"data": {ids["title"]: "待驳回", ids["description"]: None}, "version": first["version"]},
            format="json",
        )
        change_request = self.submit(api_client, reason="待驳回")

        api_client.force_authenticate(user=self.approver)
        response = api_client.post(
            self.url("requirement-change-request-act", pk=change_request["id"]),
            {"action": "rejected", "comment": "先不发"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK, response.data
        assert response.data["status"] == "rejected"
        baseline = RequirementBaseline.objects.get(product=self.product)
        assert baseline.status == "draft"
        assert baseline.current_version == 1
        # 驳回保留工作副本，正式表仍是已批准的内容
        assert Requirement.objects.get(id=first["id"]).title == "短信验证码登录"

    def test_discarding_a_draft_restores_the_published_content(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id, ids, first, _ = self.publish_first_version(api_client)
        api_client.post(f"{self.url('requirement-working-copy')}", format="json")
        api_client.patch(
            f"{self.requirements_url()}{first['id']}/",
            {"data": {ids["title"]: "临时改动", ids["description"]: None}, "version": first["version"]},
            format="json",
        )

        response = api_client.delete(self.url("requirement-working-copy"))

        assert response.status_code == status.HTTP_200_OK, response.data
        assert response.data["outcome"] == "reverted"
        assert response.data["baseline"]["status"] == "published"
        assert Requirement.objects.get(id=first["id"]).title == "短信验证码登录"

    def test_discarding_before_the_first_publish_clears_every_requirement(
        self, api_client
    ):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        ids = self.builtin_ids(api_client, type_id)
        self.add_requirement(api_client, type_id, ids, "尚未发布")

        response = api_client.delete(self.url("requirement-working-copy"))

        assert response.status_code == status.HTTP_200_OK, response.data
        assert response.data["outcome"] == "cleared"
        assert not Requirement.objects.filter(product=self.product).exists()

    def test_version_snapshot_rows_are_paginated_and_carry_merged_data(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id, ids, _, _ = self.publish_first_version(api_client)

        response = api_client.get(
            self.url("requirement-version-requirements", version=1), {"per_page": 1}
        )

        assert response.status_code == status.HTTP_200_OK, response.data
        assert response.data["total_count"] == 2
        assert len(response.data["results"]) == 1
        # 快照里的 data 是合并态，与网格读到的一行同形
        assert ids["title"] in response.data["results"][0]["data"]

    def test_rollback_loads_the_snapshot_into_a_working_copy(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id, ids, first, _ = self.publish_first_version(api_client)
        api_client.post(f"{self.url('requirement-working-copy')}", format="json")
        api_client.patch(
            f"{self.requirements_url()}{first['id']}/",
            {"data": {ids["title"]: "v2 标题", ids["description"]: None}, "version": first["version"]},
            format="json",
        )
        self.approve(api_client, self.submit(api_client, reason="发 v2")["id"])
        assert Requirement.objects.get(id=first["id"]).title == "v2 标题"

        response = api_client.post(
            self.url("requirement-version-rollback", version=1), format="json"
        )

        assert response.status_code == status.HTTP_200_OK, response.data
        assert response.data["baseline"]["status"] == "draft"
        # 回滚只灌工作副本，正式表要等下一次审批通过
        assert Requirement.objects.get(id=first["id"]).title == "v2 标题"
        rows = api_client.get(self.requirements_url()).data["results"]
        assert {row["title"] for row in rows} == {"短信验证码登录", "扫码登录"}

    def test_only_the_submitter_can_withdraw_a_change_request(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id, ids, first, _ = self.publish_first_version(api_client)
        api_client.post(f"{self.url('requirement-working-copy')}", format="json")
        api_client.patch(
            f"{self.requirements_url()}{first['id']}/",
            {"data": {ids["title"]: "待撤回", ids["description"]: None}, "version": first["version"]},
            format="json",
        )
        change_request = self.submit(api_client, reason="待撤回")

        api_client.force_authenticate(user=self.approver)
        denied = api_client.post(
            self.url("requirement-change-request-cancel", pk=change_request["id"]),
            format="json",
        )
        assert denied.status_code == status.HTTP_403_FORBIDDEN, denied.data

        api_client.force_authenticate(user=self.owner)
        allowed = api_client.post(
            self.url("requirement-change-request-cancel", pk=change_request["id"]),
            format="json",
        )
        assert allowed.status_code == status.HTTP_200_OK, allowed.data
        assert allowed.data["status"] == "cancelled"
        assert RequirementBaseline.objects.get(product=self.product).status == "draft"
