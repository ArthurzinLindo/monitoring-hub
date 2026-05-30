# Monitoring Hub - Painel de Monitoria de Relógios

Aplicação local para monitoramento da comunicação de relógios de ponto de empresas integradas aos sistemas DIMEP e MADIS.

O projeto roda como servidor local em Node.js/Express e também é distribuído como aplicativo desktop Windows em formato Electron portable. Nesta etapa, não há instalador NSIS/MSI.

## Stack atual

- **Backend:** Node.js + Express
- **Frontend:** HTML, CSS e JavaScript puro
- **Persistência local:** SQLite via sql.js
- **Banco local:** `%APPDATA%\Monitoring Hub\painel-monitoria.sqlite`
- **Desktop:** Electron portable
- **Testes:** node:test

## Como executar localmente

No diretório do projeto:

```bash
npm install
npm start
```

A aplicação ficará disponível em:

```text
http://127.0.0.1:8000
```

O backend escuta somente em `127.0.0.1`.

## PowerShell auxiliar

Caso `node` ou `npm` não estejam configurados corretamente no PATH:

```powershell
.\run-local.ps1
```

Se a política do PowerShell bloquear scripts locais:

```powershell
powershell -ExecutionPolicy Bypass -File .\run-local.ps1
```

## Como gerar o Electron portable

O app desktop fica em:

```text
electron-app/
```

Para instalar as dependências e gerar a build:

```bash
npm install --prefix electron-app
npm run build --prefix electron-app
```

A versão do desktop é definida em:

```text
electron-app/package.json
```

O Electron Builder utiliza essa versão para gerar o arquivo portable em `dist/`, no formato:

```text
Monitoring-Hub-<versao>-Portable.exe
```

A primeira release estável oficial é:

```text
Monitoring Hub 1.0.0
```

Arquivo da release estável:

```text
Monitoring-Hub-1.0.0-Portable.exe
```

O build é bloqueado caso já exista um executável portable com a mesma versão em `dist/`, evitando sobrescrever uma release aprovada.

Antes de gerar uma nova build, incremente a versão:

```bash
npm run version:patch --prefix electron-app
npm run version:minor --prefix electron-app
npm run version:major --prefix electron-app
```

O script de limpeza do build remove apenas artefatos temporários, como `win-unpacked`, preservando executáveis portable no padrão:

```text
Monitoring-Hub-*-Portable.exe
```

Não há instalador nesta etapa.

## Endpoints locais

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/` | Entrega a interface web |
| GET | `/api/health` | Health check local |
| GET | `/api/template/companies` | Baixa o modelo Excel de empresas |
| GET | `/api/companies` | Lista empresas carregadas/persistidas, sem expor `api_key` |
| POST | `/api/import-companies` | Importa Excel/CSV e substitui a base local |
| POST | `/api/pull-status` | Consulta status nas APIs externas quando acionado pelo usuário |

## Importação de empresas

Formatos aceitos:

- `.xlsx`
- `.xls`
- `.csv`

Colunas obrigatórias, com pequenas variações aceitas:

- Nome da empresa
- CNPJ
- API Key
- Sistema: DIMEP ou MADIS

Uma nova importação substitui a base anterior no SQLite local e limpa o cache de status.

## Persistência local

As empresas importadas ficam salvas em:

```text
%APPDATA%\Monitoring Hub\painel-monitoria.sqlite
```

O sistema cria o banco automaticamente caso ele ainda não exista.

### Dados salvos no banco

- Nome da empresa
- CNPJ/identificador
- CNPJ somente com números
- API key
- Sistema
- Datas de criação e atualização

### Dados não salvos no banco

- Resultado das consultas de status
- Histórico de comunicação
- Relatórios
- Logs de relógios

A `api_key` fica restrita ao backend/banco local. Ela não deve aparecer no frontend, logs ou respostas públicas da aplicação.

## Regras de negócio

- Relógios com `RelogioDesativado = true` são ignorados.
- Última coleta acima de 1 hora é tratada como **Sem comunicação**.
- Datas são convertidas para o horário de Brasília.
- Existe cache de status por 60 segundos.
- As APIs externas não são chamadas ao iniciar o sistema.
- A consulta de status ocorre apenas quando o usuário clica em **Puxar Status**.
- Existem regras internas de tratamento para cenários específicos de integração, como bloqueio de equipamentos desativados e normalização dos dados retornados pelas APIs externas.

## Busca e filtros no frontend

A lista de empresas possui controles discretos acima dos cards.

### Busca

A busca pode ser realizada por:

- Nome da empresa
- CNPJ formatado
- CNPJ somente com números

Quando não há resultado no sistema atual, a busca pode alternar automaticamente entre DIMEP e MADIS para localizar a empresa correspondente.

### Filtros

Filtros disponíveis:

- Todas
- Sem comunicação
- Comunicando

A ordenação padrão prioriza empresas com maior criticidade e, dentro de cada grupo, ordena por nome.

Também existe o botão **A-Z**, que permite alternar a ordenação alfabética.

## Electron portable

O Electron:

- Inicia o backend interno;
- Aguarda o `/api/health` antes de abrir a janela principal;
- Usa trava de instância única;
- Encerra o backend ao fechar o app;
- Usa `nodeIntegration: false`;
- Usa `contextIsolation: true`;
- Usa `sandbox: true`;
- Grava logs de startup em `%APPDATA%\Monitoring Hub\startup.log`;
- Permite minimizar para a bandeja do Windows;
- Permite configurar a inicialização junto com o Windows.

A lentidão inicial do portable pode ocorrer antes do Electron iniciar, devido à extração temporária do executável e/ou verificação do antivírus. O backend interno, SQLite e health check já foram otimizados.

## Testes

Para executar os testes:

```bash
npm test
```

Os testes atuais cobrem utilitários de:

- CNPJ/identificador
- Empresa pública sem `api_key`
- Datas e regra de coleta vencida
- Identidade de relógio
- Sanitização de erros e segredos

## Limitações atuais

- Sem login.
- Sem histórico persistente de status.
- Sem alertas automáticos.
- Sem relatórios exportáveis.
- Sem instalador nesta etapa.

## Documentação completa

Veja também:

```text
DOCUMENTACAO_COMPLETA.md
```

## Autor

Desenvolvido por **Arthur Figueiredo Saldanha**.
