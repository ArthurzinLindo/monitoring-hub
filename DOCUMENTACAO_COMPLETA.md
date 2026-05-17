# Documentacao Completa - Monitoring Hub

## 1. Visao geral do projeto

O Monitoring Hub e um aplicativo local para monitorar comunicacao de relogios de ponto por empresa, separado pelos sistemas DIMEP e MADIS.

O usuario importa uma planilha com empresas, CNPJ, API key e sistema. Depois aciona a consulta de status manualmente pelo botao `Puxar Status`. O sistema consulta as APIs externas, normaliza os relogios retornados e apresenta a situacao por empresa e por equipamento.

A versao atual continua sendo portable. Nao ha instalador NSIS/MSI nesta etapa.

## 2. Stack real

- Backend: Node.js + Express.
- Frontend: HTML/CSS/JavaScript puro em `public/`.
- Persistencia: SQLite via `sql.js`.
- Banco local: `%APPDATA%\Monitoring Hub\painel-monitoria.sqlite`.
- Desktop: Electron portable.
- Testes: `node:test`.
- Build desktop: `electron-builder` com alvo `portable`.

## 3. Estrutura de pastas atual

```text
PainelMonitoria/
|-- public/
|   |-- index.html
|   |-- styles.css
|   `-- app.js
|-- src/
|   |-- database/
|   |   |-- connection.js
|   |   `-- migrations.js
|   |-- repositories/
|   |   `-- companyRepository.js
|   `-- utils/
|       |-- clock.js
|       |-- company.js
|       |-- datetime.js
|       |-- errors.js
|       |-- identifier.js
|       `-- text.js
|-- tests/
|   `-- utils/
|       |-- clock.test.js
|       |-- company.test.js
|       |-- datetime.test.js
|       |-- errors.test.js
|       `-- identifier.test.js
|-- electron-app/
|   |-- assets/
|   |-- clean-dist.js
|   |-- global-styles-injection.js
|   |-- main.js
|   |-- package.json
|   |-- preload.js
|   |-- splash.html
|   `-- titlebar-overlay.html
|-- server.js
|-- package.json
|-- package-lock.json
|-- README.md
|-- DOCUMENTACAO_COMPLETA.md
`-- run-local.ps1
```

Pastas de saida como `dist/`, `node_modules/` e artefatos de build podem existir localmente, mas nao fazem parte da estrutura funcional principal.

## 4. Como executar localmente

No diretorio do projeto:

```powershell
npm install
npm start
```

Servidor local:

```text
http://127.0.0.1:8000
```

O backend esta fixado em `127.0.0.1`, evitando exposicao direta na rede local.

### 4.1 Execucao via PowerShell auxiliar

```powershell
.\run-local.ps1
```

Se houver bloqueio de politica do PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\run-local.ps1
```

## 5. Como gerar build Electron portable

No diretorio raiz do projeto:

```powershell
npm install --prefix electron-app
npm run build --prefix electron-app
```

O comando configurado em `electron-app/package.json` usa:

```text
electron-builder --win portable
```

A saida atual e um executavel portable em `dist/`. Nao existe instalador nesta etapa.

## 6. Endpoints reais do backend

### 6.1 `GET /`

Entrega `public/index.html`.

### 6.2 `GET /api/health`

Health check usado pelo Electron e por validacao manual.

Resposta:

```json
{ "status": "ok" }
```

### 6.3 `GET /api/template/companies`

Gera e baixa um modelo Excel (`modelo_empresas.xlsx`) com colunas esperadas para importacao.

### 6.4 `GET /api/companies`

Lista empresas carregadas do banco/memoria, agrupadas por sistema.

Nao retorna `api_key`.

Formato geral:

```json
{
  "total": 1,
  "grouped": {
    "DIMEP": [],
    "MADIS": []
  },
  "companies": [
    {
      "id": "dimep-12345678000190-1",
      "name": "Empresa Exemplo",
      "identifier": "12.345.678/0001-90",
      "system": "DIMEP"
    }
  ]
}
```

### 6.5 `POST /api/import-companies`

Importa planilha Excel/CSV via `multipart/form-data` no campo `file`.

Formatos aceitos:

- `.xlsx`
- `.xls`
- `.csv`

Limite atual de upload:

- 10 MB

Comportamento:

