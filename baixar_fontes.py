# baixar_fontes.py — versão corrigida
import urllib.request
from pathlib import Path

# URL via unpkg — pacote npm material-symbols, sempre atualizado
URL = "https://unpkg.com/material-symbols@latest/material-symbols-rounded.woff2"
DEST = Path("static/fonts/material-symbols-rounded.woff2")

DEST.parent.mkdir(parents=True, exist_ok=True)

print("Baixando Material Symbols Rounded via unpkg...")
req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(req) as resp, open(DEST, "wb") as f:
    f.write(resp.read())

print(f"Salvo em {DEST} ({DEST.stat().st_size:,} bytes)")
