# CLAUDE.md — orientações do projeto

Sistema de **Leilão de Bois** em microsserviços (trabalho acadêmico).
Visão geral e fluxo de uso: [`README.md`](README.md).
Arquitetura explicada para iniciantes: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## Estrutura

| Pasta | O que é |
|---|---|
| `auth-service/` | Registro, login e emissão de JWT (porta 3001). |
| `usuarios-service/` | Leiloeiros, licitantes e crédito do licitante (porta 3002). |
| `leiloes-service/` | Leilão (evento) e seu ciclo de vida (porta 3003). |
| `lances-service/` | Lances + orquestrador da Saga de registro de lance (porta 3003, outro container). |
| `kong/kong.yml` | API Gateway em modo DB-less: único ponto de entrada (porta 8000), valida o JWT. |
| `docker-compose.yml` | Sobe os 4 serviços, os 4 Postgres e o Kong. |
| `testes/` | `testar-unitarios.ps1` (Jest dos 4 serviços), `testar-tudo.ps1` (ponta a ponta), roteiro manual e coleção Postman. |

## Convenções de código

- Node.js 20 + Express, **CommonJS** (`require` / `module.exports`).
- Nomes, mensagens e comentários em **português**, **sem acentos dentro do código**
  (arquivos `.md` podem ter acentos).
- Camadas em todos os serviços: `routes → controllers → services → repositories → Postgres`.
  - `clients/`: chamadas REST para outros serviços (URL sempre vinda de variável de ambiente).
  - `sagas/` (só no lances-service): orquestração da Saga.
  - `middlewares/`, `utils/`, `config/`, `db/`: apoio.
- Regra de negócio vive em `services/`; controller só traduz HTTP ↔ service; repository só fala SQL.
- Erros de negócio: `throw new ErroDeValidacao(mensagem, codigoHttp)`; o `tratarErro`
  do controller converte em resposta JSON `{ erro }`. Qualquer outro erro vira 500.
- SQL sempre parametrizado (`$1`, `$2`...), nunca concatenando valores do usuário.
- Valores em dinheiro são comparados em **centavos** (inteiros) para evitar erro de ponto flutuante.

## Regras de arquitetura

- Cada serviço tem **o próprio banco**; nenhum serviço lê o banco de outro.
- Comunicação entre serviços: REST direto pela rede do Docker (sem passar pelo Kong).
- O Kong é o único ponto de entrada público e valida o JWT; os serviços só **decodificam**
  o token (`middlewares/extrairUsuario.js`).
- As rotas `/licitantes/:id/reservas` são internas (o Kong responde 403 para fora).
- **Autorização** fica nos `services/`, usando `papel` e `perfilId` do token
  (`req.usuarioAutenticado`, repassado pelo controller): leilão só pelo leiloeiro
  logado (e alterado só pelo dono); lance só pelo licitante logado, em nome próprio;
  cadastro de leiloeiro/licitante alterado só pelo próprio (`usuarios-service/src/utils/autorizacao.js`).
  Sem login → 401; sem permissão → 403.
- Rotas internas: reservas de crédito e `POST` de perfis (o Kong responde 403) e
  `/reservas/leilao/:id/liberar` (o Kong nem tem rota `/reservas`).
- Duplicação de pequenos arquivos entre serviços (`config/db.js`, `utils/erros.js`) é
  **intencional**: cada microsserviço é independente.

## Comentários (fase de apresentação)

- Estilo **didático**, pensado para quem está aprendendo a programar: pode "poluir" o código.
- Cada arquivo tem um cabeçalho (o que é, em qual camada está, quem chama e quem é chamado);
  cada função tem um bloco explicando o que recebe, o que faz e o que devolve.
- Mudança de comentário **não altera código** na mesma alteração. Verificação: o `git diff`
  não pode ter linhas removidas e as linhas adicionadas precisam ser só comentários.

## Como validar

```powershell
# testes unitarios dos 4 servicos (Node local ou Docker), com resumo;
# cobertura medida sobre todo o src/, minimo de 50% (coverageThreshold)
powershell -ExecutionPolicy Bypass -File .\testes\testar-unitarios.ps1

# ponta a ponta pelo Kong (com a stack no ar: docker compose up --build)
powershell -ExecutionPolicy Bypass -File .\testes\testar-tudo.ps1
```

Um servico so: `cd <servico> && npm install && npm test`.
Novos testes: regras em `tests/<modulo>.test.js`; camada HTTP em `tests/rotas.test.js` (supertest, services mockados).

Roteiro da apresentacao: [`docs/APRESENTACAO.md`](docs/APRESENTACAO.md).

## Git

- Um branch por tarefa, commits pequenos, mensagens em português.
