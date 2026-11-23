# Chrome Web Store listing — Oloop 0.6.1

Everything the developer dashboard asks for, in the order it asks. Copy each block into its field.
Images are in `store/images/` (made by `scripts/shots.mjs` + `scripts/store-images.mjs`).

## Package

- Upload: `dist/oloop-0.6.1.zip` (`npm run pack`).
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
Write once. Post to ten platforms.

Oloop opens each platform’s own composer side by side, in the browser you are already signed into. Add your images, video, title and text once. Oloop uploads the media, fills in every post, waits for each platform to finish processing, and checks the text before anything is sent.

• X, Threads, Instagram, RedNote (Xiaohongshu), TikTok, YouTube, Bilibili, Pinterest, note and Naver Blog
• Its own title, text, media and cover for each platform when you need them
• Pick a video frame or upload an image as the cover
• Sends for you, or stops one step short so you press send yourself
• Clear progress, links to every post, one-click retry
• Light and dark, in nine languages

No API keys and no business accounts. No servers and no analytics: your drafts and media stay on your computer.

Free and open source: https://github.com/omniomo/oloop

Oloop is not affiliated with any of these platforms.
```

### Description — 简体中文 (zh_CN)

```
写一次，十个平台一起发。

Oloop 在你已登录的浏览器里，同时打开各平台自己的发布页。图片、视频、标题和正文只放一次，它负责上传、逐个填好，等每个平台处理完素材、核对过文字，才会发出。

• X、Threads、Instagram、小红书、TikTok、YouTube、B站、Pinterest、note、Naver 博客
• 需要时可以给每个平台单独设置标题、正文、素材和封面
• 封面可以从视频里选一帧，也可以上传图片
• 可以自动发送，也可以停在最后一步由你来点
• 进度清楚，每条帖子都有链接，失败的一键重试
• 浅色和深色，支持九种语言

不用 API，不用商业账号。没有服务器，没有统计：草稿和素材只存在你的电脑里。

免费开源：https://github.com/omniomo/oloop

Oloop 与上述平台没有关联。
```

### Description — 繁體中文 (zh_TW)

```
寫一次，十個平台一起發。

Oloop 在你已登入的瀏覽器裡，同時開啟各平台自己的發布頁。圖片、影片、標題和內文只放一次，它負責上傳、逐一填好，等每個平台處理完素材、核對過文字，才會發出。

• X、Threads、Instagram、小紅書、TikTok、YouTube、Bilibili、Pinterest、note、Naver 部落格
• 需要時可以為每個平台單獨設定標題、內文、素材和封面
• 封面可以從影片裡選一格畫面，也可以上傳圖片
• 可以自動傳送，也可以停在最後一步由你來點
• 進度清楚，每則貼文都有連結，失敗的一鍵重試
• 淺色和深色，支援九種語言

不用 API，不用商業帳號。沒有伺服器，沒有統計：草稿和素材只存在你的電腦裡。

免費開源：https://github.com/omniomo/oloop

Oloop 與上述平台沒有關聯。
```

### Description — 日本語 (ja)

```
一度書いて、10 のプラットフォームへ。

Oloop は、ログイン済みのブラウザで各プラットフォームの投稿画面を並べて開きます。画像・動画・タイトル・本文を一度入れるだけで、アップロードと入力を行い、各プラットフォームの処理が終わってテキストを確認できてから送信します。

• X、Threads、Instagram、RedNote（小紅書）、TikTok、YouTube、Bilibili、Pinterest、note、NAVER ブログ
• 必要に応じて、プラットフォームごとにタイトル・本文・メディア・カバーを設定
• カバーは動画のフレームから選ぶか、画像をアップロード
• 自動送信も、最後の一歩で止めて自分で送信することも可能
• 進行状況がひと目でわかり、投稿へのリンクとワンクリック再試行つき
• ライトとダーク、9 つの言語に対応

API キーもビジネスアカウントも不要。サーバーも解析もありません。下書きとメディアはあなたのコンピューターにだけ保存されます。

無料・オープンソース：https://github.com/omniomo/oloop

Oloop はこれらのプラットフォームとは関係ありません。
```

### Description — 한국어 (ko)

```
한 번 쓰고, 10개 플랫폼에 게시.

Oloop는 이미 로그인된 브라우저에서 각 플랫폼의 작성 화면을 나란히 엽니다. 이미지, 동영상, 제목, 본문을 한 번만 넣으면 업로드하고 게시물을 채운 뒤, 각 플랫폼의 처리가 끝나고 글이 확인되어야 보냅니다.

• X, Threads, Instagram, 샤오홍슈, TikTok, YouTube, Bilibili, Pinterest, note, 네이버 블로그
• 필요하면 플랫폼마다 제목, 본문, 미디어, 커버를 따로 설정
• 커버는 동영상 프레임에서 고르거나 이미지를 업로드
• 자동으로 보내거나, 마지막 단계에서 멈추고 직접 보내기
• 한눈에 보이는 진행 상황, 게시물 링크, 원클릭 다시 시도
• 라이트와 다크, 9개 언어 지원

