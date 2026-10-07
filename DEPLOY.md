# Guia de Deploy — Plataforma GTA (Vercel + GitHub + Vercel Postgres)

Este guia coloca a plataforma no ar, de graça, acessível por login. Siga na ordem.
Onde disser **[você]**, é uma ação sua no navegador; o resto o assistente já preparou.

---

## Visão geral

- **GitHub** guarda o código. A cada atualização, a **Vercel** republica sozinha.
- **Vercel** hospeda o site (plano gratuito).
- **Vercel Postgres** guarda as tarefas (e, no futuro, o histórico de propostas).

Você vai criar 2 contas gratuitas (pode usar o Google `gtaenergiago@gmail.com` nas duas):
**GitHub** e **Vercel**.

---

## Passo 1 — Conta no GitHub  **[você]**

1. Acesse https://github.com e crie uma conta (ou faça login).
2. Crie um repositório novo (botão **+** → **New repository**):
   - **Name:** `plataforma-gta`
   - **Private** (recomendado — código interno).
   - **NÃO** marque "Add a README" (o projeto já tem os arquivos).
3. Copie a URL que aparece, algo como
   `https://github.com/SEU-USUARIO/plataforma-gta.git`.

## Passo 2 — Enviar o código para o GitHub

O assistente já fez o `commit` local. Falta apenas conectar ao seu repositório e enviar.
Cole a URL do Passo 1 e rode (o assistente pode fazer isso por você):

```bash
git remote add origin https://github.com/SEU-USUARIO/plataforma-gta.git
git branch -M main
git push -u origin main
```

> Na primeira vez o Git pedirá login no GitHub (abre uma janela do navegador). Autorize.

## Passo 3 — Conta na Vercel e importar o projeto  **[você]**

1. Acesse https://vercel.com e clique em **Sign Up** → **Continue with GitHub**
   (assim a Vercel já enxerga seus repositórios).
2. No painel, clique em **Add New… → Project**.
3. Encontre `plataforma-gta` na lista e clique em **Import**.
4. **NÃO clique em Deploy ainda** — antes vamos configurar o banco e as variáveis
   (Passos 4 e 5). Se o deploy iniciar sozinho e falhar, tudo bem: corrigimos e ele
   republica após o Passo 5.

## Passo 4 — Criar o banco Vercel Postgres  **[você]**

1. No projeto, aba **Storage** → **Create Database** → escolha **Postgres**.
2. Dê um nome (ex.: `gta-db`), região **Washington, D.C. (iad1)** ou a mais próxima,
   e conclua. Aceite vincular ao projeto `plataforma-gta`.
3. Pronto — a Vercel injeta automaticamente a variável `POSTGRES_URL`. A tabela de
   tarefas é criada sozinha no primeiro uso.

## Passo 5 — Variáveis de ambiente  **[você]**

No projeto: **Settings → Environment Variables**. Adicione as duas abaixo
(ambiente: **Production, Preview e Development** marcados):

| Nome         | Valor |
|--------------|-------|
| `AUTH_SECRET`| *(use o valor que o assistente gerou e te enviou no chat)* |
| `APP_USERS`  | JSON com a equipe (exemplo abaixo) |

Exemplo de `APP_USERS` (troque por nomes/senhas reais e fortes):

```json
[{"email":"tito@gta.com","password":"TROQUE-forte-1","name":"Tito"},
 {"email":"gabriel@gta.com","password":"TROQUE-forte-2","name":"Gabriel"}]
```

> ⚠️ Em produção, **sem `AUTH_SECRET` e `APP_USERS` ninguém entra** — isso é
> proposital, para não expor a senha de teste. Nunca use `gta123` em produção.

## Passo 6 — Publicar

- Se você parou antes do deploy: aba **Deployments** → **Deploy** (ou **Redeploy**).
- Se as variáveis foram adicionadas depois de um deploy que falhou: **Redeploy**.
- Ao terminar, a Vercel mostra a URL pública (ex.: `plataforma-gta.vercel.app`).

