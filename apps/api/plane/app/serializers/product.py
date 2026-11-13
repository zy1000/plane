import re
from collections import defaultdict
from operator import attrgetter

from rest_framework import serializers

from plane.app.serializers.user import UserLiteSerializer
from plane.db.models import (
    DataDictionaryItem,
    Product,
    User,
    WorkspaceMember,
)
from plane.app.permissions.base import _get_user_product_permission_keys, bulk_product_permission_keys
from plane.utils.content_validator import validate_html_content
from plane.utils.data_dictionary import PRODUCT_DICTIONARY_FIELD_KEYS

from .base import BaseSerializer
from .data_dictionary import DataDictionaryItemLiteSerializer


# 首位必须是字母，且不含连字符 —— 展示编号是 "{identifier}-{sequence_id}"，
# 标识里再出现连字符就没法反解（"A-B-1" 有两种读法）。
IDENTIFIER_PATTERN = re.compile(r"^[A-Z][A-Z0-9]{0,11}$")


def _dictionary_item_field():
    # 必须显式声明：模型列 null=True，ModelSerializer 会自动生成 required=False / allow_null=True。
    # 这里要的是「创建必填、PATCH 可省略、显式 null 拒绝」—— required=True + allow_null 默认 False 正好。
    return serializers.PrimaryKeyRelatedField(
        queryset=DataDictionaryItem.objects.select_related("dictionary"), required=True
    )


