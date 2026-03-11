import sqlite3
conn = sqlite3.connect("tariel_admin.db")
cur  = conn.cursor()
cols = [row[1] for row in cur.execute("PRAGMA table_info(empresas)")]
novas = {
    "status_bloqueio":  "INTEGER NOT NULL DEFAULT 0",
    "data_cadastro":    "TEXT",
    "segmento":         "TEXT",
    "cidade_estado":    "TEXT",
    "nome_responsavel": "TEXT",
    "observacoes":      "TEXT",
}
for col, tipo in novas.items():
    if col not in cols:
        cur.execute(f"ALTER TABLE empresas ADD COLUMN {col} {tipo}")
        print(f"Coluna {col} adicionada.")
conn.commit()
conn.close()
print("Migracao concluida.")