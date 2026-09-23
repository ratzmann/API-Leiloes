# CLAUDE.md — orientações do projeto

Sistema de **Leilão de Bois** em microsserviços (trabalho acadêmico).
Visão geral e fluxo de uso: [`README.md`](README.md).
Arquitetura explicada para iniciantes: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md)
(inclui o mapa de endpoints, seção 13).
Roteiro da apresentação: [`docs/APRESENTACAO.md`](docs/APRESENTACAO.md).

## Estrutura

| Pasta | O que é |
|---|---|
| `auth-service/` | Registro, login e emissão de JWT (porta 3001). |
| `usuarios-service/` | Leiloeiros, licitantes e crédito do licitante (porta 3002). |
| `leiloes-service/` | Leilão (evento) e seu ciclo de vida (porta 3003). |
| `lances-service/` | Lances + orquestrador da Saga de registro de lance (porta 3003, outro container). |
| `kong/kong.yml` | API Gateway em modo DB-less: único ponto de entrada (porta 8000), valida o JWT. |
| `kong/erro.json` | Template dos erros gerados pelo próprio Kong (`{ "erro": ... }`). |
| `docker-compose.yml` | Sobe os 4 serviços, os 4 Postgres e o Kong. |
| `testes/` | `testar-unitarios.ps1` (Jest dos 4 serviços), `testar-tudo.ps1` (ponta a ponta), roteiro manual e coleção Postman. |

## Convenções de código

- Node.js 20 + Express 4, **CommonJS** (`require` / `module.exports`).
- Nomes, mensagens e comentários em **português**, **sem acentos dentro do código**
  (arquivos `.md` podem ter acentos).
- Camadas em todos os serviços: `routes → controllers → services → repositories → Postgres`.
  - `clients/`: chamadas REST para outros serviços, sempre por `clients/http.js`
    (`requisicao`, `urlBase`, `ServicoIndisponivel`; timeout `SERVICOS_TIMEOUT_MS`).
  - `sagas/` (só no lances-service): orquestração da Saga.
  - `middlewares/`: `extrairUsuario.js` (lê o token) e `tratarErros.js` (responde os erros).
  - `utils/`, `config/`, `db/`: apoio.
- Responsabilidade de cada camada:
  - **service**: regras de negócio e autorização; não conhece HTTP, SQL nem `process.env`;
  - **controller**: só traduz HTTP ↔ service e repassa `req.usuarioAutenticado`;
  - **repository**: só fala SQL;
  - **client**: só fala HTTP com outro serviço.
- **Erros**:
  - o service faz `throw new ErroDeValidacao(mensagem, codigoHttp)`;
  - o controller faz `try { ... } catch (err) { next(err); }`;
  - o middleware `tratarErros` (registrado no `app.js` depois das rotas) responde
    `{ erro }` (+ `sagaId` na Saga), `400` para JSON inválido e `500` genérico para o resto;
  - não criar `tratarErro` em controller.
- **Formato de erro da API**: sempre `{ "erro": "mensagem" }`, inclusive no Kong
  (template `kong/erro.json` e `body` do `request-termination`). Única exceção:
  o `401` do plugin JWT, que continua `{ "message": ... }`.
- Chamadas a outros serviços: `2xx` → corpo; recusa de negócio (`4xx`) → `ErroDeValidacao`
  com o mesmo código; rede, timeout, `5xx` ou URL ausente → `ServicoIndisponivel` (o service
  converte em `503`).
- SQL sempre parametrizado (`$1`, `$2`...), nunca concatenando valores do usuário.
- Valores em dinheiro são comparados em **centavos** (inteiros) para evitar erro de ponto flutuante.

## Regras de arquitetura

- Cada serviço tem **o próprio banco**; nenhum serviço lê o banco de outro.
- Os 4 serviços rodam `db/migrar.js` ao subir (`init.sql` idempotente: `IF NOT EXISTS`).
- Comunicação entre serviços: REST direto pela rede do Docker (sem passar pelo Kong),
  URL sempre vinda de variável de ambiente.
