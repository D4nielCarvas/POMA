# Poma — Projetos em Inteligência Agrícola

Sistema web de gestão de projetos em inteligência agrícola, baseado na metodologia PAAM: Planejar, Avaliar, Analisar e Melhorar.

A aplicação centraliza informações de projetos, responsáveis, locais de execução e cronogramas, oferecendo uma visão geral dos prazos e das atividades em andamento.

## Sobre o projeto

O Poma foi desenvolvido para apoiar a organização e o acompanhamento de projetos agrícolas, como experimentos, monitoramentos e estudos de caso.

O sistema reúne uma interface web em HTML, CSS e JavaScript, uma API em Node.js com Express e uma estrutura de persistência com SQLite e integração com Supabase.

## Funcionalidades

- Cadastro e autenticação de usuários.
- Autenticação baseada em tokens JWT.
- Fluxo de recuperação e redefinição de senha.
- Cadastro e edição de projetos.
- Classificação de projetos em:
  - Experimento.
  - Monitoramento.
  - Estudo de caso.
- Identificação de projetos internos ou de parceiros.
- Cadastro de múltiplos responsáveis por projeto.
- Cadastro de múltiplos locais de execução.
- Organização de cronogramas com etapas dinâmicas.
- Dashboard com indicadores de:
  - Total de projetos.
  - Projetos em andamento.
  - Projetos concluídos.
  - Prazos críticos ou atrasados.
- Busca por nome, responsável ou local.
- Filtros por classificação, tipo e situação do prazo.
- Central de alertas de prazos.
- Alternância entre tema claro e escuro.

> O envio de e-mails para recuperação de senha depende da configuração de um servidor SMTP.

## Metodologia PAAM

O projeto utiliza a metodologia PAAM como referência para a gestão:

| Etapa | Objetivo |
| --- | --- |
| Planejar | Organizar objetivos, responsáveis, locais e cronogramas. |
| Avaliar | Acompanhar a execução e a situação dos projetos. |
| Analisar | Examinar informações e identificar pontos de atenção. |
| Melhorar | Apoiar ajustes e a melhoria contínua dos processos. |

## Tecnologias

| Camada | Tecnologias |
| --- | --- |
| Interface | HTML, CSS e JavaScript |
| Servidor | Node.js e Express |
| Banco local | SQLite, por meio do módulo nativo `node:sqlite` |
| Integração com banco em nuvem | Supabase |
| Autenticação | JSON Web Token e bcryptjs |
| E-mail | Nodemailer |
| Testes | Executor nativo de testes do Node.js |
| Implantação | Configuração de serviço no Render |

## Estrutura do projeto

```text
.
├── data/                      # Armazenamento local
├── public/                    # Interface web
│   ├── css/
│   ├── img/
│   ├── js/
│   └── index.html
├── server/                    # Backend
│   ├── config/                # Configuração dos bancos
│   ├── controllers/           # Controladores
│   ├── database/              # Esquema e scripts de dados
│   ├── middleware/            # Middlewares
│   ├── models/                # Modelos e acesso a dados
│   ├── routes/                # Rotas da API
│   ├── services/              # Serviços
│   ├── app.js                 # Configuração do Express
│   └── server.js              # Inicialização do servidor
├── tests/                     # Testes automatizados
├── .env.example               # Modelo de variáveis de ambiente
├── .gitignore
├── package.json
├── package-lock.json
└── render.yaml                # Configuração de implantação
```

## Como executar localmente

### 1. Pré-requisitos

- Git.
- Node.js com suporte ao módulo nativo `node:sqlite` e à opção `--env-file`.
- npm.

O projeto utiliza `DatabaseSync`, importado de `node:sqlite`. Uma versão do Node.js sem suporte a esse módulo não executará o backend.

### 2. Clonar o repositório

```bash
git clone [https://github.com/D4nielCarvas/ProjetoCesinha.git](https://github.com/D4nielCarvas/ProjetoCesinha.git) poma
cd poma
```

### 3. Instalar as dependências

```bash
npm install
```

### 4. Configurar as variáveis de ambiente

Crie um arquivo `.env` na raiz, utilizando `.env.example` como referência.

Para uma execução local inicial com SQLite:

