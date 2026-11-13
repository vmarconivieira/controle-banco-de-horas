# ⏱️ Controle de Ponto e Banco de Horas

[![GitHub Pages](https://img.shields.io/badge/Deploy-GitHub%20Pages-0f6b45?style=flat&logo=github)](https://vmarconivieira.github.io/controle-banco-de-horas/)
[![PWA Ready](https://img.shields.io/badge/PWA-Offline--First-10b981?style=flat&logo=pwa)](https://vmarconivieira.github.io/controle-banco-de-horas/)
[![Backend](https://img.shields.io/badge/Backend-Supabase-3ecf8e?style=flat&logo=supabase)](https://supabase.com)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Sistema profissional de **Controle de Ponto e Banco de Horas** desenvolvido como uma Single Page Application (SPA) e Progressive Web App (PWA) de alto padrão visual (padrão Lovable / UI Craft), com suporte a operação **Offline-First**, sincronização em tempo real na nuvem e importador inteligente de cartões de ponto brasileiros.

🔗 **Acesse a aplicação em produção:**  
👉 **[https://vmarconivieira.github.io/controle-banco-de-horas/](https://vmarconivieira.github.io/controle-banco-de-horas/)**

---

## 🚀 Principais Funcionalidades

- **Autenticação Direta por Username**: Login e cadastro simplificados exclusivamente por nome de usuário (mapeamento transparente na API, sem necessidade de informar e-mail na interface).
- **Offline-First & Sincronização Inteligente**:
  - Snapshot local instantâneo (`localStorage`).
  - Fila de mutações offline (`OfflineRepository`) com envio automático para a nuvem assim que a conexão for restabelecida.
  - Indicador visual em tempo real de status da conexão (`Online`, `Sincronizando`, `Offline`).
- **Importador Inteligente de Ponto**:
  - Leitura e processamento de arquivos `.csv`, `.tsv` ou texto colado.
  - Reconhecimento automático dos formatos de relatórios de ponto mais utilizados no Brasil (Ahgora, Secullum, Senior, Dimep, etc.).
  - Filtro contra cabeçalhos e metadados, cálculo automático de batidas (Entrada 1, Saída 1, Entrada 2, Saída 2), total trabalhado e saldo de horas diário (base CLT 8h).
  - Ação direta para lançar batidas importadas no banco de horas.
- **Painel Administrativo Completo**:
  - Listagem de usuários cadastrados com métricas de lançamentos (`admin_list_users`).
  - Redefinição administrativa de senhas (`admin_reset_password`).
  - Criação de novos usuários com definição de permissão (`admin` / `user`).
  - Exclusão segura de usuários (`admin_delete_user`).
- **Autosserviço do Usuário**:
  - Modal seguro para troca da própria senha.
  - Exportação completa da base de lançamentos em arquivo `.csv`.
  - Simulador de metas e projeção de saldo futuro.
  - Planejamento de folgas e compensações com metas agendadas.
- **Design System & UX**:
  - Modo Escuro (Dark Mode) e Modo Claro persistentes.
  - Design tokens modernos e responsivos para Desktop, Tablets e Smartphones.
  - Ícones Lucide SVG inline de alta definição.
  - Instalável como aplicativo nativo em Android, iOS, Windows e macOS via Service Worker e Web App Manifest.

---

## 🏛️ Arquitetura de Arquivos

```
├── index.html                     # Shell principal da aplicação SPA e PWA
├── Controle_Banco_de_Horas.html   # Versão consolidada autônoma (backup offline)
├── manifest.webmanifest           # Manifesto de instalação PWA
├── sw.js                          # Service Worker com cache e fallback offline
├── favicon.svg                    # Ícone SVG do aplicativo
├── css/
│   └── style.css                  # Design Tokens, temas dark/light e layout responsivo
├── js/
│   ├── supabase.js                # Cliente REST nativo em fetch (sem SDK pesado)
│   ├── offline.js                 # Gerenciador de snapshot local e fila de sincronização
│   ├── parser.js                  # Parser inteligente de cartões ponto e aritmética de horas
│   └── app.js                     # Controlador SPA, rotas, regras de negócio e painel admin
├── icons/                         # Ícones da aplicação em 192x192, 512x512 e SVG
└── .github/workflows/
    └── deploy.yml                 # Deploy contínuo automático no GitHub Pages
```

---

## ⚙️ Backend & Infraestrutura (Supabase)

- **Instância Supabase**: `https://zxkikslpehynkhdyhugq.supabase.co`
- **Tabelas do Sistema**:
  - `timebank_profiles`: Dados de perfil, nomes e papéis dos usuários (`admin` / `user`).
  - `timebank_entries`: Lançamentos diários do banco de horas conciliado.
  - `timebank_point_entries`: Registros brutos do espelho de ponto importado.
  - `timebank_planning`: Metas e agendamentos de folgas ou plantões extras.
  - `timebank_settings`: Preferências gerais do sistema.
- **Funções Remotas (RPCs)**:
  - `admin_list_users()`: Retorna listagem de usuários com contagem de lançamentos para administradores.
  - `admin_reset_password(target_user_id, new_password)`: Permite a redefinição de credenciais de colaboradores.
  - `admin_delete_user(target_user_id)`: Exclui usuários e seus registros vinculados de forma segura.

---

## 👥 Contas Padrão Pré-configuradas

| Usuário | Perfil / Papel | Descrição |
|---|---|---|
| `vmarconi` | **Administrador** | Usuário principal do sistema |
| `admin` | **Administrador** | Administrador master do sistema |

> **Nota**: Para segurança, novas senhas podem ser redefinidas a qualquer momento pelo menu de usuário ou pelo Painel Administrativo.

---

## 📲 Instalação PWA

1. Acesse o link no Chrome, Safari, Edge ou navegador mobile compatível.
2. No menu do navegador ou barra de endereços, selecione **"Adicionar à Tela de Início"** ou **"Instalar Aplicativo"**.
3. O aplicativo funcionará de forma independente de navegador com cache local e acesso offline.

---

## 🛠️ Deploy Contínuo

O repositório está configurado para deploy automático via **GitHub Actions** (`.github/workflows/deploy.yml`). Qualquer alteração na branch `main` dispara automaticamente a compilação e publicação atualizada no **GitHub Pages**.
