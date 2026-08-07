import fs from "node:fs";
import path from "node:path";
import { createPool, type VercelPool } from "@vercel/postgres";
import { getDbUrl } from "../tasks/postgres-store";
import { notificar } from "./store";
import { users } from "../users/store";

/**
 * Anúncio de novidade da plataforma: cada feature entregue ganha uma entrada
 * aqui, e `processarNovidades()` a envia (uma única vez, para todos os
 * usuários ativos) na primeira chamada após o deploy. `slug` é o identificador
 * estável que evita reenvio — nunca reutilize um slug já publicado.
 */
export interface Novidade {
  slug: string;
  titulo: string;
  mensagem: string;
  link: string;
}

export const NOVIDADES: Novidade[] = [
  {
    slug: "crm-funil-negociacoes-2026-08",
    titulo: "CRM: funil, negociações, contatos e configurações no ar",
    mensagem:
      "O CRM deixou de ser esqueleto: crie negociações e acompanhe-as no quadro do funil (arraste entre etapas), registre contatos, vincule produtos e mantenha o histórico de cada negociação — toda perda pede motivo. Em Configurações, monte seus funis, fontes, motivos de perda e o catálogo de produtos.",
    link: "/crm/funil",
  },
  {
    slug: "crm-dois-em-um-2026-08",
    titulo: "A plataforma agora tem duas ferramentas",
    mensagem:
      "O que você já usava passa a se chamar Operações — propostas, aprovações, tarefas e apontamentos, sem nenhuma mudança. Ao lado dele nasce o CRM, com funil de vendas, negociações, contatos e empresas. Troque de ferramenta pelo seletor ao lado do logo. O cadastro de Clientes virou Empresas e agora fica no CRM.",
    link: "/crm",
  },
  {
    slug: "proposta-registrada-2026-08",
    titulo: "Novidade: registrar proposta feita fora da plataforma",
    mensagem:
      "A proposta específica demais para caber num configurador agora entra no histórico: escolha o serviço, informe cliente e valor e, se quiser, anexe o PDF para mandar à aprovação. Em Propostas, no botão “Registrar proposta pronta”.",
    link: "/propostas/registrar",
  },
  {
    slug: "calendario-tarefas-2026-08",
    titulo: "Novidade: calendário de prazos",
    mensagem: "Veja os prazos das suas tarefas distribuídos no mês, com prioridade e situação, e alterne para a visão da equipe. Fica em Calendário, no menu do perfil.",
    link: "/calendario",
  },
  {
    slug: "capacidade-equipe-2026-08",
    titulo: "Tarefas: indicação de responsável e prazo calculado",
    mensagem: "Ao abrir uma tarefa, escolha a categoria e o tipo de demanda: a plataforma traz a duração média, indica os responsáveis com disponibilidade e calcula a data de entrega de cada um. Um clique preenche responsável e prazo operacional. O catálogo de demandas e a jornada de trabalho são cadastrados por um administrador em Planejamento e capacidade.",
    link: "/tarefas",
  },
  {
    slug: "precos-materiais-2026-08",
    titulo: "Preços de materiais em um lugar só",
    mensagem: "Novo card em Nova proposta: revise o custo unitário dos materiais à mão ou por planilha (baixa preenchida, você atualiza e importa). Ao montar um orçamento, a plataforma avisa se algum material DAQUELA lista está com preço vencido.",
    link: "/precos",
  },
  {
    slug: "carregador-nbr5410-2026-08",
    titulo: "Carregador: dimensionamento corrigido pela NBR 5410",
    mensagem: "O disjuntor passa a cobrir a corrente de projeto (era menor que ela em todos os casos), a queda trifásica usa a fórmula certa, e a lista de materiais escala com o número de pontos. Orçamentos de carregador mudam de valor.",
    link: "/nova/carregador",
  },
  {
    slug: "solar-fio-b-lei-14300-2026-08",
    titulo: "Solar: payback segue a rampa da Lei 14.300",
    mensagem: "O percentual do Fio B agora acompanha o ano-calendário da lei (60% em 2026, 75% em 2027, 90% em 2028) em vez de um valor fixo. Muda o payback de sistemas com muita injeção — monofásicos e superdimensionados.",
    link: "/nova/solar",
  },
  {
    slug: "solar-cabe-no-telhado-2026-08",
    titulo: "Solar: quantos painéis cabem no telhado",
    mensagem: "Informe as medidas da água e o configurador diz quantos módulos cabem, compara com o que o consumo pede e gera um PNG com o desenho e as cotas para anexar à proposta.",
    link: "/nova/solar",
  },
  {
    slug: "solar-avisos-tecnicos-2026-08",
    titulo: "Solar: avisos técnicos no dimensionamento",
    mensagem: "O configurador agora avisa quando o sistema passa de microgeração, quando a potência não combina com o tipo de ligação e quando o consumo não justifica o investimento — antes de a proposta sair.",
    link: "/nova/solar",
  },
  {
    slug: "admin-armazenamento-2026-08",
    titulo: "Novidade: painel de armazenamento",
    mensagem: "Administradores agora veem quanto o banco e os arquivos estão ocupando — e qual tabela ou pasta está puxando o espaço. Fica no menu do perfil, em Armazenamento.",
    link: "/admin/armazenamento",
  },
  {
    slug: "design-consistente-2026-08",
    titulo: "Plataforma com visual mais uniforme",
    mensagem: "Avisos, erros, títulos e tabelas agora seguem o mesmo padrão em todas as telas — e os textos secundários ficaram mais legíveis, principalmente no tema claro.",
    link: "/",
  },
  {
    slug: "apontamentos-virada-meia-noite-2026-08",
    titulo: "Corrigido: apontamento que vira a meia-noite",
    mensagem: "Plantão das 23h à 1h agora pode ser lançado normalmente — o sistema entende que o fim é no dia seguinte e avisa a duração antes de salvar.",
    link: "/apontamentos",
  },
  {
    // Texto atualizado após a aba ser renomeada de "Tracker" para
    // "Apontamentos". O slug NÃO muda: onde a notificação já saiu, ela não
    // reenvia; onde ainda não saiu, sai já com o nome certo.
    slug: "tracker-2026-08",
    titulo: "Novidade: Apontamentos (registro de horas)",
    mensagem: "Cronômetro ou lançamento manual, vinculado a uma tarefa ou avulso. Nova aba \"Apontamentos\" no menu.",
    link: "/apontamentos",
  },
  {
    slug: "foto-perfil-2026-07",
    titulo: "Novidade: foto de perfil",
    mensagem: "Agora você pode adicionar (ou trocar) sua foto de perfil em Minha conta.",
    link: "/conta",
  },
  {
    slug: "tarefas-filtro-atraso-2026-07",
    titulo: "Novidade: filtro Em atraso nas Tarefas",
    mensagem: "Agora dá pra filtrar as tarefas com prazo vencido direto no dropdown de status.",
    link: "/tarefas",
  },
  {
    slug: "tarefas-clique-linha-2026-07",
    titulo: "Novidade: abrir a tarefa clicando na linha",
    mensagem: "Não precisa mais acertar o nome da tarefa — clique em qualquer ponto da linha para expandir.",
    link: "/tarefas",
  },
  {
    slug: "solar-microinversor-2026-07",
    titulo: "Novidade: Solar agora monta sistema com microinversor",
    mensagem: "Escolha o microinversor (W × módulos) e o configurador calcula a quantidade, a potência CA total, os ramais e a lista de materiais.",
    link: "/nova/solar",
  },
  {
    slug: "solar-lista-materiais-kits-2026-07",
    titulo: "Novidade: lista de materiais do Solar mais enxuta",
    mensagem: "Os itens miúdos viraram kits (fixação, cabeamento, proteção, aterramento, acabamento) — bem menos linhas para ajustar antes de cotar.",
    link: "/nova/solar",
  },
  {
    slug: "lista-materiais-nao-reseta-2026-07",
    titulo: "Corrigido: a lista de materiais não apaga mais o que você escreve",
    mensagem: "Depois de editar a lista, mexer em qualquer campo apagava suas alterações. Agora a lista editada é preservada — e avisa se o dimensionamento mudou depois.",
    link: "/nova/solar",
  },
  {
    slug: "aprovacoes-reabrir-2026-07",
    titulo: "Novidade: dá para desfazer uma aprovação",
    mensagem: "Aprovou ou cancelou por engano? O botão \"Reabrir para revisão\" devolve o orçamento, com o motivo registrado no histórico.",
    link: "/aprovacoes",
  },
  {
    slug: "solar-micro-livre-2026-07",
    titulo: "Novidade: microinversor com entrada livre",
    mensagem: "Agora dá para digitar a potência do microinversor (opção \"Outra...\") e fixar a quantidade à mão — o cálculo vira sugestão, não trava.",
    link: "/nova/solar",
  },
  {
    slug: "mobile-area-de-toque-2026-07",
    titulo: "Novidade: plataforma mais confortável no celular",
    mensagem: "Botões, filtros e seletores ganharam área de toque maior no celular — menos toque errado. No computador nada mudou.",
    link: "/",
  },
  {
    slug: "login-continuar-conectado-2026-07",
    titulo: "Novidade: continuar conectado",
    mensagem: "A plataforma agora mantém você logado por até 30 dias. Em computador compartilhado, desmarque \"Continuar conectado\" ao entrar.",
    link: "/conta",
  },
  {
    slug: "solar-micro-kw-telhados-2026-07",
    titulo: "Novidade: microinversor em kW e novas estruturas",
    mensagem: "O microinversor agora é escolhido em kW (3 a 25) e a sugestão já mostra quantas unidades. Estruturas de fixação atualizadas (shingle, telha, colonial, laje, solo e mais).",
    link: "/nova/solar",
  },
  /*
   * Este é o único anúncio da lista que muda o que o CLIENTE paga. Vai
   * primeiro e sozinho no assunto, porque descobrir uma mudança de preço por
   * um orçamento mais caro é a pior forma de descobrir.
   */
  {
    slug: "equipe-responsavel-preco-2026-08",
    titulo: "Atenção: as horas da GTA passam a entrar em quatro orçamentos",
    mensagem:
      "Ao gerar uma proposta de carregador, QGBT, rede de média tensão ou execução de subestação, apontar quem executa e quem elaborou faz o preço SUBIR — as horas entram no custo antes do Fator K. Nos outros oito serviços o preço não muda: as horas só aparecem no detalhamento e na margem. O acréscimo é zero enquanto o custo por hora de cada pessoa não estiver cadastrado em Planejamento e capacidade.",
    link: "/",
  },
  {
    slug: "detalhamento-preco-proposta-2026-08",
    titulo: "Novidade: o preço da proposta, destrinchado",
    mensagem:
      "Ao montar uma proposta você vê a conta inteira aberta: faturamento da GTA separado do que é repasse (o kit solar, o equipamento), cada parcela de custo com nome, imposto, lucro e margem. Serve para decidir se o trabalho vale a pena antes de mandar — nada disso vai para o documento do cliente. Visível para quem tem permissão financeira.",
    link: "/",
  },
];

