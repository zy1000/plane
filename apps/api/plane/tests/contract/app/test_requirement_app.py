"""需求条目与需求基线的契约测试。

覆盖重构后的核心事实：
- Requirement 就是需求条目本身，产品需求与标准库条目落在同一张表上
- 标题与描述存在列上，但**接口契约里它们仍然以内置字段 UUID 出现在 data 里**
- 审批的单位是基线（一个产品的全部需求），基线由后端惰性创建
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
    "config",
    "default_value",
    "builtin_key",
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


def builtin_field_ids(fields):
    return {
        field["builtin_key"]: field["id"] for field in fields if field.get("builtin_key")
    }


@pytest.mark.contract
@pytest.mark.django_db
class TestRequirementApp:
    def setup_method(self):
        self.owner = UserFactory(username=f"requirement-owner-{uuid4()}")
        self.workspace = WorkspaceFactory(owner=self.owner)
        WorkspaceMember.objects.create(
            workspace=self.workspace, member=self.owner, role=20
        )
        self.product = Product.objects.create(
            name=f"Requirement product {uuid4()}",
            workspace=self.workspace,
            owner=self.owner,
        )

    # --- helpers -------------------------------------------------------

    def url(self, name, **kwargs):
        return reverse(name, kwargs={"slug": self.workspace.slug, **kwargs})

    def baseline_url(self):
        return self.url("requirement-baseline", product_id=self.product.id)

    def requirements_url(self):
        return self.url("product-requirements", product_id=self.product.id)

    def add_workspace_member(self, role=15):
        user = UserFactory(username=f"requirement-member-{uuid4()}")
        WorkspaceMember.objects.create(
            workspace=self.workspace, member=user, role=role
        )
        return user

    def create_requirement_type(self, api_client, name=None):
        """走创建接口 —— 只有它会补齐标题/描述两个内置字段。"""
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
                "config": {},
                "default_value": None,
                "builtin_key": None,
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

    def make_data(self, fields, title, description=None, **custom):
        ids = builtin_field_ids(fields)
        data = {ids["title"]: title, ids["description"]: description}
        by_name = {field["name"]: field["id"] for field in fields}
        for name, value in custom.items():
            data[by_name[name]] = value
        return data

    # --- tests ---------------------------------------------------------

    def test_baseline_is_created_lazily_and_starts_empty(self, api_client):
        api_client.force_authenticate(user=self.owner)
        assert not RequirementBaseline.objects.filter(product=self.product).exists()

        response = api_client.get(self.baseline_url())

        assert response.status_code == status.HTTP_200_OK, response.data
        assert response.data["baseline"]["status"] == "draft"
        assert response.data["baseline"]["current_version"] is None
        assert response.data["requirement_types"] == []
        assert response.data["is_frozen"] is False
        assert RequirementBaseline.objects.filter(product=self.product).count() == 1

    def test_title_and_description_round_trip_through_data(self, api_client):
        """存储上是列，契约上仍是 data 里的两个字段 UUID。"""
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        fields = self.add_custom_field(api_client, type_id)

        response = api_client.post(
            self.requirements_url(),
            {
                "requirement_type_id": type_id,
                "data": self.make_data(fields, "登录页支持短信验证码", "<p>细则</p>", 优先级="高"),
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED, response.data
        ids = builtin_field_ids(fields)
        assert response.data["title"] == "登录页支持短信验证码"
        assert response.data["description_html"] == "<p>细则</p>"
        # 契约：内置值仍以字段 UUID 出现在 data 里
        assert response.data["data"][ids["title"]] == "登录页支持短信验证码"
        assert response.data["data"][ids["description"]] == "<p>细则</p>"

        # 存储：列上有值，data 里只剩自定义字段
        row = Requirement.objects.get(id=response.data["id"])
        assert row.title == "登录页支持短信验证码"
        assert row.description_html == "<p>细则</p>"
        assert ids["title"] not in row.data
        assert ids["description"] not in row.data
        assert row.product_id == self.product.id
        assert row.library_id is None

    def test_search_matches_builtin_title_stored_on_the_column(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        fields = self.type_fields(api_client, type_id)
        for title in ("短信验证码登录", "扫码登录"):
            api_client.post(
                self.requirements_url(),
                {"requirement_type_id": type_id, "data": self.make_data(fields, title)},
                format="json",
            )

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

        created = api_client.post(
            reverse(
                "requirement-library-items",
                kwargs={"slug": self.workspace.slug, "library_id": library.id},
            ),
            {"data": self.make_data(fields, "标准条目", "<p>库描述</p>", 优先级="中")},
            format="json",
        )
        assert created.status_code == status.HTTP_201_CREATED, created.data
        item = Requirement.objects.get(id=created.data["id"])
        assert item.library_id == library.id
        assert item.product_id is None
        assert item.title == "标准条目"

        imported = api_client.post(
            f"{self.requirements_url()}import/",
            {"library_id": str(library.id), "item_ids": [str(item.id)]},
            format="json",
        )

        assert imported.status_code == status.HTTP_201_CREATED, imported.data
        assert imported.data["requirement_type_id"] == str(type_id)
        copy = Requirement.objects.get(product=self.product)
        assert copy.title == "标准条目"
        assert copy.description_html == "<p>库描述</p>"
        # 同一个需求类型，字段 UUID 一致，自定义值直接拷贝
        assert list(copy.data.values()) == ["中"]

    def test_requirement_type_cannot_be_deleted_while_requirements_reference_it(
        self, api_client
    ):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        fields = self.type_fields(api_client, type_id)
        api_client.post(
            self.requirements_url(),
            {"requirement_type_id": type_id, "data": self.make_data(fields, "占用中")},
            format="json",
        )

        response = api_client.delete(self.url("requirement-type-detail", pk=type_id))

        assert response.status_code == status.HTTP_409_CONFLICT, response.data
        assert response.data["code"] == "REQUIREMENT_TYPE_IN_USE"

    def test_non_member_cannot_reach_product_requirements(self, api_client):
        outsider = self.add_workspace_member()
        self.product.network = 0
        self.product.save(update_fields=["network"])
        api_client.force_authenticate(user=outsider)

        assert api_client.get(self.baseline_url()).status_code == status.HTTP_404_NOT_FOUND
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
        fields = self.type_fields(api_client, type_id)

        api_client.force_authenticate(user=viewer)
        assert api_client.get(self.requirements_url()).status_code == status.HTTP_200_OK
        response = api_client.post(
            self.requirements_url(),
            {"requirement_type_id": type_id, "data": self.make_data(fields, "无权限")},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN, response.data

        # 加入产品后即可维护
        ProductMember.objects.create(product=self.product, member=viewer)
        allowed = api_client.post(
            self.requirements_url(),
            {"requirement_type_id": type_id, "data": self.make_data(fields, "有权限")},
            format="json",
        )
        assert allowed.status_code == status.HTTP_201_CREATED, allowed.data

    def test_authentication_is_enforced(self, api_client):
        assert api_client.get(self.baseline_url()).status_code in (
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        )

    def test_bulk_save_applies_mixed_operations(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        fields = self.type_fields(api_client, type_id)
        first = api_client.post(
            self.requirements_url(),
            {"requirement_type_id": type_id, "data": self.make_data(fields, "第一条")},
            format="json",
        ).data
        second = api_client.post(
            self.requirements_url(),
            {"requirement_type_id": type_id, "data": self.make_data(fields, "第二条")},
            format="json",
        ).data
        expected_updated_at = api_client.get(self.baseline_url()).data[
            "expected_updated_at"
        ]

        response = api_client.post(
            f"{self.requirements_url()}bulk-save/",
            {
                "expected_updated_at": expected_updated_at,
                "creates": [
                    {
                        "client_id": str(uuid4()),
                        "requirement_type_id": type_id,
                        "data": self.make_data(fields, "第三条"),
                    }
                ],
                "updates": [
                    {
                        "id": first["id"],
                        "version": first["version"],
                        "data": self.make_data(fields, "第一条（改）"),
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

    def test_bulk_save_rejects_stale_grid_token(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        fields = self.type_fields(api_client, type_id)

        response = api_client.post(
            f"{self.requirements_url()}bulk-save/",
            {
                "expected_updated_at": "2020-01-01T00:00:00Z",
                "creates": [
                    {
                        "client_id": str(uuid4()),
                        "requirement_type_id": type_id,
                        "data": self.make_data(fields, "过期令牌"),
                    }
                ],
                "updates": [],
                "deletes": [],
            },
            format="json",
        )

        assert response.status_code == status.HTTP_409_CONFLICT, response.data
        assert response.data["code"] == "REQUIREMENT_CONFIGURATION_CONFLICT"
        assert not Requirement.objects.filter(product=self.product).exists()
