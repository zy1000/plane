from rest_framework.response import Response
from rest_framework import status
from rest_framework.views import APIView
from django.utils import timezone
from datetime import datetime
from plane.db.models import *
from plane.utils.data_model import IssueTypeModel
from plane.utils.project.defaults import temporary_create_issue_type


class SimpleTestAPIView(APIView):
    """
    简单的测试API接口
    不需要认证，支持GET和POST请求
    """

    # 不需要认证
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        """
        GET请求 - 返回当前时间和简单信息
        """

        projects = Project.objects.all()
        for project in projects:
            temporary_create_issue_type(project)

        return Response('1', status=status.HTTP_200_OK)

    def post(self, request):
        """
        POST请求 - 接收数据并返回处理结果
        """
        received_data = request.data

        response_data = {
            "message": "数据接收成功",
            "timestamp": timezone.now().isoformat(),
            "method": "POST",
            "status": "success",
            "received_data": received_data,
            "processed_info": {
                "data_type": type(received_data).__name__,
                "data_size": len(str(received_data)),
                "processing_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
        }

        return Response(response_data, status=status.HTTP_201_CREATED)


class HealthCheckAPIView(APIView):
    """
    健康检查API接口
    """

    # 不需要认证
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        """
        健康检查接口
        """
        data = {
            "status": "healthy",
            "timestamp": timezone.now().isoformat(),
            "service": "Plane API",
            "version": "1.0.0",
            "uptime": "运行正常"
        }
        return Response(data, status=status.HTTP_200_OK)