```env
NODE_ENV=development
PORT=3000

JWT_SECRET=substitua_por_uma_chave_longa_aleatoria_e_privada
JWT_EXPIRES_IN=24h

APP_URL=http://localhost:3000
```

Não utilize a chave ilustrativa acima em produção.

Para habilitar a integração com Supabase, acrescente as credenciais reais do seu projeto:

```env
SUPABASE_URL=[https://seu-projeto.supabase.co](https://seu-projeto.supabase.co)
SUPABASE_KEY=sua_chave_do_supabase
```

Para habilitar o envio de e-mails:

```env
SMTP_HOST=smtp.seu-provedor.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=seu-email@exemplo.com
SMTP_PASS=sua_credencial_smtp
```

Observações:

- Não publique o arquivo `.env` nem credenciais no repositório.
- Credenciais privilegiadas do Supabase devem permanecer somente no backend.
- Não preencha as variáveis do Supabase com valores fictícios para executar apenas com SQLite.
- A integração com Supabase exige que a estrutura correspondente do banco esteja preparada. Consulte `server/database/schema.sql`.
- O arquivo de esquema contém seções distintas para SQLite e PostgreSQL/Supabase; não execute o arquivo inteiro indiscriminadamente no Supabase.

### 5. Iniciar a aplicação

Com as configurações armazenadas no `.env`:

```bash
node --env-file=.env server/server.js
```

Para desenvolvimento, com reinicialização automática:

```bash
node --env-file=.env --watch server/server.js
```

Acesse no navegador:

```text
http://localhost:3000
```

O backend também entrega os arquivos da interface web.

> Os scripts atuais `npm start` e `npm run dev` não carregam o `.env` explicitamente. Utilize-os quando as variáveis já estiverem disponíveis no ambiente do processo ou use os comandos com `--env-file` apresentados acima.

## Banco de dados

### SQLite

Na inicialização, o servidor cria a estrutura local a partir da seção SQLite de `server/database/schema.sql`.

O caminho padrão do arquivo é:

```text
data/gestao_projetos.db
```

É possível personalizar esse caminho pela variável de ambiente `DB_PATH`.

### Supabase

O projeto possui um cliente Supabase configurado por variáveis de ambiente.

A inicialização atual do servidor também abre o banco SQLite, mesmo quando as credenciais do Supabase estão disponíveis. Portanto, a presença da integração não significa que o SQLite deixou de ser utilizado.

## Scripts disponíveis

| Comando | Finalidade |
| --- | --- |
| `npm start` | Inicia o servidor. |
| `npm run dev` | Inicia o servidor em modo de observação. |
| `npm run seed` | Executa o script de população de dados. |
| `npm test` | Executa os testes automatizados. |

Antes de executar scripts de população, confira o banco de destino e o conteúdo do script.

## API

Principais caminhos definidos no servidor:

| Caminho | Finalidade |
| --- | --- |
| `/api/auth` | Rotas de autenticação. |
| `/api/projects` | Rotas de gerenciamento de projetos. |
| `/api/health` | Verificação básica de disponibilidade da API. |

Exemplo de resposta de `/api/health`:

```json
{
  "status": "ok",
  "timestamp": "..."
}
```

## Implantação

O repositório inclui um arquivo `render.yaml` com a configuração de um serviço web no Render.

A configuração prevê:

- Instalação das dependências com `npm install`.
- Inicialização com `npm start`.
- Variável `NODE_ENV` definida como `production`.
- Geração automática de `JWT_SECRET`.
- Configuração externa de credenciais do Supabase e SMTP.

Antes da publicação:

1. Configure as variáveis necessárias no ambiente de hospedagem.
2. Ajuste `APP_URL` para o endereço público da aplicação.
3. Prepare o esquema do banco utilizado.
4. Verifique a persistência do arquivo SQLite no ambiente escolhido.
5. Valide autenticação, operações de projetos e recuperação de senha.

A existência do arquivo de configuração não confirma que há uma implantação ativa.

## Testes

Execute:

```bash
npm test
```

O comando utiliza o executor nativo de testes do Node.js.

## Autoria

Projeto mantido por [Daniel Carvas](https://github.com/D4nielCarvas).

## Licença

O campo `license` do `package.json` está definido como `ISC`.

Não foi identificado um arquivo `LICENSE` na raiz consultada. A formalização da licença deve ser revisada pelo responsável pelo projeto.
