# Third party imports
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

# Module imports
from plane.api.serializers.ldap import LdapConfigSerializer
from plane.app.views import BaseAPIView
from plane.db.models import LdapConfig
from plane.license.api.permissions.instance import InstanceAdminPermission
from plane.authentication.utils.ldap import ldap_test_connection
from plane.license.utils.encryption import decrypt_data


class LdapConfigEndpoint(BaseAPIView):
    permission_classes = [InstanceAdminPermission]

    def get(self, request):
        config = LdapConfig.objects.first()
        if not config:
            return Response({}, status=status.HTTP_200_OK)
        
        serializer = LdapConfigSerializer(config)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        config = LdapConfig.objects.first()
        if config:
            serializer = LdapConfigSerializer(config, data=request.data, partial=True)
        else:
            serializer = LdapConfigSerializer(data=request.data)

        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LdapTestConnectionEndpoint(BaseAPIView):
    permission_classes = [InstanceAdminPermission]

    def post(self, request):
        server_url = request.data.get("server_url")
        bind_dn = request.data.get("bind_dn")
        bind_password = request.data.get("bind_password")
        
        # If testing saved config (password might be masked)
        if bind_password == "******":
            config = LdapConfig.objects.first()
            if config:
                bind_password = decrypt_data(config.bind_password)

        try:
            ldap_test_connection(
                ldap_url=server_url,
                bind_dn=bind_dn,
                bind_password=bind_password,
            )
            return Response({"status": "success"}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {"status": "error", "message": str(e)}, 
                status=status.HTTP_400_BAD_REQUEST
            )
