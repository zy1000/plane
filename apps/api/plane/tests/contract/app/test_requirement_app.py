"""需求条目与需求配置的契约测试。

覆盖的核心事实：
- Requirement 就是需求条目本身，产品需求与标准库条目落在同一张表上
- 八个内置字段是行上的**真实列**，走 builtin 传，不再以字段 UUID 出现在 data 里
- 需求配置（谁能批、要几个人批）由后端惰性创建，不再持有状态与版本
- 只读是**行级**的：一条在评审中不影响同产品的其它行
"""

from uuid import uuid4

import pytest
from django.urls import reverse
from rest_framework import status

from plane.db.models import (
    Product,
    ProductMember,
    Requirement,
    RequirementApprovalPolicy,
    RequirementLibrary,
    RequirementType,
    WorkspaceMember,
)
from plane.tests.factories import UserFactory, WorkspaceFactory


FIELD_PAYLOAD_KEYS = (
    "id",
    "name",
    "field_type",
    "is_required",
    "is_active",
    "field_category",
    "config",
    "default_value",
)


def writable_fields(fields):
    """把配置接口返回的字段树整理成可以原样回传的写入载荷。"""
    result = []
    for field in fields:
        payload = {key: field[key] for key in FIELD_PAYLOAD_KEYS}
        payload["children"] = [
            {key: child[key] for key in FIELD_PAYLOAD_KEYS}
            for child in field.get("children") or []
        ]
        result.append(payload)
    return result


