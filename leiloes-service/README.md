# leiloes-service

Microsserviço de domínio responsável pelo **cadastro de leilão (evento)** do
sistema de Leilão de Bois. É independente: tem o próprio código, o próprio
banco de dados (`leiloes-db`), o próprio `Dockerfile` e os próprios testes.

## Arquitetura interna (em camadas)

```
routes/  →  controllers/  →  services/  →  repositories/  →  Postgres
                               │
                               └──▶ clients/usuariosClient.js ──HTTP──▶ usuarios-service
```

| Camada | Responsabilidade |
| --- | --- |
| `routes/` | Declara os endpoints HTTP e liga cada um ao controller. |
| `controllers/` | Traduz HTTP ↔ domínio (lê o `body`, devolve status code). |
| `services/` | **Regras de negócio** — é onde a lógica do leilão vive. |
| `repositories/` | Único ponto que fala SQL com o Postgres. |
| `clients/` | Comunicação REST com outros microsserviços. |
| `middlewares/`, `utils/` | Apoio (decodificar JWT, validadores, erros). |

Essa separação é o que permite testar as regras de negócio sem banco e sem
rede: os testes trocam `repositories/` e `clients/` por mocks.

## Modelo de dados

Tabela `leiloes` (`src/db/init.sql`):

| Campo | Descrição |
| --- | --- |
| `leiloeiro_id` | Id do leiloeiro no `usuarios-service`. |
| `titulo`, `descricao`, `local_evento`, `raca` | Identificação do evento. |
| `quantidade_bois` | Tamanho do lote (≥ 1). |
| `lance_inicial` | Valor de abertura (> 0). |
| `incremento_minimo` | Passo mínimo entre lances (> 0). |
| `data_inicio`, `data_fim` | Janela do pregão. |
| `status` | `AGENDADO`, `ABERTO`, `ENCERRADO` ou `CANCELADO`. |

## Regras de negócio implementadas

1. **Validação do evento** — título com no mínimo 3 caracteres, lote com pelo
   menos 1 boi, lance inicial e incremento mínimo maiores que zero, incremento
   nunca maior que o lance inicial, datas em ISO 8601, fim depois do início e
   duração mínima de 30 minutos.
2. **Leilão só existe com leiloeiro válido** — antes de gravar, o serviço
   consulta o `usuarios-service` (`GET /leiloeiros/:id`) via REST. Leiloeiro
   inexistente → `404`; serviço fora do ar → `503`, sem gravar nada.
3. **Data de início no futuro** — não se cadastra um leilão que já começou.
4. **Agenda exclusiva do leiloeiro** — um leiloeiro não pode ter dois eventos
   `AGENDADO`/`ABERTO` com períodos sobrepostos (`409`).
5. **Ciclo de vida controlado** — as únicas transições aceitas são
   `AGENDADO → ABERTO → ENCERRADO`, e `AGENDADO`/`ABERTO → CANCELADO`.
   Qualquer outra (ex.: reabrir um leilão encerrado) devolve `409`.
6. **Edição só antes da abertura** — depois de `ABERTO` as regras já estão
   publicadas e existem lances dependendo delas, então `PUT` e `DELETE` são
   recusados (para encerrar o evento use o cancelamento).

## Endpoints

Todos passam pelo Kong em `http://localhost:8000` e exigem `Authorization:
Bearer <token>` (plugin JWT do Kong).

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/leiloes` | Lista leilões. Filtros opcionais: `?status=ABERTO`, `?leiloeiroId=1`. |
| `GET` | `/leiloes/:id` | Detalha um leilão. |
| `GET` | `/leiloes/:id/disponibilidade` | Diz se o leilão está aceitando lances agora — consumido pelo microsserviço de lances. |
| `POST` | `/leiloes` | Cadastra um leilão. |
| `PUT` | `/leiloes/:id` | Edita um leilão ainda `AGENDADO`. |
| `PATCH` | `/leiloes/:id/abrir` | `AGENDADO → ABERTO`. |
| `PATCH` | `/leiloes/:id/encerrar` | `ABERTO → ENCERRADO`. |
| `PATCH` | `/leiloes/:id/cancelar` | Cancela um leilão não encerrado. |
| `PATCH` | `/leiloes/:id/status` | Transição genérica (`{ "status": "ABERTO" }`). |
| `DELETE` | `/leiloes/:id` | Remove um leilão ainda `AGENDADO`. |
| `GET` | `/health` | Healthcheck (rota interna). |

### Exemplo de cadastro

```bash
curl -X POST http://localhost:8000/leiloes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "leiloeiroId": 1,
    "titulo": "Leilão de Nelore - Lote 12",
    "descricao": "Bois nelore terminados a pasto, média de 18 arrobas.",
    "localEvento": "Parque de Exposições de Lages",
    "raca": "Nelore",
    "quantidadeBois": 40,
    "lanceInicial": 5000,
    "incrementoMinimo": 100,
    "dataInicio": "2026-10-01T14:00:00Z",
    "dataFim": "2026-10-01T18:00:00Z"
  }'
```

## Comunicação entre microsserviços

O endereço do `usuarios-service` **nunca** aparece no código: vem da variável
de ambiente `USUARIOS_SERVICE_URL` (definida no `docker-compose.yml`), igual ao
que o `auth-service` já fazia. A chamada vai direto ao container na rede
interna do Docker, sem passar pelo Kong, e tem timeout
(`USUARIOS_SERVICE_TIMEOUT_MS`, padrão 3s) para não travar o cadastro quando o
outro serviço demora a responder.

O caminho inverso também está pronto: o microsserviço de **lances** consulta
`GET /leiloes/:id/disponibilidade` para saber se pode aceitar um lance,
recebendo `status`, `aceitandoLances`, `lanceInicial` e `incrementoMinimo`.

## Variáveis de ambiente

Veja `.env.example`. No `docker-compose.yml` os valores já vêm definidos; para
rodar fora do Docker, copie `.env.example` para `.env` e ajuste `DB_HOST` etc.

## Testes

```bash
cd leiloes-service && npm install && npm test
```

Jest com `repositories/` e `clients/` mockados (`__mocks__/`), cobrindo as
regras de negócio de `services/` e `utils/`. Cobertura atual: **~96%**
(mínimo exigido pelo trabalho: 50%).
