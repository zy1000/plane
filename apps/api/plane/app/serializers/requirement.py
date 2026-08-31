from django.utils.html import strip_tags
from rest_framework import serializers

from plane.db.models import (
    FileAsset,
    Requirement,
    RequirementFieldType,
    RequirementItemStatus,
    RequirementLibrary,
    RequirementModule,
    RequirementPriority,
)
from plane.utils.content_validator import validate_html_content
from plane.utils.requirement import (
    BUILTIN_COLUMN_DEFAULTS,
    BUILTIN_COLUMNS,
    TITLE_MAX_LENGTH,
    builtin_filter_specs,
    builtin_values_from_payload,
    field_attr,
    get_requirement_eligible_user_ids,
    get_requirement_select_mode,
    get_requirement_select_options,
    library_hidden_builtin_columns,
)
from plane.utils.requirement_module import module_scope_filter

from .base import BaseSerializer


class RequirementFieldWriteSerializer(serializers.Serializer):
    id = serializers.UUIDField(required=False)
    client_id = serializers.CharField(required=False, max_length=64)
    name = serializers.CharField(max_length=255, trim_whitespace=True)
    field_type = serializers.ChoiceField(choices=RequirementFieldType.choices)
    is_required = serializers.BooleanField(required=False, default=False)
    is_active = serializers.BooleanField(required=False, default=True)
    config = serializers.DictField(required=False, default=dict)
    default_value = serializers.JSONField(required=False, allow_null=True)
    show_in_library = serializers.BooleanField(required=False, default=True)

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

        # 不纳入标准库的字段不能设为必填。表单与子字段各自独立判断。
        #
        # 标准库只按纳入库的字段校验（utils/requirement.py 的 get_library_field_specs），
        # 库外字段压根不在库条目的契约里；而导入到产品需求时是按类型的**全集**校验的。
        # 一旦某个库外字段被标成必填，库条目天生就缺它，导入只能跳过必填校验
        # （build_library_import_creates），落进来的行随后每一次单元格保存又会被
        # 同一条必填规则打回 —— 那一行从此存不进任何改动。
        offenders = [
            node["name"]
            for node in [attrs, *children]
            if not node.get("show_in_library", True) and node.get("is_required")
        ]
        if offenders:
            raise serializers.ValidationError(
                {
                    "is_required": (
                        "A field kept out of the standard library cannot be "
                        "required, because library items never carry it: "
                        f"{', '.join(offenders)}"
                    )
                }
            )
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


def _canonical_asset_values(owner, value, *, image_only=False, with_meta=False):
    """附件 / 图片值 -> 规范化的 `[{asset_id, name, type, size}]`。

    with_meta 只给需求级附件用（多带上传人与时间）。附件**字段**的值每次 PATCH 都会经
    这里重新规范化，默认不带 meta 才能让老行的存储形状逐字节不变 —— 多出两个键会让
    整份 data 比对把「没改」判成「内容变了」。
    """
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
        item = {
            "asset_id": str(asset.id),
            "name": (asset.attributes or {}).get("name") or asset.filename,
            "type": file_type,
            "size": int(asset.size or 0),
        }
        if with_meta:
            item["created_by"] = str(asset.created_by_id) if asset.created_by_id else None
            item["created_at"] = asset.created_at.isoformat() if asset.created_at else None
        result.append(item)
    return result


def validate_requirement_leaf_value(
    *, owner, field, value, enforce_required=True, current_value=None
):
    """current_value 是这一格更新前的值。成员字段只在**换人**时校验成员资格 —— 已离开
    工作区的人挂在旧行上不该让整行写不动，与内置列负责人 / 父项的「只拦新指派」一致。"""
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
            unchanged = current_value not in ("", None) and str(member_id) == str(
                current_value
            )
            if not unchanged:
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


