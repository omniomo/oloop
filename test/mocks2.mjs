// Mocks for the BETA platforms. They follow the adapters' selectors, so they
// test the plumbing (frames, redirects, on-the-fly file inputs, covers), not
// whether those selectors still match the live sites.

const common = `<meta charset="utf-8"><script>
async function sha(f){const h=await crypto.subtle.digest('SHA-256',await f.arrayBuffer());return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function describe(files){return Promise.all([...files].map(async f=>({name:f.name,type:f.type,size:f.size,sha:await sha(f)})))}
window.__log=[];
// like many sites: create a file input on the fly and click() it
function pickFiles(accept,multiple,cb){const i=document.createElement('input');i.type='file';i.accept=accept;i.multiple=multiple;i.addEventListener('change',()=>cb([...i.files]));i.click()}
</script>`;

export const THREADS_PAGE = `<!doctype html><html><head>${common}</head><body>
<nav><div role="button" tabindex="0" id="create" aria-label="New thread"><svg width="24" height="24"><rect width="24" height="24"/></svg></div></nav>
<div role="button" aria-label="Empty text field. Type to compose a new post.">What’s new?</div>
<div id="dlg" role="dialog" hidden>
  <div id="ed" contenteditable="true" role="textbox" aria-label="Empty text field. Type to compose a new post." style="min-height:40px;border:1px solid #ccc"></div>
  <div id="prev"></div>
  <div role="button" id="attach"><svg aria-label="Attach media" width="20" height="20"><rect width="20" height="20"/></svg></div>
  <div role="button" id="post" aria-disabled="true">Post</div>
</div>
<script>
const $=id=>document.getElementById(id);let files=[];
$('create').onclick=()=>{$('dlg').hidden=false};
const refresh=()=>$('post').setAttribute('aria-disabled',String(!($('ed').innerText.trim()||files.length)));
$('ed').addEventListener('input',refresh);
$('attach').onclick=()=>pickFiles('image/*,video/*',true,fs=>{files=fs;for(const f of fs){const u=URL.createObjectURL(f);
  const n=document.createElement(f.type.startsWith('video')?'video':'img');n.src=u;n.width=40;$('prev').appendChild(n)}refresh()});
$('post').onclick=async()=>{if($('post').getAttribute('aria-disabled')==='true')return;
  window.__posted={text:$('ed').innerText,files:await describe(files)};$('dlg').remove();
  const t=document.createElement('div');t.innerHTML='<div><span>Posted</span> <a href="/@omniomo/post/ABC123">View</a></div>';document.body.appendChild(t)};
</script></body></html>`;

