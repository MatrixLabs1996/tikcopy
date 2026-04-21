"""Execute uma vez para autenticar com o Google e gerar token.json."""
import os, sys
from pathlib import Path

SCOPES = [
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive.file",
]

creds_path = Path(__file__).parent / "credentials.json"
token_path = Path(__file__).parent / "token.json"

if not creds_path.exists():
    print("ERRO: credentials.json não encontrado nesta pasta.")
    print("Siga as instruções da sidebar do app para obtê-lo.")
    sys.exit(1)

from google_auth_oauthlib.flow import InstalledAppFlow
flow  = InstalledAppFlow.from_client_secrets_file(str(creds_path), SCOPES)
creds = flow.run_local_server(port=0)
token_path.write_text(creds.to_json())
print(f"OK — token.json criado em {token_path}")
