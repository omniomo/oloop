# Chrome Web Store listing — Oloop 0.7.1

Everything the developer dashboard asks for, in the order it asks. Copy each block into its field.
Images are in `store/images/` (made by `scripts/shots.mjs` + `scripts/store-images.mjs`).

## Package

- Upload: `dist/oloop-0.7.1.zip` (`npm run pack`).
- Languages come from `extension/_locales`: en (default), zh_CN, zh_TW, ja, ko, es, fr, de, pt_BR, pt_PT. The dashboard shows a listing tab for each one.

## Store listing tab

| Field | Value |
|---|---|
| Name | Oloop (from the manifest) |
| Summary | from the manifest, per language (`_locales/*/messages.json` → `description`) |
| Category | Social Networking |
| Language | English (default) + the 9 others above |
| Icon | `extension/icons/icon128.png` (96 px art, 16 px clear padding) |
| Small promo tile (440×280, required) | `store/images/promo-small-440x280.png` |
| Marquee (1400×560, optional) | `store/images/promo-marquee-1400x560.png` |
| Screenshots (1280×800, 1–5) | `store/images/<lang>/1-write.png` … `5-night.png` — upload each language's set on its tab; `en` on the default tab |
| Official URL | https://oloop.ooooomo.com (after verifying ooooomo.com in Search Console) |
| Homepage URL | https://oloop.ooooomo.com |
| Support URL | https://github.com/omniomo/oloop/issues |

Screenshot folders: `en`, `zh-Hans` → zh_CN, `zh-Hant` → zh_TW, `ja`, `ko`, `es`, `fr`, `de`, `pt` → pt_BR and pt_PT.

### Description — English (default)

```
Write once. Post to multi platforms.
Oloop fills in each post with your text and media.

Free and open source: https://github.com/omniomo/oloop
```

### Description — 简体中文 (zh_CN)

```
写一次，十个平台一起发。

Oloop 会把你的文字和素材填进各平台的发布页。
```

### Description — 繁體中文 (zh_TW)

```
寫一次，十個平台一起發。

Oloop 會把你的文字和素材填進各平台的發布頁。
```

### Description — 日本語 (ja)

```
一度書いて、10 のプラットフォームへ。

Oloop が各投稿画面に文章とメディアを入力します。
```

### Description — 한국어 (ko)

```
한 번 쓰고, 10개 플랫폼에 게시.

Oloop가 각 플랫폼의 작성 화면에 글과 미디어를 채워 줍니다.
```

### Description — Español (es)

```
Escribe una vez. Publica en diez plataformas.

Oloop rellena cada publicación con tu texto y tus archivos.
```

### Description — Français (fr)

```
Écrivez une fois. Publiez sur dix plateformes.

Oloop ajoute votre texte et vos médias à chaque publication.
```

### Description — Deutsch (de)

```
Einmal schreiben. Auf zehn Plattformen posten.

Oloop fügt deinen Text und deine Medien in jeden Beitrag ein.
```

### Description — Português (pt_BR, pt_PT)

```
Escreva uma vez. Publique em dez plataformas.

Oloop preenche cada publicação com seu texto e seus arquivos.
```

## Privacy practices tab

**Single purpose**

```
Oloop publishes one post to several social platforms at once: the user writes a draft in the side panel, and the extension fills it into each chosen platform's own compose page in the user's browser, waits for uploads, and sends it.
```

**Permission justifications**

| Permission | Justification |
|---|---|
| sidePanel | The draft, the platform choices and the publishing progress live in Chrome's side panel. |
| storage | Keeps the draft (title, text, per-platform settings), the theme and language choice, and the progress of the current run on the user's device. |
| unlimitedStorage | The images and videos of a draft are kept in IndexedDB on the device until the user posts or clears them; videos often exceed the default quota. |
| alarms | While a run is publishing, a periodic check notices a platform tab that stopped responding, so it can be retried or reported instead of waiting forever. |
| Host access (content scripts on x.com, twitter.com, threads.com/.net, instagram.com, tiktok.com, studio.youtube.com, pinterest.com, creator.xiaohongshu.com, member.bilibili.com, note.com, editor.note.com, blog.naver.com) | The extension works inside each platform's own compose page: it attaches the user's media, fills in the title and text, waits for the platform to finish processing, and presses send. It runs only on these sites and only acts in a tab it opened for a post. |

**Remote code:** No, I am not using remote code. (All JavaScript, translations and fonts ship in the package.)

**Data usage — what to tick**

- Website content: ticked. The extension reads the structure of the platforms' compose pages, and handles the text and media the user chose to post. It never leaves the device except into the platform the user posts to.
- Everything else (personally identifiable information, health, financial, authentication, personal communications, location, web history, user activity): not ticked.
- Certify all three: not sold to third parties; not used or transferred for purposes unrelated to the single purpose; not used to determine creditworthiness or for lending.

**Privacy policy URL:** https://oloop.ooooomo.com/privacy/

## Distribution tab

- Visibility: Public. Regions: all.
- Pricing: free (no in-app purchases; Ko-fi and GitHub Sponsors are plain links).

## Test instructions (for the reviewer)

```
No extension login is required. Sign in to X or another supported platform in Chrome.
1. Open Oloop from the toolbar.
2. Add an image and text, then select X or your platform.
3. Leave Auto-send off and click Post. Oloop opens the compose page, adds the media and text, and shows Ready to send. You can close the tab without posting.
Only X, Instagram and YouTube support Auto-send. The menu (···) changes language and theme or clears the draft.
```

## Before submitting

1. Developer account: one-time US$5 fee, 2-Step Verification on the Google account, trader / non-trader declaration (a trader's address and phone are shown publicly on the listing).
2. Verify ooooomo.com in Google Search Console with the same Google account, then choose it as the Official URL.
3. Deploy `site/` to oloop.ooooomo.com so the privacy policy URL resolves before review.
4. Upload the zip, fill the tabs above, Submit for review.