// TikTok Studio, shaped like the Nov 2026 page: the cover sits in
// [data-e2e=cover_container]; "Edit cover" opens a full-screen editor whose
// "Upload cover" label wraps a JPEG/PNG-only input, with Cancel/Save in its header.
// A "Turn on automatic content checks?" modal pops up over everything first.
export const TIKTOK_PAGE = `<!doctype html><html><head>${common}</head><body>
<div id="up"><input type="file" accept="video/*" id="fi" style="display:none"><button>Select video</button></div>
<div id="form" hidden>
  <div class="upload-progress" id="prog"></div>
  <div class="caption-editor"><div class="public-DraftEditor-content" contenteditable="true" id="cap" style="border:1px solid #ccc"></div></div>
  <div data-e2e="cover_container"><span>Cover</span>
    <div class="cover-container" id="coverBox"><img id="coverImg" class="cover-image" width="60" height="80" alt=""><div class="edit-container">Edit cover</div></div></div>
  <button data-e2e="post_video_button" id="post" disabled>Post</button>
</div>
<div role="dialog" class="TUXModal" id="checks" hidden>Turn on automatic content checks?<button id="checksNo">Cancel</button><button id="checksOn">Turn on</button></div>
<div id="coverModal" role="dialog" class="Dialog__content" hidden>
  <div><button id="cCancel">Cancel</button><button id="save">Save</button></div>
  <div id="slot"></div>
</div>
<script>
const $=id=>document.getElementById(id);let file=null,cover=null,pending=null;
const swatch=(c)=>{const k=document.createElement('canvas');k.width=6;k.height=8;const g=k.getContext('2d');g.fillStyle=c;g.fillRect(0,0,6,8);return k.toDataURL()};
const upload=()=>{$('slot').innerHTML='<label role="button" aria-label="Upload cover image">Upload cover<input type="file" accept="image/jpeg, image/png, image/jpg" id="cfi" style="display:none"></label>';
  $('cfi').onchange=e=>{const f=e.target.files[0];if(!/^image\\/(jpeg|png|jpg)$/.test(f.type)){__log.push('cover-rejected:'+f.type);return}
    pending=f;$('slot').innerHTML='<div aria-label="Uploaded cover image"><button aria-label="Delete uploaded image" id="del">×</button></div>';$('del').onclick=()=>{pending=null;upload()}}};
$('cap').addEventListener('paste',e=>{e.preventDefault();$('cap').innerText=e.clipboardData.getData('text/plain');__log.push('paste')});
$('fi').onchange=e=>{file=e.target.files[0];$('up').hidden=true;$('form').hidden=false;$('cap').innerText=file.name.replace(/\\.\\w+$/,'');$('coverImg').src=swatch('#888');$('checks').hidden=false;
  let p=0;const iv=setInterval(()=>{p+=25;$('prog').textContent=p+'%';if(p>=100){clearInterval(iv);$('prog').textContent='Uploaded';$('post').disabled=false}},400)};
$('checksOn').onclick=()=>__log.push('CHECKS-TURNED-ON');
$('coverBox').onclick=()=>{upload();$('coverModal').hidden=false;__log.push('cover-open')};
$('cCancel').onclick=()=>{$('coverModal').hidden=true;__log.push('cover-cancel')};
$('save').onclick=()=>{if(pending){cover=pending;$('coverImg').src=URL.createObjectURL(pending)}$('coverModal').hidden=true;__log.push('cover-save')};
$('post').onclick=async()=>{window.__posted={caption:$('cap').innerText,files:await describe([file]),cover:cover&&(await describe([cover]))[0]};
  history.pushState({},'','/tiktokstudio/content');$('form').hidden=true};
</script></body></html>`;

export const PINTEREST_PAGE = `<!doctype html><html><head>${common}</head><body>
<input id="storyboard-upload-input" type="file" accept="image/*,video/*" style="display:none">
<div id="form">
  <input id="storyboard-selector-title" placeholder="Add a title" disabled>
  <div id="storyboard-selector-description"><div contenteditable="false" aria-label="Tell everyone what your Pin is about" id="desc" style="border:1px solid #ccc;min-height:20px"></div></div>
  <input id="WebsiteField" type="url" placeholder="Add a link" disabled>
  <div role="button" data-test-id="board-dropdown-select-button" id="boardBtn" aria-disabled="true">Board Choose a board</div>
  <div id="pop" role="dialog" hidden><input id="pickerSearchField" placeholder="Search">
    <div data-test-id="board-row-Other" role="button">Other</div><div data-test-id="board-row-OMO" role="button" id="omo">OMO</div>
    <div role="button" id="createBoard">Create board</div></div>
  <div data-test-id="storyboard-creation-nav-done"><button id="pub" disabled>Publish</button></div>
  <div data-test-id="storyboard-pin-card-item" id="coverBox" hidden><button data-test-id="video-cover-container-edit-cover-button" id="editCover"><div><div>Edit cover</div></div></button></div>
</div>
<div id="coverDlg" role="dialog" aria-modal="true" aria-label="Select a cover for the video" hidden><h1>Pick a cover</h1>
  <div data-test-id="video-cover-edit-cover-modal-content" id="coverBody"></div>
  <button data-test-id="video-cover-edit-cover-cancel-button" id="coverCancel">Cancel</button><button data-test-id="video-cover-edit-cover-done-button" id="coverDone">Done</button></div>
<script>
const $=id=>document.getElementById(id);let file=null,board=null;
// "Pick a cover" (Nov 2026): pressing the filmstrip centres a frame-sized window
// on the press and seeks the window's video there; Done keeps that frame. No upload.
// The strip is built when the picker opens (like the real one), so it holds no <video> before that.
let coverTime=null,clipUrl=null;
$('editCover').onclick=()=>{$('coverBody').innerHTML='<div data-test-id="video-cover-timeline-picker" id="track" style="position:relative;width:800px;height:120px;background:#ddd;cursor:pointer">'+
    '<div id="win" style="position:absolute;left:0px;top:0;width:100px;height:120px;overflow:hidden;outline:2px solid #000"><video id="cv" muted style="width:100px;height:120px"></video></div></div>';
  $('cv').src=clipUrl;
  $('track').addEventListener('pointerdown',e=>{const r=$('track').getBoundingClientRect();const left=Math.min(700,Math.max(0,e.clientX-r.left-50));
    $('win').style.left=left+'px';if($('cv').duration)$('cv').currentTime=left/800*$('cv').duration;__log.push('cover-press')});
  $('coverDlg').hidden=false;__log.push('cover-open')};
const closeCover=()=>{$('coverDlg').hidden=true;$('coverBody').innerHTML=''};
$('coverDone').onclick=()=>{coverTime=$('cv').currentTime;closeCover();__log.push('cover-done')};
$('coverCancel').onclick=()=>{closeCover();__log.push('cover-cancel')};
$('storyboard-upload-input').onchange=e=>{file=e.target.files[0];if(file.type.startsWith('video/')){$('coverBox').hidden=false;clipUrl=URL.createObjectURL(file)}
  // locked while "processing", like the real form
  setTimeout(()=>{$('storyboard-selector-title').disabled=false;$('WebsiteField').disabled=false;$('desc').setAttribute('contenteditable','true');$('boardBtn').setAttribute('aria-disabled','false')},1500)};
$('boardBtn').onclick=()=>{if($('boardBtn').getAttribute('aria-disabled')==='true')return;$('pop').hidden=false};
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('pop').hidden=true});
$('createBoard').onclick=()=>{__log.push('CREATED-BOARD')};
document.querySelectorAll('[data-test-id^=board-row-]').forEach(o=>o.onclick=()=>{board=o.textContent;$('boardBtn').textContent='Board '+board;$('pop').hidden=true;$('pub').disabled=false});
$('pub').onclick=async()=>{window.__posted={title:$('storyboard-selector-title').value,description:$('desc').innerText,link:$('WebsiteField').value,board,files:await describe([file]),coverTime};
  const t=document.createElement('div');t.setAttribute('role','alert');t.innerHTML='Saved to '+board+' <a href="/pin/12345/">See it</a>';document.body.appendChild(t)};
</script></body></html>`;

