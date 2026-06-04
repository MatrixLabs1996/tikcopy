from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel


# ── Auth ──────────────────────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    email: str
    password: str
    name: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    plan: Optional[str] = None


# ── Projects ──────────────────────────────────────────────────────────────────
class ProjectCreate(BaseModel):
    name: str
    nicho: Optional[str] = None
    niche_id: Optional[str] = None   # nicho ao qual esta oferta pertence
    avatar: Optional[str] = None
    tone: Optional[str] = None
    platform: Optional[str] = None
    instructions: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    nicho: Optional[str] = None
    niche_id: Optional[str] = None
    avatar: Optional[str] = None
    tone: Optional[str] = None
    platform: Optional[str] = None
    instructions: Optional[str] = None


# ── Transcription ─────────────────────────────────────────────────────────────
class TranscribeUrlRequest(BaseModel):
    url: str
    project_id: Optional[str] = None
    niche: Optional[str] = None
    translate: Optional[bool] = False


class ProfileAnalysisRequest(BaseModel):
    url: str
    top_n: int = 5
    niche: Optional[str] = None
    theme: Optional[str] = None          # filtro de tema dentro do canal (opcional)
    rank_by: Optional[str] = "views"     # 'views' (absoluto) | 'relevance' (em alta)
    video_type: Optional[str] = "both"   # 'both' | 'long' | 'shorts'
    translate: Optional[bool] = False
    include_comments: Optional[bool] = True


# ── Ads ───────────────────────────────────────────────────────────────────────
class AdAnalysisResponse(BaseModel):
    id: str
    title: str
    duration: str
    avatar: dict
    video_format: str
    editing: dict
    hook_visual: str
    hook_written: str
    landing_phrase: str
    body: str
    created_at: datetime


# ── Copy Zone ─────────────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str
    active_context: Optional[dict] = None


class SwipeCreate(BaseModel):
    content: str
    tag: Optional[str] = None
    source: Optional[str] = None
    project_id: Optional[str] = None


# ── Templates ─────────────────────────────────────────────────────────────────
class TemplateField(BaseModel):
    name: str
    label: str
    placeholder: Optional[str] = None
    type: str = "textarea"


class TemplateCreate(BaseModel):
    name: str
    niche: Optional[str] = None
    is_public: bool = False
    fields: list[TemplateField]


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    niche: Optional[str] = None
    is_public: Optional[bool] = None
    fields: Optional[list[TemplateField]] = None


# ── Drafts ────────────────────────────────────────────────────────────────────
class DraftCreate(BaseModel):
    title: Optional[str] = None
    template_id: Optional[str] = None
    project_id: Optional[str] = None
    briefing_id: Optional[str] = None
    research_id: Optional[str] = None
    fields_data: Optional[dict] = None
    visual_refs: Optional[list[str]] = None
    dont_do: Optional[str] = None
    editor_notes: Optional[str] = None


class DraftUpdate(BaseModel):
    title: Optional[str] = None
    fields_data: Optional[dict] = None
    visual_refs: Optional[list[str]] = None
    dont_do: Optional[str] = None
    editor_notes: Optional[str] = None


class SuggestFieldRequest(BaseModel):
    field_name: str
    field_label: str
    context: Optional[dict] = None


# ── Briefings (template estruturado da oferta) ───────────────────────────────
# Os campos seguem o template completo do método Amanda Khayat.
class BriefingCreate(BaseModel):
    title: str
    project_id: Optional[str] = None
    market: Optional[str] = None
    chiclete_name: Optional[str] = None
    problem_mechanism: Optional[str] = None
    solution_mechanism: Optional[str] = None
    vsl_avatar: Optional[str] = None
    vsl_format: Optional[str] = None
    vsl_bullets: Optional[list] = None
    vsl_story: Optional[str] = None
    cta_destination: Optional[str] = None
    validated_angles: Optional[list] = None
    validated_formats: Optional[list] = None
    validated_avatars: Optional[list] = None
    chiclete_names_market: Optional[list] = None
    rejected_solutions: Optional[list] = None
    main_pains: Optional[list] = None
    main_desires: Optional[list] = None
    slang: Optional[list] = None
    common_enemy: Optional[list] = None
    cultural_refs: Optional[Any] = None       # pode ser list ou string (texto longo)
    organic_hooks: Optional[list] = None
    organic_structures: Optional[Any] = None  # pode ser list ou texto
    template_data: Optional[dict] = None      # campos extras do template completo


class BriefingUpdate(BaseModel):
    title: Optional[str] = None
    market: Optional[str] = None
    chiclete_name: Optional[str] = None
    problem_mechanism: Optional[str] = None
    solution_mechanism: Optional[str] = None
    vsl_avatar: Optional[str] = None
    vsl_format: Optional[str] = None
    vsl_bullets: Optional[list] = None
    vsl_story: Optional[str] = None
    validated_angles: Optional[list] = None
    validated_formats: Optional[list] = None
    validated_avatars: Optional[list] = None
    chiclete_names_market: Optional[list] = None
    rejected_solutions: Optional[list] = None
    main_pains: Optional[list] = None
    main_desires: Optional[list] = None
    slang: Optional[list] = None
    common_enemy: Optional[list] = None
    cultural_refs: Optional[Any] = None
    organic_hooks: Optional[list] = None
    organic_structures: Optional[Any] = None
    template_data: Optional[dict] = None


# ── Públicos (fatias de público por nicho) ───────────────────────────────────
class PublicoCreate(BaseModel):
    nicho: str
    nome: str


class PublicoUpdate(BaseModel):
    nome: Optional[str] = None


# ── Research Docs (biblioteca livre por nicho + público) ─────────────────────
class ResearchDocCreate(BaseModel):
    nicho: str
    publico_id: Optional[str] = None
    title: str
    type: str  # 'upload' | 'text' | 'link'
    content: Optional[str] = None
    source_url: Optional[str] = None
    source_platform: Optional[str] = None
    source_metadata: Optional[dict] = None
    imported_via: Optional[str] = "web"


class ResearchDocUpdate(BaseModel):
    title: Optional[str] = None
    publico_id: Optional[str] = None
    content: Optional[str] = None
    source_url: Optional[str] = None
    source_platform: Optional[str] = None
    source_metadata: Optional[dict] = None
