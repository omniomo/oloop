// Minimal stand-ins for the three compose UIs, built from the same selectors and
// labels the adapters look for. They record what was "posted" in window.__posted.

const common = `
<script>
async function sha(f){const h=await crypto.subtle.digest('SHA-256',await f.arrayBuffer());return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function describe(files){return Promise.all(files.map(async f=>({name:f.name,type:f.type,size:f.size,sha:await sha(f)})))}
window.__log=[];
</script>`;

export const X_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>X</title></head><body>${common}
<div role="dialog" id="dlg">
  <div data-testid="tweetTextarea_0" contenteditable="true" role="textbox" style="min-height:40px;border:1px solid #ccc"></div>
  <div data-testid="attachments" id="att"></div>
  <input type="file" data-testid="fileInput" multiple accept="image/*,video/*" style="display:none">
  <button data-testid="tweetButton" aria-disabled="true">Post</button>
</div>
<script>
const ed=document.querySelector('[data-testid=tweetTextarea_0]');
const btn=document.querySelector('[data-testid=tweetButton]');
let files=[],uploading=false;
function refresh(){const has=ed.innerText.trim()||files.length;btn.setAttribute('aria-disabled',(!has||uploading)?'true':'false')}
// Draft.js-like: handles paste itself, re-renders blocks
ed.addEventListener('paste',e=>{e.preventDefault();const t=e.clipboardData.getData('text/plain');ed.innerHTML='';
  t.split('\\n').forEach(l=>{const d=document.createElement('div');d.textContent=l||'\\u200b';ed.appendChild(d)});__log.push('paste');refresh()});
