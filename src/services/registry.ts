import type { ServiceModule } from "./types";
import { solarService } from "./solar";
import { subestacaoService } from "./subestacao";
import { carregadorService } from "./carregador";
import { spdaService } from "./spda";
import { execucaoSubestacaoService } from "./execucao-subestacao";
import { redeMtService } from "./rede-mt";
import { qgbtService } from "./qgbt";
import { laudoInspecaoService } from "./laudo-inspecao";
import { limpezaPlacasService } from "./limpeza";
import { conexaoConcessionariaService } from "./conexao-concessionaria";
import { analisadorEnergiaService } from "./analisador-energia";
import { projetoEletricoBtService } from "./projeto-bt";
import { maoDeObraService } from "./mao-de-obra";

/**
 * Registro central de serviços da plataforma.
 *
 * - Solar: configurador próprio (dimensionamento + economia).
 * - Demais: serviços CPQ de engenharia elétrica, com precificação base derivada
 *   das propostas reais da GTA (ver src/services/_cpq). Conexão e Analisador têm
 *   regras fixas de gestão.
 *
 * O dashboard, o formulário e o endpoint de geração reconhecem automaticamente
 * qualquer serviço deste array.
 */
export const SERVICES: ServiceModule[] = [
  solarService,
  subestacaoService,
  execucaoSubestacaoService,
  conexaoConcessionariaService,
  redeMtService,
  spdaService,
  laudoInspecaoService,
  analisadorEnergiaService,
  carregadorService,
  qgbtService,
  projetoEletricoBtService,
  maoDeObraService,
  limpezaPlacasService,
  // Último de propósito: é a saída para o que NÃO se encaixa nos anteriores,
  // e quem procura deve esbarrar nos configuradores específicos primeiro.
];

export function getService(key: string): ServiceModule | undefined {
  return SERVICES.find((s) => s.key === key);
}
