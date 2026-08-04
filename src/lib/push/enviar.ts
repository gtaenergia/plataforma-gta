import webpush from "web-push";
import type { NovaNotificacao } from "../notificacoes/types";
import { payloadDe } from "./politica";
import { getPushStore } from "./store";

/**
 * Entrega das notificações push.
 *
 * Roda só em Node (o `web-push` cifra a mensagem com WebCrypto do servidor) —
 * nenhuma rota Edge pode importar este arquivo.
 */

/**
 * O `mailto:` do VAPID não é enfeite: é por onde o serviço de push avisa se a
 * aplicação estiver se comportando mal, antes de bloquear o remetente.
 */
const ASSUNTO_PADRAO = "mailto:gtaenergiago@gmail.com";

let configurado: boolean | null = null;

/** `false` quando faltam as chaves — a plataforma segue funcionando sem push. */
function configurar(): boolean {
  if (configurado !== null) return configurado;
  const publica = process.env.VAPID_PUBLIC_KEY?.trim();
  const privada = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publica || !privada) {
    configurado = false;
    return false;
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT?.trim() || ASSUNTO_PADRAO, publica, privada);
  configurado = true;
  return true;
}

export function pushDisponivel(): boolean {
  return configurar();
}

/**
 * Uma inscrição morre quando a pessoa desinstala o app, limpa os dados do
 * navegador ou revoga a permissão. O serviço de push responde 404 ou 410, e
 * essa é a ÚNICA hora em que dá para saber — não existe outro aviso. Sem
 * apagar aqui, a tabela cresce para sempre e cada notificação passa a gastar
 * uma ida à rede por aparelho fantasma.
 */
const MORTA = new Set([404, 410]);

/**
 * Envia para todos os aparelhos do destinatário.
 *
 * Best-effort, como o `notificar()`: push é efeito colateral, e falhar em
 * entregar um aviso nunca pode derrubar o fluxo que o originou.
 */
export async function enviarPush(n: NovaNotificacao): Promise<void> {
  try {
    if (!configurar()) return;
    const payload = payloadDe(n);
    if (!payload) return;

    const store = getPushStore();
    const inscricoes = await store.listPara(n.paraEmail);
    if (inscricoes.length === 0) return;

    const corpo = JSON.stringify(payload);
    await Promise.all(
      inscricoes.map(async (i) => {
        try {
          await webpush.sendNotification(
            { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
            corpo,
            // TTL de um dia: um aviso de prazo não tem serventia na semana que
            // vem, e o serviço de push descarta sozinho se o aparelho não
            // voltar até lá.
            { TTL: 60 * 60 * 24 },
          );
        } catch (e) {
          const status = (e as { statusCode?: number })?.statusCode;
          if (status && MORTA.has(status)) {
            await store.remover(i.endpoint).catch(() => undefined);
            return;
          }
          console.error("Push: falha ao enviar —", status ?? e);
        }
      }),
    );
  } catch (e) {
    console.error("Push: falha geral —", e);
  }
}
