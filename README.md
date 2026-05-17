# Monitoring Hub - Painel de Monitoria de Relogios

Aplicacao local para monitorar a comunicacao de relogios de ponto de empresas integradas aos sistemas DIMEP e MADIS.

O projeto roda como servidor local Node.js/Express e tambem e distribuido atualmente como aplicativo desktop Windows em formato Electron portable. Nesta etapa nao existe instalador NSIS/MSI.

## Stack atual

- Backend: Node.js + Express
- Frontend: HTML, CSS e JavaScript puro em `public/`
- Persistencia local: SQLite via `sql.js`
- Banco local: `%APPDATA%\Monitoring Hub\painel-monitoria.sqlite`
- Desktop: Electron portable
- Testes: `node:test`

## Como executar localmente

No diretorio do projeto:

```powershell
npm install
npm start
```

A aplicacao fica disponivel em:

```text
http://127.0.0.1:8000
```

O backend escuta somente em `127.0.0.1`.

### PowerShell auxiliar

Se `node` ou `npm` nao estiverem no PATH:

```powershell
.\run-local.ps1
```

Se a politica do PowerShell bloquear scripts locais:

```powershell
powershell -ExecutionPolicy Bypass -File .\run-local.ps1
```

## Como gerar o Electron portable

O app desktop fica em `electron-app/`.

```powershell
npm install --prefix electron-app
npm run build --prefix electron-app
```

A versao do desktop e definida em `electron-app/package.json`. O Electron Builder usa essa versao para gerar o arquivo em `dist/` no formato:

```text
Monitoring-Hub-<versao>-Portable.exe
```

A release estavel atual e `Monitoring Hub 1.0.0`, gerada como:

```text
Monitoring-Hub-1.0.0-Portable.exe
```

O build e bloqueado se ja existir um portable com a mesma versao em `dist/`, para evitar sobrescrever uma release aprovada. Antes de gerar uma nova build, incremente a versao:

```powershell
npm run version:patch --prefix electron-app
npm run version:minor --prefix electron-app
npm run version:major --prefix electron-app
```

O script de limpeza do build remove apenas artefatos temporarios, como `win-unpacked`, e preserva executaveis versionados `Monitoring-Hub-*-Portable.exe`. Nao ha instalador nesta etapa.

## Endpoints locais

- `GET /` - entrega a interface web.
- `GET /api/health` - health check local.
- `GET /api/template/companies` - baixa modelo Excel de empresas.
- `GET /api/companies` - lista empresas carregadas/persistidas, sem `api_key`.
- `POST /api/import-companies` - importa Excel/CSV e substitui a base local.
- `POST /api/pull-status` - consulta status nas APIs externas quando acionado pelo usuario.

## Importacao de empresas

Formatos aceitos:

- `.xlsx`
- `.xls`
- `.csv`

Colunas obrigatorias, com pequenas variacoes aceitas:

- Nome da empresa
- CNPJ
- API Key
- Sistema (`DIMEP` ou `MADIS`)

Uma nova importacao substitui a base anterior no SQLite local e limpa o cache de status.

## Persistencia local

As empresas importadas ficam salvas em:

```text
%APPDATA%\Monitoring Hub\painel-monitoria.sqlite
```

O sistema cria o banco automaticamente se ele ainda nao existir.

Salvo no banco:

- nome da empresa
- CNPJ/identifier
- CNPJ somente numeros
- API key
- sistema
- datas de criacao/atualizacao

Nao e salvo no banco:

- resultado das consultas de status
- historico de comunicacao
- relatorios
- logs de relogios

`api_key` fica somente no backend/banco. Ela nao deve aparecer no frontend, logs ou respostas publicas.

## Regras de negocio

- Relogios com `RelogioDesativado = true` sao ignorados.
- Ultima coleta acima de 1 hora e tratada como `Sem comunicacao`.
- Datas sao convertidas para horario de Brasilia.
- Existe cache de status por 60 segundos.
- Existe regra especial por API key para uma empresa especifica, com bloqueio de codigos e filtro por IP nulo.
- As APIs externas nao sao chamadas ao iniciar o sistema; apenas quando o usuario clica em `Puxar Status`.

## Busca e filtros no frontend

A lista de empresas tem controles discretos acima dos cards.

Busca:

- por nome da empresa
- por CNPJ formatado
- por CNPJ somente numeros

Filtros:

- Todas
- Com falha
- Sem comunicacao
- Tudo comunicando
- Sem status

A ordenacao padrao prioriza empresas com problema e depois ordena por nome.

## Electron portable

O Electron:

- inicia o backend interno;
- aguarda `/api/health` antes de abrir a janela principal;
- usa trava de instancia unica;
- encerra o backend ao fechar o app;
- usa `nodeIntegration: false`, `contextIsolation: true` e `sandbox: true`;
- grava logs de startup em `%APPDATA%\Monitoring Hub\startup.log`.

A lentidao inicial do portable pode acontecer antes do Electron iniciar, por extracao temporaria do executavel e/ou verificacao do antivirus. O backend interno, SQLite e health check ja foram otimizados.

## Testes

Comando:

```powershell
npm test
```

Os testes atuais cobrem utilitarios de:

- CNPJ/identifier
- empresa publica sem `api_key`
- datas e regra de coleta vencida
- identidade de relogio
- sanitizacao de erros e segredos

## Limitacoes atuais

- Sem login.
- Sem historico persistente de status.
- Sem alertas automaticos.
- Sem relatorios exportaveis.
- Sem instalador nesta etapa.

## Documentacao completa

Veja:

- `DOCUMENTACAO_COMPLETA.md`
