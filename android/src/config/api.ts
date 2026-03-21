export { API_BASE_URL, pingApi, resolverUrlArquivoApi } from "./apiCore";
export {
  carregarBootstrapMobile,
  loginInspectorMobile,
  logoutInspectorMobile,
  obterUrlLoginSocialMobile,
  obterUrlRecuperacaoSenhaMobile,
} from "./authApi";
export {
  alterarSenhaContaMobile,
  atualizarPerfilContaMobile,
  carregarConfiguracoesCriticasContaMobile,
  enviarRelatoSuporteMobile,
  salvarConfiguracoesCriticasContaMobile,
  uploadFotoPerfilContaMobile,
} from "./settingsApi";
export {
  carregarLaudosMobile,
  carregarMensagensLaudo,
  carregarStatusLaudo,
  enviarMensagemChatMobile,
  reabrirLaudoMobile,
  uploadDocumentoChatMobile,
} from "./chatApi";
export {
  carregarMensagensMesaMobile,
  enviarAnexoMesaMobile,
  enviarMensagemMesaMobile,
} from "./mesaApi";