ed.addEventListener('input',refresh);
const whenVisible=()=>document.hidden?new Promise(r=>document.addEventListener('visibilitychange',function f(){if(!document.hidden){document.removeEventListener('visibilitychange',f);r()}})):Promise.resolve();
document.querySelector('[data-testid=fileInput]').addEventListener('change',async e=>{
  const picked=[...e.target.files];if(document.hidden)__log.push('files-while-hidden');await whenVisible();
  files=picked;const att=document.getElementById('att');
  for(const f of files){const u=URL.createObjectURL(f);
    if(f.type.startsWith('video/')){const v=document.createElement('video');v.src=u;att.appendChild(v)}
    else{const i=document.createElement('img');i.src=u;i.width=50;att.appendChild(i)}}
  uploading=true;refresh();let pct=0;const lbl=document.createElement('span');att.appendChild(lbl);
  const iv=setInterval(()=>{pct+=20;lbl.textContent='Uploading '+pct+'%';if(pct>=100){clearInterval(iv);lbl.remove();uploading=false;refresh()}},400);
});
btn.addEventListener('click',async()=>{
  if(btn.getAttribute('aria-disabled')==='true'){__log.push('clicked-while-disabled');return}
  window.__posted={text:ed.innerText,files:await describe(files)};
  document.getElementById('dlg').remove();history.pushState({},'','/home');
  const t=document.createElement('div');t.setAttribute('data-testid','toast');
  t.innerHTML='Your post was sent. <a href="/oloop/status/1234567890">View</a>';document.body.appendChild(t);
});
</script></body></html>`;

// Instagram, laid out like the Nov 2026 page: Create is a plus icon; each step of
// the dialog has a header row (Back icon · title · text action: Next, then Share);
// the crop button is the left-most icon along the bottom, its menu lists Original
// and ratios. Tests swap the words for another language (see test/lang.mjs).
export const IG_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Instagram</title>
<style>.hd{display:flex;justify-content:space-between;align-items:center;width:600px}.bar{display:flex;justify-content:space-between;width:600px;margin-top:40px}</style></head><body>${common}
<nav><a role="link" href="#" id="create"><svg aria-label="New post" width="24" height="24" viewBox="0 0 24 24"><path d="M21 11h-8V3a1 1 0 1 0-2 0v8H3a1 1 0 1 0 0 2h8v8a1 1 0 1 0 2 0v-8h8a1 1 0 1 0 0-2Z"/></svg><span>Create</span></a></nav>
<div id="nag" role="dialog"><p>Turn on Notifications</p><button>Turn On</button><button id="notnow">Not Now</button></div>
<div id="reels" role="dialog" hidden><p>Video posts are now shared as reels</p><button id="reelsok">OK</button></div>
<div id="cd" role="dialog" hidden style="width:600px">
  <div id="s-select"><div class="hd"><span></span><div role="heading">Create new post</div><span></span></div><button>Select from computer</button>
    <form enctype="multipart/form-data"><input id="fi" type="file" multiple accept="image/jpeg,image/png,video/mp4" style="display:none"></form></div>
  <div id="s-crop" hidden>
    <div class="hd"><div role="button"><svg aria-label="Back" width="16" height="16"><rect width="16" height="16"/></svg></div><div role="heading">Crop</div><div role="button" id="n1">Next</div></div>
    <div style="height:200px"></div>
    <div id="ratios" hidden><div role="button" id="orig"><svg aria-label="Photo outline icon" width="10" height="10"><rect width="10" height="10"/></svg><span>Original</span></div><div role="button"><svg aria-label="Crop square icon" width="10" height="10"><rect width="10" height="10"/></svg><span>1:1</span></div><div role="button"><svg aria-label="Crop portrait icon" width="10" height="10"><rect width="10" height="10"/></svg><span>4:5</span></div></div>
    <div class="bar"><span><button id="cropBtn"><svg aria-label="Select crop" width="16" height="16"><rect width="16" height="16"/></svg></button><button><svg aria-label="Select zoom" width="16" height="16"><rect width="16" height="16"/></svg></button></span><button><svg aria-label="Open media gallery" width="16" height="16"><rect width="16" height="16"/></svg></button></div></div>
  <div id="s-edit" hidden><div class="hd"><div role="button"><svg aria-label="Back" width="16" height="16"><rect width="16" height="16"/></svg></div><div role="heading">Edit</div><div role="button" id="n2">Next</div></div></div>
  <div id="s-cap" hidden><div class="hd"><div role="button"><svg aria-label="Back" width="16" height="16"><rect width="16" height="16"/></svg></div><div role="heading">Create new post</div><div role="button" id="share">Share</div></div>
    <div id="cap" contenteditable="true" role="textbox" aria-label="Write a caption..." style="min-height:40px;border:1px solid #ccc"></div></div>
  <div id="s-done" hidden></div>
</div>
<script>
const $=id=>document.getElementById(id);let files=[],ratio='1:1';
$('notnow').onclick=()=>$('nag').remove();
$('create').onclick=e=>{e.preventDefault();$('cd').hidden=false};
$('fi').onchange=e=>{files=[...e.target.files];$('s-select').hidden=true;$('s-crop').hidden=false;
  if(files.some(f=>f.type.startsWith('video/')))$('reels').hidden=false};
$('reelsok').onclick=()=>{$('reels').hidden=true;__log.push('reels-ok')};
$('cropBtn').onclick=()=>{$('ratios').hidden=!$('ratios').hidden};
$('orig').onclick=()=>{ratio='original';$('ratios').hidden=true};
$('n1').onclick=()=>{if(!$('reels').hidden){__log.push('next-blocked-by-reels');return}$('s-crop').hidden=true;$('s-edit').hidden=false};
$('n2').onclick=()=>{$('s-edit').hidden=true;$('s-cap').hidden=false};
// Lexical-ish editor with no paste handler: forces the execCommand fallback
$('share').onclick=async()=>{
  window.__posted={caption:$('cap').innerText,ratio,files:await describe(files)};
  $('s-cap').hidden=true;$('s-done').hidden=false;$('s-done').textContent='Sharing';
  setTimeout(()=>{$('s-done').innerHTML='<img alt="Animated checkmark" src="data:,"><span>Your post has been shared.</span>'},1500);
};
</script></body></html>`;

export const YT_REDIRECT = `<!doctype html><script>location.replace('https://studio.youtube.com/channel/UC123/videos/upload?d=ud')</script>`;