interface NovidadeStore {
  /** Tenta reservar o slug; true = ninguém enviou ainda (e agora é sua vez). */
  reservar(slug: string): Promise<boolean>;
}

class JsonNovidadeStore implements NovidadeStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file: string) {}

  private readAll(): string[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      return [];
    }
  }
  private writeAll(slugs: string[]): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(slugs, null, 2), "utf8");
    fs.renameSync(tmp, this.file);
  }
  reservar(slug: string): Promise<boolean> {
    const run = this.queue.then(() => {
      const atuais = this.readAll();
      if (atuais.includes(slug)) return false;
      this.writeAll([...atuais, slug]);
      return true;
    });
    this.queue = run.catch(() => false);
    return run;
  }
}

class PostgresNovidadeStore implements NovidadeStore {
  private pool: VercelPool;
  private ready: Promise<void> | null = null;
  constructor() {
    this.pool = createPool({ connectionString: getDbUrl() });
  }
  private ensureSchema(): Promise<void> {
    if (!this.ready) {
      this.ready = this.pool.sql`
        CREATE TABLE IF NOT EXISTS novidades_enviadas (
          slug text PRIMARY KEY,
          enviado_em timestamptz NOT NULL
        )
      `
        .then(() => undefined)
        .catch((e) => {
          this.ready = null;
          throw e;
        });
    }
    return this.ready;
  }
  async reservar(slug: string): Promise<boolean> {
    await this.ensureSchema();
    // ON CONFLICT DO NOTHING: se duas requisições concorrentes chegarem aqui,
    // só uma ganha a linha (e portanto só uma dispara o broadcast).
    const { rowCount } = await this.pool.sql`
      INSERT INTO novidades_enviadas (slug, enviado_em) VALUES (${slug}, ${new Date().toISOString()})
      ON CONFLICT (slug) DO NOTHING
    `;
    return (rowCount ?? 0) > 0;
  }
}

const g = globalThis as unknown as { __gtaNovidadeStore?: NovidadeStore };

function getNovidadeStore(): NovidadeStore {
  if (!g.__gtaNovidadeStore) {
    g.__gtaNovidadeStore = getDbUrl()
      ? new PostgresNovidadeStore()
      : new JsonNovidadeStore(path.join(process.cwd(), "data", "novidades-enviadas.json"));
  }
  return g.__gtaNovidadeStore;
}

/**
 * Envia as novidades ainda não publicadas para todos os usuários ativos.
 * Best-effort e idempotente — seguro de chamar a cada requisição.
 */
export async function processarNovidades(): Promise<void> {
  try {
    const store = getNovidadeStore();
    for (const novidade of NOVIDADES) {
      const minhaVez = await store.reservar(novidade.slug);
      if (!minhaVez) continue;
      const ativos = (await (await users()).list()).filter((u) => u.active);
      await Promise.all(
        ativos.map((u) =>
          notificar({ paraEmail: u.email, tipo: "novidade", titulo: novidade.titulo, mensagem: novidade.mensagem, link: novidade.link })
        )
      );
    }
  } catch (e) {
    console.error("Novidades: falha ao processar —", e);
  }
}