API 키도 비즈니스 계정도 필요 없습니다. 서버도 분석도 없습니다. 초안과 미디어는 내 컴퓨터에만 저장됩니다.

무료 오픈소스: https://github.com/omniomo/oloop

Oloop는 이 플랫폼들과 관련이 없습니다.
```

### Description — Español (es)

```
Escribe una vez. Publica en diez plataformas.

Oloop abre el editor de cada plataforma a la vez, en el navegador donde ya tienes la sesión iniciada. Añade imágenes, vídeo, título y texto una sola vez: sube los archivos, rellena cada publicación y espera a que cada plataforma termine de procesarlos y a que el texto cuadre antes de enviar nada.

• X, Threads, Instagram, RedNote (Xiaohongshu), TikTok, YouTube, Bilibili, Pinterest, note y Blog de Naver
• Título, texto, archivos y portada propios para cada plataforma cuando los necesites
• Elige un fotograma del vídeo o sube una imagen como portada
• Envía por ti, o se detiene en el último paso para que pulses enviar
• Progreso claro, enlaces a cada publicación y reintento con un clic
• Claro y oscuro, en nueve idiomas

Sin claves de API ni cuentas de empresa. Sin servidores ni analíticas: tus borradores y archivos se quedan en tu ordenador.

Gratis y de código abierto: https://github.com/omniomo/oloop

Oloop no está afiliado a ninguna de estas plataformas.
```

### Description — Français (fr)

```
Écrivez une fois. Publiez sur dix plateformes.

Oloop ouvre l’éditeur de chaque plateforme côte à côte, dans le navigateur où vous êtes déjà connecté. Ajoutez images, vidéo, titre et texte une seule fois : il importe, remplit chaque publication et attend que chaque plateforme ait fini le traitement et que le texte soit vérifié avant d’envoyer quoi que ce soit.

• X, Threads, Instagram, RedNote (Xiaohongshu), TikTok, YouTube, Bilibili, Pinterest, note et Naver Blog
• Titre, texte, médias et couverture propres à chaque plateforme si besoin
• Choisissez une image de la vidéo ou importez une image comme couverture
• Il envoie pour vous, ou s’arrête juste avant pour que vous appuyiez sur Envoyer
• Progression claire, lien vers chaque publication, nouvel essai en un clic
• Clair et sombre, en neuf langues

Ni clé d’API ni compte professionnel. Ni serveur ni statistiques : vos brouillons et médias restent sur votre ordinateur.

Gratuit et open source : https://github.com/omniomo/oloop

Oloop n’est affilié à aucune de ces plateformes.
```

### Description — Deutsch (de)

```
Einmal schreiben. Auf zehn Plattformen posten.

Oloop öffnet den Editor jeder Plattform nebeneinander, in dem Browser, in dem du schon angemeldet bist. Bilder, Video, Titel und Text gibst du nur einmal ein: Es lädt hoch, füllt jeden Beitrag aus und wartet, bis jede Plattform fertig verarbeitet hat und der Text stimmt, bevor etwas gesendet wird.

• X, Threads, Instagram, RedNote (Xiaohongshu), TikTok, YouTube, Bilibili, Pinterest, note und Naver Blog
• Eigener Titel, Text, eigene Medien und eigenes Cover pro Plattform, wenn du sie brauchst
• Wähle einen Frame aus dem Video oder lade ein Bild als Cover hoch
• Sendet für dich oder hält kurz davor an, damit du selbst auf Senden tippst
• Klarer Fortschritt, Links zu jedem Beitrag, erneuter Versuch mit einem Klick
• Hell und dunkel, in neun Sprachen

Keine API-Schlüssel, keine Business-Konten. Keine Server, keine Analysen: Entwürfe und Medien bleiben auf deinem Computer.

Kostenlos und Open Source: https://github.com/omniomo/oloop

Oloop steht in keiner Verbindung zu diesen Plattformen.
```

### Description — Português (pt_BR, pt_PT)

```
Escreva uma vez. Publique em dez plataformas.

O Oloop abre o editor de cada plataforma lado a lado, no navegador em que você já está conectado. Adicione imagens, vídeo, título e texto uma vez só: ele envia os arquivos, preenche cada post e espera cada plataforma terminar o processamento e o texto conferir antes de enviar qualquer coisa.

• X, Threads, Instagram, RedNote (Xiaohongshu), TikTok, YouTube, Bilibili, Pinterest, note e Blog da Naver
• Título, texto, mídia e capa próprios para cada plataforma quando precisar
• Escolha um quadro do vídeo ou envie uma imagem como capa
• Envia por você, ou para um passo antes para você tocar em enviar
• Progresso claro, links para cada post e nova tentativa com um clique
• Claro e escuro, em nove idiomas

Sem chaves de API e sem contas comerciais. Sem servidores e sem análises: seus rascunhos e mídias ficam no seu computador.

Grátis e de código aberto: https://github.com/omniomo/oloop

O Oloop não tem relação com nenhuma dessas plataformas.
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
