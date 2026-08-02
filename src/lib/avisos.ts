/**
 * Aviso técnico — o formato compartilhado por todo módulo que valida algo e
 * precisa levantar a mão sem bloquear.
 *
 * Nasceu dentro do Solar e o carregador já o importava de lá. Com a capacidade
 * da equipe passando a emitir avisos também, `src/lib` teria que importar de
 * `src/services` — dependência na direção errada. Aqui é o lugar neutro.
 *
 * Nada que devolve `AvisoTecnico` deve IMPEDIR uma ação: quem está na tela às
 * vezes sabe de algo que a conta não sabe. O aviso existe para a decisão ser
 * consciente, não para ser tomada pelo sistema.
 */

export type NivelAviso = "atencao" | "critico";

export interface AvisoTecnico {
  nivel: NivelAviso;
  titulo: string;
  detalhe: string;
}
