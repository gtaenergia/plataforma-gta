/**
 * Projeto de engenharia: uma obra, com os dados que alimentam o cabeçalho das
 * ferramentas e os laudos, mais o estado de cada ferramenta.
 */

import type { DadosRisco } from "./risco/tipos";
import type { DadosQuadro } from "./quadro/tipos";

export interface ResponsavelTecnico {
  nome: string;
  registro: string;
  art: string;
  empresa: string;
  cnpj: string;
  telefone: string;
  email: string;
  /** Logo própria em data URL (PNG/JPEG). Vazio = logo da GTA. */
  logo: string;
}

export interface DadosProjeto {
  nome: string;
  cliente: string;
  documento: string;
  endereco: string;
  cidade: string;
  /** yyyy-mm-dd */
  data: string;
  descricao: string;
  rt: ResponsavelTecnico;
}

export interface ProjetoEng {
  id: string;
  dados: DadosProjeto;
  risco: DadosRisco | null;
  quadro: DadosQuadro | null;
  criadoPor: string;
  criadoEm: string;
  atualizadoEm: string;
}

/** Linha da lista (sem o conteúdo das ferramentas). */
export interface ResumoProjeto {
  id: string;
  nome: string;
  cliente: string;
  cidade: string;
  data: string;
  temRisco: boolean;
  temQuadro: boolean;
  criadoPor: string;
  atualizadoEm: string;
}

export function rtVazio(): ResponsavelTecnico {
  return { nome: "", registro: "", art: "", empresa: "GTA Energia", cnpj: "", telefone: "", email: "", logo: "" };
}

export function dadosVazios(rt?: ResponsavelTecnico): DadosProjeto {
  return {
    nome: "",
    cliente: "",
    documento: "",
    endereco: "",
    cidade: "",
    data: new Date().toISOString().slice(0, 10),
    descricao: "",
    rt: rt ? { ...rt } : rtVazio(),
  };
}

export function resumir(p: ProjetoEng): ResumoProjeto {
  return {
    id: p.id,
    nome: p.dados.nome,
    cliente: p.dados.cliente,
    cidade: p.dados.cidade,
    data: p.dados.data,
    temRisco: p.risco != null,
    temQuadro: p.quadro != null,
    criadoPor: p.criadoPor,
    atualizadoEm: p.atualizadoEm,
  };
}
