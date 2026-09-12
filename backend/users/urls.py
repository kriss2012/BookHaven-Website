from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from . import views

urlpatterns = [
    path('register/', views.RegisterView.as_view(), name='auth-register'),
    path('login/', views.LoginView.as_view(), name='auth-login'),
    path('logout/', views.LogoutView.as_view(), name='auth-logout'),
    path('me/', views.ProfileView.as_view(), name='auth-profile'),
    path('google/', views.GoogleAuthView.as_view(), name='auth-google'),
    path('clerk-sync/', views.ClerkSyncView.as_view(), name='auth-clerk-sync'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
]
