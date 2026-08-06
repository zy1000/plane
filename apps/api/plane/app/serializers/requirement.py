from django.db import transaction
from django.utils.html import strip_tags
from rest_framework import serializers

from plane.app.serializers.user import UserLiteSerializer
from plane.db.models import (
    FileAsset,
    Product,
    Project,
    Requirement,
    RequirementApprovalType,
    RequirementBaseline,
    RequirementChangeStatus,
    RequirementDraftRow,
    RequirementFieldCategory,
    RequirementFieldType,
    RequirementItemStatus,
    RequirementPriority,
    User,
)
from plane.utils.content_validator import validate_html_content
from plane.utils.product import can_edit_product_requirements
from plane.utils.requirement import (
    BUILTIN_COLUMNS,
    TITLE_MAX_LENGTH,
    builtin_filter_specs,
    builtin_values_from_payload,
    field_attr,
    get_requirement_eligible_user_ids,
    get_requirement_select_mode,
    get_requirement_select_options,
    replace_requirement_approvers,
)

from .base import BaseSerializer


class RequirementBaselineSerializer(BaseSerializer):
    """需求基线：一个产品（或项目）全部需求的审批与版本单元。

    标题与描述不在这里 —— 它们是需求条目自己的字段。基线只持有状态、负责人与
    审批配置。
    """

    workspace_id = serializers.UUIDField(read_only=True)
    product_id = serializers.PrimaryKeyRelatedField(
        source="product",
        queryset=Product.objects.all(),
        required=False,
        allow_null=True,
    )
    project_id = serializers.PrimaryKeyRelatedField(
        source="project",
        queryset=Project.objects.all(),
        required=False,
        allow_null=True,
    )
    owner_id = serializers.PrimaryKeyRelatedField(
        source="owner",
        queryset=User.objects.all(),
        required=False,
    )
    owner_detail = UserLiteSerializer(source="owner", read_only=True)
    approver_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        write_only=True,
    )
    approver_details = serializers.SerializerMethodField()
    scope = serializers.CharField(read_only=True)
    can_edit = serializers.SerializerMethodField()
    pending_change_request_id = serializers.SerializerMethodField()
    can_approve = serializers.SerializerMethodField()

    class Meta:
        model = RequirementBaseline
        fields = [
            "id",
            "workspace_id",
            "scope",
            "product_id",
            "project_id",
            "status",
            "owner_id",
            "owner_detail",
            "approval_type",
            "required_count",
            "approver_ids",
            "approver_details",
            "can_edit",
            "current_version",
            "pending_change_request_id",
            "can_approve",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = [
            "id",
            "workspace_id",
            "scope",
            "owner_detail",
            "approver_details",
            "can_edit",
            "current_version",
            "pending_change_request_id",
            "can_approve",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]

    def get_approver_details(self, obj):
        approvers = [link.approver for link in obj.approvers.all()]
        return UserLiteSerializer(approvers, many=True).data

    def get_can_edit(self, obj):
        request = self.context.get("request")
        if request is None or request.user.is_anonymous:
            return False
        if obj.product_id:
            return can_edit_product_requirements(request.user, obj.product)
        return True

    def _pending_change_request(self, obj):
        """走 to_attr="pending_change_requests" 的预取，列表页不产生 N+1。"""
        prefetched = getattr(obj, "pending_change_requests", None)
        if prefetched is not None:
            return prefetched[0] if prefetched else None
        return (
            obj.change_requests.filter(status=RequirementChangeStatus.PENDING)
            .order_by("-created_at")
            .first()
        )

    def get_pending_change_request_id(self, obj):
        change_request = self._pending_change_request(obj)
        return str(change_request.id) if change_request else None

    def get_can_approve(self, obj):
        request = self.context.get("request")
        if request is None or request.user.is_anonymous:
            return False
        change_request = self._pending_change_request(obj)
        if change_request is None:
            return False
        return any(
            approval.approver_id == request.user.id and not approval.action
            for approval in change_request.approvals.all()
        )

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["approver_ids"] = [
            link.approver_id for link in instance.approvers.all()
        ]
        return data

    def _validate_immutable_scope(self, attrs):
        errors = {}
        immutable_fields = {
            "product_id": ("product", self.instance.product_id),
            "project_id": ("project", self.instance.project_id),
        }
        for request_field, (attribute, current_value) in immutable_fields.items():
            if request_field not in self.initial_data:
                continue
            if getattr(attrs.get(attribute), "id", None) != current_value:
                errors[request_field] = "This field cannot be changed after creation."
            attrs.pop(attribute, None)
        if errors:
            raise serializers.ValidationError(errors)

    def _validate_scope(self, attrs, workspace):
        if self.instance:
            self._validate_immutable_scope(attrs)
            return self.instance.product, self.instance.project

        product = attrs.get("product")
        project = attrs.get("project")
        errors = {}

        if len([scope for scope in (product, project) if scope]) != 1:
            errors["scope"] = (
                "A baseline must belong to exactly one product or project."
            )

        if product is not None and product.workspace_id != workspace.id:
            errors["product_id"] = "Product does not belong to this workspace."
        if project is not None and project.workspace_id != workspace.id:
            errors["project_id"] = "Project does not belong to this workspace."

        if errors:
            raise serializers.ValidationError(errors)
        return product, project

    def _get_effective_approver_ids(
        self,
        attrs,
        *,
        workspace,
        product,
        project,
    ):
        if "approver_ids" in attrs:
            approver_ids = list(dict.fromkeys(attrs["approver_ids"]))
            eligible_ids = get_requirement_eligible_user_ids(
                workspace_id=workspace.id,
                product_id=getattr(product, "id", None),
                project_id=getattr(project, "id", None),
                user_ids=approver_ids,
            )
            invalid_ids = [
                approver_id
                for approver_id in approver_ids
                if approver_id not in eligible_ids
            ]
            if invalid_ids:
                raise serializers.ValidationError(
                    {
                        "approver_ids": (
                            "Approvers must be valid members of the baseline target: "
                            + ", ".join(str(item) for item in invalid_ids)
                        )
                    }
                )
            attrs["approver_ids"] = approver_ids
            return approver_ids

        if self.instance:
            return list(
                self.instance.approvers.values_list("approver_id", flat=True)
            )
        return []

    def _validate_approval_rule(self, attrs, approver_ids):
        if self.instance:
            approval_type = attrs.get(
                "approval_type", self.instance.approval_type
            )
            if (
                "approval_type" in attrs
                and approval_type != RequirementApprovalType.N_OF_M
                and "required_count" not in attrs
            ):
                attrs["required_count"] = None
            required_count = attrs.get(
                "required_count", self.instance.required_count
            )
        else:
            approval_type = attrs.get(
                "approval_type", RequirementApprovalType.ANY
            )
            required_count = attrs.get("required_count")

        if approval_type == RequirementApprovalType.N_OF_M:
            if required_count is None:
                raise serializers.ValidationError(
                    {"required_count": "This field is required for n_of_m approval."}
                )
            if required_count < 1:
                raise serializers.ValidationError(
                    {"required_count": "The required count must be at least 1."}
                )
            if required_count > len(approver_ids):
                raise serializers.ValidationError(
                    {
                        "required_count": (
                            "The required count cannot exceed the number of approvers."
                        )
                    }
                )
        elif required_count is not None:
            raise serializers.ValidationError(
                {"required_count": "This field must be null unless approval_type is n_of_m."}
            )

    def validate(self, attrs):
        workspace = self.context.get("workspace")
        if workspace is None:
            raise serializers.ValidationError({"workspace": "Workspace is required."})
        product, project = self._validate_scope(attrs, workspace)

        owner = attrs.get("owner", getattr(self.instance, "owner", None))
        if owner is None:
            request = self.context.get("request")
            owner = getattr(request, "user", None)
            if owner is None or owner.is_anonymous:
                raise serializers.ValidationError({"owner_id": "Owner is required."})
            attrs["owner"] = owner

        eligible_owner_ids = get_requirement_eligible_user_ids(
            workspace_id=workspace.id,
            product_id=getattr(product, "id", None),
            project_id=getattr(project, "id", None),
            user_ids=[owner.id],
        )
        if owner.id not in eligible_owner_ids:
            raise serializers.ValidationError(
                {"owner_id": "Owner must be a valid member of the baseline target."}
            )

        approver_ids = self._get_effective_approver_ids(
            attrs,
            workspace=workspace,
            product=product,
            project=project,
        )
        self._validate_approval_rule(attrs, approver_ids)
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        approver_ids = validated_data.pop("approver_ids", [])
        request = self.context.get("request")
        actor = getattr(request, "user", None)

        baseline = RequirementBaseline(**validated_data)
        baseline.full_clean(exclude=["created_by", "updated_by"])
        baseline.save()

        replace_requirement_approvers(
            baseline=baseline,
            approver_ids=approver_ids,
            actor=actor,
        )
        return baseline

    @transaction.atomic
    def update(self, instance, validated_data):
        approver_ids = validated_data.pop("approver_ids", serializers.empty)
        for attribute, value in validated_data.items():
            setattr(instance, attribute, value)

        instance.full_clean(exclude=["created_by", "updated_by"])
        instance.save()

        if approver_ids is not serializers.empty:
            request = self.context.get("request")
            replace_requirement_approvers(
                baseline=instance,
                approver_ids=approver_ids,
                actor=getattr(request, "user", None),
            )
        return instance


class RequirementFieldWriteSerializer(serializers.Serializer):
    id = serializers.UUIDField(required=False)
    client_id = serializers.CharField(required=False, max_length=64)
    name = serializers.CharField(max_length=255, trim_whitespace=True)
    field_type = serializers.ChoiceField(choices=RequirementFieldType.choices)
    is_required = serializers.BooleanField(required=False, default=False)
    is_active = serializers.BooleanField(required=False, default=True)
    config = serializers.DictField(required=False, default=dict)
    default_value = serializers.JSONField(required=False, allow_null=True)
    # 分类没有默认值：根字段必须明确它进不进标准库，由 RequirementFieldNodeWriteSerializer
    # 校验。表单子字段跟着父字段走，保存时强制继承，所以这里必须收得下 null ——
    # 前端的字段树是整棵回传的，新建的子字段在草稿里就是 null。
    field_category = serializers.ChoiceField(
        choices=RequirementFieldCategory.choices,
        required=False,
        allow_null=True,
        default=None,
    )

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Field name cannot be empty.")
        return value

    def validate(self, attrs):
        if attrs["field_type"] != RequirementFieldType.SELECT:
            return attrs

        config = attrs.get("config") or {}
        selection_mode = config.get("selection_mode", "single")
        if selection_mode not in ("single", "multiple"):
            raise serializers.ValidationError(
                {"config": {"selection_mode": "Use single or multiple."}}
            )
        raw_options = config.get("options")
        if not isinstance(raw_options, list) or not raw_options:
            raise serializers.ValidationError(
                {"config": {"options": "A selector requires at least one option."}}
            )

        option_ids = set()
        option_labels = set()
        options = []
        for index, option in enumerate(raw_options):
            if not isinstance(option, dict):
                raise serializers.ValidationError(
                    {"config": {"options": f"Option {index + 1} must be an object."}}
                )
            try:
                option_id = str(
                    serializers.UUIDField().run_validation(option.get("id"))
                )
            except serializers.ValidationError as exc:
                raise serializers.ValidationError(
                    {
                        "config": {
                            "options": f"Option {index + 1} must include a valid id."
                        }
                    }
                ) from exc
            try:
                label = serializers.CharField(
                    max_length=255,
                    trim_whitespace=True,
                    allow_blank=False,
                ).run_validation(option.get("label"))
            except serializers.ValidationError as exc:
                raise serializers.ValidationError(
                    {
                        "config": {
                            "options": f"Option {index + 1} must include a label."
                        }
                    }
                ) from exc

            normalized_label = label.casefold()
            if option_id in option_ids:
                raise serializers.ValidationError(
                    {"config": {"options": "Option ids must be unique."}}
                )
            if normalized_label in option_labels:
                raise serializers.ValidationError(
                    {"config": {"options": "Option labels must be unique."}}
                )
            option_ids.add(option_id)
            option_labels.add(normalized_label)
            options.append({"id": option_id, "label": label})

        attrs["config"] = {
            **config,
            "selection_mode": selection_mode,
            "options": options,
        }
        return attrs


class RequirementFieldNodeWriteSerializer(RequirementFieldWriteSerializer):
    children = RequirementFieldWriteSerializer(many=True, required=False, default=list)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if not attrs.get("field_category"):
            raise serializers.ValidationError(
                {"field_category": "Pick whether this field is a standard or data field."}
            )
        field_type = attrs["field_type"]
        children = attrs.get("children") or []
        if field_type != RequirementFieldType.FORM and children:
            raise serializers.ValidationError(
                {"children": "Only form fields can contain child fields."}
            )
        if any(
            child["field_type"] == RequirementFieldType.FORM for child in children
        ):
            raise serializers.ValidationError(
                {"children": "A form child cannot also be a form field."}
            )
        if field_type == RequirementFieldType.FORM:
            attrs["default_value"] = None

        names = [child["name"].casefold() for child in children]
        if len(names) != len(set(names)):
            raise serializers.ValidationError(
                {"children": "Child field names must be unique within a form."}
            )
        return attrs


def _canonical_asset_values(owner, value, *, image_only=False):
    if value in (None, ""):
        return []
    if not isinstance(value, list):
        raise serializers.ValidationError("File values must be an array.")
    asset_ids = []
    for item in value:
        if not isinstance(item, dict) or not item.get("asset_id"):
            raise serializers.ValidationError("Each file must include an asset_id.")
        asset_ids.append(item["asset_id"])
    assets = {
        str(asset.id): asset
        for asset in FileAsset.objects.filter(
            id__in=asset_ids,
            workspace_id=owner.workspace_id,
            entity_type=FileAsset.EntityTypeContext.REQUIREMENT_ATTACHMENT,
            is_uploaded=True,
            is_deleted=False,
        )
    }
    if len(assets) != len(set(str(item) for item in asset_ids)):
        raise serializers.ValidationError(
            "Files must be uploaded requirement assets from this workspace."
        )

    result = []
    for asset_id in asset_ids:
        asset = assets[str(asset_id)]
        file_type = str((asset.attributes or {}).get("type") or "")
        if image_only and not file_type.startswith("image/"):
            raise serializers.ValidationError("Image fields only accept image files.")
        result.append(
            {
                "asset_id": str(asset.id),
                "name": (asset.attributes or {}).get("name") or asset.filename,
                "type": file_type,
                "size": int(asset.size or 0),
            }
        )
    return result


def validate_requirement_leaf_value(*, owner, field, value, enforce_required=True):
    field_type = field_attr(field, "field_type")
    is_required = bool(field_attr(field, "is_required", False))

    if field_type in (RequirementFieldType.TEXT, RequirementFieldType.RICH_TEXT):
        if value is not None and not isinstance(value, str):
            raise serializers.ValidationError("Text values must be strings.")
        if field_type == RequirementFieldType.RICH_TEXT and value:
            is_valid, error_message, sanitized_html = validate_html_content(value)
            if not is_valid:
                raise serializers.ValidationError(
                    error_message or "HTML content is not valid."
                )
            value = sanitized_html if sanitized_html is not None else value
    elif field_type == RequirementFieldType.MEMBER:
        if value in ("", None):
            value = None
        else:
            try:
                member_id = serializers.UUIDField().run_validation(value)
            except serializers.ValidationError as exc:
                raise serializers.ValidationError("Member values must be UUIDs.") from exc
            eligible_ids = get_requirement_eligible_user_ids(
                workspace_id=owner.workspace_id,
                user_ids=[member_id],
            )
            if member_id not in eligible_ids:
                raise serializers.ValidationError(
                    "The selected member is not active in this workspace."
                )
            value = str(member_id)
    elif field_type == RequirementFieldType.BOOLEAN:
        if value is not None and not isinstance(value, bool):
            raise serializers.ValidationError("Boolean values must be true or false.")
    elif field_type == RequirementFieldType.SELECT:
        option_ids = {
            str(option.get("id"))
            for option in get_requirement_select_options(field)
            if isinstance(option, dict) and option.get("id")
        }
        if get_requirement_select_mode(field) == "multiple":
            if value in (None, ""):
                value = []
            if not isinstance(value, list):
                raise serializers.ValidationError(
                    "Multiple selector values must be an array."
                )
            if any(not isinstance(item, str) for item in value):
                raise serializers.ValidationError(
                    "Selector values must be option ids."
                )
            if len(value) != len(set(value)):
                raise serializers.ValidationError(
                    "Selector values cannot contain duplicates."
                )
            if set(value).difference(option_ids):
                raise serializers.ValidationError(
                    "One or more selected options are not available."
                )
        else:
            if value in ("", None):
                value = None
            elif not isinstance(value, str):
                raise serializers.ValidationError(
                    "Single selector values must be an option id."
                )
            elif value not in option_ids:
                raise serializers.ValidationError(
                    "The selected option is not available."
                )
    elif field_type == RequirementFieldType.ATTACHMENT:
        value = _canonical_asset_values(owner, value)
    elif field_type == RequirementFieldType.IMAGE:
        value = _canonical_asset_values(owner, value, image_only=True)
    else:
        raise serializers.ValidationError("This value is not valid for a form field.")

    is_empty = value is None or value == "" or value == []
    if isinstance(value, str) and field_type == RequirementFieldType.RICH_TEXT:
        is_empty = not strip_tags(value).strip()
    if enforce_required and is_required and is_empty:
        raise serializers.ValidationError("This field is required.")
    return value


def validate_requirement_data(*, owner, data, fields):
    """校验并规范化一行需求数据（合并态，含内置字段）。

    owner 是这行数据的归属（基线或标准库），只用于取 workspace_id 做资产与成员
    校验。fields 必须由调用方显式给出 —— 就是这一行所绑定的那个需求类型的字段。

    刻意不留「fields 为 None 就自己去查」的兜底：兜底会解析成空列表，然后把任何非空
    data 都报成「Unknown root field ids」，错得很难查。
    """
    if not isinstance(data, dict):
        raise serializers.ValidationError("Requirement data must be an object.")

    fields = list(fields)
    roots = [field for field in fields if field.parent_field_id is None]
    children_by_parent = {}
    for field in fields:
        if field.parent_field_id:
            children_by_parent.setdefault(field.parent_field_id, []).append(field)

    unknown_root_ids = set(data).difference(str(field.id) for field in roots)
    if unknown_root_ids:
        raise serializers.ValidationError(
            {"data": f"Unknown root field ids: {', '.join(sorted(unknown_root_ids))}"}
        )

    canonical = {}
    used_child_row_ids = set()
    for field in roots:
        field_key = str(field.id)
        raw_value = data.get(field_key, field.default_value)
        if field.field_type != RequirementFieldType.FORM:
            canonical[field_key] = validate_requirement_leaf_value(
                owner=owner,
                field=field,
                value=raw_value,
                enforce_required=field.is_active,
            )
            continue

        rows = raw_value if raw_value is not None else []
        if not isinstance(rows, list):
            raise serializers.ValidationError(
                {field_key: "Form values must be an array."}
            )
        if field.is_active and field.is_required and not rows:
            raise serializers.ValidationError(
                {field_key: "This form requires at least one child record."}
            )

        child_fields = children_by_parent.get(field.id, [])
        child_ids = {str(child.id) for child in child_fields}
        canonical_rows = []
        for row in rows:
            if not isinstance(row, dict) or not row.get("id"):
                raise serializers.ValidationError(
                    {field_key: "Every form row must include an id."}
                )
            try:
                row_id = str(serializers.UUIDField().run_validation(row["id"]))
            except serializers.ValidationError as exc:
                raise serializers.ValidationError(
                    {field_key: "Form row ids must be UUIDs."}
                ) from exc
            if row_id in used_child_row_ids:
                raise serializers.ValidationError(
                    {field_key: "Form row ids must be unique within a detail."}
                )
            used_child_row_ids.add(row_id)
            values = row.get("values") or {}
            if not isinstance(values, dict):
                raise serializers.ValidationError(
                    {field_key: "Form row values must be an object."}
                )
            unknown_child_ids = set(values).difference(child_ids)
            if unknown_child_ids:
                raise serializers.ValidationError(
                    {
                        field_key: (
                            "Unknown child field ids: "
                            + ", ".join(sorted(unknown_child_ids))
                        )
                    }
                )
            canonical_values = {}
            for child in child_fields:
                child_key = str(child.id)
                canonical_values[child_key] = validate_requirement_leaf_value(
                    owner=owner,
                    field=child,
                    value=values.get(child_key, child.default_value),
                    enforce_required=field.is_active and child.is_active,
                )
            canonical_rows.append({"id": row_id, "values": canonical_values})
        canonical[field_key] = canonical_rows
    return canonical


class RequirementBuiltinWriteSerializer(serializers.Serializer):
    """一行需求的八个内置字段。

    与 data 平级：data 只装自定义字段，这里只装内置列。字段级的取值合法性交给
    DRF，跨行/跨表的规则（负责人是不是本工作区的人、父项在不在同一归属下、父项
    链会不会成环）放在 validate_requirement_builtin_values。
    """

    title = serializers.CharField(
        max_length=TITLE_MAX_LENGTH, allow_blank=True, required=False, default=""
    )
    description_html = serializers.CharField(
        allow_blank=True, allow_null=True, required=False, default=None
    )
    status = serializers.ChoiceField(
        choices=RequirementItemStatus.choices,
        required=False,
        default=RequirementItemStatus.DRAFT,
    )
    priority = serializers.ChoiceField(
        choices=RequirementPriority.choices,
        required=False,
        default=RequirementPriority.NONE,
    )
    assignee_id = serializers.UUIDField(required=False, allow_null=True, default=None)
    start_date = serializers.DateField(required=False, allow_null=True, default=None)
    target_date = serializers.DateField(required=False, allow_null=True, default=None)
    parent_id = serializers.UUIDField(required=False, allow_null=True, default=None)

    def validate_description_html(self, value):
        if not value:
            return value
        is_valid, error_message, sanitized_html = validate_html_content(value)
        if not is_valid:
            raise serializers.ValidationError(
                error_message or "HTML content is not valid."
            )
        return sanitized_html if sanitized_html is not None else value

    def validate(self, attrs):
        start_date = attrs.get("start_date")
        target_date = attrs.get("target_date")
        if start_date and target_date and start_date > target_date:
            raise serializers.ValidationError(
                {"target_date": "The due date cannot be earlier than the start date."}
            )
        return attrs


def validate_requirement_builtin_values(*, owner, values, parent_queryset, row_id=None):
    """校验内置列里那些 DRF 管不到的部分，返回可直接当模型 kwargs 的完整八列。

    parent_queryset 是这一行所在的那一批行（正式表或草稿层，已按归属过滤）——
    父项只能在这批里选，这样产品需求就不会指到标准库的条目上去。
    """
    values = dict(values or {})

    assignee_id = values.get("assignee_id")
    if assignee_id:
        eligible_ids = get_requirement_eligible_user_ids(
            workspace_id=owner.workspace_id,
            user_ids=[assignee_id],
        )
        if assignee_id not in eligible_ids:
            raise serializers.ValidationError(
                {"assignee_id": "The selected member is not active in this workspace."}
            )

    parent_id = values.get("parent_id")
    if parent_id:
        if row_id and str(parent_id) == str(row_id):
            raise serializers.ValidationError(
                {"parent_id": "A requirement cannot be its own parent."}
            )
        # 一次取全这批行的父指针，逐级 get 会在深层级上退化成 N 次查询
        parent_by_id = {
            str(item_id): str(item_parent_id) if item_parent_id else None
            for item_id, item_parent_id in parent_queryset.values_list("id", "parent_id")
        }
        if str(parent_id) not in parent_by_id:
            raise serializers.ValidationError(
                {"parent_id": "The parent requirement was not found in this scope."}
            )
        if row_id:
            seen = set()
            cursor = str(parent_id)
            while cursor is not None and cursor not in seen:
                if cursor == str(row_id):
                    raise serializers.ValidationError(
                        {"parent_id": "This parent would create a cycle."}
                    )
                seen.add(cursor)
                cursor = parent_by_id.get(cursor)

    return builtin_values_from_payload(values)


class RequirementBaselineConfigurationWriteSerializer(serializers.Serializer):
    """在乐观锁下更新基线的 meta。

    基线本身没有字段，字段编辑走需求类型的配置接口，所以这里显式拒绝 fields
    而不是默默忽略 —— 前端把字段树发到错误的端点时应该拿到明确的报错。
    """

    expected_updated_at = serializers.DateTimeField()
    baseline = serializers.DictField()

    def validate(self, attrs):
        if "fields" in self.initial_data:
            raise serializers.ValidationError(
                {
                    "fields": "需求的列来自需求类型，请到需求类型管理里修改字段。",
                }
            )
        return attrs

    def validate_baseline(self, value):
        baseline = self.context["baseline"]
        # 状态只能由审批流转推动，配置保存里带上的 status 一律忽略
        value = {key: item for key, item in value.items() if key != "status"}
        serializer = RequirementBaselineSerializer(
            baseline,
            data=value,
            partial=True,
            context={
                "request": self.context.get("request"),
                "workspace": self.context["workspace"],
            },
        )
        serializer.is_valid(raise_exception=True)
        self._baseline_serializer = serializer
        return value

    @transaction.atomic
    def save(self, **kwargs):
        baseline = (
            RequirementBaseline.objects.select_for_update()
            .filter(
                id=self.context["baseline"].id,
                workspace=self.context["workspace"],
            )
            .first()
        )
        if baseline is None:
            raise serializers.ValidationError("Requirement baseline not found.")
        if baseline.updated_at != self.validated_data["expected_updated_at"]:
            raise RequirementConfigurationConflict

        self._baseline_serializer.instance = baseline
        baseline = self._baseline_serializer.save()
        baseline.refresh_from_db()
        return baseline


class RequirementConfigurationConflict(Exception):
    pass


class _RequirementRowSerializerMixin:
    """行输出的共同部分。

    八个内置字段是行上的平铺键，与 data 平级；data 只装自定义字段（key 是字段
    UUID）。前端因此有两组列：固定的内置列 + 需求类型给的自定义列。
    """

    def get_change_kind(self, obj):
        """相对上一个已发布版本的变更标记，由列表入口按需注解。"""
        return getattr(obj, "change_kind", None)


ROW_FIELDS = [
    "id",
    "product_id",
    "project_id",
    "library_id",
    "requirement_type_id",
    *BUILTIN_COLUMNS,
    "data",
    "sort_order",
    "version",
    "change_kind",
    "last_changed_version",
    "created_at",
    "updated_at",
    "created_by",
    "updated_by",
]


class RequirementSerializer(_RequirementRowSerializerMixin, BaseSerializer):
    """一条需求条目。"""

    change_kind = serializers.SerializerMethodField()

    class Meta:
        model = Requirement
        fields = ROW_FIELDS
        read_only_fields = fields


class RequirementDraftRowSerializer(_RequirementRowSerializerMixin, BaseSerializer):
    """草稿里的需求条目，输出形状与正式行完全一致。

    前端的网格因此不需要为草稿态做任何分支 —— 它看到的始终是同一份契约。
    """

    change_kind = serializers.SerializerMethodField()
    product_id = serializers.SerializerMethodField()
    project_id = serializers.SerializerMethodField()
    library_id = serializers.SerializerMethodField()

    class Meta:
        model = RequirementDraftRow
        fields = ROW_FIELDS
        read_only_fields = fields

    def get_product_id(self, obj):
        product_id = self.context.get("product_id")
        return str(product_id) if product_id else None

    def get_project_id(self, obj):
        project_id = self.context.get("project_id")
        return str(project_id) if project_id else None

    def get_library_id(self, obj):
        # 草稿只属于产品/项目作用域，永远不会挂在标准库上；这里恒为 None，只是为了
        # 让草稿行与正式行的输出形状保持一致。
        return None


class _RequirementBuiltinWriteMixin:
    """写入路径共用的内置字段校验。

    context 里要有 owner 与 parent_queryset —— 后者划定父项的可选范围（这一行所在
    的那一批行），由视图从 RowLayer 传进来。
    """

    def resolve_builtin(self, attrs, *, row_id=None):
        return validate_requirement_builtin_values(
            owner=self.context["owner"],
            values=attrs.get("builtin") or {},
            parent_queryset=self.context["parent_queryset"],
            row_id=row_id,
        )


class RequirementCreateSerializer(_RequirementBuiltinWriteMixin, serializers.Serializer):
    """新增一条需求。

    必须指明这行绑定哪个需求类型 —— 字段由类型提供，data 也按该类型的字段校验。
    标准库的条目不用传，库本身就固定了类型（default_requirement_type_id）。
    """

    data = serializers.DictField()
    builtin = RequirementBuiltinWriteSerializer(required=False, default=dict)
    requirement_type_id = serializers.UUIDField(required=False)
    before_id = serializers.UUIDField(required=False, allow_null=True)
    after_id = serializers.UUIDField(required=False, allow_null=True)

    def validate(self, attrs):
        if attrs.get("before_id") and attrs.get("after_id"):
            raise serializers.ValidationError(
                "Only one insertion anchor can be provided."
            )

        resolver = self.context["requirement_type_resolver"]
        requirement_type_id = attrs.get("requirement_type_id") or self.context.get(
            "default_requirement_type_id"
        )
        if requirement_type_id is None:
            raise serializers.ValidationError(
                {"requirement_type_id": "This field is required."}
            )
        if resolver.resolve(requirement_type_id) is None:
            raise serializers.ValidationError(
                {"requirement_type_id": "The requirement type was not found."}
            )

        attrs["requirement_type_id"] = requirement_type_id
        attrs["data"] = validate_requirement_data(
            owner=self.context["owner"],
            data=attrs["data"],
            fields=resolver.specs(requirement_type_id),
        )
        attrs["builtin"] = self.resolve_builtin(attrs)
        return attrs


class RequirementUpdateSerializer(_RequirementBuiltinWriteMixin, serializers.Serializer):
    """更新一条需求。

    不接受 requirement_type_id —— 行与需求类型的绑定创建后不可变，调用方按行上
    已存的 requirement_type_id 取字段传进 context["fields"]。
    """

    data = serializers.DictField()
    builtin = RequirementBuiltinWriteSerializer(required=False, default=dict)
    version = serializers.IntegerField(min_value=1)

    def validate_data(self, value):
        return validate_requirement_data(
            owner=self.context["owner"],
            data=value,
            fields=self.context["fields"],
        )

    def validate(self, attrs):
        attrs["builtin"] = self.resolve_builtin(attrs, row_id=self.context["row_id"])
        return attrs


class RequirementBatchCreateSerializer(RequirementCreateSerializer):
    client_id = serializers.UUIDField()


class RequirementBatchUpdateSerializer(
    _RequirementBuiltinWriteMixin, serializers.Serializer
):
    """批量更新的一项：按行自己的需求类型校验 data。

    validate_data 看不到同级的 id，所以校验整体放在 validate 里做。
    """

    id = serializers.UUIDField()
    data = serializers.DictField()
    builtin = RequirementBuiltinWriteSerializer(required=False, default=dict)
    version = serializers.IntegerField(min_value=1)

    def validate(self, attrs):
        row_requirement_types = self.context["row_requirement_types"]
        requirement_type_id = row_requirement_types.get(attrs["id"])
        if requirement_type_id is None:
            raise serializers.ValidationError(
                {"id": "The requirement was not found."}
            )
        attrs["data"] = validate_requirement_data(
            owner=self.context["owner"],
            data=attrs["data"],
            fields=self.context["requirement_type_resolver"].specs(
                requirement_type_id
            ),
        )
        attrs["builtin"] = self.resolve_builtin(attrs, row_id=attrs["id"])
        return attrs


class RequirementBatchDeleteSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    version = serializers.IntegerField(min_value=1)


class RequirementImportSerializer(serializers.Serializer):
    """从标准库导入条目到产品需求。

    只收归属与条目，不收 data —— data 是从库条目原样拷过来的。两侧引用的是同一个
    需求类型，字段 UUID 因此完全一致，不需要任何重映射。
    """

    library_id = serializers.UUIDField()
    item_ids = serializers.ListField(
        child=serializers.UUIDField(), allow_empty=False, max_length=500
    )
    before_id = serializers.UUIDField(required=False, allow_null=True)
    after_id = serializers.UUIDField(required=False, allow_null=True)

    def validate(self, attrs):
        if attrs.get("before_id") and attrs.get("after_id"):
            raise serializers.ValidationError(
                "Only one insertion anchor can be provided."
            )
        attrs["item_ids"] = list(dict.fromkeys(attrs["item_ids"]))
        return attrs


class RequirementBatchSaveSerializer(serializers.Serializer):
    expected_updated_at = serializers.DateTimeField()
    creates = RequirementBatchCreateSerializer(
        many=True, required=False, default=list
    )
    updates = RequirementBatchUpdateSerializer(
        many=True, required=False, default=list
    )
    deletes = RequirementBatchDeleteSerializer(
        many=True, required=False, default=list
    )

    def validate(self, attrs):
        creates = attrs["creates"]
        updates = attrs["updates"]
        deletes = attrs["deletes"]
        if not creates and not updates and not deletes:
            raise serializers.ValidationError(
                "At least one requirement operation is required."
            )

        client_ids = [item["client_id"] for item in creates]
        if len(client_ids) != len(set(client_ids)):
            raise serializers.ValidationError(
                {"creates": "Client ids cannot contain duplicates."}
            )

        update_ids = [item["id"] for item in updates]
        if len(update_ids) != len(set(update_ids)):
            raise serializers.ValidationError(
                {"updates": "Requirement ids cannot contain duplicates."}
            )

        delete_ids = [item["id"] for item in deletes]
        if len(delete_ids) != len(set(delete_ids)):
            raise serializers.ValidationError(
                {"deletes": "Requirement ids cannot contain duplicates."}
            )
        if set(update_ids).intersection(delete_ids):
            raise serializers.ValidationError(
                "A requirement cannot be updated and deleted in the same request."
            )
        return attrs


class RequirementFilterSerializer(serializers.Serializer):
    # 不是 UUIDField：内置列用列名当 field_id（"title"、"status"…），与自定义
    # 字段的 UUID 在同一个维度上表达
    field_id = serializers.CharField(max_length=64)
    operator = serializers.ChoiceField(
        choices=["contains", "equals", "is_empty", "is_not_empty"]
    )
    value = serializers.JSONField(required=False, allow_null=True)

    def _resolve_field(self, field_id):
        """字段可能是正式表的模型对象、草稿快照解析出的 spec，或内置列的伪字段，
        用 field_attr 一视同仁。调用方（需求列表入口）总是从 RowLayer 取好字段传
        进来，所以自定义字段这边只认 context["fields"]。"""
        return next(
            (
                field
                for field in [*builtin_filter_specs(), *self.context["fields"]]
                if str(field_attr(field, "id")) == str(field_id)
                and field_attr(field, "field_type") != RequirementFieldType.FORM
            ),
            None,
        )

    def validate(self, attrs):
        field = self._resolve_field(attrs["field_id"])
        if field is None:
            raise serializers.ValidationError(
                {"field_id": "The filter field was not found."}
            )
        field_type = field_attr(field, "field_type")
        operator = attrs["operator"]
        if operator in ("contains", "equals") and "value" not in attrs:
            raise serializers.ValidationError({"value": "This field is required."})
        if (
            operator == "contains"
            and field_type
            not in (RequirementFieldType.TEXT, RequirementFieldType.RICH_TEXT)
            and not (
                field_type == RequirementFieldType.SELECT
                and get_requirement_select_mode(field) == "multiple"
            )
        ):
            raise serializers.ValidationError(
                {
                    "operator": (
                        "Contains is only supported for text fields and "
                        "multiple selectors."
                    )
                }
            )
        if field_type == RequirementFieldType.SELECT and operator in (
            "contains",
            "equals",
        ):
            option_ids = {
                str(option.get("id"))
                for option in get_requirement_select_options(field)
                if isinstance(option, dict) and option.get("id")
            }
            value = attrs.get("value")
            if not isinstance(value, str) or value not in option_ids:
                raise serializers.ValidationError(
                    {"value": "The filter option is not available."}
                )
        attrs["field"] = field
        return attrs
