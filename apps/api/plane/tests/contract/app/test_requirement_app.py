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
    RequirementLibrary,
    RequirementType,
    WorkspaceMember,
)
from plane.tests.factories import UserFactory, WorkspaceFactory
from plane.utils.requirement import ORDERABLE_BUILTIN_COLUMNS


FIELD_PAYLOAD_KEYS = (
    "id",
    "name",
    "field_type",
    "is_required",
    "is_active",
    "show_in_library",
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
            identifier=f"P{uuid4().hex[:7].upper()}",
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
                "show_in_library": True,
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

    # --- tests ---------------------------------------------------------

    def test_configuration_is_read_only_and_carries_no_policy(self, api_client):
        api_client.force_authenticate(user=self.owner)

        response = api_client.get(self.configuration_url())

        assert response.status_code == status.HTTP_200_OK, response.data
        # 产品级不再有审批配置：评审人与规则随每次提交给定
        assert "policy" not in response.data
        assert response.data["can_edit"] is True
        assert response.data["pending_change_request_count"] == 0
        assert response.data["requirement_types"] == []

        updated = api_client.put(self.configuration_url(), {}, format="json")
        assert updated.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

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
            identifier=f"L{uuid4().hex[:7].upper()}",
        )
        by_name = {field["name"]: field["id"] for field in fields}

        # 不带编号也能建（行内新增的空行）：服务端按「库标识-序号」补占位编号
        auto_coded = api_client.post(
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
        assert auto_coded.status_code == status.HTTP_201_CREATED, auto_coded.data
        assert auto_coded.data["sequence_id"] == 1
        assert auto_coded.data["code"] == f"{library.identifier}-1"
        assert auto_coded.data["display_id"] == f"{library.identifier}-1"

        created = api_client.post(
            reverse(
                "requirement-library-items",
                kwargs={"slug": self.workspace.slug, "library_id": library.id},
            ),
            {
                "data": {by_name["优先级"]: "中"},
                "builtin": {"title": "标准条目", "description_html": "库描述"},
                "code": "REQ-登录-001",
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
        assert item.status == "not_started"
        # 库条目的展示编号就是手填的 code（不校验格式）；内部序号照常分配，
        # 且它是导入的源头，不可能有来源
        assert item.sequence_id == 2
        assert item.code == "REQ-登录-001"
        assert created.data["display_id"] == "REQ-登录-001"
        assert item.source_library_id is None
        assert created.data["source_display_id"] is None

        # 同库内编号不可重复
        duplicated = api_client.post(
            reverse(
                "requirement-library-items",
                kwargs={"slug": self.workspace.slug, "library_id": library.id},
            ),
            {
                "data": {},
                "builtin": {"title": "撞号条目"},
                "code": "REQ-登录-001",
            },
            format="json",
        )
        assert duplicated.status_code == status.HTTP_400_BAD_REQUEST, duplicated.data
        assert "REQUIREMENT_CODE_ALREADY_EXISTS" in str(duplicated.data)

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
        # 导入的行同时有自己的产品编号和来源库编号：产品编号仍是自动生成的
        # identifier-序号，来源编号则实时跟随库条目当前的手填 code
        payload = imported.data["created"][0]["requirement"]
        assert payload["display_id"] == f"{self.product.identifier}-1"
        assert copy.source_library_id == library.id
        assert copy.source_sequence_id == item.sequence_id
        assert copy.code is None
        assert payload["source_display_id"] == "REQ-登录-001"

        # 改库标识**不再**影响来源编号（编号已与标识脱钩）；改库条目的手填编号，
        # 已导入行的来源编号实时跟随 —— 这正是存结构化 id 而不是快照字符串的理由
        library.identifier = "RENAMED"
        library.save()
        item.code = "REQ-登录-V2"
        item.save(update_fields=["code"])
        listed = api_client.get(self.requirements_url())
        assert listed.status_code == status.HTTP_200_OK, listed.data
        assert listed.data["results"][0]["source_display_id"] == "REQ-登录-V2"

    def test_sequence_ids_increment_per_scope_and_are_never_reused(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)

        rows = [self.add_requirement(api_client, type_id, f"需求 {i}") for i in range(3)]
        assert [row["sequence_id"] for row in rows] == [1, 2, 3]
        assert [row["display_id"] for row in rows] == [
            f"{self.product.identifier}-{n}" for n in (1, 2, 3)
        ]
        # 手工录入的行没有来源
        assert all(row["source_display_id"] is None for row in rows)

        deleted = api_client.delete(f"{self.requirements_url()}{rows[-1]['id']}/")
        assert deleted.status_code == status.HTTP_204_NO_CONTENT, deleted.data

        # 编号永不复用：软删的行仍然占着 3 号，取号侧用的是 all_objects。
        # 用 objects 的话这里会拿到 3，然后撞 req_unique_product_sequence。
        again = self.add_requirement(api_client, type_id, "删完再建")
        assert again["sequence_id"] == 4

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
        locked = self.add_requirement(api_client, type_id, "评审中")
        submitted = api_client.post(
            self.url(
                "requirement-change-requests", product_id=self.product.id
            ),
            {
                "reason": "提交",
                "approval_type": "any",
                "approver_ids": [str(self.approver.id)],
                "items": [{"requirement_id": locked["id"]}],
            },
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

    # --- 内置字段布局 ---------------------------------------------------

    def builtin_fields_payload(self, *, positions=None, show_in_library=None):
        """缺省即现状：canonical 顺序、描述/优先级/父项纳入库、其余不纳入。"""
        overrides = show_in_library or {}
        return [
            {
                "key": key,
                "show_in_library": overrides.get(
                    key, key in ("description_html", "priority", "parent_id")
                ),
                "position": (positions or {}).get(key, index),
            }
            for index, key in enumerate(ORDERABLE_BUILTIN_COLUMNS)
        ]

    def put_type_configuration(self, api_client, type_id, *, builtin_fields=None):
        payload = {
            "expected_updated_at": RequirementType.objects.get(
                id=type_id
            ).updated_at.isoformat(),
            "fields": writable_fields(self.type_fields(api_client, type_id)),
        }
        if builtin_fields is not None:
            payload["builtin_fields"] = builtin_fields
        return api_client.put(
            self.url("requirement-type-configuration", pk=type_id),
            payload,
            format="json",
        )

    def test_builtin_layout_defaults_keep_builtin_before_custom(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)

        response = api_client.get(
            self.url("requirement-type-configuration", pk=type_id)
        )

        assert response.status_code == status.HTTP_200_OK, response.data
        entries = response.data["builtin_fields"]
        assert [entry["key"] for entry in entries] == list(ORDERABLE_BUILTIN_COLUMNS)
        assert [entry["show_in_library"] for entry in entries] == [
            True, False, True, False, False, False, True,
        ]
        # 缺省 sort_order 恒小于第一个自定义字段的 (0+1)*1000 —— 内置在前
        assert all(entry["sort_order"] < 1000 for entry in entries)

    def test_builtin_layout_interleaves_and_survives_old_payloads(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        self.add_custom_field(api_client, type_id)
        revision_before = RequirementType.objects.get(
            id=type_id
        ).current_schema_revision

        # 自定义字段占统一列表第 0 位，内置项依次 1..7
        positions = {
            key: index + 1 for index, key in enumerate(ORDERABLE_BUILTIN_COLUMNS)
        }
        response = self.put_type_configuration(
            api_client,
            type_id,
            builtin_fields=self.builtin_fields_payload(positions=positions),
        )

        assert response.status_code == status.HTTP_200_OK, response.data
        # 双方 sort_order 出自同一套槽位公式，读侧归并即还原统一顺序
        assert response.data["fields"][0]["sort_order"] == 1000
        assert [entry["sort_order"] for entry in response.data["builtin_fields"]] == [
            (position + 1) * 1000 for position in range(1, 8)
        ]
        # 仅动内置布局不产字段结构修订
        assert (
            RequirementType.objects.get(id=type_id).current_schema_revision
            == revision_before
        )

        # 旧客户端载荷（不带 builtin_fields）不清空既有布局
        old_payload = self.put_type_configuration(api_client, type_id)
        assert old_payload.status_code == status.HTTP_200_OK, old_payload.data
        assert old_payload.data["builtin_fields"][0]["key"] == "description_html"
        assert old_payload.data["builtin_fields"][0]["sort_order"] == 2000

    def test_builtin_layout_validation_rejects_bad_payloads(self, api_client):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)

        missing_key = self.builtin_fields_payload()[:-1]
        with_title = self.builtin_fields_payload()
        with_title[0] = {**with_title[0], "key": "title"}
        with_code = self.builtin_fields_payload()
        with_code[0] = {**with_code[0], "key": "code"}
        duplicated_position = self.builtin_fields_payload()
        duplicated_position[1] = {**duplicated_position[1], "position": 0}
        # 零个自定义字段时统一列表只有 7 槽，position 7 越界
        out_of_range = self.builtin_fields_payload()
        out_of_range[-1] = {**out_of_range[-1], "position": 7}
        status_in_library = self.builtin_fields_payload(
            show_in_library={"status": True}
        )

        for payload in (
            missing_key,
            with_title,
            with_code,
            duplicated_position,
            out_of_range,
            status_in_library,
        ):
            response = self.put_type_configuration(
                api_client, type_id, builtin_fields=payload
            )
            assert (
                response.status_code == status.HTTP_400_BAD_REQUEST
            ), response.data

    def test_builtin_show_in_library_flip_controls_library_and_import(
        self, api_client
    ):
        api_client.force_authenticate(user=self.owner)
        type_id = self.create_requirement_type(api_client)
        # 勾上「负责人」纳入标准库
        response = self.put_type_configuration(
            api_client,
            type_id,
            builtin_fields=self.builtin_fields_payload(
                show_in_library={"assignee_id": True}
            ),
        )
        assert response.status_code == status.HTTP_200_OK, response.data

        library = RequirementLibrary.objects.create(
            workspace=self.workspace,
            requirement_type_id=type_id,
            name=f"Library {uuid4()}",
            identifier=f"L{uuid4().hex[:7].upper()}",
        )
        library_kwargs = {"slug": self.workspace.slug, "library_id": library.id}
        created = api_client.post(
            reverse("requirement-library-items", kwargs=library_kwargs),
            {
                "data": {},
                "builtin": {
                    "title": "带负责人的模板",
                    "assignee_id": str(self.approver.id),
                },
                "code": "LIB-001",
            },
            format="json",
        )
        assert created.status_code == status.HTTP_201_CREATED, created.data
        item = Requirement.objects.get(id=created.data["id"])
        # 已纳入库的内置列不再被拍回缺省；status 恒不纳入
        assert item.assignee_id == self.approver.id
        assert item.status == "not_started"

        # 库配置出口发完整 7 项，show_in_library 标志由前端过滤；status 恒为 False
        config = api_client.get(
            reverse("requirement-library-configuration", kwargs=library_kwargs)
        )
        assert config.status_code == status.HTTP_200_OK, config.data
        library_visibility = {
            entry["key"]: entry["show_in_library"]
            for entry in config.data["builtin_fields"]
        }
        assert len(library_visibility) == 7
        assert library_visibility["assignee_id"] is True
        assert library_visibility["status"] is False

        # 导入产品：负责人跟着落地
        imported = api_client.post(
            f"{self.requirements_url()}import/",
            {"library_id": str(library.id), "item_ids": [str(item.id)]},
            format="json",
        )
        assert imported.status_code == status.HTTP_201_CREATED, imported.data
        copy = Requirement.objects.get(product=self.product)
        assert copy.assignee_id == self.approver.id

        # 翻回不纳入：存量值不回溯清洗，下一次库写入才拍回缺省
        response = self.put_type_configuration(
            api_client, type_id, builtin_fields=self.builtin_fields_payload()
        )
        assert response.status_code == status.HTTP_200_OK, response.data
        item.refresh_from_db()
        assert item.assignee_id == self.approver.id

        saved = api_client.post(
            reverse("requirement-library-item-bulk-save", kwargs=library_kwargs),
            {
                "creates": [],
                "updates": [
                    {
                        "id": str(item.id),
                        "version": item.version,
                        "data": {},
                        "builtin": {"title": "改个标题"},
                    }
                ],
                "deletes": [],
            },
            format="json",
        )
        assert saved.status_code == status.HTTP_200_OK, saved.data
        item.refresh_from_db()
        assert item.title == "改个标题"
        assert item.assignee_id is None

    def test_excel_sheet_spec_follows_builtin_layout(self):
        from plane.utils import requirement_excel as xl
        from plane.utils.requirement import RequirementFieldSpec

        custom = RequirementFieldSpec(
            id=str(uuid4()),
            parent_field_id=None,
            name="自定义",
            field_type="text",
            is_required=False,
            is_active=True,
            sort_order=1000,
            config={},
        )
        # priority 与自定义字段撞在 1000 上 —— 归并规则：相等时内置在前
        layout = [
            {"key": "priority", "show_in_library": True, "sort_order": 1000},
            {"key": "description_html", "show_in_library": True, "sort_order": 3000},
            {"key": "status", "show_in_library": False, "sort_order": 4000},
            {"key": "assignee_id", "show_in_library": False, "sort_order": 5000},
            {"key": "start_date", "show_in_library": False, "sort_order": 6000},
            {"key": "target_date", "show_in_library": False, "sort_order": 7000},
            {"key": "parent_id", "show_in_library": True, "sort_order": 8000},
        ]

        product_sheet = xl.build_sheet_spec(
            requirement_type_id=str(uuid4()),
            requirement_type_name="类型",
            field_specs=[custom],
            is_library=False,
            sheet_name="类型",
            builtin_layout=layout,
        )
        assert [column.key for column in product_sheet.columns] == [
            xl.SEQUENCE_COLUMN_KEY,
            "title",
            "priority",
            custom.id,
            "description_html",
            "status",
            "assignee_id",
            "start_date",
            "target_date",
            "parent_id",
        ]

        library_sheet = xl.build_sheet_spec(
            requirement_type_id=str(uuid4()),
            requirement_type_name="类型",
            field_specs=[custom],
            is_library=True,
            sheet_name="类型",
            builtin_layout=layout,
        )
        # 库剔除未纳入的内置列；编号 / 标题恒锁定最前
        assert [column.key for column in library_sheet.columns] == [
            xl.SEQUENCE_COLUMN_KEY,
            "title",
            "priority",
            custom.id,
            "description_html",
            "parent_id",
        ]
