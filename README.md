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
| **Inventory** | Shows your CS:R inventory after Discord login: skin image, name, type (Pistol, Rifle, SMG, Knife, Case, etc.), **float** with wear color (FN/MW/FT/WW/BS), **seed** (`#pattern`), and **coins**. Search and filter by name, item type, rarity, wear, and float sort — same idea as the [CSR Inventory Helper](https://github.com/smelbravo/CS-Restored-Inventory-Helper) extension filters. |
| **Settings** | Set the path to your game folder (`csgo.exe` / CS:R directory), custom launch args (e.g. `-novid -console -tickrate 128`), and UI language. |
| **Account** | Log in with Discord; hover your username to **log out**. Unverified accounts are marked in the top bar. |

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
1. Go to [Releases](https://github.com/fareederx/csr-launcher-x/releases/latest) and download the latest available version.
2. After installing the launcher, log in to your Discord account.
3. In the settings, select the path to `csgo.exe` (Important: select the `csgo.exe` file itself, not the csgo folder).
4. Enter additional launch parameters if needed.
5. Click the Play button.



# CS:R Launcher RU
> [!Important]
> Это **модифицированный форк** оригинального [CSR Launcher](https://github.com/fareederx/csr-launcher-x). Он активно поддерживается в этом репозитории ([smelbravo/csr-launcher-x](https://github.com/smelbravo/csr-launcher-x)) с дополнительными функциями и исправлениями. Оригинальный разработчик знает об этом форке и не возражал. Исходный проект: fareederx/csr-launcher-x.

## Инструкция
1. Перейдите в раздел [Releases](https://github.com/fareederx/csr-launcher-x/releases/latest) и скачайте последнюю доступную версию.
2. После установки лаунчера войдите в свой Discord аккаунт.
3. В настройках укажите путь до файла `csgo.exe` (Важно: именно до файла `csgo.exe`, а не до папки csgo).
4. При необходимости введите дополнительные параметры запуска.
5. Нажмите кнопку "Играть".



# CS:R Launcher DE
> [!Important]
> Dies ist ein **modifizierter Fork** des originalen [CSR Launcher](https://github.com/fareederx/csr-launcher-x). Er wird in diesem Repository ([smelbravo/csr-launcher-x](https://github.com/smelbravo/csr-launcher-x)) aktiv gepflegt — mit zusätzlichen Features und Fixes. Der Original-Entwickler ist über diesen Fork informiert und hatte keine Einwände. Upstream: fareederx/csr-launcher-x.

## Anleitung
1. Gehe zu [Releases](https://github.com/fareederx/csr-launcher-x/releases/latest) und lade die neueste verfügbare Version herunter.
2. Nach der Installation des Launchers melde dich mit deinem Discord-Konto an.
3. Wähle in den Einstellungen den Pfad zur Datei `csgo.exe` (Wichtig: wähle die Datei `csgo.exe` selbst, nicht den csgo-Ordner).
4. Gib bei Bedarf zusätzliche Startparameter ein.
5. Klicke auf die Schaltfläche „Spielen“.



# CS:R Launcher PT
> [!Important]
> Esta é uma **versão modificada** do launcher original ([fareederx/csr-launcher-x](https://github.com/fareederx/csr-launcher-x)). É mantida ativamente neste repositório ([smelbravo/csr-launcher-x](https://github.com/smelbravo/csr-launcher-x)) com funcionalidades e correções extra. O developer original está ciente deste fork e não se opôs. Projeto original: fareederx/csr-launcher-x.

## Instruções
1. Vai a [Releases](https://github.com/fareederx/csr-launcher-x/releases/latest) e descarrega a versão mais recente disponível.
2. Depois de instalar o launcher, inicia sessão com a tua conta Discord.
3. Nas definições, seleciona o caminho para `csgo.exe` (Importante: seleciona o ficheiro `csgo.exe`, não a pasta csgo).
4. Introduz parâmetros de arranque adicionais, se necessário.
5. Clica no botão «Jogar».



# CS:R Launcher ES
> [!Important]
> Este es un **fork modificado** del [CSR Launcher](https://github.com/fareederx/csr-launcher-x) original. Se mantiene activamente en este repositorio ([smelbravo/csr-launcher-x](https://github.com/smelbravo/csr-launcher-x)) con funciones y correcciones adicionales. El desarrollador original conoce este fork y no tuvo objeciones. Proyecto original: fareederx/csr-launcher-x.

## Instructions
1. Ve a [Releases](https://github.com/fareederx/csr-launcher-x/releases/latest) y descarga la versión más reciente disponible.
2. Después de instalar el launcher, inicia sesión con tu cuenta de Discord.
3. En la configuración, selecciona la ruta al archivo `csgo.exe` (Importante: selecciona el archivo `csgo.exe` directamente, no la carpeta csgo).
4. Introduce parámetros de inicio adicionales si los necesitas.
5. Haz clic en el botón Jugar.
