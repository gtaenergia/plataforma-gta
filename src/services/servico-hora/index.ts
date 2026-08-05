import { criarServicoConfigurador } from "../_cpq/configurador";

/**
 * Serviço por hora — a saída para o que NÃO tem configurador próprio.
 *
 * Os doze serviços anteriores sabem precificar exatamente o que foram feitos
 * para precificar. Quando aparece outra coisa — o dono cita "um smart meter da
 * vida" e "uma manutenção que não foi tratada" — o orçamento saía da
 * plataforma e virava planilha.
 *
 * Aqui o preço vem do caminho mais genérico que existe em obra elétrica: as
 * HORAS de mão de obra terceirizada, multiplicadas pelo custo de cada função e
 * elevadas pelo markup. Quem monta descreve o serviço com as próprias
 * palavras; a conta a plataforma faz.
 *
 * Reusa o molde padrão de serviços: a proposta que chega ao cliente mostra o
 * serviço e o preço, nunca a composição de custo.
 */
export const servicoHoraService = criarServicoConfigurador({
  key: "servico-hora",
  label: "Serviço por hora",
  description:
    "Para o que não tem configurador próprio: informe as horas de mão de obra e a plataforma monta o preço.",
  referencePrefix: "HORA",
});
