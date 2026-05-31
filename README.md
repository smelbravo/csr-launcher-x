# CS:R Launcher EN

> [!Important]
> This launcher will no longer receive updates for the time being. A new version is actively under development. Stay tuned for news on our Discord server: https://discord.gg/pbXWCccD7d

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
> Для данного лаунчера больше не будет выпускаться обновлений. Сейчас активно разрабатывается новая версия, следите за новостями на нашем Discord сервере: https://discord.gg/pbXWCccD7d

## Инструкция
1. Перейдите в раздел [Releases](https://github.com/fareederx/csr-launcher-x/releases/latest) и скачайте последнюю доступную версию.
2. После установки лаунчера войдите в свой Discord аккаунт.
3. В настройках укажите путь до файла `csgo.exe` (Важно: именно до файла `csgo.exe`, а не до папки csgo).
4. При необходимости введите дополнительные параметры запуска.
5. Нажмите кнопку "Играть".



# CS:R Launcher DE
> [!Important]
> Für diesen Launcher werden vorerst keine weiteren Updates veröffentlicht. Eine neue Version wird aktiv entwickelt. Neuigkeiten auf unserem Discord-Server: https://discord.gg/pbXWCccD7d

## Anleitung
1. Gehe zu [Releases](https://github.com/fareederx/csr-launcher-x/releases/latest) und lade die neueste verfügbare Version herunter.
2. Nach der Installation des Launchers melde dich mit deinem Discord-Konto an.
3. Wähle in den Einstellungen den Pfad zur Datei `csgo.exe` (Wichtig: wähle die Datei `csgo.exe` selbst, nicht den csgo-Ordner).
4. Gib bei Bedarf zusätzliche Startparameter ein.
5. Klicke auf die Schaltfläche „Spielen“.



# CS:R Launcher PT
> [!Important]
> Este launcher deixará de receber atualizações por agora. Está em desenvolvimento uma nova versão. Acompanha as novidades no nosso servidor Discord: https://discord.gg/pbXWCccD7d

## Instruções
1. Vai a [Releases](https://github.com/fareederx/csr-launcher-x/releases/latest) e descarrega a versão mais recente disponível.
2. Depois de instalar o launcher, inicia sessão com a tua conta Discord.
3. Nas definições, seleciona o caminho para `csgo.exe` (Importante: seleciona o ficheiro `csgo.exe`, não a pasta csgo).
4. Introduz parâmetros de arranque adicionais, se necessário.
5. Clica no botão «Jogar».



# CS:R Launcher ES
> [!Important]
> Este launcher dejará de recibir actualizaciones por el momento. Actualmente se está desarrollando activamente una nueva versión. Mantente atento a las novedades en nuestro servidor de Discord: https://discord.gg/pbXWCccD7d

## Instructions
1. Ve a [Releases](https://github.com/fareederx/csr-launcher-x/releases/latest) y descarga la versión más reciente disponible.
2. Después de instalar el launcher, inicia sesión con tu cuenta de Discord.
3. En la configuración, selecciona la ruta al archivo `csgo.exe` (Importante: selecciona el archivo `csgo.exe` directamente, no la carpeta csgo).
4. Introduce parámetros de inicio adicionales si los necesitas.
5. Haz clic en el botón Jugar.
