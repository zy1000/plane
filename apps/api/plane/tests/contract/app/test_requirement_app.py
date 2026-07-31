import json
from unittest.mock import patch
from uuid import uuid4

import pytest
from django.urls import reverse
from rest_framework import status

from plane.db.models import (
    Product,
    ProductMember,
    ProjectMember,
    Requirement,
    RequirementApprover,
    RequirementApprovalType,
    RequirementChangeRequest,
    RequirementDetail,
    RequirementField,
    RequirementFieldType,
    RequirementLibrary,
    RequirementStatus,
    WorkspaceMember,
)
from plane.tests.factories import ProjectFactory, UserFactory, WorkspaceFactory


@pytest.mark.contract
@pytest.mark.django_db
class TestRequirementApp:
    def setup_method(self):
        self.owner = UserFactory(username=f"requirement-owner-{uuid4()}")
        self.workspace = WorkspaceFactory(owner=self.owner)
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            member=self.owner,
            role=20,
        )
        self.list_url = reverse(
            "requirements", kwargs={"slug": self.workspace.slug}
        )

    def authenticate(self, api_client, user):
        api_client.force_authenticate(user=user)

    def add_workspace_member(self, role=15):
        user = UserFactory(username=f"requirement-member-{uuid4()}")
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            member=user,
            role=role,
        )
        return user

    def create_product(self, *members):
        product = Product.objects.create(
            name=f"Requirement product {uuid4()}",
            workspace=self.workspace,
            owner=self.owner,
        )
        for member in members:
            ProductMember.objects.create(product=product, member=member)
        return product

    def create_standard_requirement(self, template, title=None):
        """标准库 + 标准需求：模板只定义字段，明细挂在标准需求上。"""
        library = RequirementLibrary.objects.create(
            workspace=self.workspace,
            template=template,
            name=f"Requirement library {uuid4()}",
        )
        return Requirement.objects.create(
            workspace=self.workspace,
            library=library,
            title=title or f"Standard requirement {uuid4()}",
            owner=self.owner,
        )

    def create_project(self, *members):
        project = ProjectFactory(
            workspace=self.workspace,
            identifier=uuid4().hex[:8].upper(),
        )
        for member in members:
            ProjectMember.objects.create(
                project=project,
                member=member,
                role=20,
                is_active=True,
            )
        return project

    def test_crud_contract_for_workspace_product_and_project_scopes(self, api_client):
        approver = self.add_workspace_member()
        product = self.create_product(self.owner, approver)
        project = self.create_project(self.owner, approver)
        self.authenticate(api_client, self.owner)

        template_response = api_client.post(
            self.list_url,
            {
                "is_template": True,
                "title": "  Requirement template  ",
                "description_html": '<p>Template</p><script>alert("x")</script>',
                "approver_ids": [str(approver.id)],
            },
            format="json",
        )
        assert template_response.status_code == status.HTTP_201_CREATED
        assert template_response.data["scope"] == "workspace"
        assert template_response.data["title"] == "Requirement template"
        assert "<script" not in template_response.data["description_html"]
        assert [str(item) for item in template_response.data["approver_ids"]] == [
            str(approver.id)
        ]
        assert str(template_response.data["approver_details"][0]["id"]) == str(
            approver.id
        )

        product_response = api_client.post(
            self.list_url,
            {
                "product_id": str(product.id),
                "title": "Product requirement",
                "approval_type": RequirementApprovalType.ALL,
                "approver_ids": [str(approver.id)],
            },
            format="json",
        )
        assert product_response.status_code == status.HTTP_201_CREATED
        assert product_response.data["scope"] == "product"
        assert str(product_response.data["product_id"]) == str(product.id)
        assert product_response.data["field_count"] == 0
        assert product_response.data["detail_count"] == 0

        project_response = api_client.post(
            self.list_url,
            {
                "project_id": str(project.id),
                "title": "Project requirement",
                "approver_ids": [str(approver.id)],
            },
            format="json",
        )
        assert project_response.status_code == status.HTTP_201_CREATED
        assert project_response.data["scope"] == "project"
        assert str(project_response.data["project_id"]) == str(project.id)

        template_list = api_client.get(self.list_url, {"is_template": "true"})
        product_list = api_client.get(
            self.list_url, {"product_id": str(product.id)}
        )
        project_list = api_client.get(
            self.list_url, {"project_id": str(project.id)}
        )
        assert [item["id"] for item in template_list.data] == [
            template_response.data["id"]
        ]
        assert [item["id"] for item in product_list.data] == [
            product_response.data["id"]
        ]
        assert [item["id"] for item in project_list.data] == [
            project_response.data["id"]
        ]

        detail_url = reverse(
            "requirement-detail",
            kwargs={
                "slug": self.workspace.slug,
                "pk": project_response.data["id"],
            },
        )
        update_response = api_client.patch(
            detail_url,
            {"title": "Updated requirement", "approver_ids": []},
            format="json",
        )
        assert update_response.status_code == status.HTTP_200_OK
        assert update_response.data["title"] == "Updated requirement"
        assert update_response.data["approver_ids"] == []

        immutable_response = api_client.patch(
            detail_url,
            {"product_id": str(product.id)},
            format="json",
        )
        assert immutable_response.status_code == status.HTTP_400_BAD_REQUEST
        assert "product_id" in immutable_response.data

        with patch("plane.db.mixins.soft_delete_related_objects.delay"):
            delete_response = api_client.delete(detail_url)
        assert delete_response.status_code == status.HTTP_204_NO_CONTENT
        assert not Requirement.objects.filter(id=project_response.data["id"]).exists()
        assert Requirement.all_objects.filter(
            id=project_response.data["id"], deleted_at__isnull=False
        ).exists()

    def test_scope_membership_and_approval_rule_validation(self, api_client):
        approver = self.add_workspace_member()
        non_product_member = self.add_workspace_member()
        product = self.create_product(self.owner, approver)
        self.authenticate(api_client, self.owner)

        invalid_member_response = api_client.post(
            self.list_url,
            {
                "product_id": str(product.id),
                "title": "Invalid approver",
                "approver_ids": [str(non_product_member.id)],
            },
            format="json",
        )
        assert invalid_member_response.status_code == status.HTTP_400_BAD_REQUEST
        assert "approver_ids" in invalid_member_response.data

        invalid_owner_response = api_client.post(
            self.list_url,
            {
                "product_id": str(product.id),
                "title": "Invalid owner",
                "owner_id": str(non_product_member.id),
            },
            format="json",
        )
        assert invalid_owner_response.status_code == status.HTTP_400_BAD_REQUEST
        assert "owner_id" in invalid_owner_response.data

        insufficient_response = api_client.post(
            self.list_url,
            {
                "product_id": str(product.id),
                "title": "Insufficient approvals",
                "approval_type": RequirementApprovalType.N_OF_M,
                "required_count": 2,
                "approver_ids": [str(approver.id)],
            },
            format="json",
        )
        assert insufficient_response.status_code == status.HTTP_400_BAD_REQUEST
        assert "required_count" in insufficient_response.data

        second_approver = self.add_workspace_member()
        ProductMember.objects.create(product=product, member=second_approver)
        valid_response = api_client.post(
            self.list_url,
            {
                "product_id": str(product.id),
                "title": "Valid approvals",
                "approval_type": RequirementApprovalType.N_OF_M,
                "required_count": 2,
                "approver_ids": [
                    str(approver.id),
                    str(approver.id),
                    str(second_approver.id),
                ],
            },
            format="json",
        )
        assert valid_response.status_code == status.HTTP_201_CREATED
        assert [str(item) for item in valid_response.data["approver_ids"]] == [
            str(approver.id),
            str(second_approver.id),
        ]
        assert not RequirementChangeRequest.objects.exists()

        invalid_count_response = api_client.post(
            self.list_url,
            {
                "product_id": str(product.id),
                "title": "Count with any",
                "approval_type": RequirementApprovalType.ANY,
                "required_count": 1,
                "approver_ids": [str(approver.id)],
            },
            format="json",
        )
        assert invalid_count_response.status_code == status.HTTP_400_BAD_REQUEST
        assert "required_count" in invalid_count_response.data

    def test_template_import_clones_content_and_filters_approvers(self, api_client):
        eligible_approver = self.add_workspace_member()
        filtered_approver = self.add_workspace_member()
        product = self.create_product(self.owner, eligible_approver)
        template = Requirement.objects.create(
            workspace=self.workspace,
            is_template=True,
            title="Imported template",
            description_html="<p>Template description</p>",
            status=RequirementStatus.PUBLISHED,
            owner=self.owner,
            approval_type=RequirementApprovalType.N_OF_M,
            required_count=2,
            is_active=True,
        )
        RequirementApprover.objects.create(
            requirement=template,
            approver=eligible_approver,
            sort_order=10,
        )
        RequirementApprover.objects.create(
            requirement=template,
            approver=filtered_approver,
            sort_order=20,
        )
        root_field = RequirementField.objects.create(
            requirement=template,
            name="Form",
            field_type=RequirementFieldType.FORM,
            config={"layout": "stacked"},
        )
        child_field = RequirementField.objects.create(
            requirement=template,
            parent_field=root_field,
            name="Summary",
            field_type=RequirementFieldType.TEXT,
            default_value="Default summary",
        )
        self.authenticate(api_client, self.owner)

        failed_response = api_client.post(
            self.list_url,
            {
                "product_id": str(product.id),
                "title": "Invalid import without template",
                "owner_id": str(self.owner.id),
                "import_fields": True,
            },
            format="json",
        )
        assert failed_response.status_code == status.HTTP_400_BAD_REQUEST
        assert "import_fields" in failed_response.data
        assert not Requirement.objects.filter(product=product).exists()

        success_response = api_client.post(
            self.list_url,
            {
                "product_id": str(product.id),
                "template_id": str(template.id),
                "title": "Imported copy",
                "description_html": "<p>Product-specific description</p>",
                "approval_type": RequirementApprovalType.ALL,
                "approver_ids": [str(self.owner.id)],
                "import_fields": True,
            },
            format="json",
        )
        assert success_response.status_code == status.HTTP_201_CREATED
        assert success_response.data["title"] == "Imported copy"
        assert (
            success_response.data["description_html"]
            == "<p>Product-specific description</p>"
        )
        assert success_response.data["status"] == RequirementStatus.DRAFT
        assert success_response.data["approval_type"] == RequirementApprovalType.ALL
        assert success_response.data["required_count"] is None
        assert [str(item) for item in success_response.data["approver_ids"]] == [
            str(self.owner.id)
        ]
        assert success_response.data["field_count"] == 2
        # 模板只定义字段，导入不会带来任何明细
        assert success_response.data["detail_count"] == 0

        copied_requirement = Requirement.objects.get(id=success_response.data["id"])
        copied_fields = list(copied_requirement.fields.all())
        assert len(copied_fields) == 2
        copied_root = next(item for item in copied_fields if item.parent_field_id is None)
        copied_child = next(item for item in copied_fields if item.parent_field_id)
        assert copied_root.id != root_field.id
        assert copied_child.id != child_field.id
        assert copied_child.parent_field_id == copied_root.id
        assert copied_root.config == root_field.config
        assert not copied_requirement.details.exists()

        without_fields_response = api_client.post(
            self.list_url,
            {
                "product_id": str(product.id),
                "template_id": str(template.id),
                "title": "Reference only copy",
                "owner_id": str(self.owner.id),
            },
            format="json",
        )
        assert without_fields_response.status_code == status.HTTP_201_CREATED
        assert without_fields_response.data["field_count"] == 0
        assert without_fields_response.data["detail_count"] == 0
        assert without_fields_response.data["approver_ids"] == []

    def test_only_authentication_is_enforced(self, api_client):
        unauthenticated_response = api_client.get(self.list_url)
        assert unauthenticated_response.status_code == status.HTTP_401_UNAUTHORIZED

        outsider = UserFactory(username=f"requirement-outsider-{uuid4()}")
        self.authenticate(api_client, outsider)
        create_response = api_client.post(
            self.list_url,
            {
                "is_template": True,
                "title": "Created without workspace permission",
                "owner_id": str(self.owner.id),
            },
            format="json",
        )
        assert create_response.status_code == status.HTTP_201_CREATED

    def test_product_requirement_permission_matrix_and_promoted_endpoints(
        self, api_client
    ):
        product_member = self.add_workspace_member(role=5)
        reviewer = self.add_workspace_member(role=5)
        workspace_viewer = self.add_workspace_member(role=5)
        workspace_admin = self.add_workspace_member(role=20)
        outsider = UserFactory(username=f"requirement-outsider-{uuid4()}")
        product = self.create_product(self.owner, product_member)
        product.reviewers.add(reviewer)

        self.authenticate(api_client, self.owner)
        create_response = api_client.post(
            self.list_url,
            {
                "product_id": str(product.id),
                "title": "Permission matrix requirement",
                "owner_id": str(self.owner.id),
            },
            format="json",
        )
        assert create_response.status_code == status.HTTP_201_CREATED
        requirement_id = create_response.data["id"]
        configuration_url = reverse(
            "requirement-configuration",
            kwargs={"slug": self.workspace.slug, "pk": requirement_id},
        )
        details_url = reverse(
            "requirement-details",
            kwargs={
                "slug": self.workspace.slug,
                "requirement_id": requirement_id,
            },
        )

        for read_only_user in (reviewer, workspace_viewer):
            self.authenticate(api_client, read_only_user)
            list_response = api_client.get(
                self.list_url, {"product_id": str(product.id)}
            )
            assert list_response.status_code == status.HTTP_200_OK
            assert [item["id"] for item in list_response.data] == [requirement_id]
            assert list_response.data[0]["can_edit"] is False
            assert api_client.get(configuration_url).status_code == status.HTTP_200_OK
            assert api_client.get(details_url).status_code == status.HTTP_200_OK
            assert (
                api_client.post(
                    self.list_url,
                    {
                        "product_id": str(product.id),
                        "title": "Read-only create",
                        "owner_id": str(self.owner.id),
                    },
                    format="json",
                ).status_code
                == status.HTTP_403_FORBIDDEN
            )
            assert (
                api_client.post(details_url, {"data": {}}, format="json").status_code
                == status.HTTP_403_FORBIDDEN
            )

        self.authenticate(api_client, product_member)
        member_list = api_client.get(
            self.list_url, {"product_id": str(product.id)}
        )
        assert member_list.status_code == status.HTTP_200_OK
        assert member_list.data[0]["can_edit"] is True
        member_create = api_client.post(
            self.list_url,
            {
                "product_id": str(product.id),
                "title": "Created by product member",
                "owner_id": str(product_member.id),
            },
            format="json",
        )
        assert member_create.status_code == status.HTTP_201_CREATED
        configuration = api_client.get(configuration_url).data
        assert (
            api_client.put(
                configuration_url,
                {
                    "expected_updated_at": configuration["requirement"]["updated_at"],
                    "requirement": {},
                    "fields": [],
                },
                format="json",
            ).status_code
            == status.HTTP_200_OK
        )
        assert (
            api_client.post(details_url, {"data": {}}, format="json").status_code
            == status.HTTP_201_CREATED
        )

        self.authenticate(api_client, workspace_admin)
        admin_create = api_client.post(
            self.list_url,
            {
                "product_id": str(product.id),
                "title": "Created by workspace admin",
                "owner_id": str(self.owner.id),
            },
            format="json",
        )
        assert admin_create.status_code == status.HTTP_201_CREATED

        self.authenticate(api_client, outsider)
        assert (
            api_client.get(
                self.list_url, {"product_id": str(product.id)}
            ).status_code
            == status.HTTP_404_NOT_FOUND
        )
        assert (
            api_client.get(configuration_url).status_code
            == status.HTTP_404_NOT_FOUND
        )

    def test_template_configuration_and_detail_crud_contract(self, api_client):
        self.authenticate(api_client, self.owner)
        template_response = api_client.post(
            self.list_url,
            {
                "is_template": True,
                "title": "Dynamic requirement template",
                "owner_id": str(self.owner.id),
            },
            format="json",
        )
        assert template_response.status_code == status.HTTP_201_CREATED
        template_id = template_response.data["id"]
        configuration_url = reverse(
            "requirement-configuration",
            kwargs={"slug": self.workspace.slug, "pk": template_id},
        )

        configuration_response = api_client.get(configuration_url)
        assert configuration_response.status_code == status.HTTP_200_OK
        summary_client_id = f"summary-{uuid4()}"
        form_client_id = f"form-{uuid4()}"
        accepted_client_id = f"accepted-{uuid4()}"
        save_configuration_response = api_client.put(
            configuration_url,
            {
                "expected_updated_at": configuration_response.data["requirement"][
                    "updated_at"
                ],
                "requirement": {
                    "description_html": "<p>Collect structured requirements.</p>",
                    "status": RequirementStatus.PUBLISHED,
                },
                "fields": [
                    {
                        "client_id": summary_client_id,
                        "name": "Summary",
                        "field_type": RequirementFieldType.TEXT,
                        "is_required": True,
                        "is_active": True,
                        "config": {"placeholder": "Describe the requirement"},
                        "default_value": None,
                        "children": [],
                    },
                    {
                        "client_id": form_client_id,
                        "name": "Acceptance criteria",
                        "field_type": RequirementFieldType.FORM,
                        "is_required": False,
                        "is_active": True,
                        "config": {},
                        "default_value": None,
                        "children": [
                            {
                                "client_id": accepted_client_id,
                                "name": "Accepted",
                                "field_type": RequirementFieldType.BOOLEAN,
                                "is_required": True,
                                "is_active": True,
                                "config": {},
                                "default_value": False,
                            }
                        ],
                    },
                ],
            },
            format="json",
        )
        assert save_configuration_response.status_code == status.HTTP_200_OK
        assert save_configuration_response.data["requirement"]["status"] == (
            RequirementStatus.PUBLISHED
        )
        assert len(save_configuration_response.data["fields"]) == 2
        summary_id = save_configuration_response.data["created_field_ids"][
            summary_client_id
        ]
        form_id = save_configuration_response.data["created_field_ids"][
            form_client_id
        ]
        accepted_id = save_configuration_response.data["created_field_ids"][
            accepted_client_id
        ]
        saved_form = save_configuration_response.data["fields"][1]
        form_configuration_payload = {
            key: saved_form[key]
            for key in (
                "id",
                "name",
                "field_type",
                "is_required",
                "is_active",
                "config",
                "default_value",
            )
        }
        form_configuration_payload["children"] = [
            {
                key: child[key]
                for key in (
                    "id",
                    "name",
                    "field_type",
                    "is_required",
                    "is_active",
                    "config",
                    "default_value",
                )
            }
            for child in saved_form["children"]
        ]

        # 模板只定义字段，明细走标准库里的标准需求（字段实时引用该模板）
        assert (
            api_client.post(
                reverse(
                    "requirement-details",
                    kwargs={
                        "slug": self.workspace.slug,
                        "requirement_id": template_id,
                    },
                ),
                {"data": {}},
                format="json",
            ).status_code
            == status.HTTP_404_NOT_FOUND
        )
        standard_requirement = self.create_standard_requirement(
            Requirement.objects.get(id=template_id)
        )
        details_url = reverse(
            "requirement-details",
            kwargs={
                "slug": self.workspace.slug,
                "requirement_id": standard_requirement.id,
            },
        )
        first_detail_response = api_client.post(
            details_url,
            {
                "data": {
                    summary_id: "Searchable checkout requirement",
                    form_id: [
                        {
                            "id": str(uuid4()),
                            "values": {accepted_id: True},
                        }
                    ],
                }
            },
            format="json",
        )
        assert first_detail_response.status_code == status.HTTP_201_CREATED
        second_detail_response = api_client.post(
            details_url,
            {
                "after_id": first_detail_response.data["id"],
                "data": {
                    summary_id: "Unrelated content",
                    form_id: [],
                },
            },
            format="json",
        )
        assert second_detail_response.status_code == status.HTTP_201_CREATED
        assert second_detail_response.data["sort_order"] > (
            first_detail_response.data["sort_order"]
        )

        search_response = api_client.get(details_url, {"search": "checkout"})
        assert search_response.status_code == status.HTTP_200_OK
        assert [item["id"] for item in search_response.data["results"]] == [
            first_detail_response.data["id"]
        ]
        filter_response = api_client.get(
            details_url,
            {
                "filters": json.dumps(
                    [
                        {
                            "field_id": accepted_id,
                            "operator": "equals",
                            "value": True,
                        }
                    ]
                )
            },
        )
        assert filter_response.status_code == status.HTTP_200_OK
        assert [item["id"] for item in filter_response.data["results"]] == [
            first_detail_response.data["id"]
        ]

        detail_url = reverse(
            "requirement-detail-item",
            kwargs={
                "slug": self.workspace.slug,
                "requirement_id": standard_requirement.id,
                "pk": first_detail_response.data["id"],
            },
        )
        conflict_response = api_client.patch(
            detail_url,
            {
                "version": first_detail_response.data["version"] + 1,
                "data": first_detail_response.data["data"],
            },
            format="json",
        )
        assert conflict_response.status_code == status.HTTP_409_CONFLICT
        update_response = api_client.patch(
            detail_url,
            {
                "version": first_detail_response.data["version"],
                "data": {
                    **first_detail_response.data["data"],
                    summary_id: "Updated checkout requirement",
                },
            },
            format="json",
        )
        assert update_response.status_code == status.HTTP_200_OK
        assert update_response.data["version"] == (
            first_detail_response.data["version"] + 1
        )

        data_loss_response = api_client.put(
            configuration_url,
            {
                "expected_updated_at": save_configuration_response.data[
                    "requirement"
                ]["updated_at"],
                "requirement": {},
                "fields": [form_configuration_payload],
            },
            format="json",
        )
        assert data_loss_response.status_code == status.HTTP_409_CONFLICT
        assert data_loss_response.data["code"] == "REQUIREMENT_SCHEMA_DATA_LOSS"
        confirmed_response = api_client.put(
            configuration_url,
            {
                "expected_updated_at": save_configuration_response.data[
                    "requirement"
                ]["updated_at"],
                "requirement": {},
                "fields": [form_configuration_payload],
                "confirm_data_loss": True,
            },
            format="json",
        )
        assert confirmed_response.status_code == status.HTTP_200_OK

        bulk_delete_url = reverse(
            "requirement-detail-bulk-delete",
            kwargs={
                "slug": self.workspace.slug,
                "requirement_id": standard_requirement.id,
            },
        )
        bulk_delete_response = api_client.post(
            bulk_delete_url,
            {
                "ids": [
                    first_detail_response.data["id"],
                    second_detail_response.data["id"],
                ]
            },
            format="json",
        )
        assert bulk_delete_response.status_code == status.HTTP_204_NO_CONTENT
        assert not RequirementDetail.objects.filter(
            requirement=standard_requirement
        ).exists()

    def test_requirement_detail_bulk_save_applies_mixed_operations_atomically(
        self, api_client
    ):
        self.authenticate(api_client, self.owner)
        template = Requirement.objects.create(
            workspace=self.workspace,
            is_template=True,
            title=f"Bulk save template {uuid4()}",
            owner=self.owner,
        )
        field = RequirementField.objects.create(
            requirement=template,
            name="Summary",
            field_type=RequirementFieldType.TEXT,
            is_required=True,
            is_active=True,
            config={},
            default_value=None,
            sort_order=1000,
        )
        field_id = str(field.id)
        requirement = self.create_standard_requirement(template)
        first_detail = RequirementDetail.objects.create(
            requirement=requirement,
            data={field_id: "First"},
            sort_order=1000,
        )
        second_detail = RequirementDetail.objects.create(
            requirement=requirement,
            data={field_id: "Second"},
            sort_order=2000,
        )
        client_id = uuid4()
        second_client_id = uuid4()
        bulk_save_url = reverse(
            "requirement-detail-bulk-save",
            kwargs={
                "slug": self.workspace.slug,
                "requirement_id": requirement.id,
            },
        )

        response = api_client.post(
            bulk_save_url,
            {
                "expected_updated_at": requirement.updated_at.isoformat(),
                "creates": [
                    {
                        "client_id": str(client_id),
                        "data": {field_id: "Created"},
                        "after_id": str(first_detail.id),
                    },
                    {
                        "client_id": str(second_client_id),
                        "data": {field_id: "Created second"},
                        "after_id": str(first_detail.id),
                    },
                ],
                "updates": [
                    {
                        "id": str(first_detail.id),
                        "version": first_detail.version,
                        "data": {field_id: "Updated"},
                    }
                ],
                "deletes": [
                    {
                        "id": str(second_detail.id),
                        "version": second_detail.version,
                    }
                ],
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert [
            item["client_id"] for item in response.data["created"]
        ] == [str(client_id), str(second_client_id)]
        assert str(response.data["updated"][0]["id"]) == str(first_detail.id)
        assert response.data["deleted_ids"] == [str(second_detail.id)]
        saved_details = list(
            RequirementDetail.objects.filter(requirement=requirement).order_by(
                "sort_order"
            )
        )
        assert [detail.data[field_id] for detail in saved_details] == [
            "Updated",
            "Created",
            "Created second",
        ]
        assert saved_details[0].version == first_detail.version + 1

    def test_requirement_detail_bulk_save_rolls_back_on_conflict_or_validation_error(
        self, api_client
    ):
        self.authenticate(api_client, self.owner)
        template = Requirement.objects.create(
            workspace=self.workspace,
            is_template=True,
            title=f"Atomic bulk save template {uuid4()}",
            owner=self.owner,
        )
        field = RequirementField.objects.create(
            requirement=template,
            name="Summary",
            field_type=RequirementFieldType.TEXT,
            is_required=True,
            is_active=True,
            config={},
            default_value=None,
        )
        field_id = str(field.id)
        requirement = self.create_standard_requirement(template)
        detail = RequirementDetail.objects.create(
            requirement=requirement,
            data={field_id: "Original"},
            sort_order=1000,
        )
        bulk_save_url = reverse(
            "requirement-detail-bulk-save",
            kwargs={
                "slug": self.workspace.slug,
                "requirement_id": requirement.id,
            },
        )
        base_payload = {
            "expected_updated_at": requirement.updated_at.isoformat(),
            "creates": [
                {
                    "client_id": str(uuid4()),
                    "data": {field_id: "Created"},
                    "after_id": str(detail.id),
                }
            ],
            "deletes": [],
        }

        conflict_response = api_client.post(
            bulk_save_url,
            {
                **base_payload,
                "updates": [
                    {
                        "id": str(detail.id),
                        "version": detail.version + 1,
                        "data": {field_id: "Should not save"},
                    }
                ],
            },
            format="json",
        )
        assert conflict_response.status_code == status.HTTP_409_CONFLICT
        assert (
            conflict_response.data["code"]
            == "REQUIREMENT_DETAIL_BATCH_CONFLICT"
        )
        detail.refresh_from_db()
        assert detail.data[field_id] == "Original"
        assert RequirementDetail.objects.filter(requirement=requirement).count() == 1

        invalid_response = api_client.post(
            bulk_save_url,
            {
                **base_payload,
                "creates": [
                    {
                        **base_payload["creates"][0],
                        "client_id": str(uuid4()),
                        "data": {},
                    }
                ],
                "updates": [
                    {
                        "id": str(detail.id),
                        "version": detail.version,
                        "data": {field_id: "Should still not save"},
                    }
                ],
            },
            format="json",
        )
        assert invalid_response.status_code == status.HTTP_400_BAD_REQUEST
        detail.refresh_from_db()
        assert detail.data[field_id] == "Original"
        assert RequirementDetail.objects.filter(requirement=requirement).count() == 1

    def test_selector_field_configuration_values_search_filter_and_data_loss(
        self, api_client
    ):
        self.authenticate(api_client, self.owner)
        template_response = api_client.post(
            self.list_url,
            {
                "is_template": True,
                "title": "Selector requirement template",
                "owner_id": str(self.owner.id),
            },
            format="json",
        )
        assert template_response.status_code == status.HTTP_201_CREATED
        template_id = template_response.data["id"]
        configuration_url = reverse(
            "requirement-configuration",
            kwargs={"slug": self.workspace.slug, "pk": template_id},
        )
        configuration_response = api_client.get(configuration_url)
        root_option_ids = [str(uuid4()), str(uuid4())]
        child_option_ids = [str(uuid4()), str(uuid4())]
        selector_client_id = f"selector-{uuid4()}"
        form_client_id = f"form-{uuid4()}"
        child_client_id = f"child-selector-{uuid4()}"

        invalid_configuration_response = api_client.put(
            configuration_url,
            {
                "expected_updated_at": configuration_response.data["requirement"][
                    "updated_at"
                ],
                "requirement": {},
                "fields": [
                    {
                        "client_id": selector_client_id,
                        "name": "Priority",
                        "field_type": RequirementFieldType.SELECT,
                        "is_required": False,
                        "is_active": True,
                        "config": {
                            "selection_mode": "single",
                            "options": [
                                {"id": root_option_ids[0], "label": "Ready"},
                                {"id": root_option_ids[1], "label": "ready"},
                            ],
                        },
                        "default_value": None,
                        "children": [],
                    }
                ],
            },
            format="json",
        )
        assert invalid_configuration_response.status_code == status.HTTP_400_BAD_REQUEST

        save_configuration_response = api_client.put(
            configuration_url,
            {
                "expected_updated_at": configuration_response.data["requirement"][
                    "updated_at"
                ],
                "requirement": {},
                "fields": [
                    {
                        "client_id": selector_client_id,
                        "name": "Priority",
                        "field_type": RequirementFieldType.SELECT,
                        "is_required": False,
                        "is_active": True,
                        "config": {
                            "selection_mode": "single",
                            "options": [
                                {"id": root_option_ids[0], "label": "Ready"},
                                {"id": root_option_ids[1], "label": "Blocked"},
                            ],
                        },
                        "default_value": None,
                        "children": [],
                    },
                    {
                        "client_id": form_client_id,
                        "name": "Platforms",
                        "field_type": RequirementFieldType.FORM,
                        "is_required": False,
                        "is_active": True,
                        "config": {},
                        "default_value": None,
                        "children": [
                            {
                                "client_id": child_client_id,
                                "name": "Targets",
                                "field_type": RequirementFieldType.SELECT,
                                "is_required": False,
                                "is_active": True,
                                "config": {
                                    "selection_mode": "multiple",
                                    "options": [
                                        {
                                            "id": child_option_ids[0],
                                            "label": "Browser",
                                        },
                                        {
                                            "id": child_option_ids[1],
                                            "label": "Mobile",
                                        },
                                    ],
                                },
                                "default_value": [],
                            }
                        ],
                    },
                ],
            },
            format="json",
        )
        assert save_configuration_response.status_code == status.HTTP_200_OK
        selector_id = save_configuration_response.data["created_field_ids"][
            selector_client_id
        ]
        form_id = save_configuration_response.data["created_field_ids"][
            form_client_id
        ]
        child_id = save_configuration_response.data["created_field_ids"][
            child_client_id
        ]
        details_url = reverse(
            "requirement-details",
            kwargs={
                "slug": self.workspace.slug,
                "requirement_id": template_id,
            },
        )
        row_id = str(uuid4())
        detail_response = api_client.post(
            details_url,
            {
                "data": {
                    selector_id: root_option_ids[0],
                    form_id: [
                        {
                            "id": row_id,
                            "values": {
                                child_id: child_option_ids,
                            },
                        }
                    ],
                }
            },
            format="json",
        )
        assert detail_response.status_code == status.HTTP_201_CREATED

        invalid_detail_response = api_client.post(
            details_url,
            {
                "data": {
                    selector_id: str(uuid4()),
                    form_id: [],
                }
            },
            format="json",
        )
        assert invalid_detail_response.status_code == status.HTTP_400_BAD_REQUEST

        for search_value in ("Ready", "Browser"):
            search_response = api_client.get(
                details_url,
                {"search": search_value},
            )
            assert search_response.status_code == status.HTTP_200_OK
            assert [item["id"] for item in search_response.data["results"]] == [
                detail_response.data["id"]
            ]

        filter_payloads = [
            {
                "field_id": selector_id,
                "operator": "equals",
                "value": root_option_ids[0],
            },
            {
                "field_id": child_id,
                "operator": "contains",
                "value": child_option_ids[1],
            },
        ]
        for filter_payload in filter_payloads:
            filter_response = api_client.get(
                details_url,
                {"filters": json.dumps([filter_payload])},
            )
            assert filter_response.status_code == status.HTTP_200_OK
            assert [item["id"] for item in filter_response.data["results"]] == [
                detail_response.data["id"]
            ]

        def writable_fields(fields):
            result = []
            for field in fields:
                payload = {
                    key: field[key]
                    for key in (
                        "id",
                        "name",
                        "field_type",
                        "is_required",
                        "is_active",
                        "config",
                        "default_value",
                    )
                }
                payload["children"] = [
                    {
                        key: child[key]
                        for key in (
                            "id",
                            "name",
                            "field_type",
                            "is_required",
                            "is_active",
                            "config",
                            "default_value",
                        )
                    }
                    for child in field["children"]
                ]
                result.append(payload)
            return result

        renamed_fields = writable_fields(save_configuration_response.data["fields"])
        renamed_fields[0]["config"]["options"][0]["label"] = "Prepared"
        rename_response = api_client.put(
            configuration_url,
            {
                "expected_updated_at": save_configuration_response.data[
                    "requirement"
                ]["updated_at"],
                "requirement": {},
                "fields": renamed_fields,
            },
            format="json",
        )
        assert rename_response.status_code == status.HTTP_200_OK
        detail_after_rename = api_client.get(details_url).data["results"][0]
        assert detail_after_rename["data"][selector_id] == root_option_ids[0]

        removed_option_fields = writable_fields(rename_response.data["fields"])
        removed_option_fields[0]["config"]["options"] = removed_option_fields[0][
            "config"
        ]["options"][:1]
        data_loss_response = api_client.put(
            configuration_url,
            {
                "expected_updated_at": rename_response.data["requirement"][
                    "updated_at"
                ],
                "requirement": {},
                "fields": removed_option_fields,
            },
            format="json",
        )
        assert data_loss_response.status_code == status.HTTP_409_CONFLICT
        assert data_loss_response.data["code"] == "REQUIREMENT_SCHEMA_DATA_LOSS"
        assert data_loss_response.data["affected_detail_count"] == 1

        confirmed_remove_response = api_client.put(
            configuration_url,
            {
                "expected_updated_at": rename_response.data["requirement"][
                    "updated_at"
                ],
                "requirement": {},
                "fields": removed_option_fields,
                "confirm_data_loss": True,
            },
            format="json",
        )
        assert confirmed_remove_response.status_code == status.HTTP_200_OK
        detail_after_remove = api_client.get(details_url).data["results"][0]
        assert detail_after_remove["data"][selector_id] is None
        assert detail_after_remove["data"][form_id][0]["values"][child_id] == (
            child_option_ids
        )

        changed_mode_fields = writable_fields(confirmed_remove_response.data["fields"])
        changed_mode_fields[1]["children"][0]["config"]["selection_mode"] = "single"
        changed_mode_fields[1]["children"][0]["default_value"] = None
        mode_data_loss_response = api_client.put(
            configuration_url,
            {
                "expected_updated_at": confirmed_remove_response.data[
                    "requirement"
                ]["updated_at"],
                "requirement": {},
                "fields": changed_mode_fields,
            },
            format="json",
        )
        assert mode_data_loss_response.status_code == status.HTTP_409_CONFLICT
        confirmed_mode_response = api_client.put(
            configuration_url,
            {
                "expected_updated_at": confirmed_remove_response.data[
                    "requirement"
                ]["updated_at"],
                "requirement": {},
                "fields": changed_mode_fields,
                "confirm_data_loss": True,
            },
            format="json",
        )
        assert confirmed_mode_response.status_code == status.HTTP_200_OK
        detail_after_mode_change = api_client.get(details_url).data["results"][0]
        assert detail_after_mode_change["data"][form_id][0]["values"][child_id] is None
