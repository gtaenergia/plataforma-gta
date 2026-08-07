import { CrmShell } from "@/components/crm/CrmShell";
import { EmBreve } from "@/components/crm/EmBreve";

export default async function CrmContatosPage() {
  return (
    <CrmShell
      titulo="Contatos"
      subtitulo="As pessoas com quem se negocia. Um contato pertence a uma empresa e pode estar em várias negociações."
    >
      <EmBreve
        titulo="Cadastro de contatos"
        descricao="Quem atende do outro lado: nome, cargo e como falar com a pessoa."
        itens={[
          "Nome, cargo e data de nascimento",
          "Vários e-mails e vários telefones por contato, cada telefone com o seu tipo",
          "Empresa vinculada — uma por contato",
          "Negociações em que o contato aparece",
          "Busca por nome, e-mail, telefone e cargo",
          "Campos personalizados de contato",
        ]}
      />
    </CrmShell>
  );
}