- valida colunas obrigatorias;
- ignora linhas invalidas com warnings;
- substitui a base local anterior;
- salva as empresas no SQLite;
- recarrega a memoria do backend;
- limpa o cache de status;
- nao retorna `api_key`.

### 6.6 `POST /api/pull-status`

Consulta status das empresas carregadas.

Body:

```json
{
  "force_refresh": false
}
```

Na UI atual, o botao `Puxar Status` chama esta rota com `force_refresh=false`, usando cache valido quando disponivel.

Formato geral da resposta:

```json
{
  "total": 1,
  "updated_at": "07/05/2026 10:00:00",
  "summary": {
    "healthy_companies": 1,
    "unhealthy_companies": 0,
    "from_cache": 0
  },
  "grouped": {
    "DIMEP": [],
    "MADIS": []
  },
  "companies": []
}
```

## 7. Fluxo de importacao de empresas

1. Usuario baixa o modelo em `Baixar modelo Excel` ou pelo endpoint `/api/template/companies`.
2. Usuario preenche empresas com nome, CNPJ, API key e sistema.
3. Usuario seleciona o arquivo na interface.
4. Frontend envia para `POST /api/import-companies`.
5. Backend valida arquivo e colunas.
6. Empresas validas substituem a base anterior no SQLite.
7. Backend atualiza a lista em memoria.
8. Cache de status e limpo.
9. Frontend atualiza contadores e lista de empresas.

Colunas conceituais obrigatorias:

- Nome da empresa
- CNPJ/identifier
- API Key
- Sistema

Aliases sao aceitos para reduzir erro operacional, por exemplo `Empresa`, `Nome`, `Razao social`, `CNPJ`, `identifier`, `key`, `chave`, `Sistema`, `Fornecedor`.

## 8. Fluxo de consulta de status

1. Usuario clica em `Puxar Status`.
2. Frontend chama `POST /api/pull-status`.
3. Backend usa empresas carregadas da memoria.
4. Backend consulta DIMEP/MADIS com concorrencia controlada.
5. Cada empresa e tratada de forma isolada.
6. Falha em uma empresa nao interrompe as demais.
7. Relogios sao normalizados.
8. Regras de negocio sao aplicadas.
9. Resposta volta ao frontend sem `api_key`.
10. Frontend atualiza cards, lista e modal de detalhes.

As APIs externas nao sao chamadas ao iniciar o software.

## 9. Busca e filtros no frontend

A lista de empresas possui controles discretos acima dos cards.

### 9.1 Busca

Busca por:

- nome da empresa;
- CNPJ formatado;
- CNPJ somente numeros.

Exemplo: pesquisar `11222333000144` encontra `11.222.333/0001-44`.

A busca respeita a aba selecionada (`DIMEP` ou `MADIS`).

### 9.2 Filtros

Filtros disponiveis:

- Todas
- Com falha
- Sem comunicacao
- Tudo comunicando
- Sem status

Os filtros usam dados ja carregados no frontend (`statusesById`) e nao chamam backend nem APIs externas.

## 10. Ordenacao por criticidade

A lista de empresas e ordenada por prioridade operacional:

1. empresas com erro/status `error`;
2. empresas com relogios sem comunicacao;
3. empresas sem status consultado;
4. empresas com tudo comunicando.

Dentro de cada grupo, a ordenacao e por nome da empresa.

## 11. Persistencia SQLite

### 11.1 Caminho do banco

```text
%APPDATA%\Monitoring Hub\painel-monitoria.sqlite
```

O Electron define o diretorio local de dados no perfil do usuario. O backend usa esse caminho para o banco.

### 11.2 O que e salvo

Tabela `companies`:

- `id`
- `name`
- `identifier`
- `identifier_digits`
- `api_key`
- `system`
- `created_at`
- `updated_at`

### 11.3 O que nao e salvo

- status dos relogios;
- historico de consultas;
- alertas;
- relatorios;
- dados temporarios do frontend.

### 11.4 Comportamento na inicializacao

Ao iniciar:

1. o banco e criado se nao existir;
2. migrations sao executadas;
3. empresas salvas sao carregadas para memoria;
4. cache de status inicia vazio;
5. nenhuma API externa e chamada.

Uma nova importacao substitui a base anterior.

## 12. Seguranca

### 12.1 Backend local

- O Express escuta apenas em `127.0.0.1`.
- O frontend local acessa o backend pela propria maquina.

### 12.2 Protecao de `api_key`

