const config=(window as any).SCHOOL_CONFIG;
const key='school-auth-session';
let session:any;try{session=JSON.parse(sessionStorage.getItem(key)||'null')}catch{session=null}
let refreshing:Promise<any>|null=null;
function save(s:any){session=s;if(s)sessionStorage.setItem(key,JSON.stringify(s));else sessionStorage.removeItem(key)}
const json=(d:any,status=200)=>new Response(JSON.stringify(d),{status,headers:{'Content-Type':'application/json'}});
async function refresh(){if(!session?.refresh_token)return;if(!refreshing)refreshing=fetch(config.url+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:config.key,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})}).then(async r=>{const d=await r.json();if(r.ok)save(d);else save(null)}).finally(()=>{refreshing=null});return refreshing}
export async function fetchApi(path:string,options:RequestInit={}):Promise<Response>{if(!config?.url)return fetch(path,options);if(path==='/api/setup'){const r=await fetch(config.url+'/functions/v1/school-api?route=/api/setup',{...options,headers:{apikey:config.key,'Content-Type':'application/json'}});if(!r.ok)return r;return fetchApi('/api/login',options)}if(path==='/api/login'){const d=JSON.parse(String(options.body));const username=String(d.username||'').trim().toLowerCase();const r=await fetch(config.url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:config.key,'Content-Type':'application/json'},body:JSON.stringify({email:username.includes('@')?username:username+'@school.invalid',password:d.password})});const result=await r.json();if(!r.ok)return json({error:'账号或密码错误，或尝试过于频繁，请稍后重试'},r.status);save(result);const me=await fetchApi('/api/me');const who=await me.json();if(!who.user){save(null);return json({error:'此账号尚未开通或已停用，请联系管理员'},403)}return json(who)}if(path==='/api/logout'){if(session)await fetch(config.url+'/auth/v1/logout',{method:'POST',headers:{apikey:config.key,Authorization:'Bearer '+session.access_token}});save(null);return json({ok:true})}if(!session)return path==='/api/me'?json({user:null,setup:new URLSearchParams(location.hash.slice(1)).has('setup')}):json({error:'请登录后使用'},401);if(session.expires_at&&session.expires_at*1000<Date.now()+60000)await refresh();if(!session)return json({error:'登录已过期，请重新登录'},401);const local=new URL(path,'http://local');local.searchParams.set('route',local.pathname);const headers=new Headers(options.headers);headers.set('apikey',config.key);headers.set('Authorization','Bearer '+session.access_token);return fetch(config.url+'/functions/v1/school-api?'+local.searchParams,{...options,headers})}
// Render inside the current page: mobile browsers may block window.open.
let closeCurrentPhoto:(()=>void)|null=null;
export async function openPhoto(id:string){
 closeCurrentPhoto?.();
 const previous=document.activeElement as HTMLElement|null;
 const dialog=document.createElement('dialog');
 dialog.setAttribute('aria-label','现场照片');
 Object.assign(dialog.style,{width:'min(94vw,900px)',maxWidth:'94vw',maxHeight:'94dvh',padding:'16px',border:'0',borderRadius:'16px',background:'#fff',color:'#17283b',margin:'auto',boxSizing:'border-box'});
 const heading=document.createElement('h2');heading.textContent='现场照片';heading.style.margin='0';
 const toolbar=document.createElement('div');Object.assign(toolbar.style,{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',flexWrap:'wrap',marginBottom:'12px'});
 const status=document.createElement('p');status.setAttribute('role','status');status.style.margin='10px 0';
 const area=document.createElement('div');Object.assign(area.style,{overflow:'auto',maxHeight:'70dvh',background:'#eef2f5',borderRadius:'8px',textAlign:'center'});
 const photo=document.createElement('img');photo.alt='已保存的现场照片';photo.hidden=true;Object.assign(photo.style,{display:'block',maxWidth:'100%',maxHeight:'70dvh',width:'auto',height:'auto',objectFit:'contain',margin:'auto'});area.append(photo);
 const button=(label:string,click:()=>void)=>{const b=document.createElement('button');b.type='button';b.textContent=label;Object.assign(b.style,{minHeight:'44px',padding:'8px 14px',border:'1px solid #cbd5e1',borderRadius:'8px',background:'#fff',cursor:'pointer',font:'inherit'});b.onclick=click;return b};
 let closed=false,objectUrl='',controller:AbortController|null=null,zoomed=false;
 function dispose(){if(closed)return;closed=true;controller?.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);dialog.remove();if(closeCurrentPhoto===dispose)closeCurrentPhoto=null;previous?.focus()}
 const close=button('关闭',()=>{dialog.close();dispose()});
 const zoom=button('放大',()=>{zoomed=!zoomed;photo.style.maxWidth=zoomed?'none':'100%';photo.style.maxHeight=zoomed?'none':'70dvh';photo.style.width=zoomed?Math.max(area.clientWidth,Math.min(photo.naturalWidth,area.clientWidth*2))+'px':'auto';zoom.textContent=zoomed?'适应屏幕':'放大'});zoom.disabled=true;
 const retry=button('重新加载',()=>{void load()});
 toolbar.append(heading,zoom,retry,close);dialog.append(toolbar,status,area);
 dialog.addEventListener('close',dispose);dialog.addEventListener('cancel',()=>{dialog.close();dispose()});
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom){dialog.close();dispose()}}});
 closeCurrentPhoto=dispose;document.body.append(dialog);dialog.showModal();close.focus();
 async function load(){
  controller?.abort();const current=new AbortController();controller=current;status.textContent='正在加载照片…';retry.disabled=true;zoom.disabled=true;photo.hidden=true;photo.style.display='none';zoomed=false;zoom.textContent='放大';photo.style.maxWidth='100%';photo.style.maxHeight='70dvh';photo.style.width='auto';
  try{
   let address='/api/photo?id='+encodeURIComponent(id);
   if(config?.url){const r=await fetchApi(address,{signal:current.signal});const d=await r.json();if(!r.ok)throw new Error(d.error||'无法获取照片');if(!d.url)throw new Error('照片地址缺失');address=d.url}
   const response=await fetch(address,{signal:current.signal,cache:'no-store'});
   if(!response.ok)throw new Error(response.status===404?'照片文件不存在，请联系管理员核查。':'照片下载失败，请重新加载。');
   const blob=await response.blob();if(!blob.type.startsWith('image/')||!blob.size)throw new Error('照片文件格式异常，请联系管理员。');
   if(closed||current.signal.aborted)return;if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=URL.createObjectURL(blob);
   photo.src=objectUrl;await photo.decode();if(closed||current.signal.aborted)return;
   photo.hidden=false;photo.style.display='block';status.textContent='可放大核对，关闭后返回记录。';zoom.disabled=false;
  }catch(e:any){if(!closed&&!current.signal.aborted)status.textContent=e.message==='Failed to fetch'?'网络连接失败，请检查网络后重新加载照片。':e.message||'照片加载失败，请重试。'}
  finally{if(!closed&&!current.signal.aborted)retry.disabled=false}
 }
 await load();
}