class ProductSerializer(BaseSerializer):
    description_html = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    stage = _dictionary_item_field()
    category = _dictionary_item_field()
    status = _dictionary_item_field()
    hardware_level = _dictionary_item_field()
    structure_level = _dictionary_item_field()
    software_level = _dictionary_item_field()
    stage_detail = DataDictionaryItemLiteSerializer(source="stage", read_only=True)
    category_detail = DataDictionaryItemLiteSerializer(source="category", read_only=True)
    status_detail = DataDictionaryItemLiteSerializer(source="status", read_only=True)
    hardware_level_detail = DataDictionaryItemLiteSerializer(
        source="hardware_level", read_only=True
    )
    structure_level_detail = DataDictionaryItemLiteSerializer(
        source="structure_level", read_only=True
    )
    software_level_detail = DataDictionaryItemLiteSerializer(
        source="software_level", read_only=True
    )
    start_date = serializers.DateField(required=True)
    project_lead = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), required=True
    )
    test_lead = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), required=True
    )
    project_lead_detail = UserLiteSerializer(source="project_lead", read_only=True)
    test_lead_detail = UserLiteSerializer(source="test_lead", read_only=True)
    # 当前用户在这个产品里的有效 product.* key。前端所有产品内的按钮显隐都读它，
    # 列表 / 详情 / 弹窗 / 设置区手里本来就有产品对象，不用再单独拉一次。
    my_permission_keys = serializers.SerializerMethodField()
    reviewers = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), many=True, required=False
    )
    owner = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), required=False
    )
    owner_detail = UserLiteSerializer(source="owner", read_only=True)
    reviewer_details = UserLiteSerializer(source="reviewers", many=True, read_only=True)
    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("Product name cannot be empty.")

        workspace = self.context.get("workspace")
        if workspace is None:
            raise serializers.ValidationError("Workspace is required.")

        queryset = Product.objects.filter(workspace=workspace, name=name)
        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("PRODUCT_NAME_ALREADY_EXISTS")
        return name

    def validate_identifier(self, value):
        # 归一化必须排在查重之前：先查后转的话，提交 "ecom" 会绕过这里的查重，
        # 然后在 Product.save() 里变成 "ECOM" 撞上 DB 唯一约束 —— 用户拿到 500 而不是 400。
        identifier = (value or "").strip().upper()
        if not IDENTIFIER_PATTERN.match(identifier):
            raise serializers.ValidationError("PRODUCT_IDENTIFIER_INVALID")

        workspace = self.context.get("workspace")
        if workspace is None:
            raise serializers.ValidationError("Workspace is required.")

        queryset = Product.objects.filter(workspace=workspace, identifier=identifier)
        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("PRODUCT_IDENTIFIER_ALREADY_EXISTS")
        return identifier

    def validate_reviewers(self, reviewers):
        workspace = self.context.get("workspace")
        if workspace is None or not reviewers:
            return reviewers

        reviewer_ids = {reviewer.id for reviewer in reviewers}
        workspace_reviewer_ids = set(
            WorkspaceMember.objects.filter(
                workspace=workspace,
                member_id__in=reviewer_ids,
                is_active=True,
                deleted_at__isnull=True,
            ).values_list("member_id", flat=True)
        )
        if reviewer_ids != workspace_reviewer_ids:
            raise serializers.ValidationError(
                "All reviewers must be active members of this workspace."
            )
        return reviewers

    def _require_workspace_member(self, user, message):
        workspace = self.context.get("workspace")
        if workspace is None:
            raise serializers.ValidationError("Workspace is required.")
        if not WorkspaceMember.objects.filter(
            workspace=workspace,
            member=user,
            is_active=True,
            deleted_at__isnull=True,
        ).exists():
            raise serializers.ValidationError(message)
        return user

    # 两位负责人只要求是工作区成员，不像 owner 那样要求已在产品成员表里
    def validate_project_lead(self, user):
        return self._require_workspace_member(
            user, "Project lead must be an active member of this workspace."
        )

    def validate_test_lead(self, user):
        return self._require_workspace_member(
            user, "Test lead must be an active member of this workspace."
        )

    def validate_code(self, value):
        code = (value or "").strip()
        if not code:
            raise serializers.ValidationError("Product code cannot be empty.")
        return code

    def validate(self, attrs):
        attrs = super().validate(attrs)
        # 字典值必须属于本工作区、且来自对应的系统字典（阶段字段不能塞一个「产品状态」的值）
        workspace = self.context.get("workspace")
        errors = {}
        for field, key in PRODUCT_DICTIONARY_FIELD_KEYS.items():
            item = attrs.get(field)
            if item is None:
                continue
            if (
                workspace is None
                or item.workspace_id != workspace.id
                or item.dictionary.key != key
            ):
                errors[field] = ["PRODUCT_DICTIONARY_ITEM_INVALID"]
        if errors:
            raise serializers.ValidationError(errors)
        return attrs

    def get_my_permission_keys(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is None:
            return []
        return sorted(_get_user_product_permission_keys(user, obj))

    def validate_owner(self, owner):
        workspace = self.context.get("workspace")
        if workspace is None:
            raise serializers.ValidationError("Workspace is required.")
        if not WorkspaceMember.objects.filter(
            workspace=workspace,
            member=owner,
            is_active=True,
            deleted_at__isnull=True,
        ).exists():
            raise serializers.ValidationError(
                "Owner must be an active member of this workspace."
            )
        return owner

    def validate_description_html(self, value):
        if value is None or value == "":
            return value
        is_valid, error_message, sanitized_html = validate_html_content(value)
        if not is_valid:
            raise serializers.ValidationError(
                error_message or "HTML content is not valid."
            )
        return sanitized_html if sanitized_html is not None else value

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            # 需求编号的前缀（ECOM-1）。可以 PATCH 改 —— 编号是读时拼的，
            # 改完所有已有需求的展示编号自动跟随，没有第二份真相要同步。
            "identifier",
            "code",
            "description_html",
            "workspace",
            "owner",
            "reviewers",
            "owner_detail",
            "reviewer_details",
            "stage",
            "category",
            "status",
            "hardware_level",
            "structure_level",
            "software_level",
            "stage_detail",
            "category_detail",
            "status_detail",
            "hardware_level_detail",
            "structure_level_detail",
            "software_level_detail",
            "start_date",
            "project_lead",
            "test_lead",
            "project_lead_detail",
            "test_lead_detail",
            "model_number",
            "external_model",
            "o_phase_close_date",
            "v_phase_close_date",
            "logo_props",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "my_permission_keys",
        ]
        read_only_fields = [
            "id",
            "workspace",
            "owner_detail",
            "reviewer_details",
            "stage_detail",
            "category_detail",
            "status_detail",
            "hardware_level_detail",
            "structure_level_detail",
            "software_level_detail",
            "project_lead_detail",
            "test_lead_detail",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "my_permission_keys",
        ]


# ---------------------------------------------------------------------------
# 列表接口：仍然全量返回，但人员 / 字典值 / 权限键集合只输出一次，行里只带标量和 id。
# 前端 product.service.ts 的 hydrateProductList 按 id 还原成完整产品对象。
# ---------------------------------------------------------------------------

_USER_FIELDS = ("owner", "project_lead", "test_lead")
_USER_ATTNAMES = tuple(f"{field}_id" for field in _USER_FIELDS)
_DICTIONARY_ATTNAMES = tuple(f"{field}_id" for field in PRODUCT_DICTIONARY_FIELD_KEYS)
_DATETIME = serializers.DateTimeField()