- Operações que atravessam serviços precisam de **compensação**:
  - registro: se o perfil falhar, o usuário é apagado (`authService.registrar`);
  - lance: Saga orquestrada (`sagas/registrarLanceSaga.js`);
  - cancelamento de leilão: libera as reservas do leilão; é idempotente e pode ser repetido.
- O Kong é o único ponto de entrada público e valida o JWT; os serviços só **decodificam**
  o token (`middlewares/extrairUsuario.js`).
- **Autorização** fica nos `services/`, usando `papel` e `perfilId` do token
  (`req.usuarioAutenticado`). Sem login → `401`; sem permissão → `403`.
  - leilão: só o leiloeiro logado cadastra (em nome próprio) e só o dono altera;
  - lance: só o licitante logado, em nome próprio;
  - cadastro de leiloeiro/licitante: só o próprio altera ou remove
    (`usuarios-service/src/utils/autorizacao.js`); o licitante não altera o próprio limite.
- **Privacidade (LGPD)**: dados pessoais (CPF, e-mail, telefone, limite) só para o próprio dono;
  os demais recebem os campos públicos (`visaoPara` em `utils/autorizacao.js`).
- **Rotas internas** (só entre serviços):
  - `POST /licitantes/:id/reservas...` e `POST /leiloeiros|/licitantes`: o Kong responde `403`;
  - `/reservas/leilao/:id/liberar`: o Kong nem tem rota `/reservas`.
- A Admin API do Kong (8001) é publicada só em `127.0.0.1`.
- **Arquivos idênticos entre serviços** (duplicação intencional: cada microsserviço é
  independente). Ao mudar um, copie para os outros:
  - nos 4 serviços: `config/db.js`, `utils/erros.js`, `db/migrar.js`, `middlewares/tratarErros.js`;
  - em auth, leiloes e lances: `clients/http.js`;
  - em usuarios, leiloes e lances: `middlewares/extrairUsuario.js`.

## Regras de negócio

- A numeração das regras segue o **README** (fonte da verdade) e é a mesma nos comentários,
  nos testes e no `testar-tudo.ps1`.
- Cada service lista suas regras no cabeçalho; cada função indica a regra que implementa
  ("Regra N: ...").
- Ao criar uma regra: numerar no README, no service e nos testes, e cobrir no ponta a ponta
  quando envolver mais de um serviço.

## Comentários

- Estilo **didático**, pensado para quem está aprendendo a programar: pode "poluir" o código.
- Cada arquivo tem um cabeçalho (o que é, em qual camada está, quem chama e quem é chamado).
- **Um único bloco `/** */` por função**: o que recebe, o que faz e o que devolve. Não
  deixar comentário de linha repetindo o bloco logo acima dele.
- Mudança só de comentário **não altera código** no mesmo commit: o `git diff` só pode
  mexer em linhas de comentário.

## Como validar

```powershell
# testes unitarios dos 4 servicos (Node local ou Docker), com resumo;
# cobertura medida sobre todo o src/, minimo de 50% (coverageThreshold)
powershell -ExecutionPolicy Bypass -File .\testes\testar-unitarios.ps1

# ponta a ponta pelo Kong (com a stack no ar: docker compose up --build -d)
powershell -ExecutionPolicy Bypass -File .\testes\testar-tudo.ps1
```

- Estado atual: 217 testes unitários (cobertura de linhas entre 75% e 82%) e 71 passos no
  ponta a ponta, todos passando.
- Um serviço só: `cd <servico> && npm install && npm test`.
- Onde ficam os testes novos:
  - regras: `tests/<modulo>.test.js`, com repositories e clients mockados (`__mocks__/`);
  - camada HTTP: `tests/rotas.test.js` (supertest, services mockados);
  - clients: `tests/usuariosClient.test.js` (`fetch` mockado).
- Mudou código de um serviço? Reconstrua antes do ponta a ponta:
  `docker compose up -d --build <servico>`.

## Git

- Um branch por tarefa, **um commit por alteração**, mensagens em português
  (`tipo(escopo): descrição`, ex.: `fix(auth): ...`, `docs: ...`, `test(e2e): ...`).
- Cada commit deixa o projeto funcionando (testes passando).
- Mudanças vão para a `main` por Pull Request (`gh pr create`).