- `api_key` fica somente no backend/banco.
- `GET /api/companies` nao retorna `api_key`.
- `POST /api/pull-status` nao retorna `api_key`.
- Logs sao sanitizados para evitar vazamento de segredo.

### 12.3 Electron

Configuracoes atuais da janela:

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- `webSecurity: true`
- `allowRunningInsecureContent: false`

O `preload.js` expoe apenas canais controlados para minimizar e fechar a janela.

Links externos sao enviados ao navegador padrao via `shell.openExternal`.

## 13. Regras de negocio

### 13.1 Relogio desativado

Relogios com campo equivalente a `RelogioDesativado = true` sao ignorados.

### 13.2 Ultima coleta maior que 1 hora

Se a ultima coleta esta acima de 1 hora, o relogio e considerado `Sem comunicacao`.

Esta regra prevalece sobre fallback de comunicacao baseado em existencia de data.

### 13.3 Timezone Brasil

Datas da API sao interpretadas como UTC quando necessario e exibidas em horario de Brasilia (`America/Sao_Paulo`).

Formato exibido:

```text
dd/mm/aaaa hh:mm:ss
```

### 13.4 Regra especial por API key

Existe regra dedicada para a API key:

```text
11b345c7-6790-4df6-a0fb-7b4bee3a2447
```

Para essa empresa:

- alguns codigos de relogio sao bloqueados;
- apenas relogios com IP nulo/vazio sao exibidos.

A regra nao afeta outras empresas.

### 13.5 Cache de 60 segundos

O cache de status dura 60 segundos por empresa.

Chave interna:

```text
system + identifier + api_key
```

O cache reduz chamadas repetidas para APIs externas.

## 14. Testes automatizados

Ferramenta:

```text
node:test
```

Comando:

```powershell
npm test
```

Areas cobertas atualmente:

- normalizacao de CNPJ/identifier;
- geracao de candidatos de identifier;
- sanitizacao de empresa publica sem `api_key`;
- normalizacao de sistema DIMEP/MADIS;
- regra de ultima coleta vencida;
- tratamento de data vazia/invalida;
- normalizacao de codigo de relogio;
- deteccao de IP nulo/vazio;
- identidade estavel de relogio;
- mascaramento e sanitizacao de erros sensiveis.

Os testes nao chamam APIs externas, nao dependem de Electron e nao dependem de arquivo Excel real.

## 15. Electron portable

### 15.1 Inicializacao

Fluxo atual:

1. Electron inicia.
2. Trava de instancia unica e solicitada.
3. Diretorio de dados em `%APPDATA%\Monitoring Hub` e configurado.
4. Splash e criada.
5. Backend interno e carregado via `server.js`.
6. Backend inicializa SQLite e carrega empresas.
7. Electron aguarda `/api/health`.
8. Janela principal e criada.
9. Splash fecha.
10. Janela principal aparece.

### 15.2 Instancia unica

O app usa `app.requestSingleInstanceLock()`.

Se o usuario abrir outro executavel enquanto um ja estiver aberto, a instancia existente ganha foco.

### 15.3 Fechamento

Ao fechar o app, o Electron chama `stopServer()` para encerrar o backend interno.

Existe timeout de seguranca para evitar travamento no encerramento.

### 15.4 Build portable

Comando:

```powershell
npm run build --prefix electron-app
```

Configuracao atual:

- produto: `Monitoring Hub`
- alvo Windows: `portable`
- saida: `dist/`
- sem instalador nesta etapa

## 16. Performance de inicializacao

Foram adicionados logs de startup em:

```text
%APPDATA%\Monitoring Hub\startup.log
```

O log registra eventos do Electron e do backend, incluindo:

- inicio do processo Electron;
- `app.whenReady`;
- criacao da splash;
- carregamento do servidor;
- inicializacao do banco;
- migrations;
- carregamento de empresas;
- health check;
- criacao da janela principal;
- app pronto.

O backend interno, SQLite e health check ja foram otimizados.

Ainda assim, a versao portable pode demorar antes da splash aparecer. Esse atraso pode ocorrer antes do Electron iniciar, por:

- extracao temporaria do executavel portable;
- verificacao do antivirus/Windows Defender;
- leitura inicial do arquivo `.exe` grande.

Alternativa futura possivel: instalador NSIS/MSI para reduzir custo de extracao a cada abertura. Isso e roadmap, nao funcionalidade atual.

## 17. Tratamento de erros

### 17.1 API externa

