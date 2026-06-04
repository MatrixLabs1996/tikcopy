# Guia de Deploy do CopyX (Beta)

Stack: **Backend → Railway** (container com ffmpeg) · **Frontend → Vercel** · **Banco → Supabase** (já existe).

Pré-requisito: o código precisa estar no GitHub (`MatrixLabs1996/tikcopy`) com os últimos commits.

---

## PASSO 0 — Subir o código pro GitHub

No terminal, dentro da pasta do projeto:
```
git add .
git commit -m "deploy: config Railway + Vercel + medidor de uso"
git push
```
(Se estiver numa branch `claude/...`, faça merge na `main` antes, ou aponte os deploys pra essa branch.)

---

## PASSO 1 — Backend no Railway

1. Vá em **railway.app** → entre com GitHub → **New Project** → **Deploy from GitHub repo** → escolha `tikcopy`.
2. Railway vai detectar a pasta. **IMPORTANTE:** em Settings → defina o **Root Directory** = `tikcopy/backend` (porque o backend não está na raiz).
3. O `nixpacks.toml` que já está no projeto cuida do ffmpeg e do start. Não precisa configurar comando.
4. Vá em **Variables** e adicione TODAS as chaves do seu `.env` local (copie de `tikcopy/backend/.env`):
   ```
   SUPABASE_URL=...
   SUPABASE_SERVICE_KEY=...
   ANTHROPIC_API_KEY=...
   ASSEMBLYAI_KEY=...
   GEMINI_API_KEY=...
   YOUTUBE_API_KEY=...
   R2_ACCOUNT_ID=...
   R2_ACCESS_KEY_ID=...
   R2_SECRET_ACCESS_KEY=...
   R2_BUCKET=tikcopy-videos
   ADMIN_EMAILS=matrixlabsdigital@gmail.com
   ```
   (Adicione também `CORS_ORIGINS` depois que tiver a URL do Vercel — ver Passo 3.)
5. Deploy. Quando subir, Railway te dá uma URL tipo `https://tikcopy-production.up.railway.app`.
   **Anote essa URL** — é a API.
6. Teste: abra `https://SUA-URL.railway.app/videos/health` no navegador. Deve responder JSON.

---

## PASSO 2 — Rodar o SQL do medidor no Supabase

Antes de testar o painel admin, crie a tabela de uso. No Supabase → **SQL Editor** → cole e rode:

```sql
create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  operation text not null,
  provider text default 'anthropic',
  model text default '',
  input_tokens int default 0,
  output_tokens int default 0,
  cache_read_tokens int default 0,
  cache_write_tokens int default 0,
  units numeric default 0,
  cost_usd numeric default 0,
  project_id uuid,
  meta jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_usage_user on public.usage_events(user_id);
create index if not exists idx_usage_created on public.usage_events(created_at desc);
alter table public.usage_events enable row level security;
```

---

## PASSO 3 — Frontend no Vercel

1. Vá em **vercel.com** → entre com GitHub → **Add New Project** → importe `tikcopy`.
2. Em **Root Directory**, defina = `tikcopy/frontend`.
3. Framework: Vercel detecta **Vite** automaticamente. Build command e output já estão no `vercel.json`.
4. Em **Environment Variables**, adicione:
   ```
   VITE_API_URL=https://SUA-URL.railway.app      (a URL do Passo 1, SEM barra no final)
   VITE_SUPABASE_URL=https://uesmqaomnittxsxeiahe.supabase.co
   VITE_SUPABASE_ANON_KEY=...                      (a chave ANON do Supabase, NÃO a service key)
   ```
   > A `VITE_SUPABASE_ANON_KEY` está no Supabase → Settings → API → "anon public". É segura de expor (é pública).
5. Deploy. Vercel te dá uma URL tipo `https://tikcopy.vercel.app`.
6. **Volte no Railway** → Variables → adicione:
   ```
   CORS_ORIGINS=https://tikcopy.vercel.app
   ```
   (libera o frontend a chamar a API). O regex já libera qualquer `*.vercel.app`, mas é bom fixar a sua.

---

## PASSO 4 — Testar de ponta a ponta

1. Abra `https://tikcopy.vercel.app`.
2. Crie uma conta (ou logue com a sua).
3. Teste: criar projeto → gerar copy → ver "Custo & Uso (admin)" na lateral (só pro seu email).
4. Se der erro de CORS no console do navegador, confira o `CORS_ORIGINS` no Railway.

---

## Notas

- **Custo:** Railway dá ~US$5 de crédito grátis/mês; Vercel é grátis pro seu volume. Supabase free tier serve pro beta.
- **Vídeos no R2:** continuam funcionando — as chaves R2 estão nas variáveis do Railway.
- **Atualizações futuras:** todo `git push` na branch conectada redeploya sozinho (Railway e Vercel observam o GitHub).
- **Modo demo no login:** considere remover o botão "Entrar em modo demo" do `LoginPage.jsx` antes de mandar pros betas (ele entra sem Supabase e os dados não salvam direito).
