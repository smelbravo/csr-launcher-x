# CS:R Launcher EN

> [!Important]
> This is a **community-modified fork** of the original [CSR Launcher](https://github.com/fareederx/csr-launcher-x). It is actively maintained in this repository ([smelbravo/csr-launcher-x](https://github.com/smelbravo/csr-launcher-x)) with additional features and fixes. The original developer is aware of this fork and had no objections. For the upstream project, see fareederx/csr-launcher-x.

## About

**CSR Launcher** is a desktop companion app for [Counter-Strike: Restored](https://csrestored.fun) (CS:R). It handles Discord login, game updates, and launching `csr.exe` from your local CS:GO / CS:R folder — so you can jump into the game without opening the website every time.

Built with **Electron**, it runs on Windows and provides a lightweight UI for everyday CS:R use.

### What it does

| Area | Description |
|------|-------------|
| **Play** | Checks for missing or outdated game files, downloads updates if needed, then launches CS:R with your saved launch arguments and Discord session token. After launch you can **close the launcher** — the game keeps running. |
| **Matchmaking** | Full lobby UI (modes, regions, party invites) and Phoenix WebSocket integration are implemented on `develop`, but the page currently shows **Coming soon** while matchmaking is being stabilised. |
| **Leaderboard** | Paginated CS:R leaderboard with search. Click any player to open their profile. |
| **History** | Your recent matches with score, K/D/A, KDR, map and mode. Click a row to open the full **match detail** scoreboard (teams, MVPs, demo download). |
| **Player profiles** | Site-style profile for any player (including yourself via the top bar): avatar, country flag, ELO, winrate, KDR, rating, kills/deaths/matches/wins, paginated match history, links to **Steam**, **SteamDB** and **[FaceitPerf](https://faceitperf.pro)** (uses linked **Steam ID**, not CS:R nick). From other players' profiles you can **Watch inventory** or open the profile on csrestored.fun. |
| **Inventory** | Your CS:R inventory after Discord login: skin image (CDN), name, type, **float** with wear colour (FN/MW/FT/WW/BS), **seed**, **Doppler / Case Hardened** pattern badges, and **coins** in the header. Search and filter by name, type, rarity, wear, Doppler phase, CH tier, and float sort — aligned with the [CSR Inventory Helper](https://github.com/smelbravo/CS-Restored-Inventory-Helper) extension. Paginated grid (50 items per page). |
| **Other players' inventory** | Read-only inventory view from a player's profile, with the same filters and skin images. Back returns to that profile. |
| **Friends** | Friends list synced with CS:R (`/users/friends`): pending incoming/outgoing requests, accept, decline, delete, invite by user ID. **Online status** via a hidden site session (`site-presence.js`). Click a friend to open their profile. |
| **Match detail** | Full scoreboard for any match. Click a player to open their profile. **Back** is context-aware: from a profile's history it returns to that profile; from your History tab it returns to History. |
| **Settings** | Set the path to your game folder (`csgo.exe` / CS:R directory), custom launch args (e.g. `-novid -console -tickrate 128`), and UI language. |
| **Account** | Log in with Discord; click your avatar/name to open your profile. Hover your username to **log out**. Unverified accounts are marked in the top bar. |

### Recent updates (`develop` · v1.0.2)

- Player profiles with stats, history, external links and inventory button
- Leaderboard and personal match history with match detail view
- Friends page with online presence, invites and request handling
- Inventory overhaul: rarity colours, Doppler/CH badges, advanced filters, pagination, correct CDN skin IDs for own vs other players' inventories
- Navigation fixes: inventory tab no longer stuck on another player's banner; profile → match → back returns to the correct profile
- FaceitPerf link uses Steam ID instead of CS:R username
- Matchmaking UI and WebSocket code present but **disabled** (`Coming soon`) until stable
- i18n: new strings in English, Portuguese (pt-PT), German, Spanish and Russian

### Languages

English, Portuguese (pt-PT), German, Spanish, and Russian — selectable in Settings. Custom language packs can be dropped into the `custom_lang/` folder next to the installed app.

### Requirements

- **Windows** (x64)
- A valid **Discord** account linked to CS:R
- CS:R / CS:GO files installed locally (`csr.exe` in your game folder)
- **Administrator** rights (required by the installer and game launch flow)

### Build from source

```bash
npm install
npm start          # dev mode
npm run build:win  # Windows installer → dist/CSR Launcher Setup x.x.x.exe
```

The NSIS installer lets you **choose the install folder** (not one-click only).

Stable releases: [GitHub Releases](https://github.com/smelbravo/csr-launcher-x/releases)

## Instructions
1. Go to [Releases](https://github.com/smelbravo/csr-launcher-x/releases/latest) and download the latest available version.
2. After installing the launcher, log in to your Discord account.
3. In the settings, select the path to `csgo.exe` (Important: select the `csgo.exe` file itself, not the csgo folder).
4. Enter additional launch parameters if needed.
5. Click the Play button.



# CS:R Launcher RU
> [!Important]
> Это **модифицированный форк** оригинального [CSR Launcher](https://github.com/fareederx/csr-launcher-x). Он активно поддерживается в этом репозитории ([smelbravo/csr-launcher-x](https://github.com/smelbravo/csr-launcher-x)) с дополнительными функциями и исправлениями. Оригинальный разработчик знает об этом форке и не возражал. Исходный проект: fareederx/csr-launcher-x.

Полный список функций — в английской секции выше (Recent updates · v1.0.2).

## Инструкция
1. Перейдите в раздел [Releases](https://github.com/smelbravo/csr-launcher-x/releases/latest) и скачайте последнюю доступную версию.
2. После установки лаунчера войдите в свой Discord аккаунт.
3. В настройках укажите путь до файла `csgo.exe` (Важно: именно до файла `csgo.exe`, а не до папки csgo).
4. При необходимости введите дополнительные параметры запуска.
5. Нажмите кнопку "Играть".



# CS:R Launcher DE
> [!Important]
> Dies ist ein **modifizierter Fork** des originalen [CSR Launcher](https://github.com/fareederx/csr-launcher-x). Er wird in diesem Repository ([smelbravo/csr-launcher-x](https://github.com/smelbravo/csr-launcher-x)) aktiv gepflegt — mit zusätzlichen Features und Fixes. Der Original-Entwickler ist über diesen Fork informiert und hatte keine Einwände. Upstream: fareederx/csr-launcher-x.

Vollständige Feature-Liste siehe englische Sektion oben (Recent updates · v1.0.2).

## Anleitung
1. Gehe zu [Releases](https://github.com/smelbravo/csr-launcher-x/releases/latest) und lade die neueste verfügbare Version herunter.
2. Nach der Installation des Launchers melde dich mit deinem Discord-Konto an.
3. Wähle in den Einstellungen den Pfad zur Datei `csgo.exe` (Wichtig: wähle die Datei `csgo.exe` selbst, nicht den csgo-Ordner).
4. Gib bei Bedarf zusätzliche Startparameter ein.
5. Klicke auf die Schaltfläche „Spielen“.



# CS:R Launcher PT
> [!Important]
> Esta é uma **versão modificada** do launcher original [CSR Launcher](https://github.com/fareederx/csr-launcher-x). É mantida ativamente neste repositório ([smelbravo/csr-launcher-x](https://github.com/smelbravo/csr-launcher-x)) com funcionalidades e correções extra. O developer original está ciente deste fork e não se opôs. Projeto original: fareederx/csr-launcher-x.

### Funcionalidades

| Área | Descrição |
|------|-----------|
| **Jogar** | Atualiza ficheiros em falta e lança o CS:R. Podes fechar o launcher — o jogo continua a correr. |
| **Matchmaking** | UI de lobby implementada, mas página em **Em breve** enquanto o matchmaking é estabilizado. |
| **Leaderboard** | Classificação paginada com pesquisa; clica num jogador para ver o perfil. |
| **Histórico** | As tuas partidas recentes; clica numa linha para ver o scoreboard completo e descarregar demo. |
| **Perfis** | Estatísticas, histórico paginado, links Steam / SteamDB / FaceitPerf (Steam ID), botão **Ver inventário** noutros jogadores. |
| **Inventário** | Skins com float, seed, badges Doppler/CH, moedas, filtros avançados e paginação. |
| **Inventário de outros** | Vista só de leitura a partir do perfil; voltar regressa ao perfil correto. |
| **Amigos** | Lista, pedidos pendentes, convites, estado online; clica para abrir perfil. |
| **Detalhe de partida** | Scoreboard completo; **Voltar** regressa ao perfil ou ao histórico consoante a origem. |

### Novidades recentes (`develop` · v1.0.2)

- Perfis de jogadores, leaderboard, histórico e detalhe de partidas
- Página de amigos com presença online
- Inventário renovado (filtros, Doppler/CH, imagens CDN corrigidas)
- Correções de navegação (inventário, perfil → partida → voltar)
- Link FaceitPerf com Steam ID
- Matchmaking desativado temporariamente («Em breve»)

## Instruções
1. Vai a [Releases](https://github.com/smelbravo/csr-launcher-x/releases/latest) e descarrega a versão mais recente disponível.
2. Depois de instalar o launcher, inicia sessão com a tua conta Discord.
3. Nas definições, seleciona o caminho para `csgo.exe` (Importante: seleciona o ficheiro `csgo.exe`, não a pasta csgo).
4. Introduz parâmetros de arranque adicionais, se necessário.
5. Clica no botão «Jogar».



# CS:R Launcher ES
> [!Important]
> Este es un **fork modificado** del [CSR Launcher](https://github.com/fareederx/csr-launcher-x) original. Se mantiene activamente en este repositorio ([smelbravo/csr-launcher-x](https://github.com/smelbravo/csr-launcher-x)) con funciones y correcciones adicionales. El desarrollador original conoce este fork y no tuvo objeciones. Proyecto original: fareederx/csr-launcher-x.

Lista completa de funciones en la sección en inglés (Recent updates · v1.0.2).

## Instructions
1. Ve a [Releases](https://github.com/smelbravo/csr-launcher-x/releases/latest) y descarga la versión más reciente disponible.
2. Después de instalar el launcher, inicia sesión con tu cuenta de Discord.
3. En la configuración, selecciona la ruta al archivo `csgo.exe` (Importante: selecciona el archivo `csgo.exe` directamente, no la carpeta csgo).
4. Introduce parámetros de inicio adicionales si los necesitas.
5. Haz clic en el botón Jugar.
