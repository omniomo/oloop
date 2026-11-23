<p align="center">
  <img src="site/assets/logo.svg" width="88" alt="">
</p>

<h1 align="center">oloop</h1>

<p align="center">
  Social media on autopilot.<br>
  A Chrome extension that posts one draft to ten platforms.<br>
  <a href="https://oloop.ooooomo.com">oloop.ooooomo.com</a>
</p>

<p align="center">
  <img src="site/assets/shots/en/write.webp" width="30%" alt="A draft in the side panel">
  <img src="site/assets/shots/en/post.webp" width="30%" alt="Posting to every platform at once">
  <img src="site/assets/shots/en/night.webp" width="30%" alt="Dark mode">
</p>

<p align="center">X · Threads · Instagram · RedNote · TikTok · YouTube · Bilibili · Pinterest · note · Naver Blog</p>

Write once in the side panel. oloop opens each platform's own composer in the browser you're signed into, uploads your media, fills everything in and waits until it's ready. X, Instagram and YouTube can post on their own; the others stop right before Post for you to press.

## Install

Until it's on the Chrome Web Store: download this repo, open `chrome://extensions`, turn on Developer mode, choose **Load unpacked** and pick the `extension` folder.

## Develop

```sh
npm i -D playwright && npx playwright install chromium
npm test
```

Each platform is one adapter in `extension/content/`. Translations are in `extension/lib/locales/`, the website in `site/`.

## License

[GPL-3.0](LICENSE)