# 列表行里不输出、改放进公共表的字段
PRODUCT_LIST_SHARED_FIELDS = frozenset(
    {"reviewer_details", "my_permission_keys"}
    | {f"{field}_detail" for field in (*_USER_FIELDS, *PRODUCT_DICTIONARY_FIELD_KEYS)}
)

# 列表行的字段 -> 取值。几千行不逐行走 ProductSerializer，输出的值与格式和它一致
_PRODUCT_LIST_ROW_GETTERS = {
    "id": attrgetter("id"),
    "name": attrgetter("name"),
    "identifier": attrgetter("identifier"),
    "code": attrgetter("code"),
    "description_html": attrgetter("description_html"),
    "workspace": attrgetter("workspace_id"),
    "owner": attrgetter("owner_id"),
    "stage": attrgetter("stage_id"),
    "category": attrgetter("category_id"),
    "status": attrgetter("status_id"),
    "hardware_level": attrgetter("hardware_level_id"),
    "structure_level": attrgetter("structure_level_id"),
    "software_level": attrgetter("software_level_id"),
    "start_date": attrgetter("start_date"),
    "project_lead": attrgetter("project_lead_id"),
    "test_lead": attrgetter("test_lead_id"),
    "model_number": attrgetter("model_number"),
    "external_model": attrgetter("external_model"),
    "o_phase_close_date": attrgetter("o_phase_close_date"),
    "v_phase_close_date": attrgetter("v_phase_close_date"),
    "logo_props": attrgetter("logo_props"),
    "created_at": lambda product: _DATETIME.to_representation(product.created_at),
    "updated_at": lambda product: _DATETIME.to_representation(product.updated_at),
    "created_by": attrgetter("created_by_id"),
    "updated_by": attrgetter("updated_by_id"),
}

# 给产品加了字段却漏了列表行：服务启动就报错，不要等前端发现列表里缺字段
if set(_PRODUCT_LIST_ROW_GETTERS) | {"reviewers"} | PRODUCT_LIST_SHARED_FIELDS != set(ProductSerializer.Meta.fields):
    raise RuntimeError("产品列表行的字段与 ProductSerializer.Meta.fields 不一致，请同步 _PRODUCT_LIST_ROW_GETTERS")


def build_product_list_payload(products, user):
    """产品列表响应：products 是行，users / dictionary_items / permission_sets 是行里 id、下标指向的公共表。"""
    # 评审人只要 id；顺序同 product.reviewers 的默认顺序（User 按 -created_at）
    reviewer_ids = defaultdict(list)
    reviewer_rows = (
        Product.reviewers.through.objects.filter(product_id__in=[product.id for product in products])
        .order_by("-user__created_at")
        .values_list("product_id", "user_id")
    )
    for product_id, user_id in reviewer_rows:
        reviewer_ids[product_id].append(user_id)

    user_ids = {user_id for ids in reviewer_ids.values() for user_id in ids}
    item_ids = set()
    for product in products:
        user_ids.update(getattr(product, attname) for attname in _USER_ATTNAMES)
        item_ids.update(getattr(product, attname) for attname in _DICTIONARY_ATTNAMES)
    user_ids.discard(None)
    item_ids.discard(None)
    # 与详情接口同口径：头像资源、字典头各自 JOIN，字典值不滤软删
    users = User.objects.filter(id__in=user_ids).select_related("avatar_asset")
    items = DataDictionaryItem.all_objects.filter(id__in=item_ids).select_related("dictionary")

    keys_by_product = bulk_product_permission_keys(user, products)
    permission_sets, set_index, rows = [], {}, []
    for product in products:
        keys = keys_by_product[product.id]
        index = set_index.get(keys)
        if index is None:
            index = set_index[keys] = len(permission_sets)
            permission_sets.append(sorted(keys))
        row = {field: getter(product) for field, getter in _PRODUCT_LIST_ROW_GETTERS.items()}
        row["reviewers"] = reviewer_ids.get(product.id, [])
        row["permission_set"] = index
        rows.append(row)

    return {
        "products": rows,
        "users": {str(row["id"]): row for row in UserLiteSerializer(users, many=True).data},
        "dictionary_items": {str(row["id"]): row for row in DataDictionaryItemLiteSerializer(items, many=True).data},
        "permission_sets": permission_sets,
    }
