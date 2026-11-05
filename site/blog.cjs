const published = '2026-11-05';
const storeURL = 'https://chromewebstore.google.com/detail/explained-%E2%80%94-ai-reading-co/odmjfpknhbghmmemjlhaahnijdaebgfd';
const date = `<time datetime="${published}">November 5, 2026</time>`;

function index({ escape, ui, url }) {
  return `<section class="policy wrap">
    <h1>${escape(ui.blog)}</h1>
    <p>${escape(ui.descriptionBlog)}</p>
    <a class="reading-tile" href="${url('blogLaunch')}">
      <span class="eyebrow">${date}</span>
      <h2>${escape(ui.blogLaunch)}</h2>
      <p>Explained is now live on the Chrome Web Store.</p>
      <span class="text-link">Read the launch post</span>
    </a>
  </section>`;
}

function launch({ escape, ui, path }) {
  return `<article class="policy wrap">
    <header>
      <p class="eyebrow">${date}</p>
      <h1>${escape(ui.blogLaunch)}</h1>
      <p><strong>Explained is now live on the Chrome Web Store.</strong></p>
    </header>
    <p>I like reading articles written by human beings with real brains. I like following an argument, getting stuck on a sentence, and figuring out why the author put it there. Occasionally, I even change my mind. Terribly inefficient.</p>
    <p>So when I went looking for an AI reading companion, here’s what I found.</p>
    <p><strong>“Read the entire page in one click.”</strong> Even books!! Incredible. I’ve always wanted to finish a book without encountering any of its sentences.</p>
    <p><strong>“Build a personal memory as you read.”</strong> Please don’t. I came here to look up <em>one phrase</em>. How did we get to building a dossier?</p>
    <p><strong>“Open the chat panel.”</strong> Sure. Let’s put a dialogue box and a long feature bar between me and the thing I’m trying to focus on. An icon is enough.</p>
    <p>That’s why I built <strong>Explained</strong>. Highlight the bit that made you go <em>wait, what?</em> Click the little icon. Get a quick explanation right beside the original text. Get back to reading.</p>
    <p>You bring your own DeepSeek API key, and usage is billed to your DeepSeek account. Highlighting alone sends nothing. When you ask for an explanation, the selected text and any nearby context you choose to include go directly to DeepSeek. Your key stays in Chrome’s extension session memory. <a href="${path('privacy.html')}">Read the privacy policy</a>.</p>
    <p>If you still enjoy the wildly inefficient process of reading, learning, thinking, and occasionally growing, give it a try, smart cookie.</p>
    <p><a class="button" href="${storeURL}">Install Explained from the Chrome Web Store</a></p>
  </article>`;
}

module.exports = { index, launch, published };
