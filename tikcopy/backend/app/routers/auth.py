import os
from fastapi import APIRouter, HTTPException, Depends
from supabase import create_client

from app.models.schemas import RegisterRequest, LoginRequest, ProfileUpdate
from app.middleware.auth import get_current_user
from app.services.supabase_client import get_supabase

router = APIRouter()


@router.post("/register")
async def register(body: RegisterRequest):
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    try:
        res = sb.auth.sign_up({
            "email": body.email,
            "password": body.password,
            "options": {"data": {"name": body.name or ""}},
        })
        if res.user is None:
            raise HTTPException(status_code=400, detail="Falha ao criar conta")
        return {"user": {"id": res.user.id, "email": res.user.email}}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login")
async def login(body: LoginRequest):
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    try:
        res = sb.auth.sign_in_with_password({"email": body.email, "password": body.password})
        if not res.session:
            raise HTTPException(status_code=401, detail="Credenciais inválidas")
        return {
            "access_token": res.session.access_token,
            "refresh_token": res.session.refresh_token,
            "user": {
                "id": res.user.id,
                "email": res.user.email,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.get("/me")
async def get_me(current_user=Depends(get_current_user)):
    sb = get_supabase()
    profile = sb.table("profiles").select("*").eq("id", current_user.id).single().execute()
    return profile.data


@router.patch("/me")
async def update_me(body: ProfileUpdate, current_user=Depends(get_current_user)):
    sb = get_supabase()
    update_data = body.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")
    res = sb.table("profiles").update(update_data).eq("id", current_user.id).execute()
    return res.data[0] if res.data else {}
