jest.mock("./observability", () => ({
  registrarEventoObservabilidade: jest.fn(),
}));

import {
  loginInspectorMobile,
  obterUrlLoginSocialMobile,
  obterUrlRecuperacaoSenhaMobile,
} from "./authApi";

function criarResposta(
  body: string,
  init?: { status?: number; contentType?: string },
) {
  const status = init?.status ?? 200;
  const headers = new Headers();
  headers.set("content-type", init?.contentType ?? "application/json");
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    text: async () => body,
  } as Response;
}

describe("authApi", () => {
  const fetchMock = jest.fn();
  const envOriginal = { ...process.env };

  beforeEach(() => {
    fetchMock.mockReset();
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fetchMock,
    });
    process.env = { ...envOriginal };
    delete process.env.EXPO_PUBLIC_AUTH_FORGOT_PASSWORD_URL;
    delete process.env.EXPO_PUBLIC_AUTH_GOOGLE_URL;
    delete process.env.EXPO_PUBLIC_AUTH_MICROSOFT_URL;
    delete process.env.EXPO_PUBLIC_AUTH_WEB_BASE_URL;
  });

  afterAll(() => {
    process.env = envOriginal;
  });

  it("monta a URL de recuperação com email opcional", () => {
    expect(obterUrlRecuperacaoSenhaMobile()).toBe(
      "https://tarie-ia.onrender.com/app/login",
    );
    expect(obterUrlRecuperacaoSenhaMobile("inspetor@tariel.dev")).toBe(
      "https://tarie-ia.onrender.com/app/login?email=inspetor%40tariel.dev",
    );
  });

  it("monta URLs de login social com fallbacks públicos corretos", () => {
    expect(obterUrlLoginSocialMobile("Google")).toBe(
      "https://tarie-ia.onrender.com/app/login?provider=google",
    );
    expect(obterUrlLoginSocialMobile("Microsoft")).toBe(
      "https://tarie-ia.onrender.com/app/login?provider=microsoft",
    );
  });

  it("retorna login válido quando a API responde com access_token", async () => {
    fetchMock.mockResolvedValue(
      criarResposta(
        JSON.stringify({
          access_token: "token-123",
          token_type: "bearer",
          usuario: { email: "inspetor@tariel.dev" },
        }),
      ),
    );

    await expect(
      loginInspectorMobile("inspetor@tariel.dev", "segredo", true),
    ).resolves.toMatchObject({
      access_token: "token-123",
    });
  });

  it("propaga erro legível quando o login falha", async () => {
    fetchMock.mockResolvedValue(
      criarResposta(JSON.stringify({ detail: "Credenciais inválidas" }), {
        status: 401,
      }),
    );

    await expect(
      loginInspectorMobile("inspetor@tariel.dev", "errada", false),
    ).rejects.toThrow("Credenciais inválidas");
  });
});
