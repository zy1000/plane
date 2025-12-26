# Third party imports
from rest_framework import serializers

# Module imports
from plane.db.models import LdapConfig
from plane.license.utils.encryption import encrypt_data
from .base import BaseSerializer


class LdapConfigSerializer(BaseSerializer):
    class Meta:
        model = LdapConfig
        fields = [
            "id",
            "server_url",
            "bind_dn",
            "bind_password",
            "base_dn",
            "user_search_filter",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.bind_password:
            data["bind_password"] = "******"
        return data

    def create(self, validated_data):
        if "bind_password" in validated_data:
            validated_data["bind_password"] = encrypt_data(validated_data["bind_password"])
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if "bind_password" in validated_data:
            # If password is masked, don't update it
            if validated_data["bind_password"] == "******":
                validated_data.pop("bind_password")
            else:
                validated_data["bind_password"] = encrypt_data(validated_data["bind_password"])
        return super().update(instance, validated_data)
