from typing import Optional
from fastapi import APIRouter, Depends, status, Request, Form
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.user import UserCreate, UserLogin, UserOut, Token
from app.services.auth_service import register_user, authenticate_user
from app.core.security import create_access_token
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/register",
    response_model=Token,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account",
)
async def register(
    user_in: UserCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    Register a new user with email and password.
    Returns the created user and a signed JWT access token.
    """
    user = await register_user(db, user_in)
    access_token = create_access_token(subject=user.id, extra_claims={"email": user.email})
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=UserOut.model_validate(user),
    )


@router.post(
    "/login",
    response_model=Token,
    summary="Log in and retrieve JWT access token",
)
async def login(
    request: Request,
    db: AsyncSession = Depends(get_db),
    # Optional form fields for Swagger UI OAuth2 Authorize button
    username: Optional[str] = Form(None),
    password: Optional[str] = Form(None),
):
    """
    Authenticate with email/username and password.
    Supports both JSON body (for React frontend) and Form data (for Swagger UI /docs).
    """
    email_val = username
    password_val = password

    # If not form data, try parsing JSON body
    if not email_val or not password_val:
        try:
            body = await request.json()
            email_val = body.get("email") or body.get("username")
            password_val = body.get("password")
        except Exception:
            pass

    if not email_val or not password_val:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await authenticate_user(db, email=email_val, password=password_val)
    access_token = create_access_token(subject=user.id, extra_claims={"email": user.email})
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=UserOut.model_validate(user),
    )


@router.get(
    "/me",
    response_model=UserOut,
    summary="Get current authenticated user profile",
)
async def read_users_me(
    current_user: User = Depends(get_current_user),
):
    """
    Returns the authenticated user details.
    Requires Bearer JWT token in Authorization header.
    """
    return UserOut.model_validate(current_user)