def validate_requirement_data(*, owner, data, fields, current_data=None):
    """校验并规范化一行需求数据（合并态，含内置字段）。

    current_data 是更新路径上这一行当前的 data，只用于成员字段的「只拦新指派」判定
    （见 validate_requirement_leaf_value）；新增路径不传。

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

    current_data = current_data or {}
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
                current_value=current_data.get(field_key),
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
        current_rows_by_id = {
            str(item.get("id")): (item.get("values") or {})
            for item in (current_data.get(field_key) or [])
            if isinstance(item, dict) and item.get("id")
        }
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
            current_values = current_rows_by_id.get(row_id, {})
            for child in child_fields:
                child_key = str(child.id)
                canonical_values[child_key] = validate_requirement_leaf_value(
                    owner=owner,
                    field=child,
                    value=values.get(child_key, child.default_value),
                    enforce_required=field.is_active and child.is_active,
                    current_value=current_values.get(child_key),
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

    # 八个字段一律 required=False 且**不给 default**。
    #
    # 给了 default，DRF 会把没传的列也塞进 validated_data，于是「客户端真的提交了这一列」
    # 与「DRF 补了个缺省值」再也分不开 —— 一个只改标题的 PATCH 会带着其余列的缺省值到达
    # 写入层，把已填的值清空。缺省值改由 builtin_values_from_payload（新增路径）
    # 与 current_row 回填（更新路径）各自负责。
    title = serializers.CharField(
        max_length=TITLE_MAX_LENGTH, allow_blank=True, required=False
    )
    description_html = serializers.CharField(
        allow_blank=True, allow_null=True, required=False
    )
    # status 不在这里 —— 它是**交付状态轴**，走独立的状态写入口
    # （RequirementStatusWriteSerializer + utils/requirement_project.set_requirement_status），
    # 不算内容。网格的批量保存 payload 恒带全部八个内置列，所以这里选择静默忽略而不是
    # 报 400，值一律由 validate_requirement_builtin_values 从当前行/缺省值回填。
    priority = serializers.ChoiceField(
        choices=RequirementPriority.choices,
        required=False,
    )
    assignee_id = serializers.UUIDField(required=False, allow_null=True)
    start_date = serializers.DateField(required=False, allow_null=True)
    target_date = serializers.DateField(required=False, allow_null=True)
    parent_id = serializers.UUIDField(required=False, allow_null=True)

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


class RequirementStatusWriteSerializer(serializers.Serializer):
    """需求级交付状态的独立写入口。与内容 PATCH 分开：不带 version 乐观锁、不进
    内容 diff、评审中的行也能改；closed 行改成任意非 closed 值即重开。"""

    status = serializers.ChoiceField(choices=RequirementItemStatus.choices)


def validate_requirement_builtin_values(
    *, owner, values, parent_queryset, row_id=None, current_row=None
):
    """校验内置列里那些 DRF 管不到的部分，返回可直接当模型 kwargs 的完整八列。

    parent_queryset 是这一行所在的那一批行（已按归属过滤）—— 父项只能在这批里选，
    这样产品需求就不会指到标准库的条目上去。

    current_row 是更新路径上的那一行。**必须传**：builtin_values_from_payload 恒返回全
    八列，没有它，一个只改标题的 PATCH 会把其余列一起写成缺省值。有了 current_row，
    未提交的列沿用行上的当前值。

    status 永远走这条回填路径 —— 写序列化器根本不收它，所以「客户端提交的 status」这个
    概念不存在，行上是什么就还是什么。改写它的只有独立的状态写入口与两条自动推进
    （utils/requirement_project）。内容写路径落库时也不写这一列。
    """
    values = dict(values or {})
    values.pop("status", None)
    if current_row is not None:
        submitted = set(values.keys())
        for column in BUILTIN_COLUMNS:
            if column not in submitted:
                values[column] = field_attr(current_row, column)

    # 未纳入标准库的内置列在库里既不展示也不该存在（集合按需求类型布局解析，status
    # 恒在其中）。这里是库写入路径的唯一执行点。
    if isinstance(owner, RequirementLibrary):
        for column in library_hidden_builtin_columns(owner.requirement_type):
            values[column] = BUILTIN_COLUMN_DEFAULTS[column]

    assignee_id = values.get("assignee_id")
    # 与下面父项的规则同一个道理：只拦**新指派**。负责人离开工作区后，他名下的需求
    # 仍然要能改标题、改描述 —— 回填出来的旧值不该让整行写不动
    current_assignee_id = (
        str(field_attr(current_row, "assignee_id"))
        if current_row is not None and field_attr(current_row, "assignee_id")
        else None
    )
    if assignee_id and str(assignee_id) != current_assignee_id:
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
        parent_by_id = {}
        status_by_id = {}
        for item_id, item_parent_id, item_status in parent_queryset.values_list(
            "id", "parent_id", "status"
        ):
            parent_by_id[str(item_id)] = str(item_parent_id) if item_parent_id else None
            status_by_id[str(item_id)] = item_status
        if str(parent_id) not in parent_by_id:
            raise serializers.ValidationError(
                {"parent_id": "The parent requirement was not found in this scope."}
            )
        # 已关闭的需求不进任何关联选择器，父项也不例外。只拦**新指派**：更新路径会从
        # current_row 回填 parent_id，无条件拦会让已关闭父项下的所有子需求改不了任何内容
        current_parent_id = (
            str(field_attr(current_row, "parent_id"))
            if current_row is not None and field_attr(current_row, "parent_id")
            else None
        )
        if (
            str(parent_id) != current_parent_id
            and status_by_id.get(str(parent_id)) == RequirementItemStatus.CLOSED
        ):
            raise serializers.ValidationError(
                {"parent_id": "A closed requirement cannot be selected as parent."}
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


class RequirementConfigurationConflict(Exception):
    pass


ROW_FIELDS = [
    "id",
    "product_id",
    "project_id",
    "library_id",
    "requirement_type_id",
    # 作用域内自增序号 + 展示编号。产品/项目行的 display_id 是服务端拼的
    # ECOM-1（前缀是每个 RowLayer 的常量，从 context 拿，零查询）；库条目的
    # display_id 直接就是手填的 code。
    "sequence_id",
    "code",
    "display_id",
    # 标准库出处。source_library_id 是裸 UUID（不是外键），前缀按页批量解析，
    # 见 BaseRequirementRowViewSet._row_context。手工创建的行三个都是 None。
    "source_library_id",
    "source_sequence_id",
    "source_display_id",
    *BUILTIN_COLUMNS,
    # 模块挂靠（只读输出）。模块不是内容：不在 BUILTIN_COLUMNS 里、不进版本
    # 快照与变更单 diff，写入口是 set-module 端点与创建时的 module_id。
    # module_name 随行拍平，网格模块列与详情抽屉直接用，不用前端再解析树。
    "module_id",
    "module_name",
    "data",
    # 需求级附件（只读输出）。算内容但不是内置列，写入口是更新载荷顶层的 attachments。
    "attachments",
    "sort_order",
    # 乐观锁计数器。与审批版本链（approved_version）是两个完全不同的数字，前端把它
    # 叫 lock_version 以免混淆。
    "version",
    "approval_state",
    "approved_version",
    "pending_change_request_id",
    "pending_change_type",
    "is_locked",
    "can_submit_review",
    "can_withdraw",
    # 这条需求被哪些项目引用（RequirementProject）。只有产品需求列表会注解它，
    # 别处拿不到注解时返回 []，见 utils/requirement_project.annotate_project_ids。
    "project_ids",
    "created_at",
    "updated_at",
    "created_by",
    "updated_by",
]


class RequirementSerializer(BaseSerializer):
    """一条需求条目。

    八个内置字段是行上的平铺键，与 data 平级；data 只装自定义字段（key 是字段 UUID）。
    前端因此有两组列：固定的内置列 + 需求类型给的自定义列。

    审批态的四个派生字段（approval_state / is_locked / can_*）一律由服务端算 —— 前端
    从 pending_change_request_id 反推会漏掉权限这一维。
    """

    approval_state = serializers.CharField(read_only=True)
    is_locked = serializers.BooleanField(read_only=True)
    pending_change_request_id = serializers.SerializerMethodField()
    pending_change_type = serializers.SerializerMethodField()
    can_submit_review = serializers.SerializerMethodField()
    can_withdraw = serializers.SerializerMethodField()
    display_id = serializers.SerializerMethodField()
    source_display_id = serializers.SerializerMethodField()
    project_ids = serializers.SerializerMethodField()
    module_name = serializers.SerializerMethodField()

    class Meta:
        model = Requirement
        fields = ROW_FIELDS
        read_only_fields = fields

    def get_project_ids(self, obj):
        # 没注解就是 [] 而不是 None —— 前端直接 map，
        # 少一处 ?? [] 就少一处忘了写的机会
        return [str(item) for item in getattr(obj, "project_ids", None) or []]

    def get_module_name(self, obj):
        if not obj.module_id:
            return None
        # 优先走 context 的批量映射（_row_context 会带，写路径的内存实例靠它免 N+1）；
        # 列表入口没带映射时退回 FK 取值 —— 那些 queryset 都 select_related("module") 了
        names = self.context.get("module_names")
        if names is not None:
            return names.get(str(obj.module_id))
        return obj.module.name if obj.module else None

    def get_display_id(self, obj):
        # 库条目的编号是用户手填的 code，不做任何拼接
        if obj.library_id:
            return obj.code
        # 产品/项目作用域前缀对一批行是常量 —— 一个 RowLayer 只服务一个产品/项目
        prefix = self.context.get("scope_identifier")
        if not prefix or obj.sequence_id is None:
            return None
        return f"{prefix}-{obj.sequence_id}"

    def get_source_display_id(self, obj):
        if not obj.source_library_id:
            return None
        # 实时跟随来源库条目当前的手填编号（source_display_id_map 按批反查）。
        # 拿不到映射说明调用方用的是 _serializer_context 而不是 _row_context ——
        # 这时来源编号会静默消失（不报错），排查从这里开始
        return (self.context.get("source_display_ids") or {}).get(
            f"{obj.source_library_id}:{obj.source_sequence_id}"
        )

    def get_pending_change_request_id(self, obj):
        value = getattr(obj, "pending_change_request_id", None)
        return str(value) if value else None

    def get_pending_change_type(self, obj):
        return getattr(obj, "pending_change_type", None)

    def _can_write(self):
        return bool(self.context.get("can_write"))

    def get_can_submit_review(self, obj):
        # 标准库条目不走审批；在评审中的行也不能重复提交；已关闭的行内容只读，
        # 不能提内容评审（「申请删除」走行菜单，不看这个信号）
        if (
            obj.library_id
            or obj.pending_change_item_id
            or obj.status == RequirementItemStatus.CLOSED
        ):
            return False
        return self._can_write() and obj.approval_state != "approved"

    def get_can_withdraw(self, obj):
        if not obj.pending_change_item_id:
            return False
        request = self.context.get("request")
        user = getattr(request, "user", None)
        submitter_id = getattr(obj, "pending_change_submitted_by", None)
        if user is None or user.is_anonymous or submitter_id is None:
            return False
        return str(submitter_id) == str(user.id)


class _RequirementBuiltinWriteMixin:
    """写入路径共用的内置字段校验。

    context 里要有 owner 与 parent_queryset —— 后者划定父项的可选范围（这一行所在
    的那一批行），由视图从 RowLayer 传进来。
    """

    def resolve_builtin(self, attrs, *, row_id=None, current_row=None):
        return validate_requirement_builtin_values(
            owner=self.context["owner"],
            values=attrs.get("builtin") or {},
            parent_queryset=self.context["parent_queryset"],
            current_row=current_row,
            row_id=row_id,
        )


class _RequirementCodeWriteMixin:
    """库条目手填编号（code）的写入校验。

    刻意**不校验格式** —— 只有两条规则：非空、库内唯一（不含软删，口径同
    req_unique_library_code_active）。建行可以不带编号（行内新增的空行），由工厂
    补「库标识-序号」占位编号；已有的编号不能清空。产品/项目路径带 code 会被显式
    拒绝，而不是静默丢弃 —— 尽早暴露用错端点的客户端。
    """

    def resolve_code(self, attrs, *, on_create, row_id=None):
        owner = self.context["owner"]
        if not isinstance(owner, RequirementLibrary):
            if "code" in attrs:
                raise serializers.ValidationError(
                    {"code": "Only library items accept a manual code."}
                )
            return attrs
        code = (attrs.get("code") or "").strip()
        if not code:
            if on_create:
                # 建行不带编号 = 让工厂补占位编号（见 _new_library_item）
                attrs.pop("code", None)
                return attrs
            if "code" not in attrs:
                # update 不带 code = 不改编号
                return attrs
            raise serializers.ValidationError({"code": "REQUIREMENT_CODE_REQUIRED"})
        duplicates = Requirement.objects.filter(library=owner, code=code)
        if row_id:
            duplicates = duplicates.exclude(pk=row_id)
        if duplicates.exists():
            raise serializers.ValidationError(
                {"code": "REQUIREMENT_CODE_ALREADY_EXISTS"}
            )
        attrs["code"] = code
        return attrs


class RequirementCreateSerializer(
    _RequirementBuiltinWriteMixin, _RequirementCodeWriteMixin, serializers.Serializer
):
    """新增一条需求。

    必须指明这行绑定哪个需求类型 —— 字段由类型提供，data 也按该类型的字段校验。
    标准库的条目不用传，库本身就固定了类型（default_requirement_type_id）。
    """

    data = serializers.DictField()
    builtin = RequirementBuiltinWriteSerializer(required=False, default=dict)
    requirement_type_id = serializers.UUIDField(required=False)
    before_id = serializers.UUIDField(required=False, allow_null=True)
    after_id = serializers.UUIDField(required=False, allow_null=True)
    # 创建时随行挂模块（左侧树选中某模块后新建自动挂靠）。模块不是内容，所以
    # 不进 builtin；更新走 set-module 端点，RequirementUpdateSerializer 不收它。
    module_id = serializers.UUIDField(required=False, allow_null=True)
    # 库条目手填编号，库作用域必填（resolve_code）；产品/项目路径不接受。
    # 顶层字段而不是 builtin 键 —— builtin 同时是产品路径的写载荷。
    code = serializers.CharField(required=False, allow_blank=True, max_length=255)

    def validate(self, attrs):
        if attrs.get("before_id") and attrs.get("after_id"):
            raise serializers.ValidationError(
                "Only one insertion anchor can be provided."
            )

        module_id = attrs.get("module_id")
        if module_id:
            scope = module_scope_filter(self.context["owner"])
            if scope is None or not RequirementModule.objects.filter(
                id=module_id, **scope
            ).exists():
                raise serializers.ValidationError(
                    {"module_id": "The module was not found."}
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
        return self.resolve_code(attrs, on_create=True)


class RequirementUpdateSerializer(
    _RequirementBuiltinWriteMixin, _RequirementCodeWriteMixin, serializers.Serializer
):
    """更新一条需求。

    不接受 requirement_type_id —— 行与需求类型的绑定创建后不可变，调用方按行上
    已存的 requirement_type_id 取字段传进 context["fields"]。
    """

    data = serializers.DictField()
    builtin = RequirementBuiltinWriteSerializer(required=False, default=dict)
    version = serializers.IntegerField(min_value=1)
    # 库条目手填编号；不带 = 不改。产品/项目路径不接受。
    code = serializers.CharField(required=False, allow_blank=True, max_length=255)
    # 需求级附件整组替换；不带 = 不改。产品与库条目两侧都收。
    attachments = serializers.JSONField(required=False)

    def validate_data(self, value):
        current_row = self.context.get("current_row")
        return validate_requirement_data(
            owner=self.context["owner"],
            data=value,
            fields=self.context["fields"],
            current_data=getattr(current_row, "data", None),
        )

    def validate_attachments(self, value):
        return _canonical_asset_values(self.context["owner"], value, with_meta=True)

    def validate(self, attrs):
        attrs["builtin"] = self.resolve_builtin(
            attrs,
            row_id=self.context["row_id"],
            current_row=self.context.get("current_row"),
        )
        return self.resolve_code(
            attrs, on_create=False, row_id=self.context["row_id"]
        )


class RequirementBatchCreateSerializer(RequirementCreateSerializer):
    client_id = serializers.UUIDField()


class RequirementBatchUpdateSerializer(
    _RequirementBuiltinWriteMixin, _RequirementCodeWriteMixin, serializers.Serializer
):
    """批量更新的一项：按行自己的需求类型校验 data。

    validate_data 看不到同级的 id，所以校验整体放在 validate 里做。
    """

    id = serializers.UUIDField()
    data = serializers.DictField()
    builtin = RequirementBuiltinWriteSerializer(required=False, default=dict)
    version = serializers.IntegerField(min_value=1)
    # 库条目手填编号；不带 = 不改。产品/项目路径不接受。
    code = serializers.CharField(required=False, allow_blank=True, max_length=255)

    def validate(self, attrs):
        row_requirement_types = self.context["row_requirement_types"]
        requirement_type_id = row_requirement_types.get(attrs["id"])
        if requirement_type_id is None:
            raise serializers.ValidationError(
                {"id": "The requirement was not found."}
            )
        current_row = (self.context.get("rows_by_id") or {}).get(attrs["id"])
        attrs["data"] = validate_requirement_data(
            owner=self.context["owner"],
            data=attrs["data"],
            fields=self.context["requirement_type_resolver"].specs(
                requirement_type_id
            ),
            current_data=getattr(current_row, "data", None),
        )
        attrs["builtin"] = self.resolve_builtin(
            attrs,
            row_id=attrs["id"],
            current_row=current_row,
        )
        return self.resolve_code(attrs, on_create=False, row_id=attrs["id"])


class RequirementBatchDeleteSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    version = serializers.IntegerField(min_value=1)


class RequirementImportSerializer(serializers.Serializer):
    """从标准库导入条目到产品需求。

    只收归属与条目，不收 data —— data 是从库条目原样拷过来的。两侧引用的是同一个
    需求类型，字段 UUID 因此完全一致，不需要任何重映射。
    """

    library_id = serializers.UUIDField()
    # 一次收完，调用方**不要**自己切批：remap_imported_parents 只在本批内部重接父项，
    # 分批会让跨批的父子对静默丢掉层级。弹窗支持「勾整库」之后这个上限是会被摸到的，
    # 所以放宽而不是让前端切片（单次事务本来就已经锁了整个作用域，收多点不多锁什么）。
    item_ids = serializers.ListField(
        child=serializers.UUIDField(), allow_empty=False, max_length=2000
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


class RequirementSetModuleSerializer(serializers.Serializer):
    """批量挂靠 / 移动需求到模块。

    module_id 必传：显式传 null 才是「移回全部（取消挂靠）」，漏传按参数缺失报错，
    避免把误发的空请求当成批量摘除。
    """

    requirement_ids = serializers.ListField(
        child=serializers.UUIDField(), allow_empty=False
    )
    module_id = serializers.UUIDField(required=True, allow_null=True)

    def validate_requirement_ids(self, value):
        return list(dict.fromkeys(value))


class RequirementRollbackSerializer(serializers.Serializer):
    """回滚到某个已通过版本。只收版本号 —— 内容一律由服务端从版本行里读。"""

    version = serializers.IntegerField(min_value=1)


class RequirementBatchSaveSerializer(serializers.Serializer):
    """网格的批量保存。

    没有 expected_updated_at：它原本是 max(基线, 各需求类型).updated_at，而字段结构
    变更现在立即生效，任何一次类型编辑都会顶高这个 max，把所有打开着的网格的暂存编辑
    全部打成 409 —— 哪怕改的类型跟他无关。真实冲突由逐行 version 覆盖。
    """

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

        # 库条目手填编号的批内查重：单项校验只对照库内已有行，两条 create（或
        # create 与改号的 update）在同一批里撞号要在这里拦，否则落库时才撞
        # req_unique_library_code_active，整批 500。
        codes = [
            item["code"]
            for item in [*creates, *updates]
            if item.get("code")
        ]
        if len(codes) != len(set(codes)):
            raise serializers.ValidationError(
                {"code": "REQUIREMENT_CODE_DUPLICATED_IN_BATCH"}
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