Falhas por empresa sao isoladas.

Exemplos tratados:

- HTTP 403;
- timeout;
- falha de rede;
- JSON invalido;
- empresa sem relogios ativos.

Uma empresa com falha nao interrompe o lote.

### 17.2 Importacao

Tratamentos atuais:

- arquivo ausente;
- formato invalido;
- arquivo vazio;
- arquivo acima de 10 MB;
- planilha invalida/corrompida;
- colunas obrigatorias ausentes;
- sistema invalido;
- linhas duplicadas.

### 17.3 SQLite

Falhas internas sao tratadas para retornar erro operacional sem expor segredo. O banco fica no perfil do usuario.

## 18. Limitacoes atuais

- Sem login.
- Sem historico persistente de status.
- Sem alertas automaticos.
- Sem relatorios exportaveis.
- Sem instalador nesta etapa.
- Sem dashboard multiusuario.
- Sem criptografia do banco local.
- Sem persistencia de resultados de status.

## 19. Roadmap futuro

Itens possiveis para etapas futuras, ainda nao implementados:

1. Instalador NSIS/MSI como alternativa ao portable.
2. Criptografia do banco local.
3. Historico persistente de status.
4. Exportacao de relatorios.
5. Alertas automaticos.
6. Login/perfis de acesso.
7. Tela de diagnostico operacional.
8. Configuracao visual para tempo maximo de coleta.

## 20. Checklist de validacao manual

### 20.1 Execucao local

- [ ] Rodar `npm install`.
- [ ] Rodar `npm start`.
- [ ] Acessar `http://127.0.0.1:8000`.
- [ ] Acessar `GET /api/health` e confirmar `{ "status": "ok" }`.

### 20.2 Persistencia

- [ ] Abrir sem banco existente.
- [ ] Confirmar criacao de `%APPDATA%\Monitoring Hub\painel-monitoria.sqlite`.
- [ ] Importar planilha valida.
- [ ] Reiniciar o servidor.
- [ ] Confirmar empresas listadas sem importar novamente.
- [ ] Importar outra planilha e confirmar substituicao da base anterior.

### 20.3 Seguranca

- [ ] Confirmar que `/api/companies` nao retorna `api_key`.
- [ ] Confirmar que `/api/pull-status` nao retorna `api_key`.
- [ ] Confirmar que logs nao exibem `api_key`.

### 20.4 Consulta

- [ ] Clicar em `Puxar Status`.
- [ ] Confirmar atualizacao dos cards de status geral.
- [ ] Confirmar empresas com problema no topo.
- [ ] Abrir uma empresa e validar modal de relogios.
- [ ] Confirmar filtro do modal: Todos, Comunicando, Sem comunicacao.

### 20.5 Busca e filtros

- [ ] Buscar por nome da empresa.
- [ ] Buscar por CNPJ formatado.
- [ ] Buscar por CNPJ somente numeros.
- [ ] Testar filtro Todas.
- [ ] Testar filtro Com falha.
- [ ] Testar filtro Sem comunicacao.
- [ ] Testar filtro Tudo comunicando.
- [ ] Testar filtro Sem status.
- [ ] Alternar DIMEP/MADIS e validar que busca/filtros respeitam a aba.

### 20.6 Electron portable

- [ ] Executar o `.exe` portable.
- [ ] Confirmar splash.
- [ ] Confirmar abertura da janela principal apos health check.
- [ ] Abrir segunda instancia e confirmar foco na janela existente.
- [ ] Fechar app e confirmar encerramento do backend.
- [ ] Consultar `%APPDATA%\Monitoring Hub\startup.log` se houver lentidao.

### 20.7 Testes automatizados

- [ ] Rodar `npm test`.
- [ ] Rodar `node --check server.js`.
- [ ] Rodar `node --check public/app.js`.
- [ ] Rodar `node --check electron-app/main.js`.

## 21. Resumo operacional

O Monitoring Hub atual entrega:

- importacao local de empresas por Excel/CSV;
- persistencia local das empresas em SQLite;
- consulta manual de status nas APIs DIMEP/MADIS;
- cache curto de 60 segundos;
- busca e filtros por criticidade;
- visualizacao detalhada por relogio;
- app desktop Electron portable;
- testes minimos de core utilitario;
- protecao para nao expor `api_key` no frontend.

Funcionalidades como login, historico, alertas, relatorios e instalador permanecem fora do escopo atual.