export const NOTE_REDIRECT = `<!doctype html><html><head>${common}</head><body>loading…
<script>setTimeout(()=>location.replace('https://editor.note.com/notes/n0abc/edit/'),800)</script></body></html>`;

export const NOTE_EDITOR = `<!doctype html><html><head>${common}</head><body>
<button aria-label="画像を追加" id="addImg">＋</button>
<div id="menu" hidden><button id="up">画像をアップロード</button></div>
<div id="trim" role="dialog" hidden><span>トリミング</span><button id="save">保存</button></div>
<textarea placeholder="記事タイトル" id="title"></textarea>
<div class="ProseMirror" contenteditable="true" id="body" style="min-height:40px;border:1px solid #ccc"></div>
<button id="go">公開に進む</button>
<div id="pub" hidden><button id="post">投稿する</button></div>
<script>
const $=id=>document.getElementById(id);let header=null;
$('body').addEventListener('paste',e=>{e.preventDefault();$('body').innerHTML='';e.clipboardData.getData('text/plain').split('\\n').forEach(l=>{const p=document.createElement('p');p.textContent=l;$('body').appendChild(p)});__log.push('pm-paste')});
$('addImg').onclick=()=>{$('menu').hidden=false};
$('up').onclick=()=>pickFiles('image/*',false,fs=>{header=fs[0];$('menu').hidden=true;$('trim').hidden=false});
$('save').onclick=()=>{$('trim').hidden=true;__log.push('header-saved')};
$('go').onclick=()=>{$('pub').hidden=false};
$('post').onclick=async()=>{window.__posted={title:$('title').value,body:$('body').innerText,header:header&&(await describe([header]))[0]};
  document.body.insertAdjacentHTML('beforeend','<div>記事を公開しました</div>')};
</script></body></html>`;

export const NAVER_TOP = `<!doctype html><html><head>${common}</head><body>
<iframe id="mainFrame" src="/PostWriteForm.naver?blogId=omniomo" style="width:1000px;height:700px"></iframe></body></html>`;

