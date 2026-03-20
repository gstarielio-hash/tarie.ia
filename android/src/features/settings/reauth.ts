export function reautenticacaoAindaValida(dataIso: string): boolean {
  if (!dataIso) {
    return false;
  }
  const data = new Date(dataIso);
  return !Number.isNaN(data.getTime()) && data.getTime() > Date.now();
}

export function formatarStatusReautenticacao(dataIso: string): string {
  if (!reautenticacaoAindaValida(dataIso)) {
    return "Não confirmada";
  }

  const data = new Date(dataIso);
  return `Confirmada até ${data.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}
