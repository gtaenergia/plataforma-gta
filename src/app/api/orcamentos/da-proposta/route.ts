import { NextResponse } from "next/server";
import { requirePermissaoApi } from "@/lib/rbac/guards";
import { temPermissao } from "@/lib/rbac/resolve";
import { getOrcamentoStore, redigirOrcamento } from "@/lib/orcamentos/store";
import { z } from "zod";
import { criarDaPropostaSchema, type FichaExterna, type OrcamentoMeta } from "@/lib/orcamentos/types";
import { getConfigMaoDeObra } from "@/lib/mao-de-obra/config";
import { calcularComposicaoTotal } from "@/lib/mao-de-obra/motor";
import { linhaMaoDeObraSchema } from "@/lib/mao-de-obra/types";
import { getPropostaStore } from "@/lib/propostas/store";
import { SERVICO_OUTRO, SERVICO_OUTRO_LABEL } from "@/lib/propostas/types";
import { getService } from "@/services/registry";
import { parseNumber } from "@/lib/format";

export const runtime = "nodejs";

/** Cria (ou reabre) um orçamento na esteira a partir de uma proposta gerada. */
export async function POST(req: Request) {
  const guard = await requirePermissaoApi("orcamentos.criar");
  if ("error" in guard) return guard.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const parsed = criarDaPropostaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }

  const proposta = await getPropostaStore().get(parsed.data.propostaId);
  if (!proposta) return NextResponse.json({ error: "Proposta não encontrada." }, { status: 404 });

  const store = getOrcamentoStore();

  // Evita duplicar: se já existe um orçamento para esta proposta, reabre-o.
  const existente = (await store.list()).find((o) => o.propostaId === proposta.id);
  if (existente) return NextResponse.json({ orcamento: redigirOrcamento(existente, await temPermissao(guard.me, "financeiro.ver")), reaberto: true });

  const service = getService(proposta.serviceKey);
  const src = (proposta.formGerado ?? proposta.dados) as Record<string, unknown>;

  // Regenerável = o MESMO `src` que o gerar-docx usa valida contra o schema do serviço.
  // Além disso, tenta o texto final da forma de pagamento via mapper (Condições de pagamento).
  let regeneravel = false;
  let formaPagamento = typeof src.formaPagamento === "string" ? src.formaPagamento : undefined;
  let valor: number | undefined;
  try {
    if (service) {
      const parsedSrc = service.zodSchema.safeParse(src);
      regeneravel = parsedSrc.success;
      if (parsedSrc.success) {
        const data = service.map(parsedSrc.data).data as Record<string, unknown>;
        const fp = data.formaPagamento;
        if (typeof fp === "string" && fp.trim()) formaPagamento = fp;
        // valorTotal vem formatado (ex.: "R$ 1.234,56"); parseNumber devolve o número.
        const vt = parseNumber(data.valorTotal);
        if (vt > 0) valor = vt;
      }
    }
  } catch {
    regeneravel = false;
  }

  // Proposta manual não tem mapper para extrair o preço: o valor foi digitado
  // no cadastro e mora em `dados`. Sem isto o orçamento chegaria à aprovação
  // sem preço nenhum — justamente o número que decide a aprovação.
  if (valor === undefined && proposta.manual && typeof src.valor === "number" && src.valor > 0) {
    valor = src.valor;
  }

  const meta: OrcamentoMeta = {
    dataEmissao: typeof src.dataEmissao === "string" ? src.dataEmissao : undefined,
    validadeDias: typeof src.validadeDias === "number" ? src.validadeDias : undefined,
    formaPagamento,
    regeneravel,
  };
  // `SERVICO_OUTRO` não está no registro de serviços, então o fallback pela
  // chave crua escreveria "outro" em minúscula na descrição.
  const nomeAvulso = typeof src.servicoOutro === "string" ? src.servicoOutro.trim() : "";
  const rotulo =
    service?.label ??
    (proposta.serviceKey === SERVICO_OUTRO ? nomeAvulso || SERVICO_OUTRO_LABEL : proposta.serviceKey);
  const descricao = proposta.referencia ? `${rotulo} — ${proposta.referencia}` : rotulo;

  /*
   * Serviço por hora: a composição de preço é RECALCULADA aqui e gravada na
   * ficha do orçamento.
   *
   * Recalcular, em vez de copiar o que o navegador mandou, tem duas razões. A
   * primeira é confiança: o preço que entra na esteira de aprovação não pode
   * vir de um corpo de requisição que qualquer um monta. A segunda é que a
   * ficha vira o registro histórico — se o catálogo mudar amanhã, o orçamento
   * de hoje continua mostrando com que números foi fechado.
   */
  let ficha: FichaExterna | undefined;
  if (proposta.serviceKey === "servico-hora") {
    const linhas = Array.isArray(src.linhas) ? src.linhas : [];
    const parsedLinhas = z.array(linhaMaoDeObraSchema).safeParse(linhas);
    if (parsedLinhas.success && parsedLinhas.data.length > 0) {
      const config = await getConfigMaoDeObra();
      const pct = (v: unknown, padrao: number) => {
        const n = Number(String(v ?? "").replace(",", "."));
        return Number.isFinite(n) && n > 0 ? n / 100 : padrao;
      };
      const imposto = pct(src.imposto, config.impostoPadrao);
      const margem = pct(src.margem, config.margemPadrao);
      const c = calcularComposicaoTotal(
        { terceirizada: parsedLinhas.data },
        { funcoes: config.funcoes, pessoas: {} },
        { imposto, margem },
      );
      if (!c.impedimento && c.precoCent > 0) {
        ficha = {
          custoBase: c.custoCent / 100,
          fator: c.markup,
          faturamento: c.precoCent / 100,
          impostosPct: imposto,
          margemLiquida: margem,
          // O detalhamento que o dono pede por atividade. O administrativo
          // nasce zero e é preenchido na tela do orçamento, onde o catálogo de
          // demandas informa as horas da equipe.
          custoTerceirizado: c.custoTerceirizadoCent / 100,
          custoAdministrativo: c.custoAdministrativoCent / 100,
        };
        // O preço da ficha manda: é o que a plataforma calculou a partir do
        // catálogo, não o que o formulário trouxe.
        valor = c.precoCent / 100;
      }
    }
  }

  const me = guard.me;
  const novo = await store.create({
    cliente: proposta.cliente || "—",
    fonte: "interno",
    estacao: "rascunho",
    serviceKey: proposta.serviceKey,
    propostaId: proposta.id,
    descricao,
    meta,
    valor,
    ficha,
    expiraEm: null,
    criadoPor: me.email,
    criadoPorNome: me.name || me.email,
  });
  return NextResponse.json({ orcamento: redigirOrcamento(novo, await temPermissao(guard.me, "financeiro.ver")) }, { status: 201 });
}
