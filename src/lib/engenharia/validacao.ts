import type { DadosProjeto, ResponsavelTecnico } from "./tipos";
import { dadosVazios, rtVazio } from "./tipos";

/**
 * Saneamento do que chega pela API. Os textos são livres, mas com teto de
 * tamanho; a logo é a única coisa grande e tem limite próprio (uma data URL de
 * imagem, nada além disso).
 */

const LIMITE_LOGO = 600_000; // ~450 KB de imagem em base64
export const LIMITE_FERRAMENTA = 3_000_000; // bytes de JSON por ferramenta

const texto = (v: unknown, max = 300) => (typeof v === "string" ? v.slice(0, max) : "");

function logo(v: unknown): string {
  if (typeof v !== "string" || !v) return "";
  if (!/^data:image\/(png|jpe?g);base64,[A-Za-z0-9+/=]+$/.test(v)) return "";
  return v.length <= LIMITE_LOGO ? v : "";
}

export function sanearRt(v: unknown): ResponsavelTecnico {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const base = rtVazio();
  return {
    nome: texto(o.nome, 160),
    registro: texto(o.registro, 60),
    art: texto(o.art, 60),
    empresa: typeof o.empresa === "string" ? texto(o.empresa, 160) : base.empresa,
    cnpj: texto(o.cnpj, 30),
    telefone: texto(o.telefone, 40),
    email: texto(o.email, 160),
    logo: logo(o.logo),
  };
}

export function sanearDados(v: unknown): DadosProjeto {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const base = dadosVazios();
  const data = typeof o.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.data) ? o.data : base.data;
  return {
    nome: texto(o.nome, 200),
    cliente: texto(o.cliente, 200),
    documento: texto(o.documento, 30),
    endereco: texto(o.endereco, 300),
    cidade: texto(o.cidade, 120),
    data,
    descricao: texto(o.descricao, 2000),
    rt: sanearRt(o.rt),
  };
}

/** Objeto de ferramenta: precisa ser objeto (ou null) e caber no limite. */
export function ferramentaValida(v: unknown): v is object | null {
  if (v === null) return true;
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  try {
    return JSON.stringify(v).length <= LIMITE_FERRAMENTA;
  } catch {
    return false;
  }
}
