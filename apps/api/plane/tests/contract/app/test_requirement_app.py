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
    RequirementDetail,
    RequirementField,
    RequirementFieldType,
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
        source_detail = RequirementDetail.objects.create(
            requirement=template,
            data={"summary": "Template detail"},
            version=3,
        )
        self.authenticate(api_client, self.owner)

        failed_response = api_client.post(
            self.list_url,
            {
                "product_id": str(product.id),
                "template_id": str(template.id),
            },
            format="json",
        )
        assert failed_response.status_code == status.HTTP_400_BAD_REQUEST
        assert "required_count" in failed_response.data
        assert not Requirement.objects.filter(product=product).exists()

        success_response = api_client.post(
            self.list_url,
            {
                "product_id": str(product.id),
                "template_id": str(template.id),
                "title": "Imported copy",
                "approval_type": RequirementApprovalType.ANY,
            },
            format="json",
        )
        assert success_response.status_code == status.HTTP_201_CREATED
        assert success_response.data["title"] == "Imported copy"
        assert success_response.data["description_html"] == template.description_html
        assert success_response.data["status"] == RequirementStatus.DRAFT
        assert success_response.data["required_count"] is None
        assert [str(item) for item in success_response.data["approver_ids"]] == [
            str(eligible_approver.id)
        ]

        copied_requirement = Requirement.objects.get(id=success_response.data["id"])
        copied_fields = list(copied_requirement.fields.all())
        assert len(copied_fields) == 2
        copied_root = next(item for item in copied_fields if item.parent_field_id is None)
        copied_child = next(item for item in copied_fields if item.parent_field_id)
        assert copied_root.id != root_field.id
        assert copied_child.id != child_field.id
        assert copied_child.parent_field_id == copied_root.id
        assert copied_root.config == root_field.config

        copied_detail = copied_requirement.details.get()
        assert copied_detail.id != source_detail.id
        assert copied_detail.data == source_detail.data
        assert copied_detail.version == source_detail.version

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