export const NAVER_EDITOR = `<!doctype html><html><head>${common}</head><body>
<div class="se-popup-alert-confirm" id="pop"><p>작성 중인 글이 있습니다. 이어서 작성하시겠습니까?</p><button class="se-popup-button-cancel" id="cancel">취소</button><button>확인</button></div>
<div class="se-toolbar"><button class="se-image-toolbar-button" id="photo">사진</button><button id="publish">발행</button></div>
<div class="se-wrap"><div class="se-content" contenteditable="true" id="host" style="border:1px solid #ccc">
  <div class="se-documentTitle"><p class="se-text-paragraph" id="t"><br></p></div>
  <div class="se-component se-text"><p class="se-text-paragraph" id="b"><br></p></div>
  <div id="imgs"></div>
</div></div>
<script>
const $=id=>document.getElementById(id);let files=[];
$('cancel').onclick=()=>{$('pop').remove();window.parent.__log.push('draft-cancel')};
// SmartEditor-like: handles paste itself, inserting at the caret's paragraph only
$('host').addEventListener('paste',e=>{e.preventDefault();const r=getSelection().getRangeAt(0);r.deleteContents();
  r.insertNode(document.createTextNode(e.clipboardData.getData('text/plain')));__log.push('se-paste')});
$('photo').onclick=()=>pickFiles('image/*',true,fs=>{files=fs;for(const f of fs){$('imgs').insertAdjacentHTML('beforeend','<div class="se-component se-image">img</div>')}});
$('publish').onclick=async()=>{window.parent.__posted={title:$('t').innerText,body:$('b').innerText,files:await describe(files)};
  location.href='/PostView.naver?blogId=omniomo&logNo=223456789012'};
</script></body></html>`;

export const NAVER_POSTVIEW = `<!doctype html><html><head><meta charset="utf-8"></head><body>post</body></html>`;

// 小红书: tabs (one hidden off-screen copy, like the real page), a sidebar
// 「发布笔记」 button that must never be clicked, images or one video.
export const XHS_PAGE = `<!doctype html><html><head>${common}</head><body>
<aside><button id="sideNew">发布笔记</button></aside>
<div class="header" style="position:absolute;left:-9999px"><div class="creator-tab"><span class="title">上传图文</span></div></div>
<div class="header"><div class="creator-tab" id="tabV"><span class="title">上传视频</span></div><div class="creator-tab" id="tabI"><span class="title">上传图文</span></div></div>
<div id="drop"><input class="upload-input" type="file" id="fi" accept=".mp4,.mov" style="display:none"></div>
<div id="form" hidden>
  <div id="thumbs"></div><div id="status"></div>
  <div class="d-input"><input class="d-text" type="text" placeholder="填写标题会有更多赞哦～" id="title"></div>
  <div class="tiptap ProseMirror" contenteditable="true" id="body" style="min-height:40px;border:1px solid #ccc"></div>
  <div id="coverRow" hidden><div role="button" id="setCover">设置封面</div></div>
  <div class="submit"><button id="pub" disabled>发布</button><button>暂存离开</button></div>
</div>
<div id="coverModal" role="dialog" hidden>
  <div role="tab">截取封面</div><div role="tab" id="upTab">上传封面</div>
  <input type="file" accept="image/png, image/jpeg, image/*" id="cfi" style="display:none">
  <button id="ok" disabled>确定</button>
</div>
<script>
const $=id=>document.getElementById(id);let files=[],cover=null,kind='video';
$('sideNew').onclick=()=>{__log.push('SIDEBAR-CLICKED')};
$('tabI').onclick=()=>{kind='image';$('fi').accept='.jpg,.jpeg,.png,.webp';__log.push('tab-image')};
$('tabV').onclick=()=>{kind='video';$('fi').accept='.mp4,.mov';__log.push('tab-video')};
$('body').addEventListener('paste',e=>{e.preventDefault();$('body').innerText=e.clipboardData.getData('text/plain')});
$('fi').onchange=e=>{files=[...e.target.files];$('drop').hidden=true;$('form').hidden=false;$('coverRow').hidden=kind!=='video';
  for(const f of files){const n=document.createElement(kind==='video'?'video':'img');n.src=URL.createObjectURL(f);n.width=40;$('thumbs').appendChild(n)}
  let p=0;const iv=setInterval(()=>{p+=20;$('status').textContent='上传中 '+p+'%';if(p>=100){clearInterval(iv);$('status').textContent='上传成功';$('pub').disabled=false}},300)};
$('setCover').onclick=()=>{$('coverModal').hidden=false};
$('upTab').onclick=()=>{__log.push('cover-tab')};
$('cfi').onchange=e=>{cover=e.target.files[0];$('ok').disabled=false};
$('ok').onclick=()=>{$('coverModal').hidden=true;__log.push('cover-ok')};
$('pub').onclick=async()=>{if($('pub').disabled)return;
  window.__posted={kind,title:$('title').value,body:$('body').innerText,files:await describe(files),cover:cover&&(await describe([cover]))[0]};
  history.pushState({},'','/publish/success');$('form').hidden=true;document.body.insertAdjacentHTML('beforeend','<div>发布成功</div>')};
</script></body></html>`;

// B站: upload pre-fills the title with the file name; tags with Enter; Quill
// 简介; 「上传完成」 before 立即投稿 works.
export const BILI_PAGE = `<!doctype html><html><head>${common}</head><body>
<div class="upload-wrp" id="up"><div class="upload-btn"><input type="file" accept=".mp4,.flv,.mov,.mkv" id="fi" style="display:none"></div><span>上传视频</span></div>
<div id="form" hidden>
  <div class="file-list"><span id="st">上传中</span></div>
  <div class="cover-main"><div class="cover-main-img"><div class="img"></div></div><span id="chg">更换封面</span></div>
  <div class="video-title"><input type="text" maxlength="80" class="input-val" id="title"></div>
  <div><span class="check-radio-v2-name" id="own">自制</span><span class="check-radio-v2-name">转载</span></div>
  <div class="tag-wrp"><div class="tag-pre-wrp" id="tagList"></div><input type="text" placeholder="按回车键Enter创建标签" id="tagIn"></div>
  <div class="desc-container"><div class="ql-editor" contenteditable="true" id="desc" style="min-height:40px;border:1px solid #ccc"></div></div>
  <div class="submit-container"><span class="submit-add" id="submit">立即投稿</span></div>
</div>
<div id="coverModal" hidden><div class="cover-select-header-tab"><span>封面截取</span><span id="upTab">上传封面</span></div>
  <div class="bcc-upload-wrapper"><input type="file" accept="image/png, image/jpeg" id="cfi" style="display:none"></div>
  <div class="cover-select-footer-pick"><button id="done">完成</button></div></div>
<script>
const $=id=>document.getElementById(id);let file=null,cover=null,tags=[],own=false,uploaded=false;
$('fi').onchange=e=>{file=e.target.files[0];$('up').hidden=true;$('form').hidden=false;$('title').value=file.name.replace(/\\.\\w+$/,'');
  let p=0;const iv=setInterval(()=>{p+=25;$('st').textContent='上传中 '+p+'%';if(p>=100){clearInterval(iv);$('st').textContent='上传完成';uploaded=true}},400)};
$('own').onclick=()=>{own=true};
$('tagIn').addEventListener('keydown',e=>{if(e.key!=='Enter')return;const v=$('tagIn').value.trim();if(v&&!tags.includes(v)){tags.push(v);
  const s=document.createElement('span');s.className='label-item-v2-container';s.textContent=v;$('tagList').appendChild(s)}$('tagIn').value=''});
$('desc').addEventListener('paste',e=>{e.preventDefault();$('desc').innerText=e.clipboardData.getData('text/plain')});
$('chg').onclick=()=>{$('coverModal').hidden=false};
$('upTab').onclick=()=>{__log.push('cover-tab')};
$('cfi').onchange=e=>{cover=e.target.files[0]};
$('done').onclick=()=>{$('coverModal').hidden=true;__log.push('cover-done')};
$('submit').onclick=async()=>{if(!uploaded){__log.push('SUBMIT-BEFORE-UPLOAD');return}
  window.__posted={title:$('title').value,own,tags:[...tags],desc:$('desc').innerText,files:await describe([file]),cover:cover&&(await describe([cover]))[0]};
  $('form').hidden=true;document.body.insertAdjacentHTML('beforeend','<div>稿件投递成功</div>')};
</script></body></html>`;