@pytest.mark.contract
@pytest.mark.django_db
class TestRequirementApp:
    def setup_method(self):
        self.owner = UserFactory(username=f"requirement-owner-{uuid4()}")
        self.approver = UserFactory(username=f"requirement-approver-{uuid4()}")
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
        return reverse(name, kwargs={"slug": self.workspace.slug, **kwargs})

    def configuration_url(self):
        return self.url("requirement-configuration", product_id=self.product.id)

    def requirements_url(self):
        return self.url("product-requirements", product_id=self.product.id)

    def add_workspace_member(self, role=15):
        user = UserFactory(username=f"requirement-member-{uuid4()}")
        WorkspaceMember.objects.create(
            workspace=self.workspace, member=user, role=role
        )
        return user

    def create_requirement_type(self, api_client, name=None):
        response = api_client.post(
            self.url("requirement-types"),
            {"name": name or f"Requirement type {uuid4()}"},
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        return response.data["id"]

    def type_fields(self, api_client, requirement_type_id):
        response = api_client.get(
            self.url("requirement-type-configuration", pk=requirement_type_id)
        )
        assert response.status_code == status.HTTP_200_OK, response.data
        return response.data["fields"]

    def add_custom_field(self, api_client, requirement_type_id, name="优先级"):
        fields = self.type_fields(api_client, requirement_type_id)
        payload = writable_fields(fields)
        payload.append(
            {
                "name": name,
                "field_type": "text",
                "is_required": False,
                "is_active": True,
                "field_category": "standard",
                "config": {},
                "default_value": None,
                "children": [],
            }
        )
        response = api_client.put(
            self.url("requirement-type-configuration", pk=requirement_type_id),
            {
                "expected_updated_at": RequirementType.objects.get(
                    id=requirement_type_id
                ).updated_at.isoformat(),
                "fields": payload,
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK, response.data
        return self.type_fields(api_client, requirement_type_id)

    def make_payload(self, type_id, title, description=None, fields=None, **custom):
        """内置列走 builtin，自定义字段走 data。"""
        data = {}
        if custom:
            by_name = {field["name"]: field["id"] for field in fields or []}
            for name, value in custom.items():
                data[by_name[name]] = value
        return {
            "requirement_type_id": type_id,
            "data": data,
            "builtin": {"title": title, "description_html": description},
        }

    def add_requirement(self, api_client, type_id, title, **kwargs):
        response = api_client.post(
            self.requirements_url(),
            self.make_payload(type_id, title, **kwargs),
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        return response.data

    def configure_approver(self, api_client):
        policy = api_client.get(self.configuration_url()).data["policy"]
        response = api_client.put(
            self.configuration_url(),
            {
                "expected_updated_at": policy["updated_at"],
                "policy": {
                    "owner_id": str(self.owner.id),
                    "approver_ids": [str(self.approver.id)],
                    "approval_type": "any",
                    "required_count": None,
                },
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK, response.data

    # --- tests ---------------------------------------------------------

    def test_configuration_is_created_lazily_and_starts_empty(self, api_client):
        api_client.force_authenticate(user=self.owner)
        assert not RequirementApprovalPolicy.objects.filter(
            product=self.product
        ).exists()

        response = api_client.get(self.configuration_url())

        assert response.status_code == status.HTTP_200_OK, response.data
        # 配置不再持有状态与版本 —— 那些长在每一条需求上
        assert "status" not in response.data["policy"]
        assert response.data["policy"]["pending_change_request_count"] == 0
        assert response.data["requirement_types"] == []
        assert (
            RequirementApprovalPolicy.objects.filter(product=self.product).count() == 1
        )

    def test_builtin_values_live_on_columns_not_in_data(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        fields = self.add_custom_field(api_client, type_id)

        response = api_client.post(
            self.requirements_url(),
            self.make_payload(
                type_id, "登录页支持短信验证码", "细则", fields=fields, 优先级="高"
            ),
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert response.data["title"] == "登录页支持短信验证码"
        assert response.data["description_html"] == "细则"
        assert response.data["approval_state"] == "draft"

        row = Requirement.objects.get(id=response.data["id"])
        assert row.title == "登录页支持短信验证码"
        assert row.description_html == "细则"
        # data 只装自定义字段
        assert list(row.data.values()) == ["高"]
        assert row.product_id == self.product.id
        assert row.library_id is None

    def test_search_matches_builtin_title_stored_on_the_column(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        for title in ("短信验证码登录", "扫码登录"):
            self.add_requirement(api_client, type_id, title)

        response = api_client.get(self.requirements_url(), {"search": "扫码"})

        assert response.status_code == status.HTTP_200_OK, response.data
        assert [item["title"] for item in response.data["results"]] == ["扫码登录"]

    def test_library_items_are_requirements_and_import_copies_them(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        fields = self.add_custom_field(api_client, type_id)
        library = RequirementLibrary.objects.create(
            workspace=self.workspace,
            requirement_type_id=type_id,
            name=f"Library {uuid4()}",
        )
        by_name = {field["name"]: field["id"] for field in fields}

        created = api_client.post(
            reverse(
                "requirement-library-items",
                kwargs={"slug": self.workspace.slug, "library_id": library.id},
            ),
            {
                "data": {by_name["优先级"]: "中"},
                "builtin": {"title": "标准条目", "description_html": "库描述"},
            },
            format="json",
        )
        assert created.status_code == status.HTTP_201_CREATED, created.data
        item = Requirement.objects.get(id=created.data["id"])
        assert item.library_id == library.id
        assert item.product_id is None
        assert item.title == "标准条目"
        # 标准库条目永不走审批 —— 由 req_library_item_never_approved 约束硬保证
        assert item.approved_version is None
        assert item.status == "draft"

        imported = api_client.post(
            f"{self.requirements_url()}import/",
            {"library_id": str(library.id), "item_ids": [str(item.id)]},
            format="json",
        )

        assert imported.status_code == status.HTTP_201_CREATED, imported.data
        assert imported.data["requirement_type_id"] == str(type_id)
        copy = Requirement.objects.get(product=self.product)
        assert copy.title == "标准条目"
        assert copy.description_html == "库描述"
        assert list(copy.data.values()) == ["中"]

    def test_requirement_type_cannot_be_deleted_while_requirements_reference_it(
        self, api_client
    ):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        self.add_requirement(api_client, type_id, "占用中")

        response = api_client.delete(self.url("requirement-type-detail", pk=type_id))

        assert response.status_code == status.HTTP_409_CONFLICT, response.data
        assert response.data["code"] == "REQUIREMENT_TYPE_IN_USE"

    def test_requirement_type_configuration_requires_workspace_membership(
        self, api_client
    ):
        """类型字段结构会立刻影响所有产品的所有需求，不能任由非成员改。"""
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        outsider = UserFactory(username=f"requirement-outsider-{uuid4()}")

        api_client.force_authenticate(user=outsider)
        response = api_client.put(
            self.url("requirement-type-configuration", pk=type_id),
            {
                "expected_updated_at": RequirementType.objects.get(
                    id=type_id
                ).updated_at.isoformat(),
                "fields": [],
            },
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN, response.data

    def test_non_member_cannot_reach_product_requirements(self, api_client):
        outsider = self.add_workspace_member()
        self.product.network = 0
        self.product.save(update_fields=["network"])
        api_client.force_authenticate(user=outsider)

        assert (
            api_client.get(self.configuration_url()).status_code
            == status.HTTP_404_NOT_FOUND
        )
        assert (
            api_client.get(self.requirements_url()).status_code
            == status.HTTP_404_NOT_FOUND
        )

    def test_viewer_of_a_public_product_can_read_but_not_write(self, api_client):
        """产品成员可以维护需求；只是能看见公开产品的工作区成员不行。"""
        viewer = self.add_workspace_member()
        self.product.network = 2
        self.product.save(update_fields=["network"])
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)

        api_client.force_authenticate(user=viewer)
        assert api_client.get(self.requirements_url()).status_code == status.HTTP_200_OK
        response = api_client.post(
            self.requirements_url(),
            self.make_payload(type_id, "无权限"),
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN, response.data

        ProductMember.objects.create(product=self.product, member=viewer)
        allowed = api_client.post(
            self.requirements_url(),
            self.make_payload(type_id, "有权限"),
            format="json",
        )
        assert allowed.status_code == status.HTTP_201_CREATED, allowed.data

    def test_authentication_is_enforced(self, api_client):
        assert api_client.get(self.configuration_url()).status_code in (
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        )

    def test_bulk_save_applies_mixed_operations(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        first = self.add_requirement(api_client, type_id, "第一条")
        second = self.add_requirement(api_client, type_id, "第二条")

        # 没有 expected_updated_at —— 真实冲突由逐行 version 覆盖
        response = api_client.post(
            f"{self.requirements_url()}bulk-save/",
            {
                "creates": [
                    {
                        "client_id": str(uuid4()),
                        "requirement_type_id": type_id,
                        "data": {},
                        "builtin": {"title": "第三条"},
                    }
                ],
                "updates": [
                    {
                        "id": first["id"],
                        "version": first["version"],
                        "data": {},
                        "builtin": {"title": "第一条（改）"},
                    }
                ],
                "deletes": [{"id": second["id"], "version": second["version"]}],
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK, response.data
        assert len(response.data["created"]) == 1
        assert response.data["created"][0]["requirement"]["title"] == "第三条"
        assert response.data["updated"][0]["title"] == "第一条（改）"
        assert response.data["deleted_ids"] == [str(second["id"])]
        assert sorted(
            Requirement.objects.filter(product=self.product).values_list(
                "title", flat=True
            )
        ) == ["第一条（改）", "第三条"]

    def test_bulk_save_rejects_rows_that_are_under_review(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        self.configure_approver(api_client)
        locked = self.add_requirement(api_client, type_id, "评审中")
        submitted = api_client.post(
            self.url(
                "requirement-change-requests", product_id=self.product.id
            ),
            {"reason": "提交", "items": [{"requirement_id": locked["id"]}]},
            format="json",
        )
        assert submitted.status_code == status.HTTP_201_CREATED, submitted.data

        response = api_client.post(
            f"{self.requirements_url()}bulk-save/",
            {
                "creates": [],
                "updates": [
                    {
                        "id": locked["id"],
                        "version": locked["version"],
                        "data": {},
                        "builtin": {"title": "偷偷改"},
                    }
                ],
                "deletes": [],
            },
            format="json",
        )

        assert response.status_code == status.HTTP_409_CONFLICT, response.data
        assert response.data["code"] == "REQUIREMENT_BATCH_CONFLICT"
        assert response.data["conflicts"] == [
            {"id": str(locked["id"]), "reason": "in_review"}
        ]
        assert Requirement.objects.get(id=locked["id"]).title == "评审中"
