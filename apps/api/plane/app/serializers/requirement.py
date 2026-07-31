from uuid import UUID

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
    RequirementChangeStatus,
    RequirementDetail,
    RequirementDraftDetail,
    RequirementField,
    RequirementFieldType,
    RequirementLibrary,
    User,
)
from plane.utils.content_validator import validate_html_content
from plane.utils.product import can_edit_product_requirements
from plane.utils.requirement import (
    clone_requirement_children,
    field_attr,
    get_requirement_eligible_user_ids,
    get_requirement_field_specs,
    get_requirement_select_mode,
    get_requirement_select_options,
    replace_requirement_approvers,
    resolve_field_source,
    sync_requirement_fields,
    uses_change_flow,
)
from plane.utils.requirement_draft import get_draft_field_specs, save_draft_fields

from .base import BaseSerializer


class RequirementSerializer(BaseSerializer):
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
    library_id = serializers.PrimaryKeyRelatedField(
        source="library",
        queryset=RequirementLibrary.objects.all(),
        required=False,
        allow_null=True,
    )
    template_id = serializers.PrimaryKeyRelatedField(
        source="template",
        queryset=Requirement.objects.filter(is_template=True),
        required=False,
        allow_null=True,
    )
    owner_id = serializers.PrimaryKeyRelatedField(
        source="owner",
        queryset=User.objects.all(),
        required=False,
    )
    owner_detail = UserLiteSerializer(source="owner", read_only=True)
    title = serializers.CharField(max_length=255, required=False)
    description_html = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
    )
    approver_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        write_only=True,
    )
    approver_details = serializers.SerializerMethodField()
    scope = serializers.CharField(read_only=True)
    import_fields = serializers.BooleanField(
        required=False, default=False, write_only=True
    )
    field_count = serializers.SerializerMethodField()
    detail_count = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    pending_change_request_id = serializers.SerializerMethodField()
    can_approve = serializers.SerializerMethodField()

    class Meta:
        model = Requirement
        fields = [
            "id",
            "workspace_id",
            "scope",
            "product_id",
            "project_id",
            "library_id",
            "is_template",
            "template_id",
            "title",
            "description_html",
            "status",
            "owner_id",
            "owner_detail",
            "approval_type",
            "required_count",
            "approver_ids",
            "approver_details",
            "import_fields",
            "field_count",
            "detail_count",
            "can_edit",
            "current_version",
            "pending_change_request_id",
            "can_approve",
            "is_active",
            "sort_order",
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
            "field_count",
            "detail_count",
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

    def get_field_count(self, obj):
        # 标准需求的字段来自标准库所选模板，不能数它自己的 fields（恒为 0）
        if obj.library_id:
            annotated_count = getattr(obj, "library_field_count", None)
            if annotated_count is not None:
                return annotated_count
            return resolve_field_source(obj).fields.count()
        annotated_count = getattr(obj, "field_count", None)
        return annotated_count if annotated_count is not None else obj.fields.count()

    def get_detail_count(self, obj):
        annotated_count = getattr(obj, "detail_count", None)
        return annotated_count if annotated_count is not None else obj.details.count()

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

    def validate_title(self, value):
        title = value.strip()
        if not title:
            raise serializers.ValidationError("Requirement title cannot be empty.")
        return title

    def validate_description_html(self, value):
        if value is None or value == "":
            return value
        is_valid, error_message, sanitized_html = validate_html_content(value)
        if not is_valid:
            raise serializers.ValidationError(
                error_message or "HTML content is not valid."
            )
        return sanitized_html if sanitized_html is not None else value

    def _validate_immutable_scope(self, attrs):
        errors = {}
        immutable_fields = {
            "is_template": ("is_template", self.instance.is_template),
            "product_id": ("product", self.instance.product_id),
            "project_id": ("project", self.instance.project_id),
            "library_id": ("library", self.instance.library_id),
            "template_id": ("template", self.instance.template_id),
        }
        for request_field, (attribute, current_value) in immutable_fields.items():
            if request_field not in self.initial_data:
                continue
            submitted = attrs.get(attribute)
            submitted_value = (
                submitted
                if attribute == "is_template"
                else getattr(submitted, "id", None)
            )
            if submitted_value != current_value:
                errors[request_field] = "This field cannot be changed after creation."
            attrs.pop(attribute, None)
        if errors:
            raise serializers.ValidationError(errors)

    def _validate_scope(self, attrs, workspace):
        if self.instance:
            self._validate_immutable_scope(attrs)
            return (
                self.instance.is_template,
                self.instance.product,
                self.instance.project,
                self.instance.library,
                self.instance.template,
            )

        is_template = attrs.get("is_template", False)
        product = attrs.get("product")
        project = attrs.get("project")
        library = attrs.get("library")
        source_template = attrs.get("template")
        errors = {}

        if is_template:
            if product is not None:
                errors["product_id"] = "A workspace template cannot belong to a product."
            if project is not None:
                errors["project_id"] = "A workspace template cannot belong to a project."
            if library is not None:
                errors["library_id"] = "A workspace template cannot belong to a library."
            if source_template is not None:
                errors["template_id"] = "A workspace template cannot import another template."
        elif len([scope for scope in (product, project, library) if scope]) != 1:
            errors["scope"] = (
                "A non-template requirement must belong to exactly one product, "
                "project or library."
            )

        # 标准需求的字段实时引用标准库所选模板，不能再单独指定模板或导入字段
        if library is not None:
            if source_template is not None:
                errors["template_id"] = (
                    "A standard requirement inherits fields from its library template."
                )
            if attrs.get("import_fields"):
                errors["import_fields"] = (
                    "A standard requirement inherits fields from its library template."
                )

        if product is not None and product.workspace_id != workspace.id:
            errors["product_id"] = "Product does not belong to this workspace."
        if project is not None and project.workspace_id != workspace.id:
            errors["project_id"] = "Project does not belong to this workspace."
        if library is not None and library.workspace_id != workspace.id:
            errors["library_id"] = "Library does not belong to this workspace."
        if source_template is not None:
            if source_template.workspace_id != workspace.id:
                errors["template_id"] = "Template does not belong to this workspace."
            elif not source_template.is_template:
                errors["template_id"] = "Source requirement must be a workspace template."

        if errors:
            raise serializers.ValidationError(errors)
        return is_template, product, project, library, source_template

    def _get_effective_approver_ids(
        self,
        attrs,
        *,
        workspace,
        product,
        project,
        source_template,
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
                            "Approvers must be valid members of the requirement target: "
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
        if self.instance and "import_fields" in self.initial_data:
            raise serializers.ValidationError(
                {"import_fields": "Import options can only be used when creating a requirement."}
            )

        is_template, product, project, library, source_template = self._validate_scope(
            attrs, workspace
        )
        if attrs.get("import_fields", False) and source_template is None:
            raise serializers.ValidationError(
                {"import_fields": "A template is required when importing fields."}
            )

        title = attrs.get("title", getattr(self.instance, "title", None))
        if not title:
            raise serializers.ValidationError({"title": "This field is required."})

        if is_template:
            duplicate_templates = Requirement.objects.filter(
                workspace=workspace,
                is_template=True,
                title=title,
            )
            if self.instance:
                duplicate_templates = duplicate_templates.exclude(pk=self.instance.pk)
            if duplicate_templates.exists():
                raise serializers.ValidationError(
                    {"title": "A requirement template with this title already exists."}
                )

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
                {"owner_id": "Owner must be a valid member of the requirement target."}
            )

        approver_ids = self._get_effective_approver_ids(
            attrs,
            workspace=workspace,
            product=product,
            project=project,
            source_template=source_template,
        )
        self._validate_approval_rule(attrs, approver_ids)
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        approver_ids = validated_data.pop("approver_ids", [])
        import_fields = validated_data.pop("import_fields", False)
        source_template = validated_data.get("template")
        request = self.context.get("request")
        actor = getattr(request, "user", None)

        requirement = Requirement(**validated_data)
        requirement.full_clean(exclude=["created_by", "updated_by"])
        requirement.save()

        if source_template is not None and import_fields:
            try:
                clone_requirement_children(
                    source=source_template,
                    target=requirement,
                    actor=actor,
                )
            except ValueError as exc:
                raise serializers.ValidationError(
                    {"template_id": str(exc)}
                ) from exc
        replace_requirement_approvers(
            requirement=requirement,
            approver_ids=approver_ids,
            actor=actor,
        )
        return requirement

    @transaction.atomic
    def update(self, instance, validated_data):
        approver_ids = validated_data.pop("approver_ids", serializers.empty)
        validated_data.pop("import_fields", None)
        for attribute, value in validated_data.items():
            setattr(instance, attribute, value)

        instance.full_clean(exclude=["created_by", "updated_by"])
        instance.save()

        if approver_ids is not serializers.empty:
            request = self.context.get("request")
            replace_requirement_approvers(
                requirement=instance,
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


def _canonical_asset_values(requirement, value, *, image_only=False):
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
            workspace_id=requirement.workspace_id,
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


def validate_requirement_leaf_value(
    *, requirement, field, value, enforce_required=True
):
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
                workspace_id=requirement.workspace_id,
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
        value = _canonical_asset_values(requirement, value)
    elif field_type == RequirementFieldType.IMAGE:
        value = _canonical_asset_values(requirement, value, image_only=True)
    else:
        raise serializers.ValidationError("This value is not valid for a form field.")

    is_empty = value is None or value == "" or value == []
    if isinstance(value, str) and field_type == RequirementFieldType.RICH_TEXT:
        is_empty = not strip_tags(value).strip()
    if enforce_required and is_required and is_empty:
        raise serializers.ValidationError("This field is required.")
    return value


def validate_requirement_detail_data(*, requirement, data, fields=None):
    """校验并规范化一行明细数据。

    fields 为 None 时从正式表读取字段定义；草稿路径传入草稿快照解析出的 spec
    列表，从而与正式表共用同一套校验语义。
    """
    if not isinstance(data, dict):
        raise serializers.ValidationError("Detail data must be an object.")

    if fields is None:
        fields = get_requirement_field_specs(requirement)
    else:
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
                requirement=requirement,
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
                    requirement=requirement,
                    field=child,
                    value=values.get(child_key, child.default_value),
                    enforce_required=field.is_active and child.is_active,
                )
            canonical_rows.append({"id": row_id, "values": canonical_values})
        canonical[field_key] = canonical_rows
    return canonical


class RequirementConfigurationWriteSerializer(serializers.Serializer):
    expected_updated_at = serializers.DateTimeField()
    requirement = serializers.DictField()
    fields = RequirementFieldNodeWriteSerializer(many=True)
    confirm_data_loss = serializers.BooleanField(required=False, default=False)

    def validate_fields(self, value):
        names = [item["name"].casefold() for item in value]
        if len(names) != len(set(names)):
            raise serializers.ValidationError("Root field names must be unique.")

        requirement = self.context["requirement"]
        draft = self.context.get("draft")
        if draft is not None:
            existing_ids = {
                UUID(spec.id) for spec in get_draft_field_specs(draft)
            }
        else:
            existing_ids = set(
                RequirementField.objects.filter(requirement=requirement).values_list(
                    "id", flat=True
                )
            )
        submitted_ids = []
        for root in value:
            if root.get("id"):
                submitted_ids.append(root["id"])
            for child in root.get("children") or []:
                if child.get("id"):
                    submitted_ids.append(child["id"])
        if len(submitted_ids) != len(set(submitted_ids)):
            raise serializers.ValidationError("A field id cannot be submitted twice.")
        invalid_ids = set(submitted_ids).difference(existing_ids)
        if invalid_ids:
            raise serializers.ValidationError(
                "One or more fields do not belong to this requirement."
            )

        for root in value:
            if root["field_type"] != RequirementFieldType.FORM:
                root["default_value"] = validate_requirement_leaf_value(
                    requirement=requirement,
                    field=root,
                    value=root.get("default_value"),
                    enforce_required=False,
                )
            for child in root.get("children") or []:
                child["default_value"] = validate_requirement_leaf_value(
                    requirement=requirement,
                    field=child,
                    value=child.get("default_value"),
                    enforce_required=False,
                )
        return value

    def validate_requirement(self, value):
        requirement = self.context["requirement"]
        # 走审批流程的需求，状态只能由审批流转推动，配置保存里带上的 status 一律忽略
        if uses_change_flow(requirement):
            value = {key: item for key, item in value.items() if key != "status"}
        serializer = RequirementSerializer(
            requirement,
            data=value,
            partial=True,
            context={
                "request": self.context.get("request"),
                "workspace": self.context["workspace"],
            },
        )
        serializer.is_valid(raise_exception=True)
        self._requirement_serializer = serializer
        return value

    @transaction.atomic
    def save(self, **kwargs):
        requirement = (
            Requirement.objects.select_for_update()
            .filter(
                id=self.context["requirement"].id,
                workspace=self.context["workspace"],
            )
            .first()
        )
        if requirement is None:
            raise serializers.ValidationError("Requirement not found.")
        if requirement.updated_at != self.validated_data["expected_updated_at"]:
            raise RequirementConfigurationConflict

        self._requirement_serializer.instance = requirement
        requirement = self._requirement_serializer.save()
        request = self.context.get("request")
        draft = self.context.get("draft")
        actor = getattr(request, "user", None)
        if draft is not None:
            created_field_ids = save_draft_fields(
                draft=draft,
                field_payloads=self.validated_data["fields"],
                actor=actor,
                confirm_data_loss=self.validated_data["confirm_data_loss"],
            )
        else:
            created_field_ids = sync_requirement_fields(
                requirement=requirement,
                field_payloads=self.validated_data["fields"],
                actor=actor,
                confirm_data_loss=self.validated_data["confirm_data_loss"],
            )
        requirement.refresh_from_db()
        return requirement, created_field_ids


class RequirementConfigurationConflict(Exception):
    pass


class RequirementDetailSerializer(BaseSerializer):
    class Meta:
        model = RequirementDetail
        fields = [
            "id",
            "requirement_id",
            "data",
            "sort_order",
            "version",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = fields


class RequirementDraftDetailSerializer(BaseSerializer):
    """草稿明细行，输出形状与正式明细行完全一致。

    前端的明细网格因此不需要为草稿态做任何分支 —— 它看到的始终是同一份契约。
    """

    requirement_id = serializers.SerializerMethodField()

    class Meta:
        model = RequirementDraftDetail
        fields = [
            "id",
            "requirement_id",
            "data",
            "sort_order",
            "version",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = fields

    def get_requirement_id(self, obj):
        requirement_id = self.context.get("requirement_id")
        return str(requirement_id) if requirement_id else str(obj.draft.requirement_id)


class RequirementDetailCreateSerializer(serializers.Serializer):
    data = serializers.DictField()
    before_id = serializers.UUIDField(required=False, allow_null=True)
    after_id = serializers.UUIDField(required=False, allow_null=True)

    def validate(self, attrs):
        if attrs.get("before_id") and attrs.get("after_id"):
            raise serializers.ValidationError(
                "Only one insertion anchor can be provided."
            )
        attrs["data"] = validate_requirement_detail_data(
            requirement=self.context["requirement"],
            data=attrs["data"],
            fields=self.context.get("fields"),
        )
        return attrs


class RequirementDetailUpdateSerializer(serializers.Serializer):
    data = serializers.DictField()
    version = serializers.IntegerField(min_value=1)

    def validate_data(self, value):
        return validate_requirement_detail_data(
            requirement=self.context["requirement"],
            data=value,
            fields=self.context.get("fields"),
        )


class RequirementDetailBatchCreateSerializer(RequirementDetailCreateSerializer):
    client_id = serializers.UUIDField()


class RequirementDetailBatchUpdateSerializer(RequirementDetailUpdateSerializer):
    id = serializers.UUIDField()


class RequirementDetailBatchDeleteSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    version = serializers.IntegerField(min_value=1)


class RequirementDetailBatchSaveSerializer(serializers.Serializer):
    expected_updated_at = serializers.DateTimeField()
    creates = RequirementDetailBatchCreateSerializer(
        many=True, required=False, default=list
    )
    updates = RequirementDetailBatchUpdateSerializer(
        many=True, required=False, default=list
    )
    deletes = RequirementDetailBatchDeleteSerializer(
        many=True, required=False, default=list
    )

    def validate(self, attrs):
        creates = attrs["creates"]
        updates = attrs["updates"]
        deletes = attrs["deletes"]
        if not creates and not updates and not deletes:
            raise serializers.ValidationError(
                "At least one detail operation is required."
            )

        client_ids = [item["client_id"] for item in creates]
        if len(client_ids) != len(set(client_ids)):
            raise serializers.ValidationError(
                {"creates": "Client ids cannot contain duplicates."}
            )

        update_ids = [item["id"] for item in updates]
        if len(update_ids) != len(set(update_ids)):
            raise serializers.ValidationError(
                {"updates": "Detail ids cannot contain duplicates."}
            )

        delete_ids = [item["id"] for item in deletes]
        if len(delete_ids) != len(set(delete_ids)):
            raise serializers.ValidationError(
                {"deletes": "Detail ids cannot contain duplicates."}
            )
        if set(update_ids).intersection(delete_ids):
            raise serializers.ValidationError(
                "A detail cannot be updated and deleted in the same request."
            )
        return attrs


class RequirementDetailFilterSerializer(serializers.Serializer):
    field_id = serializers.UUIDField()
    operator = serializers.ChoiceField(
        choices=["contains", "equals", "is_empty", "is_not_empty"]
    )
    value = serializers.JSONField(required=False, allow_null=True)

    def _resolve_field(self, field_id):
        """字段来源可能是正式表，也可能是草稿快照解析出的 spec 列表。"""
        fields = self.context.get("fields")
        if fields is not None:
            return next(
                (
                    field
                    for field in fields
                    if str(field_attr(field, "id")) == str(field_id)
                    and field_attr(field, "field_type") != RequirementFieldType.FORM
                ),
                None,
            )
        return (
            RequirementField.objects.filter(
                id=field_id,
                requirement=self.context["requirement"],
            )
            .exclude(field_type=RequirementFieldType.FORM)
            .first()
        )

    def validate(self, attrs):
        field = self._resolve_field(attrs["field_id"])
        if field is None:
            raise serializers.ValidationError(
                {"field_id": "The filter field was not found."}
            )
        operator = attrs["operator"]
        if operator in ("contains", "equals") and "value" not in attrs:
            raise serializers.ValidationError({"value": "This field is required."})
        if (
            operator == "contains"
            and field.field_type
            not in (RequirementFieldType.TEXT, RequirementFieldType.RICH_TEXT)
            and not (
                field.field_type == RequirementFieldType.SELECT
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
        if field.field_type == RequirementFieldType.SELECT and operator in (
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
