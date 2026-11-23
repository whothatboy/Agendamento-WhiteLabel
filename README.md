# 🗓️ Agenda White-Label — Sistema Multi-tenant de Agendamento Online

> **Sistema de agendamento online white-label de alta performance, projetado com arquitetura multi-tenant, prevenção matemática de overbooking via PostgreSQL GiST, Row Level Security (RLS) e mensageria assíncrona para lembretes automáticos via E-mail e WhatsApp.**

[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![Deno](https://img.shields.io/badge/Deno-000000?style=for-the-badge&logo=deno&logoColor=white)](https://deno.land/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/)
[![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)](https://developer.mozilla.org/)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)](https://developer.mozilla.org/)
[![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com/)
[![Twilio](https://img.shields.io/badge/Twilio-F22F46?style=for-the-badge&logo=twilio&logoColor=white)](https://www.twilio.com/)
[![Resend](https://img.shields.io/badge/Resend-000000?style=for-the-badge&logo=resend&logoColor=white)](https://resend.com/)

---

## 📌 Sumário
- [Sobre o Projeto](#-sobre-o-projeto)
- [Diferenciais de Engenharia](#-diferenciais-de-engenharia)
- [Funcionalidades Principais](#-funcionalidades-principais)
- [Arquitetura e Fluxo de Dados](#-arquitetura-e-fluxo-de-dados)
- [Estrutura do Projeto](#-estrutura-do-projeto)
- [Modelo de Dados (PostgreSQL)](#-modelo-de-dados-postgresql)
- [Configuração e Instalação](#-configura%C3%A7%C3%A3o-e-instala%C3%A7%C3%A3o)
- [Deploy em Produção](#-deploy-em-produ%C3%A7%C3%A3o)
- [Licença e Contato](#-licen%C3%A7a-e-contato)

---

## 💡 Sobre o Projeto

A **Agenda White-Label** é uma solução completa para empresas prestadoras de serviço (barbearias, pet shops, clínicas, salões de beleza, nail designers, etc.) gerenciarem agendamentos com clientes de forma independente e sem risco de conflitos de horários.

O projeto foi construído priorizando:
1. **Confiabilidade Absoluta de Dados**: Eliminação de condições de corrida (*race conditions*) direto no banco de dados.
2. **Arquitetura Multi-Tenant Elegante**: Uma única infraestrutura serve dezenas ou centenas de empresas com isolamento seguro, temas visuais dinâmicos e regras de negócio específicas por segmento.
3. **Custo de Infraestrutura Próximo de Zero**: Construído sobre arquitetura *Serverless* (Vercel + Supabase), sem necessidade de manter servidores dedicados ociosos.
4. **Performance & Leveza Extrema**: Frontend em Vanilla JavaScript puro (zero frameworks pesados ou dependências no client-side), garantindo carregamento instantâneo mesmo em redes móveis 3G/4G e pontuação 100 no Google Lighthouse.

---

## ⚙️ Diferenciais de Engenharia

### 1. Garantia Matemática Contra Overbooking (`btree_gist` Exclusion Constraint)
Em sistemas de agendamento convencionais, duas requisições paralelas podem ler o mesmo horário livre e criar reservas duplicadas (*race condition*). 
Neste projeto, a validação é aplicada atomicamente no nível de armazenamento do PostgreSQL utilizando a extensão `btree_gist`:

```sql
exclude using gist (
  empresa with =, 
  tstzrange(inicio, fim, '[)') with &&
) where (not cancelada);
```
Isso assegura que **é fisicamente impossível** o banco aceitar sobreposição temporal para a mesma empresa, independentemente do volume de acessos simultâneos.

### 2. Geração Dinâmica de Slots com Fuso Horário Nativo (PL/pgSQL RPC)
A função `public.horarios()` calcula em tempo real os horários disponíveis cruzando:
- Dias de atendimento configurados da empresa (`dias integer[]`);
- Horário de abertura e fechamento locais (`time`);
- Fuso horário IANA específico de cada empresa (`fuso text`, ex: `'America/Sao_Paulo'`);
- Duração individual de cada serviço (`minutos integer`);
- Intervalos já reservados e não cancelados.

### 3. Fila de Notificações Concorrente (`FOR UPDATE SKIP LOCKED`)
Para o envio de lembretes automáticos cerca de 24 horas antes do atendimento:
- A tabela `lembretes` funciona como uma **fila assíncrona** de alta performance;
- A função `public.proximo_lembrete()` seleciona os jobs pendentes utilizando `FOR UPDATE SKIP LOCKED`, garantindo que múltiplos executores nunca processem a mesma mensagem duas vezes;
- Suporte a idempotência e *exponential retry* (com re-agendamento de limites `429 Too Many Requests`).

### 4. Segurança Rigorosa com RLS (Row Level Security)
- O acesso a tabelas sensíveis é revogado do público geral (`public`, `anon`);
- Clientes realizam agendamentos apenas através de Stored Procedures (`agendar` / `agendar_com_lembrete`) com permissões `SECURITY DEFINER` e sanitização estrita via expressões regulares;
- A equipe de gestão acessa exclusivamente seus próprios atendimentos através de políticas vinculadas a `auth.uid()`.

---

## ✨ Funcionalidades Principais

### 🌐 Portal do Cliente (`index.html`)
- **White-label Dinâmico via URL**: Basta acessar `?empresa=slug-da-empresa` para que cores institucionais (`--brand`), nome, logo, catálogo de serviços e regras sejam carregados dinamicamente.
- **Campos Condicionais por Segmento**: Exibe automaticamente campos adicionais (ex.: *"Nome do pet"* para o segmento pet shop).
- **Seleção Inteligente de Data e Hora**: Carregamento em tempo real com indicador de status acessível (`aria-live="polite"`).
- **Lembretes Opcionais**: O cliente escolhe receber notificações por **E-mail** (via Resend) e/ou **WhatsApp** (via Twilio WhatsApp Business).
- **Modo Demonstração Integrado**: Funciona imediatamente mesmo sem banco de dados configurado, simulando todo o fluxo de reservas em memória.

### 👥 Portal da Equipe / Gestor (`equipe.html`)
- **Autenticação Segura**: Login corporativo via Supabase Auth (JWT).
- **Visão em Tempo Real**: Listagem ordenada dos próximos atendimentos convertidos no fuso horário local da loja.
- **Cancelamento com Desbloqueio Imediato**: O gestor pode cancelar um atendimento, liberando instantaneamente a vaga no calendário para outros clientes.

### 🤖 Automação em Segundo Plano (Edge Functions + Cron)
- **Supabase Edge Function** escrita em Deno e TypeScript.
- **pg_cron + pg_net**: Execução periódica a cada 5 minutos diretamente no Postgres.
- Integração robusta com as APIs de envio da **Resend** (e-mail transacional) e **Twilio** (WhatsApp Content API).

---

## 🏛️ Arquitetura e Fluxo de Dados

```text
[ Cliente / Navegador ]
        │
        ├──► [ index.html + app.js ]  (Frontend Vanilla JS / Vercel CDN)
        │            │
        │            ▼
        │    [ Supabase REST API & RPC ]
        │            │
        │            ▼
        │    [ PostgreSQL 15+ ]
        │      ├── Tabelas: empresas, servicos, reservas (Exclusion Constraint)
        │      ├── Fila: lembretes (SKIP LOCKED)
        │      └── RLS & Políticas de Segurança
        │
[ Agendador pg_cron ] ── (A cada 5 min via pg_net) ──► [ Edge Function (Deno) ]
                                                                │
                                              ┌─────────────────┴─────────────────┐
                                              ▼                                   ▼
                                       [ API Resend ]                     [ API Twilio ]
                                      (Lembrete E-mail)                 (Lembrete WhatsApp)
```

---

## 📁 Estrutura do Projeto

```text
agenda/
├── .gitignore
├── vercel.json                 # Configuração de hospedagem na Vercel
├── schema.sql                  # Estrutura completa do banco de dados e políticas RLS
│
├── public/                     # Aplicação Web Frontend
│   ├── index.html              # Interface de agendamento do cliente final
│   ├── equipe.html             # Painel administrativo da equipe
│   ├── style.css               # Estilos com design system em CSS Variables
│   ├── config.js               # Chaves públicas de conexão ao Supabase
│   ├── api.js                  # Cliente de requisições HTTP (Fetch wrapper)
│   ├── app.js                  # Lógica de negócio do fluxo de agendamento
│   ├── equipe.js               # Lógica do painel de controle e autenticação
│   └── fonts/                  # Tipografia local otimizada (DM Sans woff2)
│
└── supabase/                   # Módulos de Backend & Automação
    ├── config.toml             # Configuração do projeto Supabase CLI
    ├── lembretes.sql           # Migração da fila e funções de lembrete
    ├── cron-lembretes.sql      # Configuração do agendador periódico pg_cron
    └── functions/
        └── lembretes/
            └── index.ts        # Edge Function de processamento e envio
```

---

## 🗄️ Modelo de Dados (PostgreSQL)

| Tabela | Descrição | Principais Regras / Constraints |
| :--- | :--- | :--- |
| `empresas` | Lojas cadastradas no sistema multi-tenant | Chave primária `slug`, fuso horário IANA, paleta de cor hexadecimal, horários e dias de funcionamento. |
| `servicos` | Catálogo de serviços por empresa | Duração em minutos (5 a 480 min), valor monetário (`numeric(9,2)`), flag `ativo`. |
| `reservas` | Agendamentos confirmados | `GiST Exclusion Constraint` sobre o intervalo `[inicio, fim)` para impedir colisões. |
| `gestores` | Vínculo entre usuários Auth e empresas | Chave composta `(usuario, empresa)`, base para as políticas de RLS. |
| `lembretes` | Fila assíncrona de notificações | Estados: `pendente`, `processando`, `aceito`, `falhou`, `incerto`. Índice condicional em `previsto`. |

---

## 🚀 Configuração e Instalação

### 1. Clonar o Repositório
```bash
git clone https://github.com/SEU-USUARIO/agenda-white-label.git
cd agenda-white-label/agenda
```

### 2. Execução Rápida (Modo Demonstração)
Se você apenas deseja ver o frontend funcionando, basta servir a pasta `public/` com qualquer servidor estático (como a extensão Live Server do VS Code ou `npx serve public`).
- A aplicação detecta que as credenciais em `public/config.js` estão em branco e entra automaticamente no **Modo Demonstração interativo**.

### 3. Configuração Completa com Banco de Dados (Supabase)
1. Crie um projeto no [Supabase](https://supabase.com).
2. No painel do Supabase, acesse **SQL Editor**:
   - Cole e execute o arquivo `schema.sql` (cria tabelas, índices GiST, RPCs e empresa inicial);
   - Cole e execute o arquivo `supabase/lembretes.sql` (adiciona suporte a notificações e fila).
3. Conecte o frontend:
   - Abra `public/config.js` e preencha com a URL do seu projeto e a chave anônima (`anon public`):
   ```javascript
   window.configAgenda = {
     url: 'https://seu-projeto.supabase.co',
     chave: 'sua-chave-anon-publica'
   };
   ```

### 4. Ativando o Agendador de Lembretes (Opcional)
Consulte as variáveis no painel do Supabase (**Edge Functions → Secrets**):
- `RESEND_API_KEY` e `REMINDER_FROM` (para e-mails);
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` e `TWILIO_CONTENT_SID` (para WhatsApp);
- `REMINDER_CRON_SECRET` (segredo de autenticação do worker).

Faça o deploy da Edge Function com a CLI do Supabase:
```bash
npx supabase login
npx supabase functions deploy lembretes --project-ref SEU_PROJECT_REF --no-verify-jwt
```
E configure o job executando o script `supabase/cron-lembretes.sql` no SQL Editor.

---

## ☁️ Deploy em Produção

### Frontend (Vercel)
O projeto já conta com o arquivo `vercel.json` configurado apontando a pasta `public` como diretório raiz:
```bash
npx vercel
```
Ou simplesmente conecte seu repositório do GitHub à [Vercel](https://vercel.com).

---

## 👨‍💻 Autor

Desenvolvido por **Sergio D. Gali**.

Projeto concebido para demonstrar proficiência em:
- Arquitetura de Software Multi-Tenant
- Modelagem Relacional Avançada & Concorrência em PostgreSQL
- Segurança de Aplicações Web (RLS, Sanitização, Principle of Least Privilege)
- Engenharia Serverless & Filas Assíncronas Distribuídas
- Frontend Otimizado, Acessível e Responsivo

---
*Gostou do projeto? Deixe uma ⭐️ no repositório!*