export const YT_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>YouTube Studio</title></head><body>${common}
<ytcp-uploads-dialog><tp-yt-paper-dialog>
  <input id="file-loader" type="file" accept="image/jpeg,image/png" style="display:none">
  <div id="pick"><ytcp-uploads-file-picker><input type="file" name="Filedata" style="display:none"></ytcp-uploads-file-picker><span>Select files</span></div>
  <div id="details" hidden>
    <ytcp-social-suggestions-textbox id="title-textarea"><div id="textbox" contenteditable="true" style="border:1px solid #ccc"></div></ytcp-social-suggestions-textbox>
    <ytcp-social-suggestions-textbox id="description-textarea"><div id="textbox" contenteditable="true" style="border:1px solid #ccc;min-height:30px"></div></ytcp-social-suggestions-textbox>
    <tp-yt-paper-radio-button name="VIDEO_MADE_FOR_KIDS_MFK">Yes, it's made for kids</tp-yt-paper-radio-button>
    <tp-yt-paper-radio-button name="VIDEO_MADE_FOR_KIDS_NOT_MFK">No, it's not made for kids</tp-yt-paper-radio-button>
    <ytcp-thumbnails-compact-editor-uploader><button id="select-button">Upload thumbnail</button><img id="thumb" hidden></ytcp-thumbnails-compact-editor-uploader>
    <ytcp-video-info><a href="https://youtu.be/abc123XYZ">https://youtu.be/abc123XYZ</a></ytcp-video-info>
  </div>
  <div id="elements" hidden>Video elements</div>
  <div id="checks" hidden>Checks</div>
  <div id="visibility" hidden>
    <tp-yt-paper-radio-button name="PRIVATE">Private</tp-yt-paper-radio-button>
    <tp-yt-paper-radio-button name="UNLISTED">Unlisted</tp-yt-paper-radio-button>
    <tp-yt-paper-radio-button name="PUBLIC">Public</tp-yt-paper-radio-button>
  </div>
  <div><ytcp-video-upload-progress><span class="progress-label"></span></ytcp-video-upload-progress>
    <ytcp-button id="next-button" hidden>Next</ytcp-button> <ytcp-button id="done-button" hidden>Publish</ytcp-button></div>
</tp-yt-paper-dialog></ytcp-uploads-dialog>
<ytcp-video-share-dialog hidden><span>Video published</span> <a href="https://youtu.be/abc123XYZ">https://youtu.be/abc123XYZ</a></ytcp-video-share-dialog>
<script>
let thumbFile=null;
// the real page's thumbnail input: images only
document.getElementById('file-loader').addEventListener('change',e=>{const f=e.target.files[0];
  if(f.type.startsWith('video/'))__log.push('VIDEO-IN-THUMBNAIL-INPUT');else{thumbFile=f;__log.push('thumb')}});
const q=s=>document.querySelector(s);let file=null,uploading=false;const steps=['details','elements','checks','visibility'];let step=0;
const title=q('#title-textarea #textbox'),desc=q('#description-textarea #textbox');
desc.addEventListener('paste',e=>{e.preventDefault();desc.innerText=e.clipboardData.getData('text/plain');__log.push('desc-paste')});
document.querySelectorAll('tp-yt-paper-radio-button').forEach(r=>r.addEventListener('click',()=>{
  r.parentElement.querySelectorAll('tp-yt-paper-radio-button').forEach(o=>{o.removeAttribute('checked');o.setAttribute('aria-checked','false')});
  r.setAttribute('checked','');r.setAttribute('aria-checked','true')}));
q('input[name=Filedata]').onchange=e=>{file=e.target.files[0];q('#pick').hidden=true;q('#details').hidden=false;q('#next-button').hidden=false;
  setTimeout(()=>{title.textContent=file.name.replace(/\\.[^.]+$/,'')},300);
  uploading=true;let pct=0;const lbl=q('.progress-label');
  const iv=setInterval(()=>{pct+=10;lbl.textContent='Uploading '+pct+'% ... 1 minute left';if(pct>=100){clearInterval(iv);uploading=false;lbl.textContent='Upload complete ... Processing will begin shortly'}},400)};
// fallback path: an input created on the fly and click()ed → picker.js must catch it
q('#select-button').addEventListener('click',()=>{const i=document.createElement('input');i.type='file';i.accept='image/jpeg,image/png';
  i.addEventListener('change',()=>{thumbFile=i.files[0];q('#thumb').hidden=false;__log.push('thumb')});i.click()});
const detailsEl=q('#details');
// like Studio: leaving a step unmounts it (the details step's title box and kids radios are gone)
q('#next-button').addEventListener('click',()=>{const cur=q('#'+steps[step]);cur.hidden=true;if(step===0)cur.remove();step++;q('#'+steps[step]).hidden=false;if(step===3){q('#next-button').hidden=true;q('#done-button').hidden=false}});
q('#done-button').addEventListener('click',async()=>{
  if(uploading)__log.push('published-while-uploading');
  const vis=[...document.querySelectorAll('#visibility tp-yt-paper-radio-button')].find(r=>r.hasAttribute('checked'));
  const kids=[...detailsEl.querySelectorAll('tp-yt-paper-radio-button')].find(r=>r.hasAttribute('checked'));
  window.__posted={title:title.innerText,description:desc.innerText,visibility:vis&&vis.getAttribute('name'),kids:kids&&kids.getAttribute('name'),files:await describe([file]),thumb:thumbFile&&(await describe([thumbFile]))[0]};
  q('ytcp-uploads-dialog').hidden=true;q('ytcp-video-share-dialog').hidden=false});
</script></body></html>`;
