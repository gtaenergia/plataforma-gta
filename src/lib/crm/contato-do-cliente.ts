import type { Cliente } from "@/lib/clientes/types";
import { casarContato } from "@/lib/integracao/regras";
import { getContatoStore } from "./contatos-store";
import type { Contato } from "./types";

/**
 * O cadastro do cliente tem uma seção "Contato" (nome, telefone, e-mail) e a
 * aba Contatos tem o seu próprio cadastro — a mesma pessoa, digitada duas
 * vezes, e quem não digitava a segunda ficava sem contato na ficha do cliente
 * nem para marcar na negociação. Aqui a seção do cliente vira contato sozinha.
 */

type SecaoContato = Pick<Cliente, "nome" | "tipoPessoa" | "contatoNome" | "telefone" | "email">;
type DadosContato = { nome: string; telefone: string; email: string };

/**
 * A pessoa que a seção "Contato" descreve — ou null, quando não há de quem
 * falar.
 *
 * A aba Contatos exige nome, então sem "Nome do contato" não há contato. A
 * exceção é a pessoa física: ali o cliente É a pessoa, e o nome dele serve —
 * desde que haja telefone ou e-mail, senão o registro não diria nada.
 */
export function contatoDoCadastro(c: SecaoContato): DadosContato | null {
  const telefone = c.telefone.trim();
  const email = c.email.trim();
  const nome = c.contatoNome.trim() || (c.tipoPessoa === "PF" && (telefone || email) ? c.nome.trim() : "");
  return nome ? { nome, telefone, email } : null;
}

const mesmos = (a: DadosContato | null, b: DadosContato | null) =>
  a?.nome === b?.nome && a?.telefone === b?.telefone && a?.email === b?.email;

/**
 * Cadastra na aba Contatos quem a seção "Contato" do cliente descreve, se
 * ainda não estiver lá. Devolve o contato criado, ou null.
 *
 * `antes` é o cadastro gravado, na edição: só se mexe quando a seção mudou.
 * Sem esse freio, apagar da aba Contatos alguém que saiu da empresa não
 * adiantaria — a próxima correção de endereço no cliente o traria de volta.
 *
 * Nunca altera um contato existente (casado por e-mail, telefone ou nome,
 * dentro do mesmo cliente — a mesma regra da integração do chat): o que foi
 * ajustado na aba Contatos vale mais do que o resumo no cadastro do cliente.
 */
export async function garantirContatoDoCliente(
  cliente: SecaoContato & Pick<Cliente, "id">,
  antes: SecaoContato | null,
  autor: { criadoPor: string; criadoPorNome: string },
): Promise<Contato | null> {
  const dados = contatoDoCadastro(cliente);
  if (!dados) return null;
  if (antes && mesmos(dados, contatoDoCadastro(antes))) return null;

  const store = getContatoStore();
  if (casarContato(dados, cliente.id, await store.list())) return null;
  return store.create({
    ...dados,
    cargo: "",
    empresaId: cliente.id,
    empresaNome: cliente.nome,
    observacoes: "",
    ...autor,
  });
}
