# TikTok Transcriber 🎵

Cole um link do TikTok, clique em Processar e receba o conteúdo transcrito e formatado em Hook + Corpo.

## Instalação

```bash
cd tiktok_transcriber
pip install -r requirements.txt
```

## Uso

```bash
streamlit run app.py
```

Acesse http://localhost:8501, cole o link e clique em **Processar**.

## Google Docs (opcional)

Se quiser salvar no Google Docs em vez de arquivo .txt:

1. Acesse https://console.cloud.google.com
2. Ative **Google Docs API** e **Google Drive API**
3. Crie credencial OAuth 2.0 (tipo: Desktop) → baixe como `credentials.json`
4. Execute uma vez:

```bash
python -c "
from google_auth_oauthlib.flow import InstalledAppFlow
scopes = ['https://www.googleapis.com/auth/documents','https://www.googleapis.com/auth/drive.file']
flow = InstalledAppFlow.from_client_secrets_file('credentials.json', scopes)
creds = flow.run_local_server(port=0)
open('token.json','w').write(creds.to_json())
print('OK')
"
```

Sem Google Docs configurado, o app salva automaticamente em arquivo `.txt` local.

## Variável de ambiente

```bash
# Windows PowerShell
$env:ANTHROPIC_API_KEY = "sua-chave"
```
