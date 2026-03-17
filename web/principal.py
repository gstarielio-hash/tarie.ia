import sys
import os
from PySide6.QtWidgets import QApplication
from interface.janela_principal import JanelaPrincipal


def principal():
    # Inicializa a aplicação base para o sistema de inspeções Tariel.ia
    aplicacao = QApplication(sys.argv)

    # Define o estilo 'Fusion' para garantir consistência visual em ambientes industriais (Windows/Linux)
    aplicacao.setStyle('Fusion')

    # --- CARREGAMENTO DE ESTILO (QSS) ---
    # Busca o caminho do arquivo de folhas de estilo na pasta de interface
    diretorio_base = os.path.dirname(os.path.abspath(__file__))
    caminho_estilo = os.path.join(diretorio_base, "interface", "estilo.qss")

    if os.path.exists(caminho_estilo):
        with open(caminho_estilo, "r", encoding="utf-8") as arquivo_estilo:
            aplicacao.setStyleSheet(arquivo_estilo.read())
    else:
        # Alerta de sistema caso o arquivo mude de nome ou pasta, facilitando a manutenção técnica
        print(f"⚠️ Alerta de Sistema: Arquivo de estilo não encontrado no caminho: {caminho_estilo}")

    # --- INICIALIZAÇÃO DO SISTEMA TARIEL.IA ---
    # Instancia a JanelaPrincipal (que agora gerencia o SQLite e a interface de ART/Laudos)
    janela_sistema = JanelaPrincipal()

    # Abre o programa em tela cheia para passar mais autoridade durante auditorias e uso em campo
    janela_sistema.showMaximized()

    # Inicia o laço de eventos contínuos do sistema
    sys.exit(aplicacao.exec())


if __name__ == "__main__":
    principal()