## Passo 7 — Testar em produção  **[você]**

1. Abra a URL, faça login com um usuário do `APP_USERS`.
2. Gere uma proposta (baixa o `.docx`) e crie uma tarefa.
3. As tarefas agora ficam no banco (persistem entre acessos e reinícios).

---

## Atualizações futuras

Sempre que o assistente melhorar algo, basta enviar ao GitHub:

```bash
git add -A && git commit -m "descrição da mudança" && git push
```

A Vercel detecta o `push` e republica automaticamente em ~1 minuto.

## Anexos dos orçamentos e limpeza automática (opcional)

Para anexar PDFs/planilhas na **Aprovação de orçamentos** em produção:

1. No projeto: aba **Storage** → **Create Database** → **Blob**. Escolha acesso
   **Público** e um nome (ex.: `gta-anexos`). Aceite vincular ao projeto. A Vercel
   injeta a variável `BLOB_READ_WRITE_TOKEN` automaticamente.
2. Em **Settings → Environment Variables**, adicione **`CRON_SECRET`** com um valor
   aleatório e forte (ex.: `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`).
   Ele protege a rota de limpeza `/api/cron/limpar-anexos`.
3. O `vercel.json` já agenda o cron **1×/dia** (limite do plano grátis) para apagar os
   anexos vencidos: **7 dias** após aprovado, **3 dias** após cancelado (enquanto o
   orçamento está pendente, nada é apagado). O registro do orçamento permanece.

Sem o Blob store, os anexos não funcionam em produção (o filesystem da Vercel é
efêmero); em desenvolvimento local, os anexos são gravados em `data/uploads/`.

## Integração com o chat — proposta direto no CRM (opcional)

Quando o Claude gera uma proposta técnica no chat (Claude Code, neste
computador), ele pode registrar na plataforma, depois que você confirmar o
resumo: o cliente (se for novo), o contato, a negociação na etapa **Proposta
enviada**, a proposta e um **follow-up de ligação para 2 dias depois** (se cair
num domingo, passa para a segunda).

**Ligar:**

1. No computador onde você usa o Claude, rode (troque pela URL real da plataforma):
   `node scripts/integracao-gerar-token.mjs https://SEU-DOMINIO.vercel.app`
   O token fica salvo em `C:\Users\<você>\.gta\integracao.json` e **não aparece na
   tela**. O script mostra só o **hash**.
2. Na Vercel, em **Settings → Environment Variables** (Production), crie:
   - `INTEGRACAO_TOKEN_SHA256` = o hash mostrado pelo script
   - `INTEGRACAO_USUARIO_EMAIL` = o seu e-mail de login (tudo fica no seu nome)
3. Faça um novo deploy.

**Segurança:**

- **O servidor guarda só o hash:** quem enxerga as variáveis da Vercel não
  consegue usar a integração.
- **Só cria registros:** não lista, não altera e não apaga nada. A única
  consulta possível é "esse cliente existe?", e a resposta traz só o nome.
- **Freios:** 10 tentativas com token errado bloqueiam o IP por 15 minutos.
  Além disso, há um teto de 20 registros e 120 chamadas por hora.
- **Tudo ou nada:** se alguma etapa falhar no meio, o que já tinha sido criado é
  desfeito.
- **Registro de chamadas:** toda chamada fica na tabela `integracao_log`, sem
  dados pessoais do cliente.
- **Aviso no sino:** cada registro gera uma notificação para você. Uma
  notificação que você não reconhece é sinal de token vazado.

**Desligar ou trocar o token:** apague `INTEGRACAO_TOKEN_SHA256` na Vercel (a rota
passa a responder 404) ou rode o passo 1 de novo e salve o hash novo. Nos dois
casos, faça um novo deploy. O token antigo deixa de funcionar na hora.

## Domínio próprio (opcional)

Em **Settings → Domains** você pode ligar um domínio (ex.: `app.gtaenergia.com`)
apontando o DNS conforme a Vercel indicar.
