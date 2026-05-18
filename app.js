// ⚠ WARNING: SB_KEY (anon) is designed to be public but should be paired with RLS policies.
var SB_URL='https://eqsnohwymgmdvbqwflas.supabase.co',SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxc25vaHd5bWdtZHZicXdmbGFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzU1NzUsImV4cCI6MjA5MTIxMTU3NX0.0cv-j9zJUfVAj9LBG8VFHNO0Jke4JjehBKSzDVd1nA0';
var sb2=supabase.createClient(SB_URL,SB_KEY);
// Meta access token KHÔNG còn ở client. Tất cả call Meta API đi qua /api/meta proxy
// (xem helper metaGet/metaPost/metaBatch bên dưới). Token thật ở Vercel env.
var META_BUSINESS_ID='';
var META_GLOBAL_SCOPE_ID='';
// ═══ META API PROXY HELPERS ═══
async function _metaProxyAuthHeader(){var s=await sb2.auth.getSession();var t=s&&s.data&&s.data.session&&s.data.session.access_token;return t?'Bearer '+t:'';}
async function metaApiCall(payload){
  var auth=await _metaProxyAuthHeader();
  if(!auth)return{error:{message:'Chưa đăng nhập'}};
  try{
    var resp=await fetch('/api/meta',{method:'POST',headers:{'Content-Type':'application/json',Authorization:auth},body:JSON.stringify(payload)});
    var data;try{data=await resp.json();}catch(e){data={error:{message:'Phản hồi proxy không phải JSON (HTTP '+resp.status+')'}};}
    if(!resp.ok&&data&&!data.error)data={error:{message:'HTTP '+resp.status}};
    return data;
  }catch(e){return{error:{message:'Lỗi mạng: '+(e.message||e)}};}
}
async function metaGet(path){return await metaApiCall({op:'get',path:path});}
async function metaPost(path){return await metaApiCall({op:'post',path:path});}
async function metaBatch(batchReqs){return await metaApiCall({op:'batch',batch:batchReqs});}
var CL={purple:{c:'var(--purple)',bg:'var(--purple-bg)',tx:'var(--purple-tx)'},teal:{c:'var(--teal)',bg:'var(--teal-bg)',tx:'var(--teal-tx)'},coral:{c:'var(--coral)',bg:'var(--coral-bg)',tx:'var(--coral-tx)'},pink:{c:'var(--pink)',bg:'var(--pink-bg)',tx:'var(--pink-tx)'},blue:{c:'var(--blue)',bg:'var(--blue-bg)',tx:'var(--blue-tx)'},green:{c:'var(--green)',bg:'var(--green-bg)',tx:'var(--green-tx)'},amber:{c:'var(--amber)',bg:'var(--amber-bg)',tx:'var(--amber-tx)'}};
function sc(c){return CL[c]||CL.blue;}
// ═══ SERVICES CATALOG (dịch vụ HC Agency cung cấp) ═══
// Thêm dịch vụ mới: thêm 1 entry vào đây + chạy lại migration nếu cần default
var SERVICES={
  fb_ads:{name:'Quảng cáo Facebook',short:'FB Ads',icon:'📣',color:'blue'},
  tiktok_ads:{name:'Quảng cáo TikTok',short:'TikTok Ads',icon:'🎵',color:'gray'},
  tkqc_rental:{name:'Cho thuê TKQC',short:'Thuê TKQC',icon:'🔑',color:'teal'},
  web_dev:{name:'Lập trình Web App',short:'Web App',icon:'💻',color:'purple'}
};
// ═══ CARE STATUS — TRẠNG THÁI CHĂM SÓC KHÁCH HÀNG (CRM funnel) ═══
var CARE_STATUS={
  new:{name:'Mới',color:'gray'},
  contacting:{name:'Đang trao đổi',color:'amber'},
  sent_quote:{name:'Đã gửi báo giá',color:'blue'},
  negotiating:{name:'Đang đàm phán',color:'purple'},
  won:{name:'Chốt',color:'green'},
  lost:{name:'Mất / Tạm hoãn',color:'red'}
};
var CARE_ORDER=['new','contacting','sent_quote','negotiating','won','lost'];
// ═══ ZALO LINK BUILDER ═══
// Nhận đầu vào linh hoạt: số phone / username / link đầy đủ → trả về URL zalo.me hợp lệ
function buildZaloLink(input){
  if(!input)return'';
  var s=String(input).trim();
  if(!s)return'';
  // Đã là URL đầy đủ
  if(/^https?:\/\//i.test(s))return s;
  // Bỏ ký tự không cần thiết, giữ chữ/số/_/-/./
  s=s.replace(/^@/,'').replace(/\s+/g,'');
  // Nếu chỉ chứa số → coi là phone (chuẩn hóa: bỏ +84/84 thành 0)
  if(/^[\d+\s.-]+$/.test(s)){
    var digits=s.replace(/[^\d]/g,'');
    if(digits.indexOf('84')===0&&digits.length>=11)digits='0'+digits.substring(2);
    return'https://zalo.me/'+digits;
  }
  // Còn lại → coi là username
  return'https://zalo.me/'+s;
}
// Render mảng services thành chuỗi badges HTML
// Map color name → mã màu dot (lấy từ palette badge)
var SERVICE_DOT_COLORS={blue:'#378ADD',teal:'#1D9E75',purple:'#7F77DD',green:'#639922',amber:'#BA7517',red:'#E24B4A',pink:'#D4537E',coral:'#D85A30',gray:'#888780'};
function renderServicesBadges(services,opts){
  if(!services||!services.length)return'<span style="color:var(--tx3);font-size:11px;">—</span>';
  opts=opts||{};
  var arr=Array.isArray(services)?services:[];
  var html=arr.map(function(code){
    var s=SERVICES[code];if(!s)return'';
    var dotColor=SERVICE_DOT_COLORS[s.color]||'#888780';
    var dotHtml=opts.icon!==false?'<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:'+dotColor+';margin-right:5px;vertical-align:middle;"></span>':'';
    return'<span class="badge b-'+s.color+'" style="font-size:10px;margin-right:3px;display:inline-flex;align-items:center;" title="'+s.name+'">'+dotHtml+esc(s.short||s.name)+'</span>';
  }).join('');
  return html||'<span style="color:var(--tx3);font-size:11px;">—</span>';
}
// Render badge nguồn lead (lead_source) — hiển thị trong tab Tiềm năng
function renderLeadSourceBadge(source){
  if(!source)return'';
  var meta={
    web_form:{label:'Form web',icon:'🌐',cls:'b-blue'},
    fb_lead_ads:{label:'FB Lead Ads',icon:'📋',cls:'b-purple'},
    zalo:{label:'Zalo',icon:'💬',cls:'b-teal'},
    referral:{label:'Giới thiệu',icon:'🤝',cls:'b-green'},
    cold_call:{label:'Cold call',icon:'📞',cls:'b-amber'},
    fbpage:{label:'FB Page',icon:'📘',cls:'b-blue'},
    qrcode:{label:'QR code',icon:'🔲',cls:'b-purple'},
    youtube:{label:'YouTube',icon:'📺',cls:'b-red'},
    other:{label:'Khác',icon:'📌',cls:'b-gray'}
  };
  // Nếu source dạng "ref-<id>" → là giới thiệu từ khách cụ thể
  if(source.indexOf('ref-')===0){
    return'<span class="lead-source-badge b-green" title="Giới thiệu bởi: '+esc(source.substring(4))+'">🤝 Giới thiệu</span>';
  }
  var m=meta[source];
  if(!m)return'<span class="lead-source-badge b-gray" title="Nguồn: '+esc(source)+'">'+esc(source)+'</span>';
  return'<span class="lead-source-badge '+m.cls+'" title="Lead từ '+m.label+'">'+m.icon+' '+m.label+'</span>';
}
// Render care status thành chip HTML
function renderCareChip(careStatus){
  var key=careStatus||'new';
  var cs=CARE_STATUS[key]||CARE_STATUS.new;
  return'<span class="badge b-'+cs.color+'" style="font-size:10px;">'+esc(cs.name)+'</span>';
}
// Render nút Zalo (xanh nếu có, xám nếu chưa có)
function renderZaloBtn(c){
  var zaloRaw=(c.zalo||'').trim()||(c.phone||'').trim();
  var phoneSvg='<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
  if(!zaloRaw)return'<button class="btn btn-sm" style="background:transparent;color:var(--tx3);border:1px dashed var(--bd2);padding:4px 10px;font-size:11px;cursor:not-allowed;border-radius:6px;display:inline-flex;align-items:center;gap:5px;" disabled title="Chưa có Zalo/SĐT">'+phoneSvg+' Zalo</button>';
  var url=buildZaloLink(zaloRaw);
  return'<a href="'+esc(url)+'" target="_blank" rel="noopener" class="btn btn-sm" style="background:#0068ff;color:#fff;border:none;padding:5px 10px;font-size:11px;text-decoration:none;display:inline-flex;align-items:center;gap:5px;border-radius:6px;font-weight:500;" title="Mở Zalo: '+esc(zaloRaw)+'" onclick="event.stopPropagation();">'+phoneSvg+' Zalo</a>';
}
// ═══ NGƯỠNG CẢNH BÁO SỐ DƯ Tài khoản ═══
// Khi balance (spend_cap - amount_spent) < giá trị này → hiện cảnh báo ở P6.
// Chỉnh tại đây để thay đổi ngưỡng cho toàn hệ thống.
var BALANCE_ALERT_THRESHOLD=1000000;
var allStaff=[],staffList=[],clientList=[],adList=[],dailyData=[],salaryData=[],txnData=[],monthlyRevData=[],assignData=[],scData=[],metaAccounts=[],campaignMessData=[],adPostData=[],monthlyFeeData=[],contractList=[],quotationList=[],penaltyData=[],teamFundData=[],teamTaskData=[],postScheduleData=[],clientDepositData=[],bankReconcileData=[],bankImportLog=[];
var curPage=0,cDay=null,cStaff=null,dates=[],adminTab=0,finMonth='',authUser=null,expandedAd=null,expandTabIdx=0,adViewDate='',adViewMode='today',adRangeStart='',adRangeEnd='',adSortCol='spend',adSortDir='desc',adSearchText='',adFilterStaff='',adFilterClient='',adFilterStatus='',clientSearchText='',clientFilterPayment='',clientFilterVat='',clientFilterStatus='',clientFilterSpend='',clientFilterService='',clientFilterCare='',clientSortMode='spend_desc',rptMonth='',spendTab=0,clientMonth='',expandedClientId=null,userRole='guest',userAllowedPages=null,currentUserRoleRecord=null,allUserRoles=[],salaryMonth='',expandedSalaryStaffId=null,salarySaveTimers={},clientTab='active',clientActiveSubTab='overview',contractModalClientId=null,newProspectModalOpen=false,newActiveClientModalOpen=false,contractHistoryClientId=null,quotationModalId=null,quotationFilterStatus='',quotationFilterClient='',quotationSearchText='',quotationPreviewId=null,quotationSortCol='issued_date',quotationSortDir='desc',quotationPage=1,QT_PAGE_SIZE=20,clientEditModalId=null,penaltyMonth='',depositModalCtx=null,publicLedgerMode=false,publicLedgerClientId=null,publicLedgerToken=null,publicLedgerMonth=null,publicLeadFormMode=false,publicLeadFormSource='web_form',publicLeadFormCaptcha=0,publicLeadFormCurrentStep=1,cliSpendSearch='',cliSpendType='',cliSpendStaff='',cliSpendHas='',cliSpendSort='spend_desc',finTab='thuchi',reconcileMonth='',reconcileSearch='',editingUserRoleId=null,pendingNewUserRoleStaffId=null,ovMonth='';
/* ===== SORT HELPER ===== */
function sortQuotations(rows,col,dir){
  var mul=dir==='asc'?1:-1;
  return rows.slice().sort(function(a,b){
    var av,bv;
    if(col==='total'){av=(quotationTotals(a).total||0);bv=(quotationTotals(b).total||0);}
    else if(col==='client'){av=((a.client&&a.client.name)||'').toLowerCase();bv=((b.client&&b.client.name)||'').toLowerCase();}
    else if(col==='status'){av=a.status||'';bv=b.status||'';}
    else{av=a[col]||'';bv=b[col]||'';}
    if(av<bv)return-1*mul;if(av>bv)return 1*mul;return 0;
  });
}
function setQuotationSort(col){
  if(quotationSortCol===col)quotationSortDir=quotationSortDir==='asc'?'desc':'asc';
  else{quotationSortCol=col;quotationSortDir='desc';}
  render();
}
var BANK_PROFILES={
business:{bank:'Techcombank',bankCode:'TCB',accountNo:'68915555',accountNoDisplay:'68915555',accountName:'CONG TY TNHH HC QUANG CAO'},
personal:{bank:'Techcombank',bankCode:'TCB',accountNo:'9188899999',accountNoDisplay:'9188 8999 99',accountName:'TRAN TRUC HUNG'}
};
function fm(n){if(!n)return'—';if(n>=1e6)return(n/1e6).toFixed(1)+'tr';if(n>=1e3)return Math.round(n/1e3).toLocaleString('vi-VN')+'K';return n.toLocaleString('vi-VN');}
function ff(n){if(!n)return'—';return n.toLocaleString('vi-VN');}
function fd(d){var p=d.split('-');return parseInt(p[2])+'/'+parseInt(p[1]);}
function toast(m,ok,opts){
  if(!ok&&typeof m==='string'&&/^Lỗi:?\s/i.test(m)&&!/(thử lại|liên hệ|kiểm tra)/i.test(m)){
    m=m.replace(/^Lỗi:?\s*/i,'Không thể thực hiện. ')+' — Vui lòng thử lại hoặc liên hệ quản trị viên.';
  }
  var d=document.createElement('div');
  d.className='toast '+(ok?'toast-ok':'toast-err');
  d.setAttribute('role',ok?'status':'alert');
  d.setAttribute('aria-live',ok?'polite':'assertive');
  var dur=(opts&&opts.duration)||(ok?3000:5000);
  if(opts&&opts.action){
    var msg=document.createElement('span');msg.textContent=m;d.appendChild(msg);
    var btn=document.createElement('button');
    btn.textContent=opts.action.label||'Hoàn tác';
    btn.style.cssText='margin-left:14px;background:rgba(255,255,255,.2);color:#fff;border:none;padding:4px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;';
    btn.onclick=function(){try{opts.action.onClick();}finally{d.remove();}};
    d.appendChild(btn);
  }else{
    d.textContent=m;
  }
  document.getElementById('toast-container').appendChild(d);
  setTimeout(function(){d.remove();},dur);
  return d;
}
/* ===== ERROR TOAST HELPER ===== */
function errToast(scope,err){
  var msg=(err&&err.message)||(typeof err==='string'?err:'Lỗi không xác định');
  toast('Không thể '+scope+'. '+msg+'. Vui lòng thử lại sau ít phút hoặc liên hệ quản trị viên.',false,{duration:5000});
}
/* ===== DEBOUNCE ===== */
function hcDebounce(fn,ms){var t;return function(){var a=arguments,c=this;clearTimeout(t);t=setTimeout(function(){fn.apply(c,a);},ms||250);};}
var hcRenderD=hcDebounce(function(){render();},180);
function hcSearchInput(varName,val){window[varName]=val;hcRenderD();}
/* ===== DARK MODE TOGGLE ===== */
function hcToggleTheme(){
  var cur=document.documentElement.getAttribute('data-theme')==='dark';
  if(cur){document.documentElement.removeAttribute('data-theme');try{localStorage.removeItem('hc-theme');}catch(e){}}
  else{document.documentElement.setAttribute('data-theme','dark');try{localStorage.setItem('hc-theme','dark');}catch(e){}}
  var btn=document.getElementById('theme-toggle-btn');
  if(btn)btn.setAttribute('aria-label',cur?'Chuyển chế độ tối':'Chuyển chế độ sáng');
}
(function(){try{if(localStorage.getItem('hc-theme')==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();
/* ===== KEYBOARD SHORTCUTS ===== */
document.addEventListener('keydown',function(e){
  var tag=(e.target&&e.target.tagName||'').toLowerCase();
  var inField=tag==='input'||tag==='textarea'||tag==='select'||(e.target&&e.target.isContentEditable);
  if((e.metaKey||e.ctrlKey)&&e.key&&e.key.toLowerCase()==='k'){
    var s=document.querySelector('input[placeholder*="Tìm"]');
    if(s){e.preventDefault();s.focus();s.select&&s.select();}
    return;
  }
  if(e.key==='/'&&!inField){
    var s2=document.querySelector('input[placeholder*="Tìm"]');
    if(s2){e.preventDefault();s2.focus();}
    return;
  }
  if((e.metaKey||e.ctrlKey)&&e.shiftKey&&e.key&&e.key.toLowerCase()==='d'){
    e.preventDefault();hcToggleTheme();
  }
});
/* ===== HC CONFIRM DIALOG ===== */
function hcConfirm(opts){
  return new Promise(function(resolve){
    var bd=document.createElement('div');bd.className='hc-confirm-backdrop';
    var dlg=document.createElement('div');dlg.className='hc-confirm';
    dlg.setAttribute('role','alertdialog');dlg.setAttribute('aria-modal','true');dlg.setAttribute('aria-labelledby','hc-cfm-title');
    var title=opts.title||'Xác nhận';
    var msg=opts.message||'Bạn có chắc?';
    var confirmLabel=opts.confirmLabel||'Xác nhận';
    var cancelLabel=opts.cancelLabel||'Hủy';
    var danger=!!opts.danger;
    dlg.innerHTML='<h4 id="hc-cfm-title">'+esc(title)+'</h4><p>'+esc(msg)+'</p>'+
      '<div class="hc-confirm-actions">'+
      '<button class="btn btn-ghost" data-act="cancel">'+esc(cancelLabel)+'</button>'+
      '<button class="btn '+(danger?'btn-red':'btn-primary')+'" data-act="ok">'+esc(confirmLabel)+'</button>'+
      '</div>';
    bd.appendChild(dlg);document.body.appendChild(bd);
    var okBtn=dlg.querySelector('[data-act="ok"]');
    var cancelBtn=dlg.querySelector('[data-act="cancel"]');
    var prevFocus=document.activeElement;
    setTimeout(function(){okBtn.focus();},30);
    function close(v){bd.remove();if(prevFocus&&prevFocus.focus)prevFocus.focus();resolve(v);}
    okBtn.onclick=function(){close(true);};
    cancelBtn.onclick=function(){close(false);};
    bd.addEventListener('click',function(e){if(e.target===bd)close(false);});
    bd.addEventListener('keydown',function(e){
      if(e.key==='Escape'){e.preventDefault();close(false);}
      if(e.key==='Tab'){
        var els=[cancelBtn,okBtn];var i=els.indexOf(document.activeElement);
        e.preventDefault();els[(i+(e.shiftKey?-1:1)+els.length)%els.length].focus();
      }
    });
  });
}
/* ===== FOCUS TRAP cho modal ===== */
function trapFocus(container){
  if(!container)return function(){};
  function handler(e){
    if(e.key!=='Tab')return;
    var focusables=container.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
    if(!focusables.length)return;
    var first=focusables[0],last=focusables[focusables.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  }
  container.addEventListener('keydown',handler);
  return function(){container.removeEventListener('keydown',handler);};
}
/* ===== SEARCHABLE SELECT (vanilla, không lib) =====
   Cách dùng:
   var html = searchableSelect({
     id: 'new-tk-client',           // id của hidden input chứa value (đọc qua getElementById)
     options: [{value, label}, ...], // KHÔNG cần option rỗng — placeholder lo phần đó
     value: '',                       // value hiện tại
     placeholder: '— Chọn —',
     onChange: function(value){...}   // optional, gọi khi user chọn
   });
*/
var SSEL_REG={};
function searchableSelect(o){
  var sid=o.id||('ssel_'+Math.random().toString(36).slice(2,9));
  SSEL_REG[sid]={options:o.options||[],value:o.value==null?'':String(o.value),onChange:o.onChange||null,placeholder:o.placeholder||'— Chọn —'};
  var sel=SSEL_REG[sid].options.find(function(x){return String(x.value)===SSEL_REG[sid].value;});
  var dispText=sel?sel.label:'';
  var arrow='<svg class="ssel-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
  return '<div class="ssel" data-ssel-id="'+sid+'">'+
    '<input type="hidden" id="'+sid+'" value="'+esc(SSEL_REG[sid].value)+'">'+
    '<div class="ssel-display" tabindex="0" onclick="sselToggle(\''+sid+'\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();sselToggle(\''+sid+'\');}">'+
      '<span class="ssel-text'+(dispText?'':' empty')+'">'+esc(dispText||SSEL_REG[sid].placeholder)+'</span>'+
      arrow+
    '</div>'+
    '<div class="ssel-pop" hidden>'+
      '<input type="text" class="ssel-search" placeholder="Tìm..." oninput="sselFilter(\''+sid+'\',this.value)" onkeydown="sselSearchKey(event,\''+sid+'\')">'+
      '<div class="ssel-list" id="'+sid+'__list">'+_sselRenderOpts(sid,'')+'</div>'+
    '</div>'+
  '</div>';
}
function _sselRenderOpts(sid,query){
  var reg=SSEL_REG[sid];if(!reg)return'';
  var q=(query||'').toLowerCase().trim();
  // Bỏ dấu tiếng Việt cho search dễ ("4cats" tìm bằng "cats", "cong" tìm "Chống Thấm")
  function strip(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d');}
  var qN=strip(q);
  var filtered=reg.options.filter(function(o){
    if(!q)return true;
    var ln=strip(o.label);
    return ln.indexOf(qN)>=0;
  });
  if(!filtered.length)return'<div class="ssel-empty">Không có kết quả</div>';
  return filtered.map(function(o){
    var sel=String(o.value)===reg.value?' ssel-opt-selected':'';
    var v=esc(String(o.value));
    return '<div class="ssel-opt'+sel+'" data-value="'+v+'" onclick="sselPick(\''+sid+'\',this.dataset.value)">'+esc(o.label)+'</div>';
  }).join('');
}
function sselToggle(sid){
  var wrap=document.querySelector('[data-ssel-id="'+sid+'"]');if(!wrap)return;
  var pop=wrap.querySelector('.ssel-pop');if(!pop)return;
  var willOpen=pop.hasAttribute('hidden');
  // Đóng các ssel khác đang mở
  document.querySelectorAll('.ssel-pop').forEach(function(p){if(p!==pop)p.setAttribute('hidden','');});
  if(willOpen){
    pop.removeAttribute('hidden');
    var search=pop.querySelector('.ssel-search');
    if(search){search.value='';_sselRefresh(sid,'');setTimeout(function(){search.focus();},10);}
  }else pop.setAttribute('hidden','');
}
function sselFilter(sid,q){_sselRefresh(sid,q);}
function _sselRefresh(sid,q){
  var list=document.getElementById(sid+'__list');
  if(list)list.innerHTML=_sselRenderOpts(sid,q);
}
function sselPick(sid,value){
  var reg=SSEL_REG[sid];if(!reg)return;
  reg.value=String(value);
  var hidden=document.getElementById(sid);if(hidden)hidden.value=reg.value;
  var sel=reg.options.find(function(x){return String(x.value)===reg.value;});
  var dispText=sel?sel.label:'';
  var wrap=document.querySelector('[data-ssel-id="'+sid+'"]');if(!wrap)return;
  var t=wrap.querySelector('.ssel-text');
  if(t){t.textContent=dispText||reg.placeholder;t.classList.toggle('empty',!dispText);}
  var pop=wrap.querySelector('.ssel-pop');if(pop)pop.setAttribute('hidden','');
  if(reg.onChange)try{reg.onChange(reg.value);}catch(e){console.warn('[ssel onChange]',e);}
}
function sselSearchKey(e,sid){
  if(e.key==='Escape'){e.preventDefault();sselToggle(sid);}
  else if(e.key==='Enter'){
    e.preventDefault();
    var first=document.querySelector('[data-ssel-id="'+sid+'"] .ssel-opt');
    if(first)sselPick(sid,first.dataset.value);
  }
}
// Click outside → đóng tất cả ssel pop
document.addEventListener('click',function(e){
  if(e.target.closest('.ssel'))return;
  document.querySelectorAll('.ssel-pop').forEach(function(p){p.setAttribute('hidden','');});
});
/* Auto-attach focus trap khi modal xuất hiện */
var _activeTrap=null;
function ensureModalFocusTrap(){
  if(_activeTrap){_activeTrap();_activeTrap=null;}
  var modal=document.querySelector('.hc-modal[role="dialog"]');
  if(modal){
    _activeTrap=trapFocus(modal);
    var firstInput=modal.querySelector('input,select,textarea,button');
    if(firstInput&&!modal.contains(document.activeElement))setTimeout(function(){firstInput.focus();},50);
  }
}
function esc(s){if(!s)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function moneyVal(v){var n=Number(v);return isFinite(n)?n:0;}
function sameId(a,b){return String(a)===String(b);}
function spendRowsForDate(date){return dailyData.filter(function(d){return d.report_date===date;});}
function spendTotalForDate(date){return spendRowsForDate(date).reduce(function(t,d){return t+moneyVal(d.spend_amount);},0);}
function spendTotalForAccountDate(adId,date){return dailyData.filter(function(d){return sameId(d.ad_account_id,adId)&&d.report_date===date;}).reduce(function(t,d){return t+moneyVal(d.spend_amount);},0);}
function spendTotalForRange(start,end){return dailyData.filter(function(d){return d.report_date&&d.report_date>=start&&d.report_date<=end;}).reduce(function(t,d){return t+moneyVal(d.spend_amount);},0);}
function spendTotalForAccountRange(adId,start,end){return dailyData.filter(function(d){return sameId(d.ad_account_id,adId)&&d.report_date>=start&&d.report_date<=end;}).reduce(function(t,d){return t+moneyVal(d.spend_amount);},0);}
function daysBetween(start,end){if(!start||!end)return 1;var ms=new Date(end+'T00:00:00')-new Date(start+'T00:00:00');return Math.max(1,Math.floor(ms/86400000)+1);}
function getAdViewRange(){
  var t=td();
  if(adViewMode==='today')return{start:t,end:t,label:'Hôm nay '+fd(t),short:'Hôm nay',colHeader:'Chi tiêu '+fd(t)};
  if(adViewMode==='yesterday'){var y=yesterday();return{start:y,end:y,label:'Hôm qua '+fd(y),short:'Hôm qua',colHeader:'Chi tiêu '+fd(y)};}
  if(adViewMode==='this_month'){var ms=t.substring(0,7),mNum=parseInt(ms.split('-')[1]);return{start:ms+'-01',end:t,label:'T'+mNum+'/'+ms.split('-')[0]+' (đến '+fd(t)+')',short:'T'+mNum,colHeader:'Chi tiêu T'+mNum};}
  if(adViewMode==='last_month'){var d=new Date();d.setDate(1);d.setMonth(d.getMonth()-1);var ly=d.getFullYear(),lmo=d.getMonth()+1,lastDay=new Date(ly,lmo,0).getDate(),pad=function(n){return('0'+n).slice(-2);};var s=ly+'-'+pad(lmo)+'-01',e=ly+'-'+pad(lmo)+'-'+pad(lastDay);return{start:s,end:e,label:'T'+lmo+'/'+ly,short:'T'+lmo,colHeader:'Chi tiêu T'+lmo};}
  if(adViewMode==='custom'){var s2=adRangeStart||t,e2=adRangeEnd||t;if(s2>e2){var tmp=s2;s2=e2;e2=tmp;}var lbl=fd(s2)+' → '+fd(e2);return{start:s2,end:e2,label:lbl,short:'Tùy chỉnh',colHeader:'Chi tiêu '+lbl};}
  return{start:t,end:t,label:'Hôm nay '+fd(t),short:'Hôm nay',colHeader:'Chi tiêu '+fd(t)};
}
function setAdViewMode(mode){
  adViewMode=mode;
  if(mode==='custom'&&!adRangeStart){var t=td();adRangeStart=t.substring(0,8)+'01';adRangeEnd=t;}
  var r=getAdViewRange();adViewDate=r.end;
  render();
}
function setAdCustomRange(which,val){if(which==='start')adRangeStart=val;else adRangeEnd=val;adViewMode='custom';var r=getAdViewRange();adViewDate=r.end;render();}
function needAuth(){if(!authUser){toast('Vui lòng đăng nhập để tiếp tục.',false);return false;}return true;}
function needAdmin(){if(!isAdmin()){toast('Thao tác này yêu cầu quyền Admin. Liên hệ quản trị viên nếu cần.',false);return false;}return true;}
function safeJsString(v){return JSON.stringify(v==null?'':String(v));}
function safeJsAttrString(v){return safeJsString(v).replace(/"/g,'&quot;');}
function vnDateStr(offset){var d=new Date(),u=d.getTime()+d.getTimezoneOffset()*60000+25200000+(offset||0),v=new Date(u);return v.getFullYear()+'-'+('0'+(v.getMonth()+1)).slice(-2)+'-'+('0'+v.getDate()).slice(-2);}
function td(){return vnDateStr(0);}
function gm(){return td().substring(0,7);}
function lm(){return dates.length?dates[dates.length-1].substring(0,7):gm();}
function yesterday(){return vnDateStr(-86400000);}
function toggleSidebar(){var sb=document.getElementById('sidebar');var ov=document.getElementById('overlay');if(sb)sb.classList.toggle('open');if(ov)ov.classList.toggle('show');}
function metaNum(v){var n=parseInt(v,10);return isNaN(n)?0:n;}
function hasComparableSpendCap(a){return !!(a&&a.spend_cap&&a.amount_spent>=0&&a.amount_spent<=a.spend_cap);}
function isMissingRelationError(err){return !!(err&&err.message&&/relation .* does not exist/i.test(err.message));}
function isMissingColumnError(err){return !!(err&&err.message&&(/column .* does not exist/i.test(err.message)||/Could not find .* column/i.test(err.message)||/schema cache/i.test(err.message)));}
function invoiceDomId(clientId){return String(clientId).replace(/[^A-Za-z0-9_-]/g,'_');}
function monthKey(month){return (month||'').substring(0,7);}
function normalizeMoneyInput(v){return metaNum(String(v||'').replace(/[^0-9]/g,''));}
function formatMoneyInput(el){
  if(!el)return;
  var raw=String(el.value||'').replace(/[^0-9]/g,'');
  el.value=raw?parseInt(raw,10).toLocaleString('vi-VN'):'';
}
function getMonthlyFeeRecord(clientId,month){var mk=monthKey(month);for(var i=0;i<monthlyFeeData.length;i++){var r=monthlyFeeData[i];if(r.client_id===clientId&&r.month===mk)return r;}return null;}
function getEffectiveServiceFee(clientId,month,baseFee){var rec=getMonthlyFeeRecord(clientId,month);return rec?metaNum(rec.service_fee):metaNum(baseFee);}
function getClientVatFlag(c){return !!(c&&c.has_vat);}
function getBankProfile(c){return getClientVatFlag(c)?BANK_PROFILES.business:BANK_PROFILES.personal;}
function getTransferContent(hasVat){return hasVat?'thanh toan tu van quang cao':'chuyen khoan';}
function getInvoiceBankTitle(hasVat,bank){return bank+' — '+(hasVat?'STK doanh nghiệp (VAT)':'STK cá nhân');}
function getInvoiceContentLabel(hasVat){return hasVat?'ND:':'CK:';}
// Cho thuê TKQC — tính phí theo % spend
function hasRentalService(c){var arr=Array.isArray(c&&c.services)?c.services:(c&&c.services?[c.services]:[]);return arr.indexOf('tkqc_rental')>=0;}
function getRentalFeePct(c){var v=c&&c.rental_fee_pct;v=typeof v==='number'?v:parseFloat(v);return v>0&&v<1?v:0;}
function getMonthSpendForClient(clientId,month,opts){
if(!clientId||!month)return 0;
opts=opts||{};
var startDate=null;
if(opts.respectStartDate){var c=clientList.find(function(x){return x.id===clientId;});if(c&&c.start_date)startDate=c.start_date;}
var mk=monthKey(month),total=0;
dailyData.forEach(function(d){
if(!d||!d.report_date||d.report_date.substring(0,7)!==mk)return;
if(startDate&&d.report_date<startDate)return; // bỏ ngày trước start_date
var cid=d.matched_client_id||null;
if(!cid){var aa=adList.find(function(a){return a.id===d.ad_account_id;});if(aa){var asg=getAssign(d.ad_account_id,d.report_date);cid=asg.length?asg[0].client_id:aa.client_id;}}
if(cid===clientId)total+=metaNum(d.spend_amount);
});
return total;
}
function getRentalFeeAmount(c,month,monthSpend){
if(!hasRentalService(c))return 0;
var pct=getRentalFeePct(c);if(!pct)return 0;
// Rental fee chỉ tính spend từ start_date onwards
var sp=typeof monthSpend==='number'?monthSpend:getMonthSpendForClient(c&&c.id,month,{respectStartDate:true});
if(!sp||sp<=0)return 0;
return Math.round(sp*pct/1000)*1000; // làm tròn 1000đ
}
// ═══ DEPOSIT (TIỀN NẠP) HELPERS ═══
function getClientDeposits(clientId,month){
  if(!clientId)return [];
  var mk=month?monthKey(month):null;
  return clientDepositData.filter(function(d){return d.client_id===clientId&&(!mk||(d.deposit_date||'').substring(0,7)===mk);}).sort(function(a,b){return(a.deposit_date||'').localeCompare(b.deposit_date||'');});
}
function getDepositTotal(clientId,month){return getClientDeposits(clientId,month).reduce(function(t,d){return t+(parseInt(d.amount)||0);},0);}
// Số dư đầu kỳ = closing balance của các tháng từ start_date đến tháng trước hiện tại, cộng dồn
function nextMonthKey(ms){var p=ms.split('-'),y=parseInt(p[0]),m=parseInt(p[1])+1;if(m>12){m=1;y++;}return y+'-'+('0'+m).slice(-2);}
function getRentalOpeningBalance(clientId,month){
  var c=clientList.find(function(x){return x.id===clientId;});
  if(!c||!c.start_date)return 0;
  var startMonth=c.start_date.substring(0,7),curMonth=monthKey(month);
  if(curMonth<=startMonth)return 0;
  var bal=0,iter=startMonth,guard=0;
  while(iter<curMonth&&guard++<240){
    var dep=getDepositTotal(clientId,iter);
    var sp=getMonthSpendForClient(clientId,iter,{respectStartDate:true});
    var fee=getRentalFeeAmount(c,iter,sp);
    bal=bal+dep-sp-fee;
    iter=nextMonthKey(iter);
  }
  return bal;
}
// Spend matrix: trả về object {accounts:[{id,name,daily:[d1..dN]}], dayTotals:[..], grandTotal, daysInMonth}
function buildRentalMatrix(clientId,month){
  var ms=monthKey(month);
  var year=parseInt(ms.split('-')[0]),mo=parseInt(ms.split('-')[1]);
  var daysInMonth=new Date(year,mo,0).getDate();
  var c=clientList.find(function(x){return x.id===clientId;});
  var startDate=c&&c.start_date?c.start_date:null;
  // Day index khi nào bắt đầu tính (0-based). Ngày trước start_date sẽ để 0/—
  var startDayIdx=0;
  if(startDate){
    var sd=startDate.split('-');
    if(sd.length===3&&parseInt(sd[0])===year&&parseInt(sd[1])===mo)startDayIdx=parseInt(sd[2])-1;
    else if(startDate>ms+'-31')startDayIdx=daysInMonth; // start_date sau tháng đang xem → không có gì
  }
  // Lấy tất cả TKQC liên quan TRONG THÁNG đang xem:
  // - Có assignment client_id===clientId overlap với tháng (start ≤ lastDay, end null hoặc ≥ firstDay)
  // - Fallback: ad_account.client_id===clientId VÀ chưa từng có assignment nào (TKQC mới chưa setup phân công)
  // → Sau khi assignment kết thúc (vd end_date=30/04), tháng 5 sẽ KHÔNG còn hiện TKQC đó nữa.
  var firstDay=ms+'-01',lastDay=ms+'-'+(daysInMonth<10?'0'+daysInMonth:daysInMonth);
  var accMap={};
  assignData.forEach(function(ag){
    if(ag.client_id!==clientId)return;
    if(ag.start_date&&ag.start_date>lastDay)return;        // assignment bắt đầu sau tháng
    if(ag.end_date&&ag.end_date<firstDay)return;           // assignment kết thúc trước tháng
    if(accMap[ag.ad_account_id])return;
    var acc=adList.find(function(x){return x.id===ag.ad_account_id;});
    if(acc){
      // Ưu tiên snapshot tên TKQC tại thời điểm assignment (giữ tên cũ trong báo cáo lịch sử). Fallback về tên hiện tại nếu chưa có snapshot.
      var nm=ag.account_name_snapshot||acc.account_name||acc.fb_account_id||acc.id;
      accMap[acc.id]={id:acc.id,name:nm,daily:new Array(daysInMonth).fill(0)};
    }
  });
  // Fallback: TKQC gán cứng client_id nhưng chưa có assignment nào
  adList.forEach(function(a){
    if(a.client_id!==clientId||accMap[a.id])return;
    var hasAnyAssign=assignData.some(function(ag){return ag.ad_account_id===a.id;});
    if(hasAnyAssign)return; // đã có assignment record → ưu tiên logic overlap ở trên
    accMap[a.id]={id:a.id,name:a.account_name||a.fb_account_id||a.id,daily:new Array(daysInMonth).fill(0)};
  });
  // Tổng hợp spend từ dailyData
  dailyData.forEach(function(d){
    if(!d||!d.report_date||d.report_date.substring(0,7)!==ms)return;
    if(startDate&&d.report_date<startDate)return; // bỏ ngày trước start_date
    var cid=d.matched_client_id||null;
    if(!cid){var aa=adList.find(function(a){return a.id===d.ad_account_id;});if(aa){var asg=getAssign(d.ad_account_id,d.report_date);cid=asg.length?asg[0].client_id:aa.client_id;}}
    if(cid!==clientId)return;
    var spendVal=metaNum(d.spend_amount);
    if(!accMap[d.ad_account_id]){
      // Chỉ auto-add TKQC chưa có trong matrix khi thực sự có spend > 0.
      // Tránh case: cron sync luôn insert row spend=0 cho TK đã end assignment → vẫn hiện trong sổ.
      if(spendVal<=0)return;
      var aa2=adList.find(function(a){return a.id===d.ad_account_id;});
      accMap[d.ad_account_id]={id:d.ad_account_id,name:aa2?(aa2.account_name||aa2.fb_account_id):'TKQC #'+d.ad_account_id.substring(0,6),daily:new Array(daysInMonth).fill(0)};
    }
    var day=parseInt(d.report_date.substring(8,10))-1;
    if(day>=0&&day<daysInMonth)accMap[d.ad_account_id].daily[day]+=spendVal;
  });
  var accounts=Object.values(accMap).sort(function(a,b){var sa=a.daily.reduce(function(t,v){return t+v;},0),sb=b.daily.reduce(function(t,v){return t+v;},0);return sb-sa||(a.name||'').localeCompare(b.name||'');});
  var dayTotals=new Array(daysInMonth).fill(0),grandTotal=0;
  accounts.forEach(function(a){a.daily.forEach(function(v,i){dayTotals[i]+=v;});grandTotal+=a.daily.reduce(function(t,v){return t+v;},0);});
  return{accounts:accounts,dayTotals:dayTotals,grandTotal:grandTotal,daysInMonth:daysInMonth,year:year,month:mo,startDayIdx:startDayIdx,startDate:startDate};
}
function fmtCellMatrix(n){return n?fm(n):'<span style="color:var(--tx3);">—</span>';}
// Render Sổ rental: matrix + summary box + lịch sử nạp tiền
function renderRentalLedger(c,ms,sp,invoice){
  var matrix=buildRentalMatrix(c.id,ms);
  // Đè sp/invoice theo matrix (đã filter start_date) để đảm bảo nhất quán
  sp=matrix.grandTotal;
  invoice=getInvoiceTotals(c,ms,undefined,sp);
  var deposits=getClientDeposits(c.id,ms);
  var depositTotal=deposits.reduce(function(t,d){return t+(parseInt(d.amount)||0);},0);
  var rentalFee=invoice.rentalFee||0;
  var opening=getRentalOpeningBalance(c.id,ms);
  var balance=opening+depositTotal-sp-rentalFee;
  var rentalPctLabel=invoice.rentalPct?(Math.round(invoice.rentalPct*1000)/10)+'%':'?%';
  var mLabel='T'+matrix.month+'/'+matrix.year;
  var domId=invoiceDomId(c.id);
  var h='<div class="rental-ledger" id="rental-ledger-'+domId+'">';
  // Header strip
  h+='<div class="rental-head">';
  h+='<div class="rental-title-block"><div class="rental-title">Sổ rental — '+esc(c.name)+'</div><div class="rental-meta"><span class="header-chip-rental">🔑 Cho thuê TKQC · Phí '+rentalPctLabel+'</span><span class="rental-period">Kỳ '+mLabel+'</span></div></div>';
  h+='<div class="rental-actions">';
  if(authUser){
    h+='<button class="btn btn-sm" onclick="syncMetaForClient(\''+c.id+'\',\''+ms+'\',this)" title="Đồng bộ chi tiêu Meta cho khách này">🔄 Sync Meta</button>';
    h+='<button class="btn btn-sm" onclick="copyClientShareLink(\''+c.id+'\',this)" title="Sao chép link cho khách xem qua điện thoại">🔗 Sao chép link</button>';
  }
  h+='</div>';
  h+='</div>';
  // 2 cột: matrix + summary
  h+='<div class="rental-grid">';
  // LEFT: matrix
  var startDayIdx=matrix.startDayIdx||0;
  var startDateLabel='';
  if(matrix.startDate){var sd=matrix.startDate.split('-');if(sd.length===3)startDateLabel=sd[2]+'/'+sd[1]+'/'+sd[0];}
  h+='<div class="rental-card">';
  h+='<div class="rental-card-head"><div><div class="rental-card-title">Chi tiêu theo TKQC × Ngày</div><div class="rental-card-meta">'+matrix.accounts.length+' tài khoản · '+matrix.daysInMonth+' ngày · cập nhật từ Meta'+(startDateLabel&&startDayIdx>0?' · <strong style="color:var(--teal-tx);">bắt đầu thuê '+startDateLabel+'</strong>':'')+'</div></div></div>';
  h+='<div class="rental-matrix-wrap"><table class="rental-matrix">';
  // header
  h+='<thead><tr><th>TKQC</th>';
  for(var d=1;d<=matrix.daysInMonth;d++){var cls=(d-1<startDayIdx)?' class="pre-start"':((d-1===startDayIdx&&startDayIdx>0)?' class="start-mark"':'');h+='<th'+cls+'>'+d+'</th>';}
  h+='<th class="col-total">Tổng tháng</th></tr></thead><tbody>';
  if(matrix.accounts.length===0){
    h+='<tr><td colspan="'+(matrix.daysInMonth+2)+'" style="text-align:center;color:var(--tx3);padding:24px;">Chưa có TKQC nào gắn với khách. Vào tab Tài khoản quảng cáo → gán TKQC cho khách này trước.</td></tr>';
  }else{
    matrix.accounts.forEach(function(a){
      var rowSum=a.daily.reduce(function(t,v){return t+v;},0);
      h+='<tr><td>'+esc(a.name)+'</td>';
      a.daily.forEach(function(v,i){var cls=(i<startDayIdx)?' class="pre-start"':((i===startDayIdx&&startDayIdx>0)?' class="start-mark"':'');h+='<td'+cls+'>'+(i<startDayIdx?'<span style="color:var(--tx3);opacity:.5;">·</span>':fmtCellMatrix(v))+'</td>';});
      h+='<td class="col-total">'+fmtCellMatrix(rowSum)+'</td></tr>';
    });
    h+='<tr class="total"><td>Tổng cộng</td>';
    matrix.dayTotals.forEach(function(t,i){var cls=(i<startDayIdx)?' class="pre-start"':((i===startDayIdx&&startDayIdx>0)?' class="start-mark"':'');h+='<td'+cls+'>'+(i<startDayIdx?'<span style="color:var(--tx3);opacity:.5;">·</span>':fmtCellMatrix(t))+'</td>';});
    h+='<td class="col-total">'+fmtCellMatrix(matrix.grandTotal)+'</td></tr>';
  }
  h+='</tbody></table></div></div>';
  // RIGHT: summary box
  h+='<div class="rental-summary">';
  h+='<div class="rental-summary-title">Tổng kết '+mLabel+'</div>';
  if(opening!==0)h+='<div class="rental-sum-row"><span>Số dư đầu kỳ <span style="color:var(--tx3);font-size:11px;">(chuyển từ kỳ trước)</span></span><strong class="v-opening'+(opening<0?' negative':'')+'">'+(opening>=0?'+':'')+fm(opening)+'</strong></div>';
  h+='<div class="rental-sum-row"><span>Tiền nạp</span><strong class="v-deposit">'+fm(depositTotal)+'</strong></div>';
  h+='<div class="rental-sum-row"><span>Tiền chạy (spend)</span><strong class="v-spend">'+fm(sp)+'</strong></div>';
  h+='<div class="rental-sum-row"><span>Phí thuê '+rentalPctLabel+'</span><strong class="v-fee">'+fm(rentalFee)+'</strong></div>';
  h+='<div class="rental-sum-balance"><span>Số dư cuối kỳ</span><strong class="v-balance'+(balance<0?' negative':'')+'">'+(balance>=0?'+':'')+fm(balance)+'</strong></div>';
  h+='<div class="rental-sum-hint">= '+(opening!==0?'Đầu kỳ + ':'')+'Nạp − Chạy − Phí thuê'+(balance<500000&&balance>=0?'<br>⚠ Số dư thấp, nhắc khách nạp thêm':'')+(balance<0?'<br>⚠ Số dư âm — khách cần nạp gấp':'')+'</div>';
  h+='</div>';
  h+='</div>';
  // Lịch sử nạp tiền
  h+='<div class="rental-card" style="margin-top:14px;">';
  h+='<div class="rental-card-head"><div><div class="rental-card-title">Lịch sử nạp tiền — '+mLabel+'</div><div class="rental-card-meta">'+deposits.length+' lần nạp · Tổng <strong style="color:var(--green-tx);">'+fm(depositTotal)+'</strong></div></div>';
  if(authUser)h+='<button class="btn btn-sm btn-primary" onclick="openDepositModal(\''+c.id+'\',\''+ms+'\')">➕ Thêm khoản nạp</button>';
  h+='</div>';
  if(deposits.length===0){
    h+='<div style="padding:24px;text-align:center;color:var(--tx3);font-size:13px;">Chưa ghi nhận khoản nạp nào trong tháng này.</div>';
  }else{
    deposits.forEach(function(d){
      var dp=(d.deposit_date||'').split('-');var dStr=dp.length===3?(dp[2]+'/'+dp[1]+'/'+dp[0]):d.deposit_date;
      h+='<div class="rental-deposit-row"><div class="rental-deposit-date">'+esc(dStr)+'</div><div class="rental-deposit-note">'+esc(d.note||'—')+'</div><div class="rental-deposit-amount">'+fm(d.amount)+'</div>'+(authUser?'<button class="kh-edit-btn" onclick="deleteDeposit(\''+d.id+'\')" title="Xóa khoản nạp" style="opacity:1;color:var(--red-tx);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/></svg></button>':'<span></span>')+'</div>';
    });
  }
  h+='</div>';
  h+='</div>'; // .rental-ledger
  return h;
}
function getInvoiceTotals(c,month,feeOverride,monthSpend){
var flatFee=typeof feeOverride==='number'?feeOverride:getEffectiveServiceFee(c.id,month,c.service_fee);
var rentalPct=getRentalFeePct(c),rentalActive=hasRentalService(c)&&rentalPct>0;
var spForRental=rentalActive?(typeof monthSpend==='number'?monthSpend:getMonthSpendForClient(c.id,month)):0;
var rentalFee=rentalActive?getRentalFeeAmount(c,month,spForRental):0;
var fee=flatFee+rentalFee;
var hasVat=getClientVatFlag(c),vat=hasVat?Math.round(fee*0.08):0,bank=getBankProfile(c);
return{fee:fee,flatFee:flatFee,rentalFee:rentalFee,rentalPct:rentalActive?rentalPct:0,rentalSpend:spForRental,vat:vat,total:fee+vat,hasVat:hasVat,bank:bank,content:getTransferContent(hasVat)};
}
function getVietQrImageUrl(c,month,flatFee,monthSpend){
var info=getInvoiceTotals(c,month,flatFee,monthSpend),bank=info.bank;
return 'https://img.vietqr.io/image/'+bank.bankCode+'-'+bank.accountNo+'-compact2.png?amount='+info.total+'&addInfo='+encodeURIComponent(info.content)+'&accountName='+encodeURIComponent(bank.accountName);
}
function clientFilterMatch(row,month){
var c=row.c,sp=row.spend,search=String(clientSearchText||'').toLowerCase().trim();
if(search){
var hay=[c.name,c.contact_person,c.campaign_keyword].map(function(v){return String(v||'').toLowerCase();}).join(' ');
if(hay.indexOf(search)<0)return false;
}
var ps=getClientPaymentStatus(c);
if(clientFilterPayment&&clientFilterPayment!==ps)return false;
if(clientFilterVat==='vat'&&!getClientVatFlag(c))return false;
if(clientFilterVat==='no_vat'&&getClientVatFlag(c))return false;
if(clientFilterStatus&&c.status!==clientFilterStatus)return false;
if(clientFilterSpend==='has_spend'&&sp<=0)return false;
if(clientFilterSpend==='no_spend'&&sp>0)return false;
if(clientFilterService){var svcArr=Array.isArray(c.services)?c.services:(c.services?[c.services]:['fb_ads']);if(svcArr.indexOf(clientFilterService)<0)return false;}
if(clientFilterCare){var careV=c.care_status||(c.status==='prospect'?'new':'won');if(careV!==clientFilterCare)return false;}
return true;
}
function sortClientRows(rows,month){
rows.sort(function(a,b){
if(clientSortMode==='fee_desc'){var fA=getEffectiveServiceFee(a.c.id,month,a.c.service_fee)+getRentalFeeAmount(a.c,month,a.spend);var fB=getEffectiveServiceFee(b.c.id,month,b.c.service_fee)+getRentalFeeAmount(b.c,month,b.spend);return fB-fA||a.c.name.localeCompare(b.c.name);}
if(clientSortMode==='name_asc')return a.c.name.localeCompare(b.c.name);
if(clientSortMode==='unpaid_first'){var pri={invoice_sent:0,unpaid:1,paid:2};var ap=pri[getClientPaymentStatus(a.c)],bp=pri[getClientPaymentStatus(b.c)];return ap-bp||b.spend-a.spend||a.c.name.localeCompare(b.c.name);}
return b.spend-a.spend||a.c.name.localeCompare(b.c.name);
});
}
// Trạng thái thanh toán: 'unpaid' (mặc định) | 'invoice_sent' | 'paid'
function getClientPaymentStatus(c){var v=c&&c.payment_status;return(v==='paid'||v==='invoice_sent')?v:'unpaid';}
function paymentLabel(s){return s==='paid'?'Đã thanh toán':(s==='invoice_sent'?'Đã gửi phiếu':'Chưa thanh toán');}
function paymentBadgeClass(s){return s==='paid'?'b-green':(s==='invoice_sent'?'b-amber':'b-gray');}
function paymentBadgeHtml(s){return '<span class="badge '+paymentBadgeClass(s)+'">'+paymentLabel(s)+'</span>';}
function isPaymentDue(s){return s!=='paid';}
function clientFilterLabel(kind,val){
if(kind==='payment')return paymentLabel(val);
if(kind==='vat')return val==='vat'?'Có VAT':'Không VAT';
if(kind==='status')return val==='active'?'Đang hoạt động':(val==='paused'?'Tạm dừng':'Dừng');
if(kind==='spend')return val==='has_spend'?'Có chi tiêu':'Chưa có chi tiêu';
if(kind==='sort')return {spend_desc:'Chi tiêu cao nhất',fee_desc:'Phí Dịch vụ cao nhất',name_asc:'Tên A-Z',unpaid_first:'Cần thu trước'}[val]||'';
if(kind==='service')return(SERVICES[val]&&SERVICES[val].name)||val;
if(kind==='care')return(CARE_STATUS[val]&&CARE_STATUS[val].name)||val;
return val||'';
}
function enhanceUI(){
var page=document.getElementById('page');if(!page)return;
page.querySelectorAll('[style*="background:var(--bg1)"][style*="border:1px solid var(--bd1)"][style*="border-radius:var(--radius-lg)"]').forEach(function(el){el.classList.add('surface-card');});
page.querySelectorAll('.table-wrap table').forEach(function(tbl){if(tbl.querySelectorAll('th').length>8)tbl.style.minWidth='880px';});
}

// ═══ LOAD ALL DATA ═══
// Tier 1 perf: chia 2 wave để first paint nhanh.
// Wave 1 (await + render): 8 query critical, daily_spend chỉ 60 ngày gần nhất
// Wave 2 (background): 7 query phụ + daily_spend mở rộng 60→180 ngày
// Globals deferred init = [] để code hiện tại không lỗi khi gọi sớm.
async function fetchPaged(query){var all=[],from=0,size=1000;while(true){var{data,error}=await query.range(from,from+size-1);if(error)return{data:all,error:error};all=all.concat(data||[]);if(!data||data.length<size)break;from+=size;}return{data:all,error:null};}
async function loadAll(){try{
 var minDate60=new Date(Date.now()-60*86400000).toISOString().substring(0,10);
 // ─── Wave 1: critical cho first paint ───
 var[s,c,aa,ds,asgn,mf,sc2,tx]=await Promise.all([
sb2.from('staff').select('*').order('monthly_budget',{ascending:false}),
sb2.from('client').select('*').order('name'),
sb2.from('ad_account').select('*,client(name)').order('account_name'),
fetchPaged(sb2.from('daily_spend').select('id,report_date,ad_account_id,spend_amount,staff_id,matched_client_id').gte('report_date',minDate60).order('report_date')),
sb2.from('assignment').select('*').order('start_date',{ascending:false}),
sb2.from('client_monthly_fee').select('*').order('month',{ascending:false}),
sb2.from('staff_client').select('*,client(name)'),
sb2.from('transaction').select('*,client(name),staff(short_name)').order('txn_date',{ascending:false})
]);
var errs=[];
 [['staff',s],['client',c],['ad_account',aa],['daily_spend',ds],['assignment',asgn],['transaction',tx]].forEach(function(pair){if(pair[1].error)errs.push(pair[0]+': '+pair[1].error.message);});
 if(mf.error)console.warn('[client_monthly_fee]',String(mf.error.message||mf.error));
 if(errs.length)throw new Error(errs.join('; '));
 allStaff=s.data||[];staffList=allStaff.filter(function(x){return x.is_active;});
 clientList=c.data||[];adList=aa.data||[];dailyData=ds.data||[];
 txnData=tx.data||[];
 scData=sc2.data||[];assignData=asgn.data||[];
 rebuildAssignIndex();
 monthlyFeeData=mf.error?[]:(mf.data||[]);
 // Defer empty defaults — wave 2 sẽ ghi đè
 salaryData=salaryData||[];monthlyRevData=monthlyRevData||[];campaignMessData=campaignMessData||[];adPostData=adPostData||[];
 contractList=contractList||[];quotationList=quotationList||[];penaltyData=penaltyData||[];teamFundData=teamFundData||[];teamTaskData=teamTaskData||[];postScheduleData=postScheduleData||[];clientDepositData=clientDepositData||[];
 var ds2=new Set();dailyData.forEach(function(d){ds2.add(d.report_date);});
dates=Array.from(ds2).sort();if(dates.length)cDay=dates.length-1;
if(!finMonth)finMonth=lm();if(!adViewDate)adViewDate=td();if(!rptMonth)rptMonth=lm();if(!clientMonth)clientMonth=lm();if(!ovMonth)ovMonth=lm();
render();
// ─── Wave 2: background, không await ───
loadDeferred();
}catch(e){document.getElementById('page').innerHTML='<div class="error-box">Lỗi: '+esc(e.message)+'</div>';}}
async function loadDeferred(){try{
 var minDate60=new Date(Date.now()-60*86400000).toISOString().substring(0,10);
 var minDate180=new Date(Date.now()-180*86400000).toISOString().substring(0,10);
 var[sal,mr,cmess,adp,ctr,qt,pnl,tfw,tt,pss,dep,dsExt,brec,blog]=await Promise.all([
sb2.from('salary').select('*,staff(short_name)').order('month',{ascending:false}),
sb2.from('monthly_revenue').select('*,staff(short_name,code)').order('month'),
fetchPaged(sb2.from('campaign_daily_mess').select('*,ad_account(id,account_name,client_id,max_mess_cost,max_lead_cost,client(name))').order('report_date',{ascending:false})),
fetchPaged(sb2.from('ad_daily_post').select('*').gte('report_date','2026-04-01').order('report_date',{ascending:false})),
sb2.from('contract').select('*,client(name,company_full_name)').order('created_at',{ascending:false}),
sb2.from('quotation').select('*,client(name,company_full_name)').order('created_at',{ascending:false}),
sb2.from('penalty').select('*').order('penalty_date',{ascending:false}),
sb2.from('team_fund_withdrawal').select('*').order('withdrawal_date',{ascending:false}),
sb2.from('team_task').select('*').gte('task_date',new Date(Date.now()-30*86400000).toISOString().substring(0,10)).order('task_date',{ascending:false}),
sb2.from('staff_post_schedule').select('*').gte('post_date',new Date(Date.now()-180*86400000).toISOString().substring(0,10)).order('post_date',{ascending:true}),
sb2.from('client_deposit').select('*').order('deposit_date',{ascending:false}),
fetchPaged(sb2.from('daily_spend').select('id,report_date,ad_account_id,spend_amount,staff_id,matched_client_id').gte('report_date',minDate180).lt('report_date',minDate60).order('report_date')),
sb2.from('bank_reconcile').select('*').order('bank_date',{ascending:false}),
sb2.from('bank_import_log').select('*').order('uploaded_at',{ascending:false}).limit(50)
 ]);
 if(sal&&!sal.error)salaryData=sal.data||[];
 if(mr&&!mr.error)monthlyRevData=mr.data||[];
 if(cmess&&!cmess.error)campaignMessData=cmess.data||[];
 if(adp&&!adp.error)adPostData=adp.data||[];
 if(ctr&&!ctr.error)contractList=ctr.data||[];
 if(qt&&!qt.error)quotationList=qt.data||[];
 if(pnl&&!pnl.error)penaltyData=pnl.data||[];
 if(tfw&&!tfw.error)teamFundData=tfw.data||[];
 if(tt&&!tt.error)teamTaskData=tt.data||[];
 if(pss&&!pss.error)postScheduleData=pss.data||[];
 if(dep&&!dep.error)clientDepositData=dep.data||[];
 if(brec&&!brec.error)bankReconcileData=brec.data||[];
 if(blog&&!blog.error)bankImportLog=blog.data||[];
 if(dsExt&&!dsExt.error&&dsExt.data&&dsExt.data.length){
   dailyData=dailyData.concat(dsExt.data);
   var ds2=new Set();dailyData.forEach(function(d){ds2.add(d.report_date);});
   dates=Array.from(ds2).sort();
 }
 // Re-render để cập nhật tab nào đang xem nếu cần data wave 2
 render();
}catch(e){console.warn('[loadDeferred]',e.message);}}

async function loadLight(){try{
var[s,c,aa,sal,tx,sc2,asgn,mf,ctr,qt,dep]=await Promise.all([
sb2.from('staff').select('*').order('monthly_budget',{ascending:false}),
sb2.from('client').select('*').order('name'),
sb2.from('ad_account').select('*,client(name)').order('account_name'),
sb2.from('salary').select('*,staff(short_name)').order('month',{ascending:false}),
sb2.from('transaction').select('*,client(name),staff(short_name)').order('txn_date',{ascending:false}),
sb2.from('staff_client').select('*,client(name)'),
sb2.from('assignment').select('*').order('start_date',{ascending:false}),
sb2.from('client_monthly_fee').select('*').order('month',{ascending:false}),
sb2.from('contract').select('*,client(name,company_full_name)').order('created_at',{ascending:false}),
sb2.from('quotation').select('*,client(name,company_full_name)').order('created_at',{ascending:false}),
sb2.from('client_deposit').select('*').order('deposit_date',{ascending:false})
]);
allStaff=s.data||[];staffList=allStaff.filter(function(x){return x.is_active;});
clientList=c.data||[];adList=aa.data||[];
salaryData=sal.data||[];txnData=tx.data||[];
scData=sc2.data||[];assignData=asgn.data||[];rebuildAssignIndex();monthlyFeeData=mf.error?[]:(mf.data||[]);
contractList=(ctr&&!ctr.error)?(ctr.data||[]):contractList;
quotationList=(qt&&!qt.error)?(qt.data||[]):quotationList;
clientDepositData=(dep&&!dep.error)?(dep.data||[]):clientDepositData;
render();}catch(e){console.warn('loadLight error:',e.message);}}

// ═══ ASSIGNMENT LOOKUP ═══
// Lookup assignment cho 1 TKQC tại 1 ngày, có carry-forward tự động:
// 1) Trả tất cả assignment đang ACTIVE (start≤date, end null hoặc ≥date) — chuẩn cho shared
// 2) Nếu không active: fallback assignment GẦN NHẤT trong quá khứ (start≤date) làm "vẫn phụ trách"
// → spend matrix, commission, salary, dropdown đều hiểu nhất quán.
// → Chỉ trả [] khi TKQC chưa từng có assignment nào.
// Tier 3 perf: index assignment theo ad_account_id để getAssign O(k) thay vì O(N).
// Trước: matrix render gọi getAssign hàng nghìn lần → mỗi lần filter cả assignData.
// Sau: lookup map → tăng tốc 50-100x cho agency có nhiều assignment.
var _assignByAcc=null,_adById=null,_clientById=null,_staffById=null;
function rebuildAssignIndex(){
  _assignByAcc={};
  for(var i=0;i<assignData.length;i++){
    var a=assignData[i],k=a.ad_account_id;
    if(!_assignByAcc[k])_assignByAcc[k]=[];
    _assignByAcc[k].push(a);
  }
  // Cũng index ad/client/staff để .find() lookup O(1)
  _adById={};adList.forEach(function(x){_adById[x.id]=x;});
  _clientById={};clientList.forEach(function(x){_clientById[x.id]=x;});
  _staffById={};(allStaff.length?allStaff:staffList).forEach(function(x){_staffById[x.id]=x;});
}
function findAd(id){return _adById?_adById[id]:adList.find(function(x){return x.id===id;});}
function findClient(id){return _clientById?_clientById[id]:clientList.find(function(x){return x.id===id;});}
function findStaff(id){return _staffById?_staffById[id]:(allStaff.find(function(x){return x.id===id;})||staffList.find(function(x){return x.id===id;}));}
function getAssign(adId,date){
var rows=(_assignByAcc&&_assignByAcc[adId])||assignData.filter(function(a){return a.ad_account_id===adId;});
var active=rows.filter(function(a){return a.start_date<=date && (!a.end_date||a.end_date>=date);});
if(active.length)return active;
var past=rows.filter(function(a){return a.start_date<=date;});
if(!past.length)return [];
past.sort(function(x,y){return(y.start_date||'').localeCompare(x.start_date||'');});
return [past[0]];
}
function gsfa(aid,date,dsStaffId){
if(dsStaffId)return dsStaffId;
var a=getAssign(aid,date);
return a.length?a[0].staff_id:null;
}
function gdbs(date){var r={};staffList.forEach(function(s){r[s.id]={s:s,t:0,cl:[]};});
dailyData.filter(function(d){return d.report_date===date;}).forEach(function(d){
var sid=gsfa(d.ad_account_id,date,d.staff_id);
if(sid&&r[sid]){
  var aa=findAd(d.ad_account_id);
  var cli=aa&&aa.client_id?findClient(aa.client_id):null;
  r[sid].t+=d.spend_amount;
  r[sid].cl.push({n:cli?esc(cli.name):'—',a:aa?esc(aa.account_name):'—',v:d.spend_amount});
}
});return r;}

// ═══ NAVIGATION ═══
// === SIDEBAR 2 LỚP: rail (icon) + subnav (panel) ===
// Cấu hình sub-items cho từng page
var SUBNAV_CONFIG={
  0:{title:'Tổng quan',sections:[{label:'',items:[{key:'main',label:'Tổng quan',action:"pg(0)",match:function(){return curPage===0;}}]}]},
  1:{title:'Tài khoản quảng cáo',sections:[{label:'TÀI KHOẢN',items:[
    {key:'spend0',label:'Tài khoản quảng cáo',action:"setSpendTab(0)",permKey:'p1.tkqc',match:function(){return curPage===1&&spendTab===0;}},
    {key:'spend1',label:'Chi tiêu theo nhân sự',action:"setSpendTab(1)",permKey:'p1.staff',match:function(){return curPage===1&&spendTab===1;}},
    {key:'spend2',label:'Chi tiêu theo khách hàng',action:"setSpendTab(2)",permKey:'p1.client',match:function(){return curPage===1&&spendTab===2;}}
  ]}]},
  2:{title:'Nhân sự',sections:[{label:'',items:[
    {key:'p2-task',label:'Công việc',action:"setP2Tab(2)",permKey:'p2.task',match:function(){return curPage===2&&p2Tab===2;}},
    {key:'p2-salary',label:'Lương + Hoa hồng',action:"setP2Tab(0)",permKey:'p2.salary',match:function(){return curPage===2&&p2Tab===0;}},
    {key:'p2-penalty',label:'Sổ phạt',action:"setP2Tab(1)",permKey:'p2.penalty',match:function(){return curPage===2&&p2Tab===1;}}
  ]}]},
  3:{title:'Khách hàng',sections:[{label:'PHÂN LOẠI',items:[
    {key:'cli-active',label:'Khách chính thức',action:"setClientTab('active')",match:function(){return curPage===3&&clientTab==='active';},badgeFn:function(){return clientList.filter(function(c){return c.status!=='prospect';}).length;}},
    {key:'cli-prospect',label:'Tiềm năng',action:"setClientTab('prospect')",match:function(){return curPage===3&&clientTab==='prospect';},badgeFn:function(){return clientList.filter(function(c){return c.status==='prospect';}).length;}},
    {key:'cli-quote',label:'Báo giá',action:"setClientTab('quotation')",match:function(){return curPage===3&&clientTab==='quotation';},badgeFn:function(){return quotationList.length;}}
  ]}]},
  4:{title:'Tài chính',sections:[{label:'',items:[
    {key:'fin-thuchi',label:'Thu chi',action:"pg(4);setFinTab('thuchi')",permKey:'p4.thuchi',match:function(){return curPage===4&&finTab==='thuchi';}},
    {key:'fin-reconcile',label:'Đối soát VCB',action:"pg(4);setFinTab('reconcile')",permKey:'p4.reconcile',match:function(){return curPage===4&&finTab==='reconcile';}}
  ]}]},
  5:{title:'Admin',sections:[{label:'QUẢN LÝ',items:[
    {key:'adm0',label:'Tổng quan',action:"sat(0)",match:function(){return curPage===5&&adminTab===0;}},
    {key:'adm1',label:'Người dùng',action:"sat(1)",match:function(){return curPage===5&&adminTab===1;}},
    {key:'adm3',label:'Cài đặt',action:"sat(3)",match:function(){return curPage===5&&adminTab===3;}}
  ]}]},
  6:{title:'Cảnh báo',sections:[{label:'LOẠI CẢNH BÁO',items:[
    {key:'p6-mess',label:'Cảnh báo Messenger',action:"setP6Tab(0)",permKey:'p6.mess',match:function(){return curPage===6&&p6Tab===0;},badgeFn:function(){try{return getMessAlerts().length;}catch(e){return 0;}}},
    {key:'p6-form',label:'Cảnh báo Form',action:"setP6Tab(1)",permKey:'p6.form',match:function(){return curPage===6&&p6Tab===1;},badgeFn:function(){try{return getLeadAlerts().length;}catch(e){return 0;}}},
    {key:'p6-bal',label:'Số dư thấp',action:"setP6Tab(2)",permKey:'p6.balance',match:function(){return curPage===6&&p6Tab===2;},badgeFn:function(){try{return getBalanceAlerts().length;}catch(e){return 0;}}}
  ]}]},
  7:{title:'Quản trị công việc',sections:[{label:'',items:[
    {key:'p7-main',label:'Bảng điều hành đội ngũ',action:"pg(7)",match:function(){return curPage===7;},badgeFn:function(){try{return getOpenTaskCount();}catch(e){return 0;}},badgeAlert:true}
  ]}]}
};
function renderSubnav(){
  // Legacy stub — kept for backwards compat. Sidebar v2 thay thế hoàn toàn.
  // Vẫn re-render sidebar v2 mỗi lần navigation thay đổi.
  renderSidebarV2();
}
// ═══ SIDEBAR V2 — 1 lớp, hiển thị tất cả page + sub-items (giống GoClaw) ═══
// Page có sub: render section header (uppercase) + sub-items
// Page không sub: render 1 dòng đơn không header (Tổng quan)
// Active item highlight bằng background nhẹ + dot xanh.
function _sbItemHtml(it){
  var isActive=it.match?it.match():false;
  var badge='';
  if(it.badgeFn){try{var b=it.badgeFn();if(b)badge='<span class="sb-item-badge'+(it.badgeAlert?' alert':'')+'">'+b+'</span>';}catch(e){}}
  // data-sb-action thay vì onclick → event delegation gắn 1 lần ở document, không bị xoá khi re-render
  return '<button type="button" class="sb-item'+(isActive?' active':'')+'" data-sb-action="'+esc(it.action)+'"><span class="sb-item-dot"></span><span class="sb-item-label">'+esc(it.label)+'</span>'+badge+'</button>';
}
// Icon SVG cho mỗi page (dùng ở mode collapsed)
var PAGE_ICONS={
  0:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12L12 3l9 9"/><path d="M5 10v10h14V10"/></svg>',
  1:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/></svg>',
  2:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  3:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
  4:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20"/><circle cx="17" cy="15" r="1.4"/></svg>',
  5:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  6:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>',
  7:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/><path d="M9 18l1.5 1.5L13 17"/></svg>',
  ceo:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="12" cy="10" r="3"/><path d="M6.5 19.5c0-2.8 2.5-5 5.5-5s5.5 2.2 5.5 5"/></svg>'
};
function renderSidebarV2(){
  var nav=document.getElementById('sb-nav');
  var footer=document.getElementById('sb-footer');
  var app=document.getElementById('app');
  if(!nav)return;
  var isCollapsed=app&&app.classList.contains('sidebar-collapsed');
  var html='';
  // Iterate qua các page có config (theo thứ tự PERMISSION_TREE)
  var pageOrder=[0,7,1,2,3,4,6,5]; // Quản trị công việc ngay sau Tổng quan, Admin cuối
  if(isCollapsed){
    // Mode thu gọn: chỉ icon đại diện cho mỗi page (giống rail cũ)
    pageOrder.forEach(function(pNum){
      if(authUser&&!canAccessPage(pNum))return;
      var cfg=SUBNAV_CONFIG[pNum];if(!cfg)return;
      var isActive=curPage===pNum;
      var ic=PAGE_ICONS[pNum]||'';
      html+='<button type="button" class="sb-item sb-item-iconly'+(isActive?' active':'')+'" data-sb-action="pg('+pNum+')" title="'+esc(cfg.title)+'">'+ic+'</button>';
    });
    if(isStrictAdmin())html+='<button type="button" class="sb-item sb-item-iconly" data-sb-action="window.open(\'/nghiep.html\',\'_blank\')" title="CEO Hưng Coaching">'+PAGE_ICONS.ceo+'</button>';
  }else{
    pageOrder.forEach(function(pNum){
      if(authUser&&!canAccessPage(pNum))return;
      var cfg=SUBNAV_CONFIG[pNum];if(!cfg)return;
      var allItems=[];
      cfg.sections.forEach(function(sec){
        sec.items.forEach(function(it){if(!it.permKey||canAccessKey(it.permKey))allItems.push(it);});
      });
      if(!allItems.length)return;
      // Wrap action: nếu user click sub-tab khi đang ở page khác → navigate page TRƯỚC, rồi set tab.
      // (vd click "Sổ phạt" khi đang ở Tổng quan → "pg(2);setP2Tab(1)")
      var wrapAction=function(action){
        if(!action)return action;
        // Nếu action đã chứa pg(...) thì giữ nguyên (vd page 4 đã có 'pg(4);setFinTab(...)')
        if(/(^|[^\w])pg\s*\(/.test(action))return action;
        // Page 0 (Tổng quan) action 'pg(0)' đã đủ — bỏ qua
        if(/^pg\s*\(\s*\d+\s*\)\s*;?\s*$/.test(action))return action;
        return 'pg('+pNum+');'+action;
      };
      // Page chỉ có 1 sub item (vd Tổng quan) → render 1 dòng đơn không section header
      if(allItems.length===1){
        var only=Object.assign({},allItems[0]);
        if(only.key==='main')only.label=cfg.title;
        only.action=wrapAction(only.action);
        html+='<div class="sb-section">'+_sbItemHtml(only)+'</div>';
      }else{
        html+='<div class="sb-section">';
        html+='<div class="sb-section-label">'+esc(cfg.title)+'</div>';
        allItems.forEach(function(it){
          var wrapped=Object.assign({},it,{action:wrapAction(it.action)});
          html+=_sbItemHtml(wrapped);
        });
        html+='</div>';
      }
    });
    // CEO HC link external (chỉ admin mới thấy)
    if(isStrictAdmin())html+='<div class="sb-section"><button type="button" class="sb-item" data-sb-action="window.open(\'/nghiep.html\',\'_blank\')"><span class="sb-item-dot"></span><span class="sb-item-label">CEO Hưng Coaching ↗</span></button></div>';
  }
  nav.innerHTML=html;
  // Render footer
  if(footer){
    if(authUser){
      var em=authUser.email||'',roleLbl=userRoleLabel(userRole);
      var initials=(em.charAt(0)||'?').toUpperCase();
      footer.innerHTML='<div class="sb-user"><div class="sb-user-avatar">'+esc(initials)+'</div><div class="sb-user-info"><div class="sb-user-name">'+esc(em)+'</div><div class="sb-user-meta"><span class="sb-user-status-dot"></span><span>Đã kết nối</span><span class="sb-user-role'+(userRole==='admin'?' admin':'')+'">'+esc(roleLbl)+'</span></div></div></div><button class="sb-logout" onclick="doLogout()" title="Đăng xuất"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg><span>Đăng xuất</span></button>';
    }else footer.innerHTML='';
  }
  // Legacy stub elements (for code đang gọi getElementById('subnav-body'/'subnav-title'))
  var legBody=document.getElementById('subnav-body');if(legBody)legBody.innerHTML='';
  var legTitle=document.getElementById('subnav-title');if(legTitle)legTitle.textContent='';
}
function syncSidebarNav(){
  // Sidebar v2: chỉ cần re-render là đủ (active state nằm trong HTML render)
  renderSidebarV2();
}
// Toggle thu hẹp sidebar (chỉ icon ↔ full)
function toggleSidebarV2(){
  var app=document.getElementById('app');if(!app)return;
  app.classList.toggle('sidebar-collapsed');
  try{localStorage.setItem('hcSidebarCollapsed',app.classList.contains('sidebar-collapsed')?'1':'0');}catch(e){}
  if(typeof renderSidebarV2==='function')renderSidebarV2();
}
// Khôi phục state collapsed lúc load
(function(){try{if(localStorage.getItem('hcSidebarCollapsed')==='1'){
  var apply=function(){var app=document.getElementById('app');if(app)app.classList.add('sidebar-collapsed');};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply);else apply();
}}catch(e){}})();
// Event delegation cho sidebar items: click bubble lên document → match data-sb-action → eval.
// Listener gắn 1 lần, không bị xoá khi re-render sidebar → click không bị "lúc được lúc không".
(function(){
  if(window._sbDelegationAttached)return;
  window._sbDelegationAttached=true;
  document.addEventListener('click',function(e){
    var el=e.target&&e.target.closest&&e.target.closest('[data-sb-action]');
    if(!el)return;
    var action=el.getAttribute('data-sb-action');
    if(!action)return;
    e.preventDefault();
    if(action.indexOf('/nghiep.html')>=0&&!isStrictAdmin()){
      toast('Bạn không có quyền truy cập giao diện Hưng Coaching.',false);
      return;
    }
    try{(0,eval)(action);}catch(err){console.warn('[sb-action]',action,err);}
  });
})();
function setSpendTab(i){spendTab=i;syncSidebarNav();render();}
function setClientTab(t){clientTab=t;clientActiveSubTab='overview';expandedClientId=null;syncSidebarNav();render();}
function setClientActiveSubTab(t){clientActiveSubTab=t;expandedClientId=null;render();}
function openAdTab(i){spendTab=i;pg(1);}
// Legacy: subnav cũ — alias sang sidebar v2 toggle
function toggleSubnav(){toggleSidebarV2();}
function pg(i){if(authUser&&!canAccessPage(i)){toast('Bạn không có quyền truy cập trang này. Liên hệ quản trị viên để được cấp quyền.',false);return;}curPage=i;cStaff=null;syncSidebarNav();if(window.innerWidth<=768){var sb=document.getElementById('sidebar');var ov=document.getElementById('overlay');if(sb)sb.classList.remove('open');if(ov)ov.classList.remove('show');}render();}
function render(){
var sb=document.getElementById('sidebar');
var el=document.getElementById('page');
var appEl=document.getElementById('app');
var overlay=document.getElementById('overlay');
// Snapshot focus + caret để restore sau khi innerHTML wipe DOM (giữ liền mạch khi gõ search)
var ae=document.activeElement,prevFocusId=ae&&ae.id?ae.id:null,prevSelStart=null,prevSelEnd=null;
if(prevFocusId&&(ae.tagName==='INPUT'||ae.tagName==='TEXTAREA')){try{prevSelStart=ae.selectionStart;prevSelEnd=ae.selectionEnd;}catch(e){}}
if(!authUser){
if(sb)sb.style.display='none';
if(overlay)overlay.classList.remove('show');
if(appEl)appEl.style.gridTemplateColumns='1fr';
el.innerHTML=renderLoginScreen();
return;}
if(sb)sb.style.display='';
if(appEl)appEl.style.gridTemplateColumns='';
syncSidebarNav();
if(curPage===0)el.innerHTML=p0();else if(curPage===1)el.innerHTML=p1();else if(curPage===2)el.innerHTML=p2();else if(curPage===3)el.innerHTML=p3();else if(curPage===4)el.innerHTML=p4();else if(curPage===5)el.innerHTML=p5();else if(curPage===6)el.innerHTML=p6();else if(curPage===7)el.innerHTML=p7();
// Inject contract/prospect modals (ngoài page content để không bị cắt)
var modalRoot=document.getElementById('hc-modal-root');
if(!modalRoot){modalRoot=document.createElement('div');modalRoot.id='hc-modal-root';document.body.appendChild(modalRoot);}
modalRoot.innerHTML=renderNewProspectModal()+renderNewActiveClientModal()+renderContractModal()+renderContractHistoryModal()+renderQuotationModal()+renderClientEditModal()+renderDepositModal();
enhanceUI();
ensureModalFocusTrap();
if(curPage===1&&spendTab===0)restoreAdFilters();
// Restore focus + caret cho input có id (vd #client-search) để gõ liền mạch
if(prevFocusId){var nf=document.getElementById(prevFocusId);if(nf){try{nf.focus();if(prevSelStart!==null&&nf.setSelectionRange)nf.setSelectionRange(prevSelStart,prevSelEnd);}catch(e){}}}
var aiFab=document.querySelector('.ai-fab');if(aiFab){aiFab.style.display=(curPage===3&&expandedClientId)?'none':'';}
var adot=document.getElementById('alert-dot');if(adot){var ac=getMessAlerts().length+getLeadAlerts().length+getBalanceAlerts().length;if(ac){adot.hidden=false;adot.style.background='var(--red)';}else{adot.hidden=true;}}}

// ═══ P0: TỔNG QUAN ═══
function p0(){
var cm=ovMonth||lm(),nd=dates.filter(function(d){return d.substring(0,7)===cm;}).length||1;
var ovMonthsSet=new Set();dates.forEach(function(d){ovMonthsSet.add(d.substring(0,7));});
txnData.forEach(function(t){if(t.month)ovMonthsSet.add(t.month);});
ovMonthsSet.add(cm);
var ovMonthList=Array.from(ovMonthsSet).sort().reverse();
// Spend by staff
var st={},tot=0;staffList.forEach(function(s){st[s.id]=0;});
dailyData.filter(function(d){return d.report_date.substring(0,7)===cm;}).forEach(function(d){
var sid=gsfa(d.ad_account_id,d.report_date,d.staff_id);if(sid){st[sid]+=d.spend_amount;tot+=d.spend_amount;}});
// Finance
var inc=0,exp=0;txnData.forEach(function(t){if(t.month===cm){if(t.txn_type==='income')inc+=t.amount;else exp+=t.amount;}});
var pr=inc-exp,mg=inc>0?Math.round(pr/inc*100):0;
// Previous month comparison
var pm=new Date(cm+'-01');pm.setMonth(pm.getMonth()-1);var pmStr=pm.toISOString().substring(0,7);
var prevTot=0;monthlyRevData.filter(function(r){return r.month===pmStr;}).forEach(function(r){prevTot+=r.total_spend;});
var prevInc=0;txnData.filter(function(t){return t.month===pmStr&&t.txn_type==='income';}).forEach(function(t){prevInc+=t.amount;});
// Target
var totalBudget=0;staffList.forEach(function(s){totalBudget+=s.monthly_budget;});
var pctTarget=totalBudget>0?Math.round(tot/totalBudget*100):0;
var avgDay=Math.round(tot/nd);var forecast=avgDay*30;
var daysInMonth=new Date(parseInt(cm.split('-')[0]),parseInt(cm.split('-')[1]),0).getDate();
var pctTime=Math.round((nd/daysInMonth)*100);

var h='<div class="page-title">Tổng quan</div>';
h+='<div class="page-sub" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><span>Tháng:</span>';
h+='<select class="fi" onchange="ovMonth=this.value;render();" style="width:130px;height:28px;padding:2px 8px;">';
ovMonthList.forEach(function(m){h+='<option value="'+m+'"'+(m===cm?' selected':'')+'>T'+parseInt(m.split('-')[1])+'/'+m.split('-')[0]+'</option>';});
h+='</select><span style="color:var(--tx3);">— '+nd+' ngày dữ liệu</span></div>';
// KPI cards
h+='<div class="kpi-grid kpi-4">';
h+='<div class="kpi"><div class="kpi-label">Doanh thu</div><div class="kpi-value" style="color:var(--green);">'+fm(inc)+'</div><div class="kpi-note">Phí dịch vụ</div>'+(prevInc?'<div style="font-size:11px;margin-top:3px;color:'+(inc>=prevInc?'var(--green)':'var(--red)')+';">'+(inc>=prevInc?'↑':'↓')+Math.abs(Math.round((inc-prevInc)/prevInc*100))+'% vs T'+(pm.getMonth()+1)+'</div>':'')+'</div>';
h+='<div class="kpi"><div class="kpi-label">Chi phí</div><div class="kpi-value" style="color:var(--red);">'+fm(exp)+'</div><div class="kpi-note">Lương + vận hành</div></div>';
h+='<div class="kpi"><div class="kpi-label">Lợi nhuận</div><div class="kpi-value" style="color:var(--green);">'+fm(pr)+'</div><div class="kpi-note">Biên lợi nhuận '+mg+'%</div></div>';
h+='<div class="kpi"><div class="kpi-label">Tổng chi tiêu Quảng cáo</div><div class="kpi-value">'+fm(tot)+'</div><div class="kpi-note">Ngân sách: '+fm(totalBudget)+'</div><div style="font-size:11px;color:var(--tx3);margin-top:2px;">Hoàn thành '+pctTarget+'%</div></div></div>';
// Forecast cards
h+='<div class="overview-grid">';
h+='<div class="overview-card"><div style="font-size:11px;color:var(--tx3);">Tiến độ ngân sách tháng</div><div style="font-size:18px;font-weight:600;margin-top:4px;">'+fm(tot)+' <span style="font-size:13px;color:var(--tx3);font-weight:400;">/ '+fm(totalBudget)+'</span></div>';
h+='<div style="height:8px;border-radius:4px;background:var(--bd1);margin-top:8px;position:relative;"><div style="height:8px;border-radius:4px;background:var(--green);width:'+Math.min(pctTarget,100)+'%;"></div><div style="position:absolute;top:-4px;left:'+pctTime+'%;width:2px;height:16px;border-radius:1px;background:var(--blue);"></div></div>';
h+='<div style="display:flex;justify-content:space-between;margin-top:4px;font-size:11px;color:var(--tx3);"><span>0</span><span style="color:var(--blue);">'+pctTime+'% thời gian</span><span>'+fm(totalBudget)+'</span></div></div>';
h+='<div class="overview-card"><div style="font-size:11px;color:var(--tx3);">Dự kiến cuối tháng</div><div style="font-size:18px;font-weight:600;margin-top:4px;color:var(--teal);">'+fm(forecast)+'</div>';
h+='<div style="font-size:12px;color:var(--tx2);margin-top:4px;">Trung bình '+fm(avgDay)+'/ngày × '+daysInMonth+' ngày</div>';
var fcDiff=forecast-totalBudget;h+='<div style="font-size:12px;margin-top:4px;font-weight:500;color:'+(fcDiff>=0?'var(--green)':'var(--red)')+';">'+(fcDiff>=0?'Vượt ngân sách +':'Thiếu ')+fm(Math.abs(fcDiff))+'</div></div></div>';
// Staff performance table
h+='<div class="section-title">Chi tiêu Quảng cáo theo nhân sự</div><div class="table-wrap"><table class="staff-spend-table">';
h+='<colgroup><col style="width:15%;"><col style="width:10%;"><col style="width:10%;"><col style="width:15%;"><col style="width:10%;"><col style="width:10%;"><col style="width:10%;"><col style="width:10%;"><col style="width:10%;"></colgroup>';
h+='<thead><tr><th>Nhân sự</th><th style="text-align:right;">Ngân sách</th><th style="text-align:right;">Đã chi</th><th>Tiến độ</th><th style="text-align:right;">TB/ngày</th><th style="text-align:right;">Dự kiến</th><th style="text-align:right;">Cao nhất</th><th style="text-align:right;">Thấp nhất</th><th style="text-align:right;">Tỷ trọng</th></tr></thead><tbody>';
staffList.forEach(function(s){
var c=sc(s.color_code),sp=st[s.id]||0;
var pc=s.monthly_budget>0?Math.round(sp/s.monthly_budget*100):0;
var avg=Math.round(sp/nd),fc2=avg*daysInMonth;
var contr=tot>0?Math.round(sp/tot*100):0;
// Find high/low day
var hi=0,lo=Infinity;
dates.filter(function(d){return d.substring(0,7)===cm;}).forEach(function(d){
var bs=gdbs(d),v=bs[s.id]?bs[s.id].t:0;if(v>hi)hi=v;if(v<lo)lo=v;});
if(lo===Infinity)lo=0;
h+='<tr><td><div style="display:flex;align-items:center;gap:10px;"><div class="avatar" style="background:'+c.bg+';color:'+c.tx+';">'+esc(s.avatar_initials)+'</div><span style="font-weight:500;">'+esc(s.short_name)+'</span></div></td>';
h+='<td class="mono" style="text-align:right;">'+fm(s.monthly_budget)+'</td>';
h+='<td class="mono" style="text-align:right;font-weight:500;color:var(--teal);">'+fm(sp)+'</td>';
h+='<td><div style="display:flex;align-items:center;gap:10px;"><div class="bar-track" style="flex:1;max-width:140px;"><div class="bar-fill" style="width:'+Math.min(pc,100)+'%;background:'+c.c+';"></div></div><span class="mono" style="font-size:12px;color:var(--tx2);min-width:34px;text-align:right;">'+pc+'%</span></div></td>';
h+='<td class="mono" style="text-align:right;">'+fm(avg)+'</td>';
h+='<td class="mono" style="text-align:right;color:var(--tx2);">'+fm(fc2)+'</td>';
h+='<td class="mono" style="text-align:right;color:var(--teal);">'+fm(hi)+'</td>';
h+='<td class="mono" style="text-align:right;color:var(--amber);">'+fm(lo)+'</td>';
h+='<td class="mono" style="text-align:right;font-weight:500;">'+contr+'%</td></tr>';});
// Total row
var totalAvg=Math.round(tot/nd);
h+='</tbody><tfoot><tr style="background:var(--bg2);font-weight:600;"><td>Tổng</td>';
h+='<td class="mono" style="text-align:right;">'+fm(totalBudget)+'</td>';
h+='<td class="mono" style="text-align:right;color:var(--teal);">'+fm(tot)+'</td>';
h+='<td><div style="display:flex;align-items:center;gap:10px;"><div class="bar-track" style="flex:1;max-width:140px;"><div class="bar-fill" style="width:'+Math.min(pctTarget,100)+'%;background:var(--green);"></div></div><span class="mono" style="font-size:12px;color:var(--tx2);min-width:34px;text-align:right;">'+pctTarget+'%</span></div></td>';
h+='<td class="mono" style="text-align:right;">'+fm(totalAvg)+'</td>';
h+='<td class="mono" style="text-align:right;">'+fm(forecast)+'</td>';
h+='<td></td><td></td><td class="mono" style="text-align:right;">100%</td></tr></tfoot></table></div>';
// Contribution bar
h+='<div style="margin-top:6px;"><div style="font-size:11px;color:var(--tx3);margin-bottom:4px;">Tỷ trọng đóng góp</div>';
h+='<div style="display:flex;height:6px;border-radius:3px;overflow:hidden;">';
staffList.forEach(function(s){var pct2=tot>0?Math.round(st[s.id]/tot*100):0;h+='<div style="width:'+pct2+'%;background:'+sc(s.color_code).c+';"></div>';});
h+='</div><div style="display:flex;gap:12px;margin-top:4px;font-size:11px;color:var(--tx3);">';
staffList.forEach(function(s){var pct2=tot>0?Math.round(st[s.id]/tot*100):0;h+='<span><span style="width:8px;height:8px;border-radius:50%;background:'+sc(s.color_code).c+';display:inline-block;margin-right:3px;"></span>'+esc(s.short_name)+' '+pct2+'%</span>';});
h+='</div></div>';
return h;}

// ═══ P1: CHI TIÊU Quảng cáo ═══
function p1(){
var ms=rptMonth||lm();
var mDates=dates.filter(function(d){return d.substring(0,7)===ms;}).sort();
var nd=mDates.length||1;
var dim=new Date(parseInt(ms.split('-')[0]),parseInt(ms.split('-')[1]),0).getDate();
var allMonths=new Set();dates.forEach(function(d){allMonths.add(d.substring(0,7));});
var monthList=Array.from(allMonths).sort().reverse();

var h='<div class="page-title">Tài khoản quảng cáo</div>';
h+='<div class="page-sub">Tài khoản quảng cáo, chi tiêu theo nhân sự và theo khách hàng.</div>';

if(spendTab===0){
h+=a1();
return h;
}

h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">';
h+='<div style="display:flex;gap:8px;align-items:center;"><span style="font-size:12px;color:var(--tx3);">Tháng:</span><select class="fi" onchange="rptMonth=this.value;render();" style="width:130px;">';
monthList.forEach(function(m){h+='<option value="'+m+'"'+(m===ms?' selected':'')+'>T'+parseInt(m.split('-')[1])+'/'+m.split('-')[0]+'</option>';});
h+='</select></div><div style="font-size:12px;color:var(--tx3);">'+nd+' ngày có dữ liệu · '+dim+' ngày trong tháng</div></div>';

if(spendTab===1) h+=p1Staff(ms,mDates,nd,dim);
else h+=p1Client(ms,mDates,nd,dim);
return h;}

// Tab 1: Theo nhân sự
function p1Staff(ms,mDates,nd,dim){
var dailyByStaff={};staffList.forEach(function(s){dailyByStaff[s.id]=[];});
var dayTotals=[];
for(var day=1;day<=dim;day++){
var dd=ms+'-'+(day<10?'0':'')+day;
var bs=gdbs(dd);var dt=0;
staffList.forEach(function(s){var v=bs[s.id]?bs[s.id].t:0;dailyByStaff[s.id].push(v);dt+=v;});
dayTotals.push({date:dd,day:day,total:dt});}
var stTotals={};staffList.forEach(function(s){stTotals[s.id]=dailyByStaff[s.id].reduce(function(a,b){return a+b;},0);});
var gt=dayTotals.reduce(function(a,b){return a+b.total;},0);
var maxDay=null,minDay=null;
dayTotals.forEach(function(d){if(d.total>0){if(!maxDay||d.total>maxDay.total)maxDay=d;if(!minDay||d.total<minDay.total)minDay=d;}});
// Daily table
var h='<div class="table-wrap"><table><thead><tr><th style="text-align:left;">Ngày</th>';
staffList.forEach(function(s){var c=sc(s.color_code);h+='<th style="text-align:right;"><div class="avatar" style="width:18px;height:18px;font-size:8px;display:inline-flex;background:'+c.bg+';color:'+c.tx+';vertical-align:middle;margin-right:3px;">'+esc(s.avatar_initials)+'</div>'+esc(s.short_name)+'</th>';});
h+='<th style="text-align:right;">Tổng chi tiêu</th></tr></thead><tbody>';
dayTotals.forEach(function(d,idx){
var isHi=maxDay&&d.date===maxDay.date,isLo=minDay&&d.date===minDay.date,isZ=d.total===0;
h+='<tr style="'+(isHi?'background:var(--green-bg);':'')+(isLo?'background:var(--amber-bg);':'')+(isZ?'opacity:.3;':'')+'">';
h+='<td style="text-align:left;font-weight:500;">'+d.day+'</td>';
staffList.forEach(function(s){h+='<td class="mono" style="text-align:right;">'+ff(dailyByStaff[s.id][idx])+'</td>';});
h+='<td class="mono" style="text-align:right;font-weight:600;'+(isHi?'color:var(--green-tx);':'')+(isLo?'color:var(--amber-tx);':'')+'">'+ff(d.total)+'</td></tr>';});
h+='</tbody><tfoot><tr style="background:var(--bg2);font-weight:600;border-top:2px solid var(--bd2);"><td style="text-align:left;">Tổng cộng</td>';
staffList.forEach(function(s){h+='<td class="mono" style="text-align:right;">'+ff(stTotals[s.id])+'</td>';});
h+='<td class="mono" style="text-align:right;font-size:15px;color:var(--teal-tx);">'+ff(gt)+'</td></tr></tfoot></table></div>';
// Stats grid
var totalBudget=0;staffList.forEach(function(s){totalBudget+=s.monthly_budget;});
h+='<div style="margin-top:16px;border:1px solid var(--bd1);border-radius:var(--radius-lg);overflow:hidden;"><div style="overflow-x:auto;">';
var gridCols='140px repeat('+staffList.length+',minmax(90px,1fr)) minmax(90px,1fr)';
h+='<div style="display:grid;grid-template-columns:'+gridCols+';font-size:11px;color:var(--tx3);border-bottom:1px solid var(--bd1);min-width:fit-content;">';
h+='<div style="padding:8px 14px;background:var(--bg2);"></div>';
staffList.forEach(function(s){h+='<div style="padding:8px 14px;text-align:right;font-weight:500;">'+esc(s.short_name)+'</div>';});
h+='<div style="padding:8px 14px;text-align:right;font-weight:500;">Tổng</div></div>';
var rows=[
{l:'Ngân sách tháng',fn:function(s){return s.monthly_budget;},t:totalBudget},
{l:'Tỷ lệ sử dụng',fn:function(s){return s.monthly_budget>0?(stTotals[s.id]/s.monthly_budget*100).toFixed(2)+'%':'—';},t:totalBudget>0?(gt/totalBudget*100).toFixed(2)+'%':'—',hl:true,pct:true},
{l:'Số ngày có dữ liệu',fn:function(){return nd;},t:nd,num:true},
{l:'Trung bình/ngày',fn:function(s){return Math.round(stTotals[s.id]/nd);},t:Math.round(gt/nd)},
{l:'Dự kiến cuối tháng',fn:function(s){return Math.round(stTotals[s.id]/nd)*dim;},t:Math.round(gt/nd)*dim,hl:true},
{l:'Chi tiêu cao nhất',fn:function(s){var mx=0;dailyByStaff[s.id].forEach(function(v){if(v>mx)mx=v;});return mx;},t:maxDay?maxDay.total:0,clr:'var(--green)'},
{l:'Chi tiêu thấp nhất',fn:function(s){var mn=Infinity;dailyByStaff[s.id].forEach(function(v){if(v>0&&v<mn)mn=v;});return mn===Infinity?0:mn;},t:minDay?minDay.total:0,clr:'var(--amber)'},
{l:'Tỷ trọng đóng góp',fn:function(s){return gt>0?(stTotals[s.id]/gt*100).toFixed(2)+'%':'—';},t:'100%',pct:true}
];
rows.forEach(function(row){
h+='<div style="display:grid;grid-template-columns:140px repeat('+staffList.length+',minmax(90px,1fr)) minmax(90px,1fr);font-size:12px;border-bottom:1px solid var(--bd1);min-width:fit-content;'+(row.hl?'background:var(--blue-bg);':'')+'">';
h+='<div style="padding:8px 14px;font-weight:500;color:var(--tx2);background:'+(row.hl?'var(--blue-bg)':'var(--bg2)')+';">'+row.l+'</div>';
staffList.forEach(function(s){
var v=row.fn(s);var st='padding:8px 14px;text-align:right;font-variant-numeric:tabular-nums;';
if(row.clr)st+='color:'+row.clr+';';if(row.hl)st+='font-weight:500;color:var(--blue-tx);';
if(row.pct){var c2=sc(s.color_code);h+='<div style="'+st+'"><span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500;background:'+c2.bg+';color:'+c2.tx+';">'+v+'</span></div>';}
else h+='<div style="'+st+'">'+(row.num?v:ff(v))+'</div>';});
var ts='padding:8px 14px;text-align:right;font-variant-numeric:tabular-nums;font-weight:500;';
if(row.hl)ts+='color:var(--blue-tx);';
h+='<div style="'+ts+'">'+(row.pct||row.num?row.t:ff(row.t))+'</div></div>';});
h+='</div></div>';
// Contribution bar
h+='<div style="display:flex;height:8px;border-radius:4px;overflow:hidden;margin:12px 0 4px;">';
staffList.forEach(function(s){var p=gt>0?Math.round(stTotals[s.id]/gt*100):0;h+='<div style="width:'+p+'%;background:'+sc(s.color_code).c+';"></div>';});
h+='</div><div style="display:flex;flex-wrap:wrap;gap:8px 12px;font-size:11px;color:var(--tx3);">';
staffList.forEach(function(s){var p=gt>0?Math.round(stTotals[s.id]/gt*100):0;h+='<span><span style="width:8px;height:8px;border-radius:50%;background:'+sc(s.color_code).c+';display:inline-block;margin-right:3px;"></span>'+esc(s.short_name)+' '+p+'%</span>';});
h+='</div>';
if(maxDay||minDay){h+='<div style="display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:8px;font-size:11px;color:var(--tx3);">';
if(maxDay)h+='<span><span style="width:6px;height:6px;border-radius:50%;background:var(--green);display:inline-block;margin-right:3px;"></span>Cao nhất: '+maxDay.day+'/'+parseInt(ms.split('-')[1])+' ('+fm(maxDay.total)+')</span>';
if(minDay)h+='<span><span style="width:6px;height:6px;border-radius:50%;background:var(--amber);display:inline-block;margin-right:3px;"></span>Thấp nhất: '+minDay.day+'/'+parseInt(ms.split('-')[1])+' ('+fm(minDay.total)+')</span>';
h+='</div>';}
return h;}

// Tab 2: Theo khách hàng
function p1Client(ms,mDates,nd,dim){
// Aggregate spend by client
var clientSpend={};
dailyData.filter(function(d){return d.report_date.substring(0,7)===ms;}).forEach(function(d){
var cid=d.matched_client_id||null;
if(!cid){
// For non-shared, get client from assignment or ad_account
var aa=adList.find(function(a){return a.id===d.ad_account_id;});
if(aa){
var asg=getAssign(d.ad_account_id,d.report_date);
cid=asg.length?asg[0].client_id:aa.client_id;}}
if(!cid)cid='unknown';
if(!clientSpend[cid])clientSpend[cid]={total:0,daily:{},staffIds:new Set()};
clientSpend[cid].total+=d.spend_amount;
var day=parseInt(d.report_date.split('-')[2]);
if(!clientSpend[cid].daily[day])clientSpend[cid].daily[day]=0;
clientSpend[cid].daily[day]+=d.spend_amount;
// Track staff
var sid=d.staff_id||null;
if(!sid){var asg2=getAssign(d.ad_account_id,d.report_date);if(asg2.length)sid=asg2[0].staff_id;}
if(sid)clientSpend[cid].staffIds.add(sid);});
// Sort by total descending (full unfiltered list for count pill + Top charts)
var cidsAll=Object.keys(clientSpend).sort(function(a,b){return clientSpend[b].total-clientSpend[a].total;});
// Apply filters
var search=String(cliSpendSearch||'').toLowerCase().trim();
var cids=cidsAll.filter(function(cid){
var cs=clientSpend[cid];
var cObj=clientList.find(function(c){return c.id===cid;});
if(search){if(!cObj||cObj.name.toLowerCase().indexOf(search)<0)return false;}
if(cliSpendType==='rental'){if(!cObj||!hasRentalService(cObj))return false;}
else if(cliSpendType==='ads'){if(!cObj||hasRentalService(cObj))return false;}
if(cliSpendStaff&&!cs.staffIds.has(cliSpendStaff))return false;
if(cliSpendHas==='has_spend'&&cs.total<=0)return false;
if(cliSpendHas==='no_spend'&&cs.total>0)return false;
return true;});
// Apply sort (default already spend_desc from cidsAll)
if(cliSpendSort==='spend_asc')cids.sort(function(a,b){return clientSpend[a].total-clientSpend[b].total;});
else if(cliSpendSort==='name_asc')cids.sort(function(a,b){var nA=(clientList.find(function(c){return c.id===a;})||{name:'~'}).name;var nB=(clientList.find(function(c){return c.id===b;})||{name:'~'}).name;return nA.localeCompare(nB);});
var gt=cids.reduce(function(t,id){return t+clientSpend[id].total;},0);
// Phân loại: Khách thuê TKQC vs Khách chạy ads (mutually exclusive) — tính trên data đã lọc
var rentalTotal=0,rentalCount=0,adsTotal=0,adsCount=0;
cids.forEach(function(cid){
var cObj=clientList.find(function(c){return c.id===cid;});
if(!cObj)return;
if(hasRentalService(cObj)){rentalTotal+=clientSpend[cid].total;rentalCount++;}
else{adsTotal+=clientSpend[cid].total;adsCount++;}});
var rentalPct=gt>0?(rentalTotal/gt*100).toFixed(1):0;
var adsPct=gt>0?(adsTotal/gt*100).toFixed(1):0;
var h='<div class="pr-kpi-grid" style="grid-template-columns:1fr 1fr;">';
h+='<div class="pr-kpi-card"><div class="pr-kpi-lbl">Khách thuê TKQC <span style="color:var(--tx3);font-weight:400;">· '+rentalCount+' khách · '+rentalPct+'%</span></div><div class="pr-kpi-val">'+ff(rentalTotal)+'</div></div>';
h+='<div class="pr-kpi-card"><div class="pr-kpi-lbl">Khách chạy ads <span style="color:var(--tx3);font-weight:400;">· '+adsCount+' khách · '+adsPct+'%</span></div><div class="pr-kpi-val">'+ff(adsTotal)+'</div></div>';
h+='</div>';
// Toolbar bộ lọc
h+='<div class="ad-toolbar"><div class="ad-toolbar-main">';
h+='<input type="text" id="cli-spend-search" placeholder="Tìm khách hàng..." value="'+esc(cliSpendSearch)+'" oninput="hcSearchInput(\'cliSpendSearch\',this.value)" class="fi ad-toolbar-search">';
h+='<select class="fi ad-toolbar-filter" onchange="cliSpendType=this.value;render();"><option value="">Tất cả loại khách</option><option value="rental"'+(cliSpendType==='rental'?' selected':'')+'>Khách thuê TKQC</option><option value="ads"'+(cliSpendType==='ads'?' selected':'')+'>Khách chạy ads</option></select>';
h+='<select class="fi ad-toolbar-filter" onchange="cliSpendStaff=this.value;render();"><option value="">Tất cả nhân sự</option>';
staffList.forEach(function(s){h+='<option value="'+s.id+'"'+(cliSpendStaff===s.id?' selected':'')+'>'+esc(s.short_name)+'</option>';});
h+='</select>';
h+='<select class="fi ad-toolbar-filter" onchange="cliSpendHas=this.value;render();"><option value="">Tất cả chi tiêu</option><option value="has_spend"'+(cliSpendHas==='has_spend'?' selected':'')+'>Có chi tiêu</option><option value="no_spend"'+(cliSpendHas==='no_spend'?' selected':'')+'>Chưa có chi tiêu</option></select>';
h+='<select class="fi ad-toolbar-filter" onchange="cliSpendSort=this.value;render();"><option value="spend_desc"'+(cliSpendSort==='spend_desc'?' selected':'')+'>Chi tiêu cao nhất</option><option value="spend_asc"'+(cliSpendSort==='spend_asc'?' selected':'')+'>Chi tiêu thấp nhất</option><option value="name_asc"'+(cliSpendSort==='name_asc'?' selected':'')+'>Tên A-Z</option></select>';
h+='<span class="ad-toolbar-count">'+cids.length+'/'+cidsAll.length+' khách hàng</span></div>';
h+='<div class="ad-toolbar-actions"><button class="btn btn-ghost btn-sm" onclick="clearCliSpendFilters()">Xóa bộ lọc</button></div></div>';
// Chips active
var spChips=[];
if(cliSpendSearch)spChips.push('Tìm: '+esc(cliSpendSearch));
if(cliSpendType==='rental')spChips.push('Loại: Khách thuê TKQC');
if(cliSpendType==='ads')spChips.push('Loại: Khách chạy ads');
if(cliSpendStaff){var spSObj=staffList.find(function(s){return s.id===cliSpendStaff;});spChips.push('Nhân sự: '+esc(spSObj?spSObj.short_name:'?'));}
if(cliSpendHas==='has_spend')spChips.push('Có chi tiêu');
if(cliSpendHas==='no_spend')spChips.push('Chưa có chi tiêu');
if(cliSpendSort==='spend_asc')spChips.push('Sắp xếp: Chi tiêu thấp nhất');
if(cliSpendSort==='name_asc')spChips.push('Sắp xếp: Tên A-Z');
if(spChips.length)h+='<div class="active-chips">'+spChips.map(function(c){return'<span class="chip">'+c+' <span class="x" onclick="clearCliSpendFilters()">×</span></span>';}).join('')+'</div>';
// Summary table
h+='<div class="table-wrap"><table><thead><tr><th style="text-align:left;">Khách hàng</th><th style="text-align:left;">Nhân sự</th><th style="text-align:right;">Tổng T'+parseInt(ms.split('-')[1])+'</th><th style="text-align:right;">Trung bình/ngày</th><th style="text-align:right;">Tỷ trọng</th></tr></thead><tbody>';
cids.forEach(function(cid){
var cs=clientSpend[cid];
var cObj=clientList.find(function(c){return c.id===cid;});
var cName=cObj?esc(cObj.name):'Chưa phân loại';
var isZero=cs.total===0;
// Staff info
var staffArr=Array.from(cs.staffIds);
var staffHtml='';
if(staffArr.length===1){var sObj=allStaff.find(function(s){return s.id===staffArr[0];});if(sObj){var col=sc(sObj.color_code);staffHtml='<div class="avatar" style="width:18px;height:18px;font-size:8px;display:inline-flex;background:'+col.bg+';color:'+col.tx+';vertical-align:middle;margin-right:3px;">'+esc(sObj.avatar_initials)+'</div>'+esc(sObj.short_name);}else staffHtml='—';}
else if(staffArr.length>1)staffHtml='<span style="font-size:11px;color:var(--tx3);">Nhiều nhân viên ('+staffArr.length+')</span>';
else staffHtml='<span style="font-size:11px;color:var(--tx3);">—</span>';
var pct=gt>0?(cs.total/gt*100).toFixed(1):0;
h+='<tr style="'+(isZero?'opacity:.3;':'')+'">';
h+='<td style="text-align:left;font-weight:500;">'+cName+'</td>';
h+='<td style="text-align:left;">'+staffHtml+'</td>';
h+='<td class="mono" style="text-align:right;font-weight:500;color:var(--teal);">'+ff(cs.total)+'</td>';
h+='<td class="mono" style="text-align:right;">'+ff(Math.round(cs.total/nd))+'</td>';
h+='<td class="mono" style="text-align:right;"><span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500;background:var(--bg3);color:var(--tx2);">'+pct+'%</span></td></tr>';});
h+='</tbody><tfoot><tr style="background:var(--bg2);font-weight:600;border-top:2px solid var(--bd2);">';
h+='<td style="text-align:left;">Tổng ('+cids.length+' Khách hàng)</td><td></td>';
h+='<td class="mono" style="text-align:right;font-size:15px;color:var(--teal-tx);">'+ff(gt)+'</td>';
h+='<td class="mono" style="text-align:right;">'+ff(Math.round(gt/nd))+'</td>';
h+='<td class="mono" style="text-align:right;">100%</td></tr></tfoot></table></div>';
if(cids.length>0){
// Luôn xếp theo chi tiêu giảm dần cho Top 5 / Top 10, không phụ thuộc sort dropdown
var cidsBySpend=cids.slice().sort(function(a,b){return clientSpend[b].total-clientSpend[a].total;});
// Top 5 bar
var top5=cidsBySpend.slice(0,5);
var topColors=['var(--purple)','var(--coral)','var(--teal)','var(--blue)','var(--pink)'];
h+='<div style="margin-top:12px;"><div style="font-size:11px;color:var(--tx3);margin-bottom:4px;">Top 5 khách hàng chi tiêu cao nhất</div>';
h+='<div style="display:flex;height:8px;border-radius:4px;overflow:hidden;">';
var otherPct=100;
top5.forEach(function(cid,i){var p=gt>0?Math.round(clientSpend[cid].total/gt*100):0;otherPct-=p;h+='<div style="width:'+p+'%;background:'+topColors[i]+';"></div>';});
if(otherPct>0)h+='<div style="width:'+otherPct+'%;background:var(--bd1);"></div>';
h+='</div><div style="display:flex;gap:10px;margin-top:4px;font-size:11px;color:var(--tx3);flex-wrap:wrap;">';
top5.forEach(function(cid,i){var cObj=clientList.find(function(c){return c.id===cid;});var p=gt>0?Math.round(clientSpend[cid].total/gt*100):0;h+='<span><span style="width:8px;height:8px;border-radius:50%;background:'+topColors[i]+';display:inline-block;margin-right:3px;"></span>'+(cObj?esc(cObj.name):'?')+' '+p+'%</span>';});
h+='</div></div>';
// Daily table by client (top 10)
var topClients=cidsBySpend.slice(0,10);
h+='<div class="section-title" style="margin-top:20px;">Chi tiêu theo ngày (Top 10 Khách hàng)</div>';
h+='<div class="table-wrap"><table><thead><tr><th style="text-align:left;">Ngày</th>';
topClients.forEach(function(cid){var cObj=clientList.find(function(c){return c.id===cid;});h+='<th style="text-align:right;font-size:10px;">'+esc(cObj?cObj.name:'?')+'</th>';});
h+='<th style="text-align:right;">Tổng</th></tr></thead><tbody>';
for(var day=1;day<=dim;day++){
var dayTotal=0;var isZ=true;
var vals=topClients.map(function(cid){var v=clientSpend[cid].daily[day]||0;dayTotal+=v;if(v>0)isZ=false;return v;});
// Add remaining clients
cids.forEach(function(cid){if(topClients.indexOf(cid)===-1)dayTotal+=(clientSpend[cid].daily[day]||0);});
if(dayTotal>0)isZ=false;
h+='<tr style="'+(isZ?'opacity:.3;':'')+'">';
h+='<td style="text-align:left;font-weight:500;">'+day+'</td>';
vals.forEach(function(v){h+='<td class="mono" style="text-align:right;font-size:12px;">'+ff(v)+'</td>';});
h+='<td class="mono" style="text-align:right;font-weight:600;">'+ff(dayTotal)+'</td></tr>';}
h+='</tbody></table></div>';
}
return h;}
function clearCliSpendFilters(){cliSpendSearch='';cliSpendType='';cliSpendStaff='';cliSpendHas='';cliSpendSort='spend_desc';render();}

// ═══ P2: NHÂN SỰ ═══
// ═══ TÍNH LƯƠNG TỰ ĐỘNG ═══
// Hoa hồng quảng cáo: 1% nếu khách quản lý < 90 ngày, 2% nếu ≥ 90 ngày (tính đến cuối tháng lương)
function COMMISSION_RATE(days){return days>=90?0.02:0.01;}
function getEndOfMonth(monthStr){
var y=parseInt(monthStr.split('-')[0]),m=parseInt(monthStr.split('-')[1]);
var d=new Date(Date.UTC(y,m,0)); // ngày cuối tháng
return d;}
function getClientEarliestStart(clientId){
// Ưu tiên client.start_date (nguồn đáng tin cậy nhất, do admin nhập trực tiếp)
var c=clientList.find(function(x){return x.id===clientId;});
if(c&&c.start_date)return c.start_date;
// Fallback: dùng MIN(assignment.start_date) cho khách chưa có start_date
var earliest=null;
assignData.forEach(function(a){
if(a.client_id!==clientId)return;
if(!a.start_date)return;
if(!earliest||a.start_date<earliest)earliest=a.start_date;});
return earliest;}
function computeStaffCommission(staffId,monthStr){
// Xác định client→spend cho Nhân sự này trong tháng monthStr
var clientSpend={};
dailyData.forEach(function(d){
if(!d.report_date||d.report_date.substring(0,7)!==monthStr)return;
var sid=gsfa(d.ad_account_id,d.report_date,d.staff_id);
if(sid!==staffId)return;
var cid=d.matched_client_id||null;
if(!cid){var aa=adList.find(function(x){return x.id===d.ad_account_id;});if(aa){var asg=getAssign(d.ad_account_id,d.report_date);cid=asg.length?asg[0].client_id:aa.client_id;}}
if(!cid)return;
if(!clientSpend[cid])clientSpend[cid]=0;
clientSpend[cid]+=moneyVal(d.spend_amount);});
var eom=getEndOfMonth(monthStr);
var breakdown=[];
Object.keys(clientSpend).forEach(function(cid){
var spend=clientSpend[cid];
var client=clientList.find(function(c){return c.id===cid;});
var earliest=getClientEarliestStart(cid);
var days=earliest?Math.floor((eom-new Date(earliest))/86400000)+1:0;
var rate=COMMISSION_RATE(days);
var amount=Math.round(spend*rate);
breakdown.push({client_id:cid,client_name:client?client.name:'(đã xóa)',spend:spend,days:days,rate:rate,amount:amount});});
breakdown.sort(function(a,b){return b.amount-a.amount;});
var total=breakdown.reduce(function(t,x){return t+x.amount;},0);
return{total:total,detail:breakdown};}

// p2Tab: 2 = Công việc (default, đầu sidebar), 0 = Lương + Hoa hồng, 1 = Sổ phạt
var p2Tab=2;
function setP2Tab(i){p2Tab=i;syncSidebarNav();render();}
function p2(){
// Auto-redirect nếu user không có quyền tab hiện tại
var canSalary=canAccessKey('p2.salary')||canAccessKey('p2'),canPenalty=canAccessKey('p2.penalty')||canAccessKey('p2'),canTask=canAccessKey('p2.task')||canAccessKey('p2');
if(p2Tab===0&&!canSalary){if(canPenalty)p2Tab=1;else if(canTask)p2Tab=2;}
if(p2Tab===1&&!canPenalty){if(canSalary)p2Tab=0;else if(canTask)p2Tab=2;}
if(p2Tab===2&&!canTask){if(canSalary)p2Tab=0;else if(canPenalty)p2Tab=1;}
if(p2Tab===2)return p2Task();
if(p2Tab===1)return p2Penalty();
return p2Salary();
}
// Sub-tab 0: Lương + Hoa hồng
function p2Salary(){
var lockedStaffId=getRestrictedStaffId();
var visibleStaff=lockedStaffId?staffList.filter(function(s){return s.id===lockedStaffId;}):staffList;
var nd=dates.length||1,st={};visibleStaff.forEach(function(s){st[s.id]=0;});
dailyData.forEach(function(d){var sid=gsfa(d.ad_account_id,d.report_date,d.staff_id);if(sid&&st.hasOwnProperty(sid))st[sid]+=d.spend_amount;});
var h='<div class="page-title">Nhân sự</div><div class="page-sub">'+(lockedStaffId?'Lương + Hoa hồng của bạn':visibleStaff.length+' Chuyên viên quảng cáo · Lương + Hoa hồng')+'</div>';
h+='<div class="table-wrap"><table><tr><th></th><th>Họ tên</th><th>Ngân sách</th><th>DS ('+nd+' ngày)</th><th>Lương</th></tr>';
visibleStaff.forEach(function(s){var c=sc(s.color_code),sal=salaryData.find(function(x){return x.staff_id===s.id;});
h+='<tr><td><div class="avatar" style="background:'+c.bg+';color:'+c.tx+';">'+esc(s.avatar_initials)+'</div></td><td style="font-weight:500;">'+esc(s.full_name)+'</td><td class="mono">'+fm(s.monthly_budget)+'</td><td class="mono" style="color:'+c.c+';font-weight:500;">'+fm(st[s.id])+'</td><td class="mono">'+(sal?fm(sal.total):'—')+'</td></tr>';});
h+='</table></div>';
// ═══ BẢNG LƯƠNG THÁNG ═══
h+=renderSalaryTable();
var ms=new Set();monthlyRevData.forEach(function(r){ms.add(r.month);});var sm=Array.from(ms).sort();
if(sm.length){h+='<div class="section-title">Chi tiêu lịch sử</div><div class="table-wrap"><table><tr><th>Tháng</th>';visibleStaff.forEach(function(s){h+='<th style="text-align:right;">'+esc(s.short_name)+'</th>';});h+='<th style="text-align:right;">Tổng</th></tr>';
sm.forEach(function(m){var tt=0;h+='<tr><td>T'+parseInt(m.split('-')[1])+'/'+m.split('-')[0]+'</td>';visibleStaff.forEach(function(s){var rv=monthlyRevData.find(function(r){return r.staff_id===s.id&&r.month===m;}),v=rv?rv.total_spend:0;tt+=v;h+='<td class="mono" style="text-align:right;">'+fm(v)+'</td>';});h+='<td class="mono" style="text-align:right;font-weight:600;">'+fm(tt)+'</td></tr>';});h+='</table></div>';}
return h;}
// Sub-tab 1: Sổ phạt + Tổng phạt theo nhân sự + Link CHUNG cho cả team
function p2Penalty(){
var lockedStaffId=getRestrictedStaffId();
var h='<div class="page-title">Sổ phạt</div><div class="page-sub">'+(lockedStaffId?'Lịch sử phạt + quỹ team chung':'Quản lý phạt + Quỹ team chung + 1 link cho cả team')+'</div>';
// ═══ QUỸ TEAM (banner nhắc + card tổng quan) — luôn hiển thị (quỹ là tài sản chung) ═══
h+=renderTeamFundBanner();
h+=renderTeamFundCard();
// Card share link chung — chỉ admin
if(!lockedStaffId){
  h+='<div class="form-card" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;padding:14px 18px;margin-bottom:14px;">';
  h+='<div><div style="font-weight:600;font-size:14px;">Link sổ phạt chung của team</div><div style="font-size:12px;color:var(--tx3);margin-top:2px;">1 link gửi cả nhóm Zalo · ai mở cũng thấy phạt + quỹ team · không thấy lương/hoa hồng</div></div>';
  h+='<div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="btn btn-primary btn-sm" onclick="copyTeamPenaltyLink(this)">📋 Sao chép link sổ chung</button><button class="btn btn-ghost btn-sm" onclick="rotateTeamPenaltyLink(this)" title="Sinh token mới — link cũ sẽ mất hiệu lực">🔄 Đổi token</button></div>';
  h+='</div>';
}
// Bảng tổng phạt theo nhân sự (tháng đang xem)
var month=penaltyMonth||lm();
var totByStaff={};
penaltyData.forEach(function(p){
  if((p.penalty_date||'').substring(0,7)!==month)return;
  if(lockedStaffId&&p.staff_id!==lockedStaffId)return;
  var sid=p.staff_id||('raw:'+(p.staff_name_raw||'?'));
  if(!totByStaff[sid])totByStaff[sid]={count:0,total:0};
  totByStaff[sid].count++;totByStaff[sid].total+=Number(p.amount)||0;
});
var grandCount=0,grandTotal=0;
var visibleStaffPen=lockedStaffId?staffList.filter(function(s){return s.id===lockedStaffId;}):staffList;
h+='<div class="section-title">Tổng phạt theo nhân sự — T'+parseInt(month.split('-')[1])+'/'+month.split('-')[0]+'</div>';
h+='<div class="table-wrap"><table><thead><tr><th></th><th>Nhân sự</th><th style="text-align:right;">Số lần phạt</th><th style="text-align:right;">Tổng tiền phạt</th></tr></thead><tbody>';
visibleStaffPen.forEach(function(s){
  var rec=totByStaff[s.id]||{count:0,total:0};
  grandCount+=rec.count;grandTotal+=rec.total;
  var c=sc(s.color_code);
  h+='<tr><td><div class="avatar" style="background:'+c.bg+';color:'+c.tx+';">'+esc(s.avatar_initials)+'</div></td>';
  h+='<td style="font-weight:500;">'+esc(s.full_name)+'</td>';
  h+='<td style="text-align:right;" class="mono">'+(rec.count?rec.count:'—')+'</td>';
  h+='<td style="text-align:right;" class="mono"><span style="color:'+(rec.total>0?'var(--red)':'var(--tx3)')+';font-weight:'+(rec.total>0?'500':'400')+';">'+(rec.total>0?'−'+ff(rec.total):'—')+'</span></td>';
  h+='</tr>';
});
h+='<tr style="border-top:2px solid var(--bd1);background:var(--bg2);"><td colspan="2" style="text-align:right;font-weight:600;padding:10px;">Tổng cộng tháng này</td><td style="text-align:right;font-weight:600;padding:10px;" class="mono">'+(grandCount?grandCount+' lần':'—')+'</td><td style="text-align:right;font-weight:600;padding:10px;color:var(--red);" class="mono">'+(grandTotal>0?'−'+ff(grandTotal):'—')+'</td></tr>';
h+='</tbody></table></div>';
// ═══ SỔ PHẠT chi tiết (form nhập + bảng theo ngày) ═══
h+=renderPenaltyTable();
return h;}

// ═══ BẢNG LƯƠNG THÁNG (inline edit + autosave) ═══
function renderSalaryTable(){
if(!salaryMonth)salaryMonth=lm(); // mặc định tháng hiện tại
// Danh sách tháng có dữ liệu + tháng hiện tại + 6 tháng gần nhất
var monthSet=new Set();
dates.forEach(function(d){monthSet.add(d.substring(0,7));});
salaryData.forEach(function(s){monthSet.add(s.month);});
monthSet.add(lm());
// Thêm 6 tháng gần nhất nếu chưa có
var tdObj=new Date();
for(var i=0;i<6;i++){var my=tdObj.getFullYear(),mm=tdObj.getMonth()+1-i;while(mm<=0){mm+=12;my-=1;}monthSet.add(my+'-'+String(mm).padStart(2,'0'));}
var monthArr=Array.from(monthSet).sort().reverse();
var h='<div class="section-title" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;"><div>Bảng lương tháng</div><div style="display:flex;gap:8px;align-items:center;"><select class="fi" style="width:140px;" onchange="salaryMonth=this.value;expandedSalaryStaffId=null;render();">';
monthArr.forEach(function(m){h+='<option value="'+m+'"'+(m===salaryMonth?' selected':'')+'>T'+parseInt(m.split('-')[1])+'/'+m.split('-')[0]+'</option>';});
h+='</select><button class="btn btn-ghost btn-sm" onclick="recomputeAllCommissions(this)">🔄 Tính lại hoa hồng</button></div></div>';
h+='<div style="font-size:12px;color:var(--tx3);margin-bottom:10px;">Hoa hồng tự động: <b>1%</b> ngân sách nếu khách quản lý dưới 90 ngày · <b>2%</b> nếu từ 90 ngày trở lên (tính đến cuối tháng). Tự động lưu khi chỉnh sửa.</div>';
h+='<div class="table-wrap"><table><thead><tr><th></th><th>Nhân sự</th><th style="text-align:right;">Lương cứng</th><th style="text-align:right;">Hoa hồng Quảng cáo</th><th style="text-align:right;">Thưởng khác</th><th style="text-align:right;">Phạt</th><th style="text-align:right;">Tổng</th><th style="min-width:180px;">Ghi chú thưởng</th></tr></thead><tbody>';
var grandTotal=0;
var _lockedStaffId=getRestrictedStaffId();
var _visibleStaff=_lockedStaffId?staffList.filter(function(s){return s.id===_lockedStaffId;}):staffList;
_visibleStaff.forEach(function(s){
var c=sc(s.color_code);
// Lấy row lương từ DB nếu có
var row=salaryData.find(function(x){return x.staff_id===s.id&&x.month===salaryMonth;});
// Tính hoa hồng tự động
var isCEO=(Number(s.default_base_salary)===0)||/hưng coaching|hung coaching|ceo/i.test((s.full_name||'')+' '+(s.short_name||''));
var comm=isCEO?{total:0,detail:[]}:computeStaffCommission(s.id,salaryMonth);
// Giá trị hiển thị: ưu tiên DB, fallback default
var baseVal=row&&row.base_salary!=null?Number(row.base_salary):(isCEO?0:(Number(s.default_base_salary)||4000000));
// Luôn hiển thị hoa hồng tự tính (comm.total) thay vì snapshot DB — vì spend Meta sync về có thể đã thay đổi
// DB snapshot chỉ phục vụ historical, sẽ được auto-update khi edit ô nào đó hoặc bấm "Tính lại hoa hồng"
var commVal=comm.total;
var bonusVal=row&&row.bonus!=null?Number(row.bonus):0;
var noteVal=row&&row.note?row.note:'';
// Tổng phạt trong tháng (trừ vào lương)
var penVal=0;penaltyData.forEach(function(p){if(p.staff_id===s.id&&(p.penalty_date||'').substring(0,7)===salaryMonth)penVal+=Number(p.amount)||0;});
var total=baseVal+commVal+bonusVal-penVal;grandTotal+=total;
var isExp=expandedSalaryStaffId===s.id;
h+='<tr'+(isExp?' style="background:var(--bg2);"':'')+'>';
h+='<td><div class="avatar" style="background:'+c.bg+';color:'+c.tx+';cursor:pointer;" onclick="toggleSalaryExpand(\''+s.id+'\')">'+esc(s.avatar_initials)+'</div></td>';
h+='<td style="font-weight:500;cursor:pointer;" onclick="toggleSalaryExpand(\''+s.id+'\')">'+esc(s.full_name)+(isCEO?' <span style="font-size:10px;padding:2px 6px;border-radius:6px;background:var(--amber-bg);color:var(--amber-tx);margin-left:4px;">CEO</span>':'')+'<div style="font-size:11px;color:var(--tx3);margin-top:2px;">'+comm.detail.length+' khách hàng · Click để xem chi tiết</div></td>';
h+='<td style="text-align:right;"><input type="text" inputmode="numeric" class="mono" style="width:110px;text-align:right;border:1px solid var(--bd1);border-radius:6px;padding:5px 8px;font-size:12px;" value="'+(baseVal?baseVal.toLocaleString('vi-VN'):'')+'" oninput="fmtSalaryInput(this,\''+s.id+'\',\'base_salary\')"></td>';
h+='<td style="text-align:right;" class="mono"><span style="color:'+(commVal>0?'var(--green)':'var(--tx3)')+';font-weight:500;">'+ff(commVal)+'</span>'+(isCEO?'':'<div style="font-size:10px;color:var(--tx3);">tự động</div>')+'</td>';
h+='<td style="text-align:right;"><input type="text" inputmode="numeric" class="mono" style="width:110px;text-align:right;border:1px solid var(--bd1);border-radius:6px;padding:5px 8px;font-size:12px;" value="'+(bonusVal?bonusVal.toLocaleString('vi-VN'):'')+'" oninput="fmtSalaryInput(this,\''+s.id+'\',\'bonus\')"></td>';
h+='<td style="text-align:right;" class="mono"><span style="color:'+(penVal>0?'var(--red)':'var(--tx3)')+';font-weight:500;" title="Tổng phạt tháng này từ Sổ phạt (tự động trừ vào tổng lương)">'+(penVal>0?'−'+ff(penVal):'—')+'</span></td>';
h+='<td style="text-align:right;font-weight:600;" class="mono">'+ff(total)+'</td>';
h+='<td><input type="text" style="width:100%;min-width:160px;border:1px solid var(--bd1);border-radius:6px;padding:5px 8px;font-size:12px;" placeholder="VD: Thưởng dự án Mysterise" value="'+esc(noteVal)+'" oninput="onSalaryEdit(\''+s.id+'\',\'note\',this.value)"></td>';
h+='</tr>';
// Expanded row: chi tiết hoa hồng
if(isExp){
h+='<tr><td colspan="8" style="background:var(--bg2);padding:12px 20px;">';
if(comm.detail.length){
h+='<div style="font-size:12px;font-weight:500;margin-bottom:8px;color:var(--tx2);">Chi tiết hoa hồng quảng cáo — '+comm.detail.length+' khách hàng</div>';
h+='<table style="width:100%;font-size:12px;"><thead><tr style="color:var(--tx3);font-size:11px;text-transform:uppercase;"><th style="text-align:left;padding:4px 8px;">Khách hàng</th><th style="text-align:right;padding:4px 8px;">Ngày quản lý</th><th style="text-align:right;padding:4px 8px;">Spend tháng</th><th style="text-align:right;padding:4px 8px;">% hoa hồng</th><th style="text-align:right;padding:4px 8px;">Số tiền</th></tr></thead><tbody>';
comm.detail.forEach(function(b){
h+='<tr><td style="padding:4px 8px;">'+esc(b.client_name)+'</td><td style="text-align:right;padding:4px 8px;" class="mono">'+b.days+' ngày</td><td style="text-align:right;padding:4px 8px;" class="mono">'+ff(b.spend)+'</td><td style="text-align:right;padding:4px 8px;"><span style="color:'+(b.rate>=0.02?'var(--green)':'var(--amber-tx)')+';font-weight:500;">'+(b.rate*100).toFixed(0)+'%</span></td><td style="text-align:right;padding:4px 8px;font-weight:500;" class="mono">'+ff(b.amount)+'</td></tr>';});
h+='<tr style="border-top:1px solid var(--bd1);"><td colspan="4" style="text-align:right;padding:6px 8px;font-weight:500;">Tổng hoa hồng</td><td style="text-align:right;padding:6px 8px;font-weight:600;color:var(--green);" class="mono">'+ff(comm.total)+'</td></tr>';
h+='</tbody></table>';
}else{
h+='<div style="font-size:12px;color:var(--tx3);text-align:center;padding:10px;">'+(isCEO?'CEO không nhận hoa hồng quảng cáo tự động':'Không có dữ liệu khách hàng quản lý trong tháng này')+'</div>';}
h+='</td></tr>';}
});
h+='<tr style="border-top:2px solid var(--bd1);background:var(--bg2);"><td colspan="6" style="text-align:right;font-weight:600;padding:10px;">Tổng chi lương tháng (đã trừ phạt)</td><td style="text-align:right;font-weight:600;padding:10px;color:var(--red);" class="mono">'+ff(grandTotal)+'</td><td></td></tr>';
h+='</tbody></table></div>';
return h;}

// ═══════════════════════════════════════════════════════════════════
// SỔ PHẠT — quản lý phạt nhân sự, tự động trừ vào bảng lương tháng
// ═══════════════════════════════════════════════════════════════════
function staffByFuzzyName(rawName){
var n=(rawName||'').toLowerCase().trim();if(!n)return null;
// exact short_name
var m=allStaff.find(function(s){return(s.short_name||'').toLowerCase().trim()===n;});if(m)return m;
// exact full_name
m=allStaff.find(function(s){return(s.full_name||'').toLowerCase().trim()===n;});if(m)return m;
// contains
m=allStaff.find(function(s){var sn=(s.short_name||'').toLowerCase(),fn=(s.full_name||'').toLowerCase();return sn&&(sn.indexOf(n)>=0||n.indexOf(sn)>=0);});if(m)return m;
m=allStaff.find(function(s){var fn=(s.full_name||'').toLowerCase();return fn&&(fn.indexOf(n)>=0||n.indexOf(fn)>=0);});
return m||null;}
function renderPenaltyTable(){
if(!penaltyMonth)penaltyMonth=lm();
// Tập tháng hiện có + 6 tháng gần nhất
var monthSet=new Set();
penaltyData.forEach(function(p){if(p.penalty_date)monthSet.add(p.penalty_date.substring(0,7));});
monthSet.add(lm());
var td2=new Date();for(var i=0;i<6;i++){var my=td2.getFullYear(),mm=td2.getMonth()+1-i;while(mm<=0){mm+=12;my-=1;}monthSet.add(my+'-'+String(mm).padStart(2,'0'));}
var monthArr=Array.from(monthSet).sort().reverse();
var h='<div class="section-title" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;"><div>Sổ phạt <span style="font-size:11px;font-weight:400;color:var(--tx3);margin-left:6px;">Tự động trừ vào bảng lương tháng</span></div>';
h+='<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">';
h+='<select class="fi" style="width:140px;" onchange="penaltyMonth=this.value;render();">';
monthArr.forEach(function(m){h+='<option value="'+m+'"'+(m===penaltyMonth?' selected':'')+'>T'+parseInt(m.split('-')[1])+'/'+m.split('-')[0]+'</option>';});
h+='</select>';
if(authUser&&isAdmin()){
h+='<button class="btn btn-ghost btn-sm" onclick="askAIPenalty()" title="Gõ câu tự nhiên cho AI, VD: Phạt Sơn 30k ngày 20/4 do quên báo cáo">🤖 AI ghi phạt</button>';
h+='<input type="file" id="penalty-xlsx" accept=".xlsx,.xls" style="display:none;" onchange="importPenaltiesFromXLSX(this.files[0])">';
h+='<button class="btn btn-ghost btn-sm" onclick="document.getElementById(\'penalty-xlsx\').click()" title="Import file Excel phạt (từ T2/2026 trở đi)">📥 Import Excel</button>';
}
h+='</div></div>';
// Form nhập phạt
if(authUser&&isAdmin()){
h+='<div class="form-card" style="padding:12px 14px;margin-bottom:10px;">';
h+='<div class="form-row"><div class="form-group"><label>Nhân sự</label><select id="pn-staff">';
staffList.forEach(function(s){h+='<option value="'+s.id+'">'+esc(s.short_name)+'</option>';});
h+='</select></div>';
h+='<div class="form-group"><label>Ngày</label><input type="date" id="pn-date" value="'+td()+'"></div>';
h+='<div class="form-group"><label>Số tiền</label><input type="number" id="pn-amount" placeholder="30000"></div></div>';
h+='<div class="form-row"><div class="form-group" style="grid-column:1/-1;"><label>Lý do</label><input type="text" id="pn-reason" placeholder="VD: Quên báo cáo, đi làm muộn…"></div></div>';
h+='<div style="display:flex;align-items:center;gap:8px;margin:6px 0 10px;font-size:12px;color:var(--tx2);"><label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="checkbox" id="pn-excluded" style="margin:0;"> 🏥 Bồi thường khách <span style="color:var(--tx3);">(vẫn trừ lương nhưng không vào quỹ team)</span></label></div>';
h+='<div class="btn-row"><button class="btn btn-primary btn-sm" onclick="savePenalty(this)">Ghi phạt</button></div></div>';
}
// Pivot table: dòng = ngày, cột = nhân sự + Note
var _rpLockedStaffId=getRestrictedStaffId();
var monthRows=penaltyData.filter(function(p){
  if((p.penalty_date||'').substring(0,7)!==penaltyMonth)return false;
  if(_rpLockedStaffId&&p.staff_id!==_rpLockedStaffId)return false;
  return true;
});
if(!monthRows.length){
h+='<div class="empty-state" role="status"><div class="empty-state-icon" aria-hidden="true">📒</div><div class="empty-state-title">Chưa có phạt nào trong tháng này</div><div class="empty-state-desc">Nhập phạt ở form trên, hoặc nhờ AI ghi bằng câu tự nhiên.</div></div>';
return h;}
// Build date set
var dateSet=new Set();monthRows.forEach(function(p){dateSet.add(p.penalty_date);});
var dateArr=Array.from(dateSet).sort();
// Columns: staffList (active) + any extra staff_id hoặc raw_name có trong dữ liệu nhưng không active
var colStaff=_rpLockedStaffId?staffList.filter(function(s){return s.id===_rpLockedStaffId;}):staffList.slice();var extraNameSet=new Set();
monthRows.forEach(function(p){
if(p.staff_id){if(!colStaff.find(function(s){return s.id===p.staff_id;})){var inactive=allStaff.find(function(s){return s.id===p.staff_id;});if(inactive)colStaff.push(inactive);}}
else if(p.staff_name_raw)extraNameSet.add(p.staff_name_raw);
});
var extraNames=Array.from(extraNameSet);
h+='<div class="table-wrap"><table><thead><tr><th>Ngày</th>';
colStaff.forEach(function(s){h+='<th style="text-align:right;">'+esc(s.short_name)+(s.is_active?'':' <span style="font-size:10px;color:var(--tx3);">(cũ)</span>')+'</th>';});
extraNames.forEach(function(n){h+='<th style="text-align:right;color:var(--tx3);">'+esc(n)+' <span style="font-size:10px;">(chưa gán)</span></th>';});
h+='<th>Lý do</th>'+(authUser&&isAdmin()?'<th></th>':'')+'</tr></thead><tbody>';
var totals={};colStaff.forEach(function(s){totals[s.id]=0;});var extraTotals={};extraNames.forEach(function(n){extraTotals[n]=0;});var grandTot=0;
dateArr.forEach(function(d){
var dayRows=monthRows.filter(function(p){return p.penalty_date===d;});
var reasons=dayRows.map(function(r){return r.reason||'';}).filter(function(x){return x;}).join(' · ');
// Map theo staff_id
var byStaff={},byExtra={};dayRows.forEach(function(p){
if(p.staff_id){if(!byStaff[p.staff_id])byStaff[p.staff_id]=[];byStaff[p.staff_id].push(p);}
else if(p.staff_name_raw){if(!byExtra[p.staff_name_raw])byExtra[p.staff_name_raw]=[];byExtra[p.staff_name_raw].push(p);}
});
h+='<tr><td>'+fd(d)+'</td>';
colStaff.forEach(function(s){
var arr=byStaff[s.id]||[];var sum=arr.reduce(function(acc,p){return acc+(Number(p.amount)||0);},0);
totals[s.id]+=sum;grandTot+=sum;
if(!sum){h+='<td></td>';return;}
var allEx=arr.every(function(p){return p.excluded_from_fund;});
var someEx=arr.some(function(p){return p.excluded_from_fund;});
var color=allEx?'var(--amber-tx)':'var(--red)';
var prefix=someEx?'🏥 ':'';
var title=arr.map(function(r){return (r.excluded_from_fund?'🏥 ':'')+(r.reason||'(không ghi lý do)');}).join(' · ');
h+='<td style="text-align:right;" class="mono"><span style="color:'+color+';font-weight:500;" title="'+esc(title)+'">'+prefix+ff(sum)+'</span>';
if(authUser&&isAdmin()){
  if(arr.length===1){
    h+=' <button onclick="togglePenaltyExcluded(\''+arr[0].id+'\')" style="font-size:11px;border:0;background:none;color:var(--tx3);cursor:pointer;padding:0 2px;" title="'+(arr[0].excluded_from_fund?'Đưa lại vào quỹ':'Đánh dấu bồi thường khách (không vào quỹ)')+'">'+(arr[0].excluded_from_fund?'↩':'🏥')+'</button>';
    h+=' <button onclick="deletePenalty(\''+arr[0].id+'\')" style="font-size:10px;border:0;background:none;color:var(--tx3);cursor:pointer;" title="Xóa">×</button>';
  } else {
    var _ids=arr.map(function(p){return p.id;}).join(',');
    h+=' <button onclick="deletePenaltyBulk(\''+_ids+'\','+arr.length+','+sum+')" style="font-size:10px;border:0;background:none;color:var(--tx3);cursor:pointer;" title="Xóa '+arr.length+' khoản phạt ngày này">×</button>';
  }
}
h+='</td>';
});
extraNames.forEach(function(n){
var arr=byExtra[n]||[];var sum=arr.reduce(function(acc,p){return acc+(Number(p.amount)||0);},0);
extraTotals[n]+=sum;grandTot+=sum;
if(sum)h+='<td style="text-align:right;" class="mono" style="color:var(--amber-tx);">'+ff(sum)+'</td>';else h+='<td></td>';
});
h+='<td style="font-size:12px;color:var(--tx2);">'+esc(reasons)+'</td>';
if(authUser&&isAdmin())h+='<td></td>';
h+='</tr>';
});
// Total row
h+='<tr style="border-top:2px solid var(--bd1);background:var(--bg2);font-weight:600;"><td>TỔNG</td>';
colStaff.forEach(function(s){h+='<td style="text-align:right;" class="mono">'+(totals[s.id]?'<span style="color:var(--red);">'+ff(totals[s.id])+'</span>':'—')+'</td>';});
extraNames.forEach(function(n){h+='<td style="text-align:right;" class="mono">'+(extraTotals[n]?ff(extraTotals[n]):'—')+'</td>';});
h+='<td style="text-align:right;" class="mono" colspan="'+(authUser&&isAdmin()?'2':'1')+'"><span style="color:var(--red);">Tổng tháng: '+ff(grandTot)+'</span></td>';
h+='</tr>';
h+='</tbody></table></div>';
if(extraNames.length){
h+='<div style="margin-top:10px;padding:8px 12px;background:var(--amber-bg);color:var(--amber-tx);border-radius:6px;font-size:11px;">⚠ Có '+extraNames.length+' tên chưa gán được vào Nhân sự trong hệ thống: <b>'+esc(extraNames.join(', '))+'</b>. Vào Supabase → table <code>penalty</code> → set cột <code>staff_id</code> để khớp, hoặc thêm nhân sự mới (nếu đó là nhân sự đang hoạt động).</div>';
}
return h;
}
async function savePenalty(btn){
if(!needAuth())return;
var sid=document.getElementById('pn-staff').value;
var d=document.getElementById('pn-date').value;
var amt=parseInt(document.getElementById('pn-amount').value,10);
var rs=document.getElementById('pn-reason').value.trim();
var exEl=document.getElementById('pn-excluded');
var excluded=!!(exEl&&exEl.checked);
if(!sid||!d||!amt||amt<=0){toast('Thiếu thông tin: Nhân sự / Ngày / Số tiền',false);return;}
if(btn){btn.disabled=true;btn.textContent='Đang lưu...';}
var r=await sb2.from('penalty').insert({staff_id:sid,penalty_date:d,amount:amt,reason:rs,excluded_from_fund:excluded,created_by:authUser?authUser.email:null});
if(btn){btn.disabled=false;btn.textContent='Ghi phạt';}
if(r.error){toast('Lỗi: '+r.error.message,false);return;}
toast('Đã ghi phạt '+ff(amt)+(excluded?' (bồi thường khách)':''),true);
document.getElementById('pn-amount').value='';document.getElementById('pn-reason').value='';
if(exEl)exEl.checked=false;
await loadAll();render();}
async function togglePenaltyExcluded(id){
  if(!isAdmin()){toast('Chỉ admin mới đổi được',false);return;}
  var p=penaltyData.find(function(x){return x.id===id;});if(!p)return;
  var newVal=!p.excluded_from_fund;
  var msg=newVal
    ?'Đánh dấu phạt này là "Bồi thường khách" — vẫn trừ lương nhưng KHÔNG cộng vào quỹ team. Tiếp tục?'
    :'Đưa phạt này trở lại quỹ team — sẽ cộng vào quỹ chung. Tiếp tục?';
  if(!(await hcConfirm({title:newVal?'Bồi thường khách':'Đưa lại vào quỹ',message:msg,confirmLabel:'Xác nhận'})))return;
  var r=await sb2.from('penalty').update({excluded_from_fund:newVal}).eq('id',id);
  if(r.error){toast('Lỗi: '+r.error.message,false);return;}
  toast(newVal?'Đã loại khỏi quỹ team':'Đã đưa lại vào quỹ',true);
  await loadAll();render();
}
async function deletePenalty(id){
if(!needAuth())return;
if(!confirm('Xóa khoản phạt này?'))return;
var r=await sb2.from('penalty').delete().eq('id',id);
if(r.error){toast('Lỗi: '+r.error.message,false);return;}
toast('Đã xóa',true);await loadAll();render();}
async function deletePenaltyBulk(idsStr,count,totalAmt){
if(!needAuth())return;
if(!isAdmin()){toast('Chỉ admin mới xoá được',false);return;}
if(!confirm('Xoá '+count+' khoản phạt (tổng '+ff(totalAmt)+'đ) trong cell này?'))return;
var ids=idsStr.split(',');
var r=await sb2.from('penalty').delete().in('id',ids);
if(r.error){toast('Lỗi: '+r.error.message,false);return;}
toast('Đã xoá '+count+' khoản',true);await loadAll();render();}
// ═══ AI GHI PHẠT — parse câu tự nhiên thành JSON, xác nhận trước khi lưu ═══
async function askAIPenalty(){
if(!isAdmin()){toast('Chỉ admin mới ghi phạt được',false);return;}
var rawModel=document.getElementById('ai-model')?document.getElementById('ai-model').value:'gpt-4o-mini';
var userMsg=prompt('Mô tả khoản phạt bằng câu tự nhiên:\n\nVí dụ:\n  • Phạt Sơn 30k ngày 20/4 do quên báo cáo\n  • Phạt Anh Thư 60k hôm qua, set lỗi độ tuổi\n  • Phạt Nhi 30000 today, rep tin nhắn chậm\n\nCó thể nhập NHIỀU dòng, mỗi dòng 1 phạt.');
if(!userMsg||!userMsg.trim())return;
if(!CLAUDE_KEY&&!OPENAI_KEY){toast('Chưa cấu hình API key AI. Vào Admin → Cài đặt API Key.',false);return;}
var staffHint=staffList.map(function(s){return'id="'+s.id+'" short="'+s.short_name+'" full="'+s.full_name+'"';}).join('\n');
var todayStr=td();
var systemPrompt='Bạn là trợ lý parse câu tự nhiên tiếng Việt thành JSON ghi phạt nhân sự.\n\nDanh sách nhân sự:\n'+staffHint+'\n\nHôm nay là '+todayStr+'. Nếu user nói "hôm nay" → '+todayStr+'; "hôm qua" → ngày trước đó; "20/4" → 2026-04-20 (năm hiện tại nếu không nói rõ).\n\nĐơn vị tiền: "k" hoặc "ngàn" = ×1000, "tr" hoặc "triệu" = ×1000000. "30k" = 30000.\n\nChỉ trả về JSON MẢNG thuần, KHÔNG markdown, KHÔNG code fence, VD:\n[{"staff_id":"uuid-đã-match","penalty_date":"2026-04-20","amount":30000,"reason":"quên báo cáo"}]\n\nNếu không match được nhân sự → dùng "staff_id":null và điền "staff_name_raw" là tên thô.';
toast('Đang parse bằng AI...',true);
try{
var isClaude=rawModel.indexOf('claude')===0;
var resp;
if(isClaude){
resp=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':CLAUDE_KEY,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:rawModel,system:systemPrompt,messages:[{role:'user',content:userMsg}],max_tokens:1200})});
}else{
resp=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+OPENAI_KEY},body:JSON.stringify({model:rawModel,messages:[{role:'system',content:systemPrompt},{role:'user',content:userMsg}],max_completion_tokens:1200,response_format:{type:'json_object'}})});
}
var data=await resp.json();
if(data.error){toast('Lỗi AI: '+data.error.message,false);return;}
var text=isClaude?data.content[0].text:data.choices[0].message.content;
// Parse: tìm mảng [ ... ]
var match=text.match(/\[[\s\S]*\]/);if(!match){
// Có thể AI wrap trong object {items:[...]}
try{var obj=JSON.parse(text);if(Array.isArray(obj))match=[text];else if(obj&&Array.isArray(obj.items))match=[JSON.stringify(obj.items)];else if(obj&&Array.isArray(obj.penalties))match=[JSON.stringify(obj.penalties)];}catch(e){}
}
if(!match){toast('AI không trả về JSON hợp lệ. Thử lại.',false);console.warn('[AI penalty] raw:',text);return;}
var items;try{items=JSON.parse(match[0]);}catch(e){toast('Parse JSON lỗi: '+e.message,false);console.warn('[AI penalty] raw:',text);return;}
if(!Array.isArray(items)||!items.length){toast('AI không phát hiện phạt nào',false);return;}
// Validate + confirm
var preview=items.map(function(it,i){
var sname='—';if(it.staff_id){var s=allStaff.find(function(x){return x.id===it.staff_id;});if(s)sname=s.short_name;else sname='(id không khớp)';}else if(it.staff_name_raw)sname=it.staff_name_raw+' (chưa gán)';
return(i+1)+'. '+sname+' · '+it.penalty_date+' · '+ff(it.amount)+' · '+(it.reason||'(không ghi lý do)');
}).join('\n');
if(!confirm('AI phát hiện '+items.length+' khoản phạt:\n\n'+preview+'\n\nLưu vào DB?'))return;
// Insert
var rows=items.map(function(it){return{staff_id:it.staff_id||null,staff_name_raw:it.staff_id?null:(it.staff_name_raw||null),penalty_date:it.penalty_date,amount:Number(it.amount)||0,reason:it.reason||'',created_by:authUser?authUser.email:null};});
var r=await sb2.from('penalty').insert(rows);
if(r.error){toast('Lỗi lưu: '+r.error.message,false);return;}
toast('Đã lưu '+items.length+' khoản phạt',true);
await loadAll();render();
}catch(e){toast('Lỗi: '+e.message,false);console.error(e);}}
// ═══ IMPORT XLSX — parse file "PHẠT TEAM" nhiều sheet theo tháng ═══
async function importPenaltiesFromXLSX(file){
if(!isAdmin()){toast('Chỉ admin mới import được',false);return;}
if(!file)return;
try{
var XLSX=await loadXLSX();
var buf=await file.arrayBuffer();
var wb=XLSX.read(new Uint8Array(buf),{type:'array'});
var allRows=[],skipped=[];
var MIN_MONTH='2026-02';
wb.SheetNames.forEach(function(name){
// Parse tháng từ tên sheet: "T3.2026", "T12.2024", "T2.2026"
var m=name.match(/^T(\d{1,2})[\s.\/-]?(\d{4})$/i);if(!m){skipped.push(name+' (tên sheet không phải dạng T<M>.<YYYY>)');return;}
var month=parseInt(m[1],10),year=parseInt(m[2],10);
if(month<1||month>12){skipped.push(name);return;}
var mk=year+'-'+String(month).padStart(2,'0');
if(mk<MIN_MONTH){skipped.push(name+' (< '+MIN_MONTH+')');return;}
var ws=wb.Sheets[name];var rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
if(!rows.length)return;
var header=rows[0]||[];
// header[0]="Ngày", header[1..N-2]=tên nhân sự, header[N-1]="Note"
var staffCols=[];
for(var c=1;c<header.length;c++){var hv=String(header[c]||'').trim();if(!hv||/^note|lý do|ghi chú/i.test(hv))continue;staffCols.push({idx:c,name:hv});}
// Note column = cuối
var noteIdx=-1;for(var c2=header.length-1;c2>=1;c2--){if(/^note|lý do|ghi chú/i.test(String(header[c2]||'').trim())){noteIdx=c2;break;}}
// Cuối tháng theo sheet để clamp ngày
var lastDayOfSheet=new Date(year,month,0).getDate();
for(var r=1;r<rows.length;r++){
var row=rows[r];var dateCell=row[0];
if(!dateCell||typeof dateCell==='string'&&/tổng/i.test(dateCell))continue;
// Lấy DAY từ cell. Tháng/năm DÙNG THEO TÊN SHEET (file Excel thường có year lệch vì clone sheet cũ)
var day=null;
if(typeof dateCell==='number'){var parsed=XLSX.SSF.parse_date_code(dateCell);if(parsed&&parsed.d)day=parsed.d;}
else if(typeof dateCell==='string'){var dm=dateCell.match(/\b(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?\b/);if(dm)day=parseInt(dm[1],10);else{var dmi=dateCell.match(/^(\d{1,2})$/);if(dmi)day=parseInt(dmi[1],10);}}
if(!day||day<1||day>lastDayOfSheet)continue;
var d=mk+'-'+String(day).padStart(2,'0');
var reason=noteIdx>=0?String(row[noteIdx]||'').trim():'';
staffCols.forEach(function(col){
var val=row[col.idx];if(val===''||val==null)return;
var num=Number(val);if(!num||isNaN(num)||num<=0)return;
var s=staffByFuzzyName(col.name);
allRows.push({staff_id:s?s.id:null,staff_name_raw:s?null:col.name,penalty_date:d,amount:Math.round(num),reason:reason,created_by:authUser?authUser.email:null});
});
}
});
if(!allRows.length){toast('File không có dòng phạt hợp lệ (từ T2/2026)',false);return;}
var unmatched=allRows.filter(function(r){return!r.staff_id;}).length;
if(!confirm('Import '+allRows.length+' khoản phạt từ '+(wb.SheetNames.length-skipped.length)+' sheet?'+(skipped.length?'\n\nBỏ qua sheet: '+skipped.join(', '):'')+(unmatched?'\n\n⚠ '+unmatched+' dòng chưa khớp nhân sự (sẽ lưu với staff_name_raw).':'')))return;
// Batch insert 500 rows/lần
var batches=chunkArray(allRows,500),saved=0,errs=0;
for(var i=0;i<batches.length;i++){var r=await sb2.from('penalty').insert(batches[i]);if(r.error){errs+=batches[i].length;console.warn('[Penalty import]',r.error.message);}else saved+=batches[i].length;}
toast('Import xong: '+saved+' OK'+(errs?', '+errs+' lỗi':''),!errs);
await loadAll();render();
}catch(e){toast('Lỗi đọc file: '+e.message,false);console.error(e);}}

// ═══════════════════════════════════════════════════════════════════
// QUỸ TEAM — gộp tất cả phạt thành 1 quỹ chung, trích cho liên hoan/thưởng/quà...
// ═══════════════════════════════════════════════════════════════════
var TEAM_FUND_CATEGORIES=[
  {key:'lien_hoan',label:'Liên hoan',icon:'🍻'},
  {key:'thuong',label:'Thưởng',icon:'🎁'},
  {key:'team_building',label:'Team building',icon:'🏝'},
  {key:'qua',label:'Quà',icon:'🎀'},
  {key:'khac',label:'Khác',icon:'•'}
];
function teamFundCategoryLabel(key){
  var c=TEAM_FUND_CATEGORIES.find(function(x){return x.key===key;});
  return c?(c.icon+' '+c.label):'• Khác';
}
function teamFundMetrics(){
  // Chỉ tính phạt KHÔNG bị loại khỏi quỹ (excluded_from_fund=false hoặc undefined)
  var totCol=0,excludedTotal=0;
  penaltyData.forEach(function(p){
    var amt=Number(p.amount)||0;
    if(p.excluded_from_fund)excludedTotal+=amt;
    else totCol+=amt;
  });
  var totWd=0;teamFundData.forEach(function(w){totWd+=Number(w.amount)||0;});
  var n=new Date(),y=n.getFullYear(),qIdx=Math.floor(n.getMonth()/3);
  var qStart=y+'-'+String(qIdx*3+1).padStart(2,'0')+'-01',yStart=y+'-01-01';
  var qCol=0,yCol=0;
  penaltyData.forEach(function(p){
    if(p.excluded_from_fund)return;
    var d=p.penalty_date||'',amt=Number(p.amount)||0;
    if(d>=yStart)yCol+=amt;
    if(d>=qStart)qCol+=amt;
  });
  return{balance:totCol-totWd,totCollected:totCol,totWithdrawn:totWd,quarterCollected:qCol,yearCollected:yCol,excludedTotal:excludedTotal,quarter:qIdx+1,year:y,qStart:qStart,yStart:yStart};
}
function renderTeamFundBanner(){
  // Banner nhắc đầu Q (1, 4, 7, 10) ngày 1-7: thông báo Q vừa rồi đã thu được bao nhiêu
  var n=new Date(),d=n.getDate(),m=n.getMonth()+1,y=n.getFullYear();
  if(d>7||[1,4,7,10].indexOf(m)<0)return'';
  var prevStart,prevEnd,prevLabel;
  if(m===1){prevStart=(y-1)+'-10-01';prevEnd=(y-1)+'-12-31';prevLabel='Q4/'+(y-1)+' & năm '+(y-1);}
  else{var pIdx=Math.floor((m-1)/3)-1,pYear=y;if(pIdx<0){pIdx+=4;pYear-=1;}
    var sM=pIdx*3+1,eM=pIdx*3+3;
    prevStart=pYear+'-'+String(sM).padStart(2,'0')+'-01';
    prevEnd=pYear+'-'+String(eM).padStart(2,'0')+'-31';
    prevLabel='Q'+(pIdx+1)+'/'+pYear;}
  var prevTotal=0;penaltyData.forEach(function(p){if(p.excluded_from_fund)return;var dt=p.penalty_date||'';if(dt>=prevStart&&dt<=prevEnd)prevTotal+=Number(p.amount)||0;});
  if(prevTotal<=0)return'';
  // Đã có lần trích nào trong cửa sổ nhắc (tháng này) chưa? Có rồi → bỏ banner
  var monthStart=y+'-'+String(m).padStart(2,'0')+'-01';
  if(teamFundData.some(function(w){return(w.withdrawal_date||'')>=monthStart;}))return'';
  var html='<div class="form-card" style="background:var(--amber-bg);border-color:var(--amber-bd,var(--bd1));padding:12px 16px;margin-bottom:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">';
  html+='<div style="font-size:22px;">💡</div>';
  html+='<div style="flex:1;min-width:240px;font-size:13px;color:var(--amber-tx);"><b>'+prevLabel+'</b> đã thu được <b>'+ff(prevTotal)+'đ</b> tiền phạt — cân nhắc trích quỹ liên hoan/thưởng cho team.</div>';
  html+='<button class="btn btn-primary btn-sm" onclick="openTeamFundModal()">💰 Trích quỹ ngay</button>';
  html+='</div>';
  return html;
}
function renderTeamFundCard(){
  var m=teamFundMetrics();
  var h='<div class="form-card" style="padding:16px 18px;margin-bottom:14px;">';
  h+='<div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:12px;">';
  h+='<div><div style="font-weight:600;font-size:14px;">Quỹ team</div><div style="font-size:12px;color:var(--tx3);margin-top:2px;">Gộp toàn bộ tiền phạt = quỹ chung · trích ra cho liên hoan, thưởng, team building...</div></div>';
  h+=isAdmin()?'<button class="btn btn-primary btn-sm" onclick="openTeamFundModal()">💰 Trích quỹ</button>':'';
  h+='</div>';
  h+='<div class="kpi-grid kpi-4" style="gap:10px;">';
  h+='<div class="kpi" style="padding:12px;"><div class="kpi-label">Quỹ hiện có</div><div class="kpi-value" style="color:'+(m.balance>0?'var(--green)':'var(--tx2)')+';">'+ff(m.balance)+'</div><div class="kpi-note">đ — sau khi đã trích</div></div>';
  h+='<div class="kpi" style="padding:12px;"><div class="kpi-label">Q'+m.quarter+'/'+m.year+' đã thu</div><div class="kpi-value">'+ff(m.quarterCollected)+'</div><div class="kpi-note">phạt từ đầu quý đến nay</div></div>';
  h+='<div class="kpi" style="padding:12px;"><div class="kpi-label">Năm '+m.year+' đã thu</div><div class="kpi-value">'+ff(m.yearCollected)+'</div><div class="kpi-note">phạt từ đầu năm đến nay</div></div>';
  h+='<div class="kpi" style="padding:12px;"><div class="kpi-label">Đã trích all-time</div><div class="kpi-value" style="color:var(--red);">'+ff(m.totWithdrawn)+'</div><div class="kpi-note">'+teamFundData.length+' lần</div></div>';
  h+='</div>';
  if(m.excludedTotal>0){
    h+='<div style="margin-top:10px;padding:8px 12px;background:var(--bg2);border-radius:6px;font-size:11px;color:var(--tx3);">🏥 Đã loại khỏi quỹ <b style="color:var(--tx2);">'+ff(m.excludedTotal)+'đ</b> phạt bồi thường khách (vẫn trừ lương, không cộng vào quỹ chung)</div>';
  }
  if(teamFundData.length){
    h+='<div style="margin-top:14px;border-top:1px solid var(--bd1);padding-top:12px;">';
    h+='<div style="font-size:12px;font-weight:600;color:var(--tx2);margin-bottom:8px;">Lịch sử trích quỹ — '+teamFundData.length+' lần</div>';
    h+='<div class="table-wrap" style="margin:0;"><table style="margin:0;font-size:12px;"><thead><tr><th>Ngày</th><th>Mục đích</th><th>Phân loại</th><th style="text-align:right;">Số tiền</th>'+(isAdmin()?'<th style="text-align:right;width:50px;"></th>':'')+'</tr></thead><tbody>';
    teamFundData.slice(0,20).forEach(function(w){
      var dt=(w.withdrawal_date||'').split('-');
      var dStr=dt.length===3?(dt[2]+'/'+dt[1]+'/'+dt[0]):'';
      h+='<tr>';
      h+='<td class="mono" style="white-space:nowrap;">'+esc(dStr)+'</td>';
      h+='<td>'+esc(w.purpose||'')+(w.note?'<div style="font-size:11px;color:var(--tx3);margin-top:2px;">'+esc(w.note)+'</div>':'')+'</td>';
      h+='<td style="font-size:11px;color:var(--tx3);">'+esc(teamFundCategoryLabel(w.category||'khac'))+'</td>';
      h+='<td class="mono" style="text-align:right;color:var(--red);font-weight:500;">−'+ff(Number(w.amount)||0)+'</td>';
      if(isAdmin())h+='<td style="text-align:right;"><button onclick="deleteTeamFundWithdrawal(\''+w.id+'\')" style="font-size:14px;border:0;background:none;color:var(--tx3);cursor:pointer;" title="Xóa">×</button></td>';
      h+='</tr>';
    });
    if(teamFundData.length>20)h+='<tr><td colspan="'+(isAdmin()?5:4)+'" style="text-align:center;color:var(--tx3);font-size:11px;padding:8px;">… và '+(teamFundData.length-20)+' lần trước đó</td></tr>';
    h+='</tbody></table></div></div>';
  }
  h+='</div>';
  return h;
}
function openTeamFundModal(){
  if(!isAdmin()){toast('Chỉ admin mới trích quỹ được',false);return;}
  var root=document.getElementById('hc-modal-root')||(function(){var d=document.createElement('div');d.id='hc-modal-root';document.body.appendChild(d);return d;})();
  var ex=document.getElementById('team-fund-modal');if(ex)ex.remove();
  var nowD=new Date(),todayStr=nowD.getFullYear()+'-'+String(nowD.getMonth()+1).padStart(2,'0')+'-'+String(nowD.getDate()).padStart(2,'0');
  var qNow=Math.floor(nowD.getMonth()/3)+1,yNow=nowD.getFullYear();
  var defaultPurpose='Liên hoan Q'+qNow+'/'+yNow;
  var modal=document.createElement('div');modal.id='team-fund-modal';modal.className='hc-modal-backdrop';
  modal.setAttribute('onclick','if(event.target===this)closeTeamFundModal()');
  var chips='';
  TEAM_FUND_CATEGORIES.forEach(function(c){
    chips+='<button type="button" class="btn btn-ghost btn-sm" data-cat="'+c.key+'" onclick="pickTeamFundCategory(\''+c.key+'\')" style="padding:6px 12px;font-size:12px;">'+c.icon+' '+c.label+'</button>';
  });
  var m=teamFundMetrics();
  modal.innerHTML=
    '<div class="hc-modal" role="dialog" aria-modal="true" style="max-width:480px;">'
    +'<div class="hc-modal-head"><h3>Trích quỹ team</h3><button class="hc-modal-close" onclick="closeTeamFundModal()" aria-label="Đóng">×</button></div>'
    +'<div class="hc-modal-body">'
    +'<div style="font-size:12px;color:var(--tx3);margin-bottom:12px;">Quỹ hiện có: <b style="color:'+(m.balance>0?'var(--green)':'var(--tx2)')+';">'+ff(m.balance)+'đ</b></div>'
    +'<div style="margin-bottom:12px;"><label style="font-size:12px;color:var(--tx2);font-weight:500;">Phân loại</label>'
    +'<div id="tf-cat-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">'+chips+'</div>'
    +'<input type="hidden" id="tf-category" value="lien_hoan"></div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">'
    +'<div><label style="font-size:12px;color:var(--tx2);font-weight:500;">Ngày trích</label><input type="date" id="tf-date" class="fi" value="'+todayStr+'" style="width:100%;"></div>'
    +'<div><label style="font-size:12px;color:var(--tx2);font-weight:500;">Số tiền (đ)</label><input type="text" id="tf-amount" inputmode="numeric" class="fi mono" placeholder="500000" style="width:100%;text-align:right;" oninput="fmtNumberInput(this)"></div>'
    +'</div>'
    +'<div style="margin-bottom:12px;"><label style="font-size:12px;color:var(--tx2);font-weight:500;">Mục đích (hiển thị cho team)</label>'
    +'<input type="text" id="tf-purpose" class="fi" value="'+esc(defaultPurpose)+'" placeholder="VD: Liên hoan Q2/2026" style="width:100%;margin-top:4px;"></div>'
    +'<div style="margin-bottom:12px;"><label style="font-size:12px;color:var(--tx2);font-weight:500;">Ghi chú thêm (không bắt buộc)</label>'
    +'<input type="text" id="tf-note" class="fi" placeholder="VD: Bún đậu mắm tôm + bia" style="width:100%;margin-top:4px;"></div>'
    +'<div class="btn-row" style="margin-top:18px;"><button class="btn btn-ghost" onclick="closeTeamFundModal()">Hủy</button><button class="btn btn-primary" onclick="saveTeamFundWithdrawal(this)">Trích quỹ</button></div>'
    +'</div></div>';
  root.appendChild(modal);
  setTimeout(function(){pickTeamFundCategory('lien_hoan');var a=document.getElementById('tf-amount');if(a)a.focus();},20);
}
function closeTeamFundModal(){var m=document.getElementById('team-fund-modal');if(m)m.remove();}
function pickTeamFundCategory(key){
  var input=document.getElementById('tf-category');if(!input)return;
  input.value=key;
  var chips=document.querySelectorAll('#tf-cat-chips [data-cat]');
  chips.forEach(function(c){
    if(c.getAttribute('data-cat')===key){c.classList.remove('btn-ghost');c.classList.add('btn-primary');}
    else{c.classList.add('btn-ghost');c.classList.remove('btn-primary');}
  });
  var p=document.getElementById('tf-purpose');if(!p)return;
  var nowD=new Date(),qNow=Math.floor(nowD.getMonth()/3)+1,yNow=nowD.getFullYear();
  var labels={lien_hoan:'Liên hoan Q'+qNow+'/'+yNow,thuong:'Thưởng team Q'+qNow+'/'+yNow,team_building:'Team building Q'+qNow+'/'+yNow,qua:'Quà cho team',khac:''};
  var defaults=Object.keys(labels).map(function(k){return labels[k];});
  if(defaults.indexOf(p.value)>=0||p.value==='')p.value=labels[key]||'';
}
function fmtNumberInput(el){
  var raw=(el.value||'').replace(/\D/g,'');
  var num=parseInt(raw)||0;
  var caret=el.selectionStart||0;
  var digitsBefore=((el.value||'').slice(0,caret).match(/\d/g)||[]).length;
  var formatted=num?num.toLocaleString('vi-VN'):'';
  el.value=formatted;
  if(digitsBefore>0){
    var newCaret=0,seen=0;
    for(var i=0;i<formatted.length;i++){if(/\d/.test(formatted[i]))seen++;newCaret=i+1;if(seen>=digitsBefore)break;}
    try{el.setSelectionRange(newCaret,newCaret);}catch(e){}
  }
}
async function saveTeamFundWithdrawal(btn){
  if(!needAuth())return;
  if(!isAdmin()){toast('Chỉ admin mới trích quỹ được',false);return;}
  var d=document.getElementById('tf-date').value;
  var amtStr=document.getElementById('tf-amount').value.replace(/\D/g,'');
  var amt=parseInt(amtStr,10);
  var purpose=document.getElementById('tf-purpose').value.trim();
  var note=document.getElementById('tf-note').value.trim();
  var category=document.getElementById('tf-category').value||'khac';
  if(!d||!amt||amt<=0||!purpose){toast('Thiếu thông tin: Ngày / Số tiền / Mục đích',false);return;}
  var m=teamFundMetrics();
  if(amt>m.balance){
    var ok=await hcConfirm({title:'Vượt quỹ hiện có',message:'Số tiền trích ('+ff(amt)+'đ) lớn hơn quỹ hiện có ('+ff(m.balance)+'đ). Vẫn trích?',confirmLabel:'Vẫn trích',danger:true});
    if(!ok)return;
  }
  if(btn){btn.disabled=true;btn.textContent='Đang lưu...';}
  var r=await sb2.from('team_fund_withdrawal').insert({withdrawal_date:d,amount:amt,category:category,purpose:purpose,note:note||null,created_by:authUser?authUser.email:null});
  if(btn){btn.disabled=false;btn.textContent='Trích quỹ';}
  if(r.error){toast('Lỗi: '+r.error.message,false);return;}
  toast('Đã trích quỹ '+ff(amt)+'đ — '+purpose,true);
  closeTeamFundModal();
  await loadAll();render();
}
async function deleteTeamFundWithdrawal(id){
  if(!isAdmin()){toast('Chỉ admin mới xóa được',false);return;}
  var w=teamFundData.find(function(x){return x.id===id;});
  var label=w?(w.purpose+' · '+ff(w.amount)+'đ'):'lần trích này';
  if(!(await hcConfirm({title:'Xóa lần trích quỹ',message:'Xóa "'+label+'"? Quỹ sẽ được hoàn lại.',confirmLabel:'Xóa',danger:true})))return;
  var r=await sb2.from('team_fund_withdrawal').delete().eq('id',id);
  if(r.error){toast('Lỗi: '+r.error.message,false);return;}
  toast('Đã xóa',true);await loadAll();render();
}

// ═══ P2 TAB 2: CÔNG VIỆC — Lịch bài đăng theo nhân sự ═══
// Thay thế Google Sheet "TIMELINE CHECK LIST". Mỗi ngày 2 slot mặc định (11h30 + 20h).
var POST_CATEGORIES=[
  {key:'video',      label:'Video',      bg:'#7c2d12', tx:'#ffffff'},
  {key:'anh_ai',     label:'Ảnh AI',     bg:'#dbeafe', tx:'#1e40af'},
  {key:'anh_thuong', label:'Ảnh thường', bg:'#ede9fe', tx:'#6b21a8'},
  {key:'cap_nhat',   label:'Cập nhật',   bg:'#fef3c7', tx:'#92400e'},
  {key:'story',      label:'Story',      bg:'#fecaca', tx:'#991b1b'},
  {key:'ban_hang',   label:'Bán hàng',   bg:'#1e40af', tx:'#ffffff'}
];
var POST_STATUSES=[
  {key:'cho_duyet', label:'Chờ duyệt', bg:'#f3f4f6', tx:'#374151'},
  {key:'da_duyet',  label:'Đã duyệt',  bg:'#dbeafe', tx:'#1e40af'},
  {key:'da_post',   label:'Đã post',   bg:'#d1fae5', tx:'#065f46'}
];
var POST_DEFAULT_SLOTS=['11h30','20h'];
var postScheduleStaffId=null;
var postScheduleMonth=''; // YYYY-MM, init = lm() trong p2Task()
function setPostScheduleStaff(id){postScheduleStaffId=id;render();}
function setPostScheduleMonth(m){postScheduleMonth=m;render();}
function _postPadMonth(y,m){return y+'-'+String(m).padStart(2,'0');}
function _postPrevMonth(m){var p=m.split('-');var y=parseInt(p[0]),mo=parseInt(p[1])-1;if(mo<1){mo=12;y--;}return _postPadMonth(y,mo);}
function _postNextMonth(m){var p=m.split('-');var y=parseInt(p[0]),mo=parseInt(p[1])+1;if(mo>12){mo=1;y++;}return _postPadMonth(y,mo);}
function _postMonthLabel(m){var p=m.split('-');return 'T'+parseInt(p[1])+'/'+p[0];}
function _postWeekStartFromDate(date){var x=new Date(date);x.setHours(0,0,0,0);var day=x.getDay();var diff=(day===0?-6:1-day);x.setDate(x.getDate()+diff);return x;}
function _postWeeksInMonth(monthStr){
  var p=monthStr.split('-'),y=parseInt(p[0]),mo=parseInt(p[1]);
  var firstDay=new Date(y,mo-1,1);
  var lastDay=new Date(y,mo,0);
  var weeks=[];
  var ws=_postWeekStartFromDate(firstDay);
  while(ws<=lastDay){weeks.push(new Date(ws));var next=new Date(ws);next.setDate(next.getDate()+7);ws=next;}
  return weeks;
}
function _postKpiForMonth(staffId,monthStr){
  var p=monthStr.split('-'),y=parseInt(p[0]),mo=parseInt(p[1]);
  var lastDay=new Date(y,mo,0).getDate();
  var pass=0,fail=0,pending=0;
  for(var d=1;d<=lastDay;d++){
    var ds=_postPadMonth(y,mo)+'-'+String(d).padStart(2,'0');
    var k=_postKpiForDay(staffId,ds);
    if(k.status==='pass')pass++;else if(k.status==='fail')fail++;else pending++;
  }
  return {pass:pass,fail:fail,pending:pending,total:lastDay};
}
function _postCatMeta(k){for(var i=0;i<POST_CATEGORIES.length;i++)if(POST_CATEGORIES[i].key===k)return POST_CATEGORIES[i];return null;}
function _postStatusMeta(k){for(var i=0;i<POST_STATUSES.length;i++)if(POST_STATUSES[i].key===k)return POST_STATUSES[i];return POST_STATUSES[0];}
function _postFmtDate(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function _postDayLabel(d){return ['CN','Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7'][d.getDay()]+' '+String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0');}
function _isPostLate(p){
  if(!p||p.status==='da_post')return false;
  if(!p.post_date)return false;
  var now=new Date();
  var todayStr=_postFmtDate(now);
  if(p.post_date<todayStr)return true;
  if(p.post_date>todayStr)return false;
  var m=String(p.time_slot||'').match(/^(\d{1,2})h(\d{0,2})/);
  if(!m)return false;
  var slotMin=parseInt(m[1])*60+(parseInt(m[2])||0);
  var nowMin=now.getHours()*60+now.getMinutes();
  return nowMin>slotMin;
}
// KPI Khánh Linh: mỗi ngày phải có 1 video HOẶC 2 bài viết (status='da_post').
// Tính theo từng ngày, không cho dồn — thứ 2 đăng nhiều không bù được thứ 3 trống.
function _postKpiForDay(staffId,dateStr){
  var posts=postScheduleData.filter(function(p){return p.staff_id===staffId&&p.post_date===dateStr&&p.status==='da_post';});
  var videoCnt=posts.filter(function(p){return p.category==='video';}).length;
  var textCnt=posts.filter(function(p){return p.category&&p.category!=='video';}).length;
  var pass=videoCnt>=1||textCnt>=2;
  var todayStr=_postFmtDate(new Date());
  var status=pass?'pass':(dateStr<todayStr?'fail':'pending');
  return {pass:pass,status:status,videoCnt:videoCnt,textCnt:textCnt};
}
// Locked user (Khánh Linh) được phép edit posts của CHÍNH staff được gán; admin full quyền.
function canEditPostScheduleFor(staffId){
  if(isAdmin())return true;
  var locked=getRestrictedStaffId();
  return !!(locked&&locked===staffId);
}
function p2Task(){
  var lockedStaffId=getRestrictedStaffId();
  var canEdit=isAdmin()||!!lockedStaffId;
  if(lockedStaffId){
    postScheduleStaffId=lockedStaffId;
  }else if(!postScheduleStaffId){
    var kl=staffList.find(function(s){return /linh/i.test(s.full_name||'')||/linh/i.test(s.short_name||'');});
    postScheduleStaffId=kl?kl.id:(staffList[0]?staffList[0].id:null);
  }
  var staff=staffList.find(function(s){return s.id===postScheduleStaffId;});
  var h='<div class="page-title">Công việc</div><div class="page-sub">Lịch bài đăng theo nhân sự · 2 slot/ngày mặc định (11h30 + 20h)</div>';
  // Chip chọn nhân sự — ẩn nếu user bị khoá vào 1 staff
  if(!lockedStaffId){
    h+='<div class="form-card" style="padding:14px 18px;margin-bottom:14px;">';
    h+='<div style="font-size:12px;color:var(--tx2);font-weight:500;margin-bottom:8px;">Chọn nhân sự</div>';
    h+='<div style="display:flex;flex-wrap:wrap;gap:6px;">';
    staffList.forEach(function(s){
      var active=s.id===postScheduleStaffId;
      var cnt=postScheduleData.filter(function(p){return p.staff_id===s.id;}).length;
      h+='<button type="button" class="btn '+(active?'btn-primary':'btn-ghost')+' btn-sm" onclick="setPostScheduleStaff(\''+s.id+'\')" style="padding:6px 12px;font-size:12px;">'+esc(s.short_name||s.full_name)+(cnt?' <span style="opacity:.7;">('+cnt+')</span>':'')+'</button>';
    });
    h+='</div></div>';
  }
  if(!staff){h+='<div class="empty-state">'+(lockedStaffId?'Tài khoản này được gán với 1 nhân sự không tồn tại — liên hệ admin.':'Chưa có nhân sự nào.')+'</div>';return h;}
  // Month navigator — đồng bộ pattern với p2 Lương + p4 Tài chính (select tháng)
  if(!postScheduleMonth)postScheduleMonth=lm();
  var monthSet={};
  var nowD=new Date();
  for(var mi=-6;mi<=6;mi++){var md=new Date(nowD.getFullYear(),nowD.getMonth()+mi,1);monthSet[_postPadMonth(md.getFullYear(),md.getMonth()+1)]=1;}
  postScheduleData.filter(function(p){return p.staff_id===staff.id&&p.post_date;}).forEach(function(p){monthSet[p.post_date.substring(0,7)]=1;});
  monthSet[postScheduleMonth]=1;
  var monthArr=Object.keys(monthSet).sort();
  h+='<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px;">';
  h+='<div class="month-filter"><label style="font-size:13px;color:var(--tx2);">Tháng:</label><select onchange="setPostScheduleMonth(this.value)">';
  monthArr.forEach(function(m){h+='<option value="'+m+'"'+(m===postScheduleMonth?' selected':'')+'>'+_postMonthLabel(m)+'</option>';});
  h+='</select></div>';
  if(canEdit)h+='<button class="btn btn-primary btn-sm" onclick="openPostScheduleModal(null,\''+staff.id+'\')">+ Thêm bài đăng</button>';
  h+='</div>';
  // KPI card tháng
  var mKpi=_postKpiForMonth(staff.id,postScheduleMonth);
  var kpiPct=mKpi.total?Math.round(mKpi.pass/mKpi.total*100):0;
  var kpiColor=mKpi.pass===mKpi.total?'var(--green)':(mKpi.fail>0?'#dc2626':'var(--tx2)');
  h+='<div class="form-card" style="padding:14px 18px;margin-bottom:14px;">';
  h+='<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px;flex-wrap:wrap;">';
  h+='<div><div style="font-weight:600;font-size:14px;">KPI '+_postMonthLabel(postScheduleMonth)+'</div><div style="font-size:11px;color:var(--tx3);margin-top:2px;">Mỗi ngày cần: <b>1 video</b> HOẶC <b>2 bài viết</b> (chỉ tính bài đã đăng)</div></div>';
  h+='<div style="font-size:22px;font-weight:700;color:'+kpiColor+';">'+mKpi.pass+'/'+mKpi.total+' <span style="font-size:12px;font-weight:500;color:var(--tx3);">ngày đạt</span></div>';
  h+='</div>';
  h+='<div style="height:8px;background:var(--bg2);border-radius:4px;overflow:hidden;"><div style="height:100%;background:'+(mKpi.pass===mKpi.total?'var(--green)':'#3b82f6')+';width:'+kpiPct+'%;transition:width .3s;"></div></div>';
  h+='<div style="display:flex;gap:14px;font-size:11px;margin-top:8px;flex-wrap:wrap;">';
  h+='<span style="color:#059669;">✓ Đạt: <b>'+mKpi.pass+'</b></span>';
  h+='<span style="color:#dc2626;">✗ Thiếu: <b>'+mKpi.fail+'</b></span>';
  h+='<span style="color:var(--tx3);">— Chưa tới: <b>'+mKpi.pending+'</b></span>';
  h+='</div>';
  h+='</div>';
  // Loop các tuần trong tháng — section style đồng bộ với p2 Lương (section-title)
  var weeks=_postWeeksInMonth(postScheduleMonth);
  var monthFirstDay=postScheduleMonth+'-01';
  var monthP=postScheduleMonth.split('-');var monthLastDate=new Date(parseInt(monthP[0]),parseInt(monthP[1]),0).getDate();
  var monthLastDay=postScheduleMonth+'-'+String(monthLastDate).padStart(2,'0');
  var todayStr=_postFmtDate(new Date());
  weeks.forEach(function(weekStart,wi){
    var weekEnd=new Date(weekStart);weekEnd.setDate(weekEnd.getDate()+6);
    var wsLabel=String(weekStart.getDate()).padStart(2,'0')+'/'+String(weekStart.getMonth()+1).padStart(2,'0');
    var weLabel=String(weekEnd.getDate()).padStart(2,'0')+'/'+String(weekEnd.getMonth()+1).padStart(2,'0');
    var wkPass=0,wkFail=0,wkPending=0,wkTotal=0;
    for(var di=0;di<7;di++){
      var dx=new Date(weekStart);dx.setDate(dx.getDate()+di);
      var dxs=_postFmtDate(dx);
      if(dxs<monthFirstDay||dxs>monthLastDay)continue;
      var kk=_postKpiForDay(staff.id,dxs);wkTotal++;
      if(kk.status==='pass')wkPass++;else if(kk.status==='fail')wkFail++;else wkPending++;
    }
    h+='<div class="section-title" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:'+(wi===0?'8px':'18px')+';">';
    h+='<div>Tuần '+(wi+1)+' ('+wsLabel+' – '+weLabel+')</div>';
    if(wkTotal)h+='<div style="font-size:12px;color:var(--tx3);font-weight:400;">'+wkPass+'/'+wkTotal+' ngày đạt KPI</div>';
    h+='</div>';
    h+='<div class="table-wrap"><table>';
    h+='<thead><tr><th style="width:110px;">Ngày</th><th style="width:70px;">Giờ</th><th style="width:110px;">Thể loại</th><th>Tiêu đề</th><th style="width:80px;">Link</th><th style="width:110px;">Trạng thái</th>'+(canEdit?'<th style="width:70px;"></th>':'')+'</tr></thead><tbody>';
    for(var i=0;i<7;i++){
      var d=new Date(weekStart);d.setDate(d.getDate()+i);
      var dateStr=_postFmtDate(d);
      var inMonth=dateStr>=monthFirstDay&&dateStr<=monthLastDay;
      var dayLabel=_postDayLabel(d);
      var slotsForDay=postScheduleData.filter(function(p){return p.staff_id===staff.id&&p.post_date===dateStr;});
      var slotsMap={};slotsForDay.forEach(function(p){slotsMap[p.time_slot]=p;});
      var renderSlots=POST_DEFAULT_SLOTS.slice();
      slotsForDay.forEach(function(p){if(renderSlots.indexOf(p.time_slot)<0)renderSlots.push(p.time_slot);});
      var isToday=dateStr===todayStr;
      var dayKpi=inMonth?_postKpiForDay(staff.id,dateStr):null;
      var dayBadge='';
      if(dayKpi){
        if(dayKpi.status==='pass')dayBadge='<div style="display:inline-block;margin-top:4px;padding:1px 7px;background:#d1fae5;color:#065f46;border-radius:8px;font-size:10px;font-weight:600;" title="Đủ KPI ('+dayKpi.videoCnt+' video, '+dayKpi.textCnt+' bài)">✓ Đạt KPI</div>';
        else if(dayKpi.status==='fail')dayBadge='<div style="display:inline-block;margin-top:4px;padding:1px 7px;background:#fecaca;color:#991b1b;border-radius:8px;font-size:10px;font-weight:600;" title="Mới có '+dayKpi.videoCnt+' video, '+dayKpi.textCnt+' bài. Cần: 1 video HOẶC 2 bài.">✗ Thiếu KPI</div>';
      }
      renderSlots.forEach(function(slot,si){
        var p=slotsMap[slot];
        var late=_isPostLate(p);
        var rowBg=!inMonth?'background:rgba(0,0,0,0.02);opacity:.45;':(late?'background:rgba(239,68,68,0.06);':(isToday?'background:rgba(59,130,246,0.04);':''));
        h+='<tr style="'+rowBg+'">';
        if(si===0)h+='<td rowspan="'+renderSlots.length+'" style="vertical-align:middle;font-weight:500;">'+esc(dayLabel)+(dayBadge?'<br>'+dayBadge:'')+'</td>';
        h+='<td class="mono" style="color:var(--tx3);">'+esc(slot)+'</td>';
        if(p){
          var cat=_postCatMeta(p.category);
          h+='<td>'+(cat?'<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:500;background:'+cat.bg+';color:'+cat.tx+';">'+esc(cat.label)+'</span>':'<span style="color:var(--tx3);font-size:11px;">—</span>')+'</td>';
          h+='<td>'+esc(p.title||'')+(p.notes?'<div style="font-size:11px;color:var(--tx3);margin-top:2px;">'+esc(p.notes)+'</div>':'')+'</td>';
          h+='<td>'+(p.link?'<a href="'+esc(p.link)+'" target="_blank" rel="noopener" style="font-size:11px;">Mở ↗</a>':'<span style="color:var(--tx3);font-size:11px;">—</span>')+'</td>';
          var st=late?{key:'tre',label:'Trễ',bg:'#fecaca',tx:'#991b1b'}:_postStatusMeta(p.status);
          if(canEdit&&!late)h+='<td><button onclick="cyclePostStatus(\''+p.id+'\')" style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:500;background:'+st.bg+';color:'+st.tx+';border:0;cursor:pointer;" title="Click để đổi trạng thái">'+esc(st.label)+'</button></td>';
          else h+='<td><span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:500;background:'+st.bg+';color:'+st.tx+';">'+esc(st.label)+'</span></td>';
          if(canEdit)h+='<td style="text-align:right;white-space:nowrap;"><button onclick="openPostScheduleModal(\''+p.id+'\',\''+staff.id+'\')" style="font-size:13px;border:0;background:none;color:var(--tx3);cursor:pointer;padding:2px 4px;" title="Sửa">✏️</button><button onclick="deletePostSchedule(\''+p.id+'\')" style="font-size:14px;border:0;background:none;color:var(--tx3);cursor:pointer;padding:2px 4px;" title="Xóa">×</button></td>';
        }else{
          h+='<td colspan="4" style="color:var(--tx3);font-size:11px;font-style:italic;">— Trống —</td>';
          if(canEdit)h+='<td style="text-align:right;"><button onclick="openPostScheduleModal(null,\''+staff.id+'\',\''+dateStr+'\',\''+slot+'\')" class="btn btn-ghost btn-sm" style="font-size:11px;padding:3px 8px;">+ Thêm</button></td>';
        }
        h+='</tr>';
      });
    }
    h+='</tbody></table></div>';
  });
  return h;
}
function openPostScheduleModal(id,staffId,defaultDate,defaultSlot){
  if(!needAuth())return;
  if(!canEditPostScheduleFor(staffId)){toast('Bạn chỉ sửa được lịch của chính mình',false);return;}
  var existing=id?postScheduleData.find(function(x){return x.id===id;}):null;
  var staff=staffList.find(function(s){return s.id===staffId;});
  if(!staff){toast('Không tìm thấy nhân sự',false);return;}
  var root=document.getElementById('hc-modal-root')||(function(){var d=document.createElement('div');d.id='hc-modal-root';document.body.appendChild(d);return d;})();
  var ex=document.getElementById('post-schedule-modal');if(ex)ex.remove();
  var todayStr=_postFmtDate(new Date());
  var dt=existing?existing.post_date:(defaultDate||todayStr);
  var slot=existing?existing.time_slot:(defaultSlot||'11h30');
  var cat=existing?(existing.category||''):'';
  var title=existing?(existing.title||''):'';
  var link=existing?(existing.link||''):'';
  var notes=existing?(existing.notes||''):'';
  var status=existing?(existing.status||'cho_duyet'):'cho_duyet';
  var catChips=POST_CATEGORIES.map(function(c){
    var active=c.key===cat;
    return '<button type="button" data-cat="'+c.key+'" onclick="pickPostCat(\''+c.key+'\')" style="padding:5px 12px;border-radius:14px;border:1.5px solid '+(active?c.bg:'var(--bd1)')+';background:'+(active?c.bg:'transparent')+';color:'+(active?c.tx:'var(--tx2)')+';font-size:12px;cursor:pointer;font-weight:'+(active?'600':'400')+';">'+esc(c.label)+'</button>';
  }).join('');
  var statusChips=POST_STATUSES.map(function(s){
    var active=s.key===status;
    return '<button type="button" data-st="'+s.key+'" onclick="pickPostStatus(\''+s.key+'\')" style="padding:5px 12px;border-radius:14px;border:1.5px solid var(--bd1);background:'+(active?s.bg:'transparent')+';color:'+(active?s.tx:'var(--tx2)')+';font-size:12px;cursor:pointer;font-weight:'+(active?'600':'400')+';">'+esc(s.label)+'</button>';
  }).join('');
  var slotChips=POST_DEFAULT_SLOTS.map(function(s){
    return '<button type="button" onclick="document.getElementById(\'ps-slot\').value=\''+s+'\'" class="btn btn-ghost btn-sm" style="padding:4px 10px;font-size:11px;">'+s+'</button>';
  }).join('');
  var modal=document.createElement('div');modal.id='post-schedule-modal';modal.className='hc-modal-backdrop';
  modal.setAttribute('onclick','if(event.target===this)closePostScheduleModal()');
  modal.innerHTML=
    '<div class="hc-modal" role="dialog" aria-modal="true" style="max-width:520px;">'
    +'<div class="hc-modal-head"><h3>'+(existing?'Sửa':'Thêm')+' bài đăng — '+esc(staff.short_name||staff.full_name)+'</h3><button class="hc-modal-close" onclick="closePostScheduleModal()" aria-label="Đóng">×</button></div>'
    +'<div class="hc-modal-body">'
    +'<input type="hidden" id="ps-id" value="'+(id||'')+'">'
    +'<input type="hidden" id="ps-staff-id" value="'+staff.id+'">'
    +'<input type="hidden" id="ps-category" value="'+esc(cat)+'">'
    +'<input type="hidden" id="ps-status" value="'+status+'">'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">'
    +'<div><label style="font-size:12px;color:var(--tx2);font-weight:500;">Ngày đăng</label><input type="date" id="ps-date" class="fi" value="'+dt+'" style="width:100%;margin-top:4px;"></div>'
    +'<div><label style="font-size:12px;color:var(--tx2);font-weight:500;">Giờ đăng</label><input type="text" id="ps-slot" class="fi" value="'+esc(slot)+'" placeholder="11h30" style="width:100%;margin-top:4px;"><div style="display:flex;gap:4px;margin-top:4px;">'+slotChips+'</div></div>'
    +'</div>'
    +'<div style="margin-bottom:12px;"><label style="font-size:12px;color:var(--tx2);font-weight:500;">Thể loại</label>'
    +'<div id="ps-cat-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">'+catChips+'</div></div>'
    +'<div style="margin-bottom:12px;"><label style="font-size:12px;color:var(--tx2);font-weight:500;">Tiêu đề bài đăng</label>'
    +'<input type="text" id="ps-title" class="fi" value="'+esc(title)+'" placeholder="VD: Cách viết content bán hàng khiến khách tự inbox" style="width:100%;margin-top:4px;"></div>'
    +'<div style="margin-bottom:12px;"><label style="font-size:12px;color:var(--tx2);font-weight:500;">Link content (nếu có)</label>'
    +'<input type="text" id="ps-link" class="fi" value="'+esc(link)+'" placeholder="https://..." style="width:100%;margin-top:4px;"></div>'
    +'<div style="margin-bottom:12px;"><label style="font-size:12px;color:var(--tx2);font-weight:500;">Ghi chú</label>'
    +'<input type="text" id="ps-notes" class="fi" value="'+esc(notes)+'" placeholder="Tuỳ chọn" style="width:100%;margin-top:4px;"></div>'
    +'<div style="margin-bottom:12px;"><label style="font-size:12px;color:var(--tx2);font-weight:500;">Trạng thái</label>'
    +'<div id="ps-status-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">'+statusChips+'</div></div>'
    +'<div class="btn-row" style="margin-top:18px;"><button class="btn btn-ghost" onclick="closePostScheduleModal()">Hủy</button><button class="btn btn-primary" onclick="savePostSchedule(this)">'+(existing?'Lưu':'Thêm')+'</button></div>'
    +'</div></div>';
  root.appendChild(modal);
  setTimeout(function(){var t=document.getElementById('ps-title');if(t)t.focus();},20);
}
function closePostScheduleModal(){var m=document.getElementById('post-schedule-modal');if(m)m.remove();}
function pickPostCat(key){
  var el=document.getElementById('ps-category');if(!el)return;el.value=key;
  document.querySelectorAll('#ps-cat-chips [data-cat]').forEach(function(c){
    var k=c.getAttribute('data-cat'),meta=_postCatMeta(k);if(!meta)return;
    if(k===key){c.style.background=meta.bg;c.style.color=meta.tx;c.style.borderColor=meta.bg;c.style.fontWeight='600';}
    else{c.style.background='transparent';c.style.color='var(--tx2)';c.style.borderColor='var(--bd1)';c.style.fontWeight='400';}
  });
}
function pickPostStatus(key){
  var el=document.getElementById('ps-status');if(!el)return;el.value=key;
  document.querySelectorAll('#ps-status-chips [data-st]').forEach(function(c){
    var k=c.getAttribute('data-st'),meta=_postStatusMeta(k);
    if(k===key){c.style.background=meta.bg;c.style.color=meta.tx;c.style.fontWeight='600';}
    else{c.style.background='transparent';c.style.color='var(--tx2)';c.style.fontWeight='400';}
  });
}
async function savePostSchedule(btn){
  if(!needAuth())return;
  var id=document.getElementById('ps-id').value;
  var staffId=document.getElementById('ps-staff-id').value;
  var d=document.getElementById('ps-date').value;
  var slot=document.getElementById('ps-slot').value.trim();
  var cat=document.getElementById('ps-category').value||null;
  var title=document.getElementById('ps-title').value.trim();
  var link=document.getElementById('ps-link').value.trim();
  var notes=document.getElementById('ps-notes').value.trim();
  var status=document.getElementById('ps-status').value||'cho_duyet';
  if(!staffId||!d||!slot){toast('Thiếu: Nhân sự / Ngày / Giờ',false);return;}
  if(btn){btn.disabled=true;btn.textContent='Đang lưu...';}
  var payload={staff_id:staffId,post_date:d,time_slot:slot,category:cat,title:title||null,link:link||null,notes:notes||null,status:status};
  var r;
  if(id){r=await sb2.from('staff_post_schedule').update(payload).eq('id',id);}
  else{payload.created_by=authUser?authUser.email:null;r=await sb2.from('staff_post_schedule').insert(payload);}
  if(btn){btn.disabled=false;btn.textContent=id?'Lưu':'Thêm';}
  if(r.error){toast('Lỗi: '+r.error.message,false);return;}
  toast(id?'Đã lưu':'Đã thêm bài đăng',true);
  closePostScheduleModal();
  await loadDeferred();render();
}
async function deletePostSchedule(id){
  var rec=postScheduleData.find(function(x){return x.id===id;});
  if(!rec||!canEditPostScheduleFor(rec.staff_id)){toast('Bạn chỉ xóa được lịch của chính mình',false);return;}
  if(!(await hcConfirm({title:'Xóa bài đăng',message:'Xóa lịch bài đăng này?',confirmLabel:'Xóa',danger:true})))return;
  var r=await sb2.from('staff_post_schedule').delete().eq('id',id);
  if(r.error){toast('Lỗi: '+r.error.message,false);return;}
  toast('Đã xóa',true);await loadDeferred();render();
}
async function cyclePostStatus(id){
  var p=postScheduleData.find(function(x){return x.id===id;});if(!p)return;
  if(!canEditPostScheduleFor(p.staff_id)){toast('Bạn chỉ đổi trạng thái lịch của chính mình',false);return;}
  var order=['cho_duyet','da_duyet','da_post'];
  var idx=order.indexOf(p.status||'cho_duyet');
  var next=order[(idx+1)%order.length];
  var r=await sb2.from('staff_post_schedule').update({status:next}).eq('id',id);
  if(r.error){toast('Lỗi: '+r.error.message,false);return;}
  p.status=next;render();
}

// ═══ P3: KHÁCH HÀNG ═══
function p3(){
// Tab bar — Active / Prospect / Quotation
var activeCount=clientList.filter(function(c){return c.status!=='prospect';}).length;
var prospectCount=clientList.filter(function(c){return c.status==='prospect';}).length;
var quoteCount=quotationList.length;
// Tab điều khiển từ subnav — không render inline tab-bar nữa
var tabH='<div role="tabpanel" id="cpanel-'+clientTab+'">';
if(clientTab==='prospect')return p3Prospect(tabH);
if(clientTab==='quotation')return p3Quotation(tabH);
var ms=clientMonth||lm();
var allMonths=new Set();dates.forEach(function(d){allMonths.add(d.substring(0,7));});
var monthList=Array.from(allMonths).sort().reverse();
var nd=dates.filter(function(d){return d.substring(0,7)===ms;}).length||1;
var mLabel='T'+parseInt(ms.split('-')[1]);var yLabel=ms.split('-')[0];
// EXCLUDE prospects from active list
var activeClients=clientList.filter(function(c){return c.status!=='prospect';});
var cs={};activeClients.forEach(function(c){cs[c.id]={c:c,spend:0};});
dailyData.filter(function(d){return d.report_date.substring(0,7)===ms;}).forEach(function(d){
var cid=d.matched_client_id||null;
if(!cid){var aa=adList.find(function(a){return a.id===d.ad_account_id;});if(aa){var asg=getAssign(d.ad_account_id,d.report_date);cid=asg.length?asg[0].client_id:aa.client_id;}}
if(cid&&cs[cid])cs[cid].spend+=d.spend_amount;});
var allRows=activeClients.map(function(c){return{c:c,spend:cs[c.id]?cs[c.id].spend:0};});
var rows=allRows.filter(function(row){return clientFilterMatch(row,ms);});
sortClientRows(rows,ms);
var maxSpend=Math.max.apply(null,rows.map(function(r){return r.spend;}))||1;
var totalSpend=rows.reduce(function(t,r){return t+r.spend;},0);
var totalFee=rows.reduce(function(t,r){return t+getEffectiveServiceFee(r.c.id,ms,r.c.service_fee)+getRentalFeeAmount(r.c,ms,r.spend);},0);
// Rental KPI — tóm tắt khách thuê TKQC
if(expandedClientId&&!rows.some(function(r){return r.c.id===expandedClientId;}))expandedClientId=null;
var h='<div class="pr-header"><div><div class="page-title">Khách hàng</div><div class="page-sub">Tổng '+activeClients.length+' chính thức · '+prospectCount+' tiềm năng</div></div><button class="btn btn-primary pr-add-btn" onclick="openNewActiveClientModal()">+ Thêm khách</button></div>';
h+=tabH;
// Sub-tab bar (Tổng quan / Báo cáo Ads) — chỉ hiện trong Khách chính thức
var canKhOverview=canAccessKey('p3.overview'),canKhReport=canAccessKey('p3.report');
if(clientActiveSubTab==='overview'&&!canKhOverview&&canKhReport)clientActiveSubTab='report';
if(clientActiveSubTab==='report'&&!canKhReport&&canKhOverview)clientActiveSubTab='overview';
h+='<div class="client-tab-bar" role="tablist" aria-label="Phân loại nội dung khách chính thức" style="margin-bottom:14px;">';
if(canKhOverview)h+='<button role="tab" aria-selected="'+(clientActiveSubTab==='overview')+'" class="'+(clientActiveSubTab==='overview'?'active':'')+'" onclick="setClientActiveSubTab(\'overview\')">Tổng quan</button>';
if(canKhReport)h+='<button role="tab" aria-selected="'+(clientActiveSubTab==='report')+'" class="'+(clientActiveSubTab==='report'?'active':'')+'" onclick="setClientActiveSubTab(\'report\')">Báo cáo Ads</button>';
h+='</div>';
// Nếu sub-tab='report' → render bảng báo cáo daily, return early
if(clientActiveSubTab==='report'){
  return h+p3ActiveReportContent();
}
h+='<div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;"><span style="font-size:12px;color:var(--tx3);">Tháng:</span><select class="fi" style="width:140px;" onchange="clientMonth=this.value;expandedClientId=null;render();">';
monthList.forEach(function(m){h+='<option value="'+m+'"'+(m===ms?' selected':'')+'>T'+parseInt(m.split('-')[1])+'/'+m.split('-')[0]+'</option>';});
h+='</select><span style="font-size:12px;color:var(--tx3);margin-left:8px;">'+nd+' ngày dữ liệu</span></div>';
h+='<div class="ad-toolbar">';
h+='<div class="ad-toolbar-main">';
h+='<input type="text" id="client-search" placeholder="Tìm khách hàng, liên hệ..." value="'+esc(clientSearchText)+'" oninput="expandedClientId=null;hcSearchInput(\'clientSearchText\',this.value)" class="fi ad-toolbar-search">';
h+='<select class="fi ad-toolbar-filter" onchange="clientFilterPayment=this.value;expandedClientId=null;render();"><option value="">Tất cả thanh toán</option><option value="unpaid"'+(clientFilterPayment==='unpaid'?' selected':'')+'>Chưa thanh toán</option><option value="invoice_sent"'+(clientFilterPayment==='invoice_sent'?' selected':'')+'>Đã gửi phiếu</option><option value="paid"'+(clientFilterPayment==='paid'?' selected':'')+'>Đã thanh toán</option></select>';
h+='<select class="fi ad-toolbar-filter" onchange="clientFilterVat=this.value;expandedClientId=null;render();"><option value="">Tất cả VAT</option><option value="vat"'+(clientFilterVat==='vat'?' selected':'')+'>Có VAT</option><option value="no_vat"'+(clientFilterVat==='no_vat'?' selected':'')+'>Không VAT</option></select>';
h+='<select class="fi ad-toolbar-filter" onchange="clientFilterStatus=this.value;expandedClientId=null;render();"><option value="">Tất cả trạng thái</option><option value="active"'+(clientFilterStatus==='active'?' selected':'')+'>Đang hoạt động</option><option value="paused"'+(clientFilterStatus==='paused'?' selected':'')+'>Tạm dừng</option><option value="stopped"'+(clientFilterStatus==='stopped'?' selected':'')+'>Dừng</option></select>';
h+='<select class="fi ad-toolbar-filter" onchange="clientFilterSpend=this.value;expandedClientId=null;render();"><option value="">Tất cả chi tiêu</option><option value="has_spend"'+(clientFilterSpend==='has_spend'?' selected':'')+'>Có chi tiêu</option><option value="no_spend"'+(clientFilterSpend==='no_spend'?' selected':'')+'>Chưa có chi tiêu</option></select>';
h+='<select class="fi ad-toolbar-filter" onchange="clientFilterService=this.value;expandedClientId=null;render();"><option value="">Tất cả dịch vụ</option>';Object.keys(SERVICES).forEach(function(code){h+='<option value="'+code+'"'+(clientFilterService===code?' selected':'')+'>'+SERVICES[code].name+'</option>';});h+='</select>';
h+='</div>';
h+='<div class="ad-toolbar-actions"><select class="fi ad-toolbar-sort" onchange="clientSortMode=this.value;render();"><option value="spend_desc"'+(clientSortMode==='spend_desc'?' selected':'')+'>Chi tiêu cao nhất</option><option value="fee_desc"'+(clientSortMode==='fee_desc'?' selected':'')+'>Phí Dịch vụ cao nhất</option><option value="name_asc"'+(clientSortMode==='name_asc'?' selected':'')+'>Tên A-Z</option><option value="unpaid_first"'+(clientSortMode==='unpaid_first'?' selected':'')+'>Cần thu trước</option></select><button class="btn btn-ghost btn-sm" onclick="clearClientFilters()">Xóa bộ lọc</button></div></div>';
var clientChips=[];
if(clientSearchText)clientChips.push('Tìm: '+esc(clientSearchText));
if(clientFilterPayment)clientChips.push(clientFilterLabel('payment',clientFilterPayment));
if(clientFilterVat)clientChips.push(clientFilterLabel('vat',clientFilterVat));
if(clientFilterStatus)clientChips.push(clientFilterLabel('status',clientFilterStatus));
if(clientFilterSpend)clientChips.push(clientFilterLabel('spend',clientFilterSpend));
if(clientFilterService)clientChips.push('Dịch vụ: '+clientFilterLabel('service',clientFilterService));
if(clientSortMode&&clientSortMode!=='spend_desc')clientChips.push(clientFilterLabel('sort',clientSortMode));
h+='<div class="active-chips">'+clientChips.map(function(c){return'<span class="chip">'+c+' <span class="x" onclick="clearClientFilters()">×</span></span>';}).join('')+'</div>';
h+='<div class="table-wrap"><table><thead><tr><th style="width:30px;">#</th><th>Khách hàng</th><th>Dịch vụ</th><th>Liên hệ</th><th style="white-space:nowrap;">Thanh toán</th><th style="text-align:right;white-space:nowrap;">Chi tiêu '+mLabel+'</th><th style="text-align:right;white-space:nowrap;">Phí dịch vụ</th><th style="white-space:nowrap;">Trạng thái</th><th style="text-align:center;white-space:nowrap;">Phiếu thanh toán</th></tr></thead><tbody>';
rows.forEach(function(row,i){
var c=row.c,sp=row.spend;
// Khách rental: tính lại spend chỉ từ start_date onwards (đồng bộ với Sổ rental)
if(hasRentalService(c)&&getRentalFeePct(c)>0&&c.start_date){
  sp=getMonthSpendForClient(c.id,ms,{respectStartDate:true});
}
var invoice=getInvoiceTotals(c,ms,undefined,sp);
var sb3=c.status==='active'?'b-green':(c.status==='paused'?'b-amber':'b-red');
var st2=c.status==='active'?'Đang hoạt động':(c.status==='paused'?'Tạm dừng':'Dừng');
var pct=maxSpend>0?Math.round(sp/maxSpend*100):0;
var isExp=expandedClientId===c.id;
var rentalPctLabel=invoice.rentalPct?(Math.round(invoice.rentalPct*1000)/10)+'%':'';
var feeCellHtml;
if(hasRentalService(c)){
  var feeNum=invoice.fee?fm(invoice.fee):'—';
  var chipText=rentalPctLabel?(rentalPctLabel+' thuê'):'cần %';
  var chipTitle=rentalPctLabel?('Phí thuê TKQC = '+rentalPctLabel+' × spend = '+fm(invoice.rentalFee)):'Đã chọn dịch vụ Cho thuê TKQC nhưng chưa cấu hình % phí — bấm bút chì sửa';
  feeCellHtml='<div style="display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap;"><span>'+feeNum+'</span><span class="kh-rental-chip" title="'+chipTitle+'">'+chipText+'</span></div>';
}else{
  feeCellHtml=invoice.fee?fm(invoice.fee):'—';
}
h+='<tr style="'+(isExp?'background:var(--blue-bg);':'')+'">';
h+='<td><span class="kh-num">'+(i+1)+'</span></td>';
h+='<td><div class="kh-name-cell"><span class="kh-name-text">'+esc(c.name)+'</span>'+(getClientVatFlag(c)?'<span class="vat-badge b-blue" onclick="event.stopPropagation();toggleClientVat(\''+c.id+'\',false)" title="Bấm để chuyển sang Không VAT">VAT 8%</span>':'<span class="vat-badge b-gray" onclick="event.stopPropagation();toggleClientVat(\''+c.id+'\',true)" title="Bấm để chuyển sang Có VAT">Không VAT</span>')+'<button class="kh-edit-btn" onclick="event.stopPropagation();openClientEditModal(\''+c.id+'\')" title="Sửa dịch vụ / Zalo / CSKH" aria-label="Sửa khách hàng"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg></button></div></td>';
h+='<td>'+renderServicesBadges(c.services,{compact:true})+'</td>';
h+='<td style="font-size:12px;color:var(--tx2);"><div class="kh-contact"><span>'+esc(c.contact_person||'—')+'</span>'+renderZaloBtn(c)+'</div></td>';
h+='<td>'+paymentBadgeHtml(getClientPaymentStatus(c))+'</td>';
h+='<td style="text-align:right;">'+(sp?'<div style="font-weight:500;font-variant-numeric:tabular-nums;color:var(--teal);">'+fm(sp)+'</div><div class="bar-track" style="width:80px;margin-left:auto;margin-top:3px;"><div class="bar-fill" style="width:'+pct+'%;background:var(--teal);"></div></div>':'<span style="color:var(--tx3);">—</span>')+'</td>';
h+='<td class="mono" style="text-align:right;">'+feeCellHtml+'</td>';
h+='<td><span class="badge '+sb3+'">'+st2+'</span></td>';
h+='<td style="text-align:center;">'+(sp||invoice.fee>0?'<button class="kh-open-btn'+(isExp?' is-active':'')+'" onclick="toggleClientInv(\''+c.id+'\')">'+(isExp?'Thu gọn':'Mở phiếu')+'</button>':'<span style="color:var(--tx3);font-size:12px;">—</span>')+'</td></tr>';
if(isExp){
var dim=new Date(parseInt(ms.split('-')[0]),parseInt(ms.split('-')[1]),0).getDate();
var tkSpend={};
adList.forEach(function(a){if(a.client_id===c.id)tkSpend[a.id]={name:a.account_name,spend:0};});
assignData.forEach(function(ag){if(ag.client_id===c.id&&!tkSpend[ag.ad_account_id]){var acc=adList.find(function(x){return x.id===ag.ad_account_id;});if(acc)tkSpend[acc.id]={name:acc.account_name,spend:0};}});
dailyData.filter(function(d){return d.report_date.substring(0,7)===ms;}).forEach(function(d){
var cid2=d.matched_client_id||null;
if(!cid2){var aa2=adList.find(function(a){return a.id===d.ad_account_id;});if(aa2){var asg2=getAssign(d.ad_account_id,d.report_date);cid2=asg2.length?asg2[0].client_id:aa2.client_id;}}
if(cid2===c.id&&tkSpend[d.ad_account_id])tkSpend[d.ad_account_id].spend+=d.spend_amount;});
var tkArr=Object.values(tkSpend).filter(function(t){return t.spend>0;}).sort(function(a,b){return b.spend-a.spend;});
var domId=invoiceDomId(c.id),qrUrl=getVietQrImageUrl(c,ms,invoice.flatFee,sp);
var copyTextLines=[c.name+' - '+mLabel+'/'+yLabel,'---','Tổng chi tiêu Quảng cáo: '+ff(sp)];
if(invoice.rentalFee>0)copyTextLines.push('Phí dịch vụ: '+ff(invoice.flatFee),'Phí thuê TKQC ('+rentalPctLabel+' × spend): '+ff(invoice.rentalFee));
else copyTextLines.push('Phí dịch vụ: '+ff(invoice.fee));
if(invoice.hasVat)copyTextLines.push('VAT 8%: '+ff(invoice.vat));
copyTextLines.push('Tổng thanh toán: '+ff(invoice.total),'---','Chuyển khoản:',invoice.bank.bank+' - '+invoice.bank.accountNoDisplay,invoice.bank.accountName,getInvoiceContentLabel(invoice.hasVat)+' '+invoice.content);
var inputAttrs=authUser?'':' disabled title="Đăng nhập admin để sửa phí dịch vụ theo tháng"';
var sdAttrs=authUser?'':' disabled title="Đăng nhập admin để sửa ngày bắt đầu"';
var startDateVal=c.start_date||'';
var earliestForRate=getClientEarliestStart(c.id);
var daysMng=earliestForRate?Math.floor((getEndOfMonth(ms)-new Date(earliestForRate))/86400000)+1:0;
var rateForRow=COMMISSION_RATE(daysMng);
var ctrCount=contractList.filter(function(x){return x.client_id===c.id;}).length;
h+='<tr><td colspan="9" style="padding:6px 10px;">';
h+='<div style="padding:8px 12px;margin-bottom:10px;background:var(--bg2);border-radius:var(--radius);display:flex;align-items:center;gap:12px;flex-wrap:wrap;border:1px solid var(--bd2);">';
h+='<span style="font-size:12px;color:var(--tx3);font-weight:500;">Ngày bắt đầu quản lý:</span>';
h+='<input type="date" class="fi" style="width:160px;padding:4px 8px;font-size:12px;" value="'+startDateVal+'" onchange="onClientStartDateChange(\''+c.id+'\',this.value)"'+sdAttrs+'>';
h+='<span style="font-size:11px;color:var(--tx3);">Quản lý <strong style="color:var(--tx1);">'+daysMng+'</strong> ngày → hoa hồng <strong style="color:'+(rateForRow>=0.02?'var(--green)':'var(--amber)')+';">'+(rateForRow*100)+'%</strong></span>';
h+='<span id="client-sd-status-'+c.id+'" style="font-size:11px;color:var(--green);margin-left:auto;"></span>';
h+='<button class="btn btn-sm" onclick="openContractModal(\''+c.id+'\')" style="background:var(--blue);color:#fff;border:none;">📄 Xuất hợp đồng</button>';
if(ctrCount>0)h+='<button class="btn btn-sm" onclick="openContractHistory(\''+c.id+'\')" title="Xem lịch sử Hợp đồng">📜 Lịch sử Hợp đồng ('+ctrCount+')</button>';
h+='</div>';
// Sổ rental cho khách thuê TKQC — hiển thị TRƯỚC phiếu thanh toán
if(hasRentalService(c)&&getRentalFeePct(c)>0){
  h+=renderRentalLedger(c,ms,sp,invoice);
}
h+='<div id="client-invoice-'+domId+'" class="invoice-card" data-client-id="'+esc(c.id)+'" data-month="'+ms+'" data-spend="'+sp+'" data-has-vat="'+(invoice.hasVat?'1':'0')+'">';
var psNow=getClientPaymentStatus(c);
h+='<div class="invoice-head"><div><div class="invoice-title">Phiếu thanh toán — '+esc(c.name)+'</div><div class="invoice-meta"><span>Kỳ: 01/'+parseInt(ms.split('-')[1])+' — '+dim+'/'+parseInt(ms.split('-')[1])+'/'+yLabel+'</span>'+(invoice.hasVat?'<span class="vat-badge b-blue">Có VAT</span>':'')+'</div></div><div><span class="invoice-status-badge '+paymentBadgeClass(psNow)+'">'+paymentLabel(psNow)+'</span></div></div>';
h+='<div class="invoice-body">';
h+='<div class="invoice-label">Chi tiết tài khoản Quảng cáo</div>';
tkArr.forEach(function(tk){h+='<div class="invoice-account-row"><span class="invoice-account-name">'+esc(tk.name)+'</span><span class="invoice-account-value">'+ff(tk.spend)+'</span></div>';});
if(!tkArr.length)h+='<div style="font-size:12px;color:var(--tx3);padding:10px 0 2px;">Không có dữ liệu chi tiêu</div>';
h+='<div class="invoice-sum-row" style="margin-top:14px;"><span class="invoice-sum-label">Tổng chi tiêu Quảng cáo</span><span class="invoice-account-value">'+ff(sp)+'</span></div>';
h+='<div class="invoice-fee-row"><span class="invoice-sum-label">Phí dịch vụ '+(invoice.rentalFee>0?'<span style="font-size:11px;color:var(--tx3);font-weight:400;">(cố định)</span>':'')+'</span><div class="invoice-fee-box"><span id="client-fee-display-'+domId+'" class="invoice-fee-display" onclick="startEditFee(\''+domId+'\',\''+c.id+'\',\''+ms+'\')" title="'+(authUser?'Bấm để sửa':'Đăng nhập admin để sửa')+'">'+ff(invoice.flatFee)+'</span><input id="client-fee-'+domId+'" type="number" min="0" class="inline-fee-input" style="display:none;" value="'+invoice.flatFee+'" oninput="previewClientInvoice(\''+c.id+'\',\''+ms+'\',this.value)" onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur();}" onblur="endEditFee(\''+domId+'\',\''+c.id+'\',\''+ms+'\',this.value)"'+inputAttrs+'><span class="invoice-fee-currency">đ</span></div></div>';
if(hasRentalService(c)){
  if(invoice.rentalFee>0){
    h+='<div class="invoice-rental-row"><div><div class="invoice-sum-label">Phí thuê TKQC</div><div class="invoice-rental-formula">'+rentalPctLabel+' × '+fm(sp)+' (chi tiêu '+mLabel+')</div></div><span id="invoice-rental-'+domId+'" class="invoice-rental-value">'+ff(invoice.rentalFee)+'</span></div>';
  }else{
    h+='<div class="invoice-rental-row" style="opacity:.7;"><div><div class="invoice-sum-label">Phí thuê TKQC</div><div class="invoice-rental-formula" style="color:var(--amber-tx);">'+(invoice.rentalPct?'Chưa có chi tiêu trong tháng':'Chưa cấu hình % phí thuê — bấm bút chì để sửa')+'</div></div><span class="invoice-rental-value" style="background:var(--bg2);color:var(--tx3);">—</span></div>';
  }
}
h+='<div id="invoice-vat-row-'+domId+'" class="invoice-note" style="display:'+(invoice.hasVat?'block':'none')+';">VAT (8%): <span id="invoice-vat-'+domId+'" style="font-weight:700;font-style:normal;color:var(--tx1);">'+ff(invoice.vat)+'</span></div>';
h+='<div id="invoice-novat-row-'+domId+'" class="invoice-note" style="display:none;"></div>';
h+='<div class="invoice-total"><span class="invoice-total-label">Tổng thanh toán</span><span id="invoice-total-'+domId+'" class="invoice-total-value">'+ff(invoice.total)+'</span></div>';
h+='</div>';
h+='<div class="invoice-paybox"><div class="invoice-qr-wrap"><img id="invoice-qr-'+domId+'" src="'+qrUrl+'" alt="QR thanh toán '+esc(c.name)+'" onerror="this.style.display=\'none\';var fb=document.getElementById(\'invoice-qr-fallback-'+domId+'\');if(fb)fb.style.display=\'block\';"><div id="invoice-qr-fallback-'+domId+'" class="invoice-qr-fallback">Không tải được QR.<br>Vẫn có thể sao chép thông tin tài khoản.</div></div><div style="min-width:220px;flex:1 1 260px;"><div id="invoice-bank-title-'+domId+'" class="invoice-bank-title">'+getInvoiceBankTitle(invoice.hasVat,invoice.bank.bank)+'</div><div class="invoice-bank-lines">STK: <span id="invoice-account-no-'+domId+'">'+invoice.bank.accountNoDisplay+'</span><br><strong id="invoice-account-name-'+domId+'">'+esc(invoice.bank.accountName)+'</strong><br><span id="invoice-content-label-'+domId+'">'+getInvoiceContentLabel(invoice.hasVat)+'</span> <span id="invoice-content-'+domId+'">'+esc(invoice.content)+'</span></div></div></div>';
h+='<div class="invoice-actions">';
h+='<button id="invoice-copy-'+domId+'" class="invoice-btn" type="button" onclick="copyClientInvoice('+safeJsAttrString(c.id)+','+safeJsAttrString(ms)+','+sp+')">Sao chép</button>';
h+='<button class="invoice-btn" type="button" onclick="downloadClientInvoice('+safeJsAttrString(c.id)+','+safeJsAttrString(ms)+','+sp+',this)">Tải ảnh</button>';
if(authUser){
if(psNow==='paid'){
h+='<button class="invoice-btn" type="button" style="border-color:var(--red);color:var(--red);background:#fff;" onmouseenter="this.style.background=\'var(--red-bg)\'" onmouseleave="this.style.background=\'#fff\'" onclick="undoClientPayment('+safeJsAttrString(c.id)+','+safeJsAttrString(ms)+',this)">↩ Hủy thanh toán</button>';
}else if(psNow==='invoice_sent'){
h+='<button class="invoice-btn" type="button" style="background:linear-gradient(180deg,#10b981 0%,#059669 100%);color:#fff;border:none;box-shadow:0 2px 8px rgba(5,150,105,.3);min-width:160px;" onclick="confirmClientPayment('+safeJsAttrString(c.id)+','+safeJsAttrString(ms)+',this)">✓ Xác nhận thanh toán</button>';
h+='<button class="invoice-btn" type="button" style="border-color:var(--bd2);color:var(--tx2);background:#fff;" onclick="markInvoiceUnsent('+safeJsAttrString(c.id)+',this)">↩ Chưa gửi</button>';
}else{
h+='<button class="invoice-btn" type="button" style="background:linear-gradient(180deg,#3b82f6 0%,#2563eb 100%);color:#fff;border:none;box-shadow:0 2px 8px rgba(37,99,235,.3);" onclick="markInvoiceSent('+safeJsAttrString(c.id)+',this)">✉ Đã gửi phiếu</button>';
h+='<button class="invoice-btn" type="button" style="background:linear-gradient(180deg,#10b981 0%,#059669 100%);color:#fff;border:none;box-shadow:0 2px 8px rgba(5,150,105,.3);min-width:160px;" onclick="confirmClientPayment('+safeJsAttrString(c.id)+','+safeJsAttrString(ms)+',this)">✓ Xác nhận thanh toán</button>';
}}
h+='</div></div></td></tr>';}
});
h+='</tbody><tfoot><tr style="background:var(--bg2);font-weight:600;border-top:1px solid var(--bd2);"><td></td><td>Tổng '+rows.length+'/'+clientList.length+' Khách hàng</td><td></td><td></td><td></td><td class="mono" style="text-align:right;color:var(--teal);font-size:15px;">'+fm(totalSpend)+'</td><td class="mono" style="text-align:right;">'+fm(totalFee)+'</td><td></td><td></td></tr></tfoot></table></div>';
return h;}
function clearClientFilters(){clientSearchText='';clientFilterPayment='';clientFilterVat='';clientFilterStatus='';clientFilterSpend='';clientFilterService='';clientFilterCare='';clientSortMode='spend_desc';expandedClientId=null;render();}
async function copyLeadFormUrl(btn){
  var origin=window.location.origin+window.location.pathname.replace(/[^\/]*$/,'')+'index.html';
  var url=origin+'?form=lead';
  try{await navigator.clipboard.writeText(url);toast('Đã sao chép URL form · dán Zalo / FB / QR code',true);}
  catch(e){window.prompt('Sao chép URL sau (Ctrl+C):',url);}
}

// ═══ P3 — TAB KHÁCH TIỀM NĂNG ═══
function p3Prospect(tabH){
var prospects=clientList.filter(function(c){return c.status==='prospect';});
if(clientSearchText){
  var q=clientSearchText.toLowerCase();
  prospects=prospects.filter(function(c){return(c.name||'').toLowerCase().indexOf(q)>=0||(c.company_full_name||'').toLowerCase().indexOf(q)>=0||(c.contact_person||'').toLowerCase().indexOf(q)>=0||(c.phone||'').indexOf(q)>=0||(c.address||'').toLowerCase().indexOf(q)>=0;});
}
prospects.sort(function(a,b){return(b.created_at||'').localeCompare(a.created_at||'');});
var allProspects=clientList.filter(function(c){return c.status==='prospect';});
var newCount=allProspects.filter(function(c){return(c.care_status||'new')==='new';}).length;
var negotiatingCount=allProspects.filter(function(c){return(c.care_status||'')==='negotiating';}).length;
var origin=window.location.origin+window.location.pathname.replace(/[^\/]*$/,'')+'index.html';
var leadFormUrl=origin+'?form=lead';
// Header row: title + sub + button "+ Thêm khách"
var h='<div class="pr-header"><div><div class="page-title">Khách hàng</div><div class="page-sub">Khách tiềm năng — chưa ký hợp đồng</div></div><button class="btn btn-primary pr-add-btn" onclick="openNewProspectModal()">+ Thêm khách</button></div>';
h+=tabH;
// 3 KPI cards
h+='<div class="pr-kpi-grid">';
h+='<div class="pr-kpi-card"><div class="pr-kpi-lbl">Lead chưa liên hệ</div><div class="pr-kpi-val'+(newCount>0?' urgent':'')+'">'+newCount+'</div></div>';
h+='<div class="pr-kpi-card"><div class="pr-kpi-lbl">Đang đàm phán</div><div class="pr-kpi-val">'+negotiatingCount+'</div></div>';
h+='<div class="pr-kpi-card"><div class="pr-kpi-lbl">Form công khai</div><div class="pr-kpi-actions"><a href="'+esc(leadFormUrl)+'" target="_blank" rel="noopener">Xem</a><span class="pr-dot">·</span><a href="#" onclick="event.preventDefault();copyLeadFormUrl(this);">Copy URL</a></div></div>';
h+='</div>';
// Search bar full width
h+='<input type="text" id="prospect-search" class="pr-search" placeholder="Tìm theo tên, SĐT, dịch vụ..." value="'+esc(clientSearchText)+'" oninput="hcSearchInput(\'clientSearchText\',this.value)">';
if(!prospects.length){
  h+='<div class="empty-state" role="status">';
  h+='<div class="empty-state-icon" aria-hidden="true">📋</div>';
  h+='<div class="empty-state-title">Chưa có khách tiềm năng</div>';
  h+='<div class="empty-state-desc">'+(clientSearchText?'Không tìm thấy khách khớp với từ khoá. Thử xoá bộ lọc.':'Bấm "+ Thêm khách" ở trên hoặc chia sẻ URL form công khai để khách tự điền.')+'</div>';
  h+='</div>';
  return h;
}
h+='<div class="pr-table-wrap"><table class="pr-table"><thead><tr><th>Tên</th><th>Dịch vụ</th><th>Liên hệ</th><th>Trạng thái</th><th>Ngày tạo</th><th class="pr-th-action"></th></tr></thead><tbody>';
prospects.forEach(function(c){
  var createdDate=c.created_at?c.created_at.substring(0,10):'';
  var isExp=expandedClientId===c.id;
  var initials=getInitials(c.name);
  var avColor=getAvatarColor(c.id||c.name);
  var dateDisplay='—';
  if(createdDate){var dp=createdDate.split('-');if(dp.length===3)dateDisplay=dp[2]+'/'+dp[1]+'/'+dp[0];else dateDisplay=createdDate;}
  var subline=c.address||c.contact_person||c.phone||'';
  var zaloRaw=(c.zalo||'').trim()||(c.phone||'').trim();
  h+='<tr class="'+(isExp?'pr-row-expanded':'')+'">';
  // Tên cell with avatar
  h+='<td><div class="pr-name-cell"><div class="pr-avatar" style="background:'+avColor.bg+';color:'+avColor.tx+';">'+esc(initials)+'</div><div class="pr-name-stack"><div class="pr-name-row"><span class="pr-name">'+esc(c.name)+'</span>'+renderLeadSourceBadge(c.lead_source)+'</div>'+(subline?'<div class="pr-name-sub">'+esc(subline)+'</div>':'')+'</div></div></td>';
  // Dịch vụ
  h+='<td class="pr-svc-cell">'+renderServicesBadges(c.services,{compact:true,icon:false})+'</td>';
  // Liên hệ — nút Zalo logo (dễ bấm trên mobile)
  if(zaloRaw){
    var zUrl=buildZaloLink(zaloRaw);
    h+='<td><a href="'+esc(zUrl)+'" target="_blank" rel="noopener" class="pr-zalo-btn" title="Mở Zalo: '+esc(zaloRaw)+'" onclick="event.stopPropagation();"><svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 4C9.4 4 4 8.5 4 14c0 3 1.7 5.7 4.4 7.5L7 28l5-2.7c1.2.3 2.5.4 4 .4 6.6 0 12-4.5 12-10S22.6 4 16 4z" fill="currentColor"/><text x="16" y="18.5" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="9" font-weight="900" fill="#fff" letter-spacing="-0.5">Zalo</text></svg></a></td>';
  }else{
    h+='<td><span class="pr-empty-cell">—</span></td>';
  }
  // Trạng thái
  h+='<td>'+renderCareChip(c.care_status||'new')+'</td>';
  // Ngày tạo
  h+='<td><span class="pr-date">'+esc(dateDisplay)+'</span></td>';
  // ⋯ menu
  h+='<td class="pr-action-cell">';
  h+='<div class="qt-action-wrap">';
  h+='<button class="qt-action-more" onclick="togglePrMenu(event,\''+c.id+'\')" aria-haspopup="menu" aria-expanded="false" aria-controls="pr-menu-'+c.id+'" title="Thao tác">⋯</button>';
  h+='<div class="qt-action-menu" id="pr-menu-'+c.id+'" role="menu" onclick="event.stopPropagation();">';
  h+='<button role="menuitem" onclick="toggleProspectExpand(\''+c.id+'\');closeQuotationMenus();">Xem chi tiết</button>';
  h+='<button role="menuitem" onclick="openClientEditModal(\''+c.id+'\');closeQuotationMenus();">Sửa thông tin</button>';
  h+='<button role="menuitem" onclick="openQuotationForClient(\''+c.id+'\');closeQuotationMenus();">Tạo báo giá</button>';
  h+='<button role="menuitem" onclick="openContractModal(\''+c.id+'\');closeQuotationMenus();">Tạo hợp đồng</button>';
  h+='<button role="menuitem" onclick="convertProspectToActive(\''+c.id+'\');closeQuotationMenus();">Chốt ký — chuyển chính thức</button>';
  h+='<div class="sep"></div>';
  h+='<button role="menuitem" class="danger" onclick="deleteProspect(\''+c.id+'\');closeQuotationMenus();">Xoá</button>';
  h+='</div></div></td></tr>';
  if(isExp){
    h+='<tr class="pr-row-detail"><td colspan="6" style="padding:0;">';
    h+='<div class="kh-detail-wrap">';
    h+='<div class="kh-detail-grid">';
    h+='<div class="kh-detail-item"><span class="kh-detail-label">Địa chỉ</span><span class="kh-detail-value">'+esc(c.address||'—')+'</span></div>';
    h+='<div class="kh-detail-item"><span class="kh-detail-label">MST</span><span class="kh-detail-value">'+esc(c.tax_code||'—')+'</span></div>';
    h+='<div class="kh-detail-item"><span class="kh-detail-label">Điện thoại</span><span class="kh-detail-value">'+esc(c.phone||'—')+'</span></div>';
    h+='<div class="kh-detail-item"><span class="kh-detail-label">Zalo</span><span class="kh-detail-value">'+(c.zalo?'<a href="'+esc(buildZaloLink(c.zalo))+'" target="_blank" rel="noopener">'+esc(c.zalo)+'</a>':'—')+'</span></div>';
    h+='<div class="kh-detail-item"><span class="kh-detail-label">Email</span><span class="kh-detail-value">'+esc(c.email_invoice||'—')+'</span></div>';
    h+='<div class="kh-detail-item"><span class="kh-detail-label">Công ty</span><span class="kh-detail-value">'+esc(c.company_full_name||'—')+'</span></div>';
    h+='<div class="kh-detail-item"><span class="kh-detail-label">Đại diện</span><span class="kh-detail-value">'+esc(((c.representative_salutation||'')+' '+(c.representative_name||'—')).trim())+'</span></div>';
    h+='<div class="kh-detail-item"><span class="kh-detail-label">Ngành</span><span class="kh-detail-value">'+esc(c.industry||'—')+'</span></div>';
    if(c.prospect_note)h+='<div class="kh-detail-item kh-detail-note"><span class="kh-detail-label">Ghi chú</span><span class="kh-detail-value">'+esc(c.prospect_note)+'</span></div>';
    h+='</div>';
    h+='<div class="kh-detail-actions">';
    h+='<button class="btn" onclick="openQuotationForClient(\''+c.id+'\')">Tạo báo giá</button>';
    h+='<button class="btn btn-green" onclick="convertProspectToActive(\''+c.id+'\')">Chốt ký — chuyển khách chính thức</button>';
    h+='<button class="btn" onclick="openContractModal(\''+c.id+'\')">Xuất hợp đồng</button>';
    h+='<button class="btn btn-red btn-spacer" onclick="deleteProspect(\''+c.id+'\')">Xoá</button>';
    h+='</div>';
    h+='</div>';
    h+='</td></tr>';
  }
});
h+='</tbody></table></div>';
return h;
}
// Tạo initials 2 ký tự từ tên (VD "Quang Tuấn" → "QT")
function getInitials(name){
  if(!name)return'?';
  var parts=String(name).trim().split(/\s+/).filter(Boolean);
  if(!parts.length)return'?';
  if(parts.length===1)return parts[0].substring(0,2).toUpperCase();
  return (parts[0].charAt(0)+parts[parts.length-1].charAt(0)).toUpperCase();
}
// Avatar color theo hash của id (deterministic, đa dạng)
function getAvatarColor(seed){
  var palette=[
    {bg:'rgba(55,138,221,.16)',tx:'#1F5DA0'},
    {bg:'rgba(127,119,221,.16)',tx:'#544DAB'},
    {bg:'rgba(29,158,117,.16)',tx:'#0F6E50'},
    {bg:'rgba(186,117,23,.16)',tx:'#8A560F'},
    {bg:'rgba(216,90,48,.16)',tx:'#A03E1A'},
    {bg:'rgba(212,83,126,.16)',tx:'#9C2F5A'},
    {bg:'rgba(99,153,34,.16)',tx:'#4A7218'},
    {bg:'rgba(226,75,74,.16)',tx:'#B72E2D'}
  ];
  var s=String(seed||''),sum=0;for(var i=0;i<s.length;i++)sum+=s.charCodeAt(i);
  return palette[sum%palette.length];
}
// Toggle dropdown menu của prospect — dùng position:fixed để không bị
// parent overflow:hidden (table-wrap) clip
function togglePrMenu(ev,id){
  ev.stopPropagation();
  var m=document.getElementById('pr-menu-'+id);if(!m)return;
  var wasOpen=m.classList.contains('open');
  closeQuotationMenus();
  if(!wasOpen){
    m.classList.add('open');
    var trig=ev.currentTarget;if(trig)trig.setAttribute('aria-expanded','true');
    positionFixedMenu(m,trig);
  }
}
function toggleProspectExpand(id){expandedClientId=(expandedClientId===id)?null:id;render();}
async function deleteProspect(clientId){
  if(!needAuth())return;
  var c=clientList.find(function(x){return x.id===clientId;});if(!c)return;
  if(!(await hcConfirm({title:'Xóa khách tiềm năng',message:'Xóa "'+c.name+'"? Hợp đồng đã xuất cũng sẽ bị xóa theo.',confirmLabel:'Xóa',danger:true})))return;
  var r=await sb2.from('client').delete().eq('id',clientId);
  if(r.error){toast('Lỗi: '+r.error.message,false);return;}
  toast('Đã xóa',true);
  await loadLight();
}
function toggleClientInv(id){expandedClientId=(expandedClientId===id)?null:id;render();}

async function insertInvoiceIncomeTransaction(payload){
var r=await sb2.from('transaction').insert(Object.assign({},payload,{source:'invoice'}));
if(r.error&&isMissingColumnError(r.error))r=await sb2.from('transaction').insert(payload);
return r;
}
async function deleteInvoiceIncomeTransactions(clientId,month,note){
var r=await sb2.from('transaction').delete().eq('client_id',clientId).eq('month',month).eq('source','invoice');
if(r.error&&isMissingColumnError(r.error)){
r=await sb2.from('transaction').delete().eq('client_id',clientId).eq('month',month).eq('txn_type','income').eq('category','service_fee').eq('note',note);
}
return r;
}
async function markInvoiceSent(clientId,btn){
if(!needAuth())return;
var oldText=btn?btn.textContent:'';
if(btn){btn.disabled=true;btn.textContent='Đang lưu...';}
try{
var r=await sb2.from('client').update({payment_status:'invoice_sent'}).eq('id',clientId);
if(r.error){toast('Lỗi: '+r.error.message,false);return;}
toast('Đã đánh dấu Đã gửi phiếu',true);
await loadAll();render();
}catch(e){toast('Lỗi: '+e.message,false);}
finally{if(btn){btn.disabled=false;btn.textContent=oldText||'✉ Đã gửi phiếu';}}}
async function markInvoiceUnsent(clientId,btn){
if(!needAuth())return;
var oldText=btn?btn.textContent:'';
if(btn){btn.disabled=true;btn.textContent='Đang lưu...';}
try{
var r=await sb2.from('client').update({payment_status:'unpaid'}).eq('id',clientId);
if(r.error){toast('Lỗi: '+r.error.message,false);return;}
toast('Đã chuyển về Chưa thanh toán',true);
await loadAll();render();
}catch(e){toast('Lỗi: '+e.message,false);}
finally{if(btn){btn.disabled=false;btn.textContent=oldText||'↩ Chưa gửi';}}}
async function confirmClientPayment(clientId,month,btn){
if(!needAuth())return;
var c=clientList.find(function(x){return x.id===clientId;});if(!c)return;
if(!confirm('Xác nhận '+esc(c.name)+' đã thanh toán?\nHệ thống sẽ tự tạo giao dịch Thu vào sổ thu chi.'))return;
var oldText=btn?btn.textContent:'';
if(btn){btn.disabled=true;btn.textContent='Đang xử lý...';}
try{
var feeInput=document.getElementById('client-fee-'+invoiceDomId(clientId));
var fee=feeInput?normalizeMoneyInput(feeInput.value):getEffectiveServiceFee(clientId,month,c.service_fee);
var sp=getMonthSpendForClient(clientId,month);
var info=getInvoiceTotals(c,month,fee,sp);
var mk=monthKey(month),mLabel='T'+parseInt(mk.split('-')[1])+'/'+mk.split('-')[0];
var note='Phí Dịch vụ '+mLabel+' — '+c.name;
var r1=await sb2.from('client').update({payment_status:'paid'}).eq('id',clientId);
if(r1.error){toast('Lỗi cập nhật Khách hàng: '+r1.error.message,false);return;}
var r2=await insertInvoiceIncomeTransaction({txn_date:td(),txn_type:'income',amount:info.total,category:'service_fee',client_id:clientId,staff_id:null,note:note,month:mk});
if(r2.error)toast('Đã xác nhận thanh toán, nhưng lỗi tạo giao dịch Thu: '+r2.error.message,false);
else toast('Đã xác nhận thanh toán và tạo giao dịch Thu: '+ff(info.total),true);
await loadAll();render();
}catch(e){toast('Lỗi: '+e.message,false);}
finally{if(btn){btn.disabled=false;btn.textContent=oldText||'✓ Xác nhận thanh toán';}}}

async function undoClientPayment(clientId,month,btn){
if(!needAuth())return;
var c=clientList.find(function(x){return x.id===clientId;});if(!c)return;
if(!confirm('Hủy thanh toán '+esc(c.name)+'?\nGiao dịch Thu tự động sẽ bị xóa khỏi sổ thu chi.'))return;
var oldText=btn?btn.textContent:'';
if(btn){btn.disabled=true;btn.textContent='Đang xử lý...';}
try{
var mk=monthKey(month),mLabel='T'+parseInt(mk.split('-')[1])+'/'+mk.split('-')[0],note='Phí Dịch vụ '+mLabel+' — '+c.name;
var r1=await sb2.from('client').update({payment_status:'unpaid'}).eq('id',clientId);
if(r1.error){toast('Lỗi: '+r1.error.message,false);return;}
var r2=await deleteInvoiceIncomeTransactions(clientId,mk,note);
if(r2.error)console.warn('Không xóa được giao dịch tự động:',r2.error.message);
toast('Đã hủy thanh toán'+(r2.error?'':' + xóa giao dịch Thu tự động'),true);
await loadAll();render();
}catch(e){toast('Lỗi: '+e.message,false);}
finally{if(btn){btn.disabled=false;btn.textContent=oldText||'Hủy thanh toán';}}}
function startEditFee(domId,clientId,month){
if(!authUser){toast('Đăng nhập admin để sửa phí dịch vụ',false);return;}
var display=document.getElementById('client-fee-display-'+domId);
var input=document.getElementById('client-fee-'+domId);
if(display)display.style.display='none';
if(input){input.style.display='';input.focus();input.select();}
}
function endEditFee(domId,clientId,month,rawVal){
var display=document.getElementById('client-fee-display-'+domId);
var input=document.getElementById('client-fee-'+domId);
var fee=normalizeMoneyInput(rawVal);
if(display){display.textContent=ff(fee);display.style.display='';}
if(input)input.style.display='none';
saveClientMonthlyFee(clientId,month,rawVal);
}
function previewClientInvoice(clientId,month,rawVal){
var c=clientList.find(function(x){return x.id===clientId;});if(!c)return;
var sp=getMonthSpendForClient(clientId,month);
var domId=invoiceDomId(clientId),fee=normalizeMoneyInput(rawVal),info=getInvoiceTotals(c,month,fee,sp);
var vatEl=document.getElementById('invoice-vat-'+domId),totalEl=document.getElementById('invoice-total-'+domId),qrEl=document.getElementById('invoice-qr-'+domId),fbEl=document.getElementById('invoice-qr-fallback-'+domId),nameEl=document.getElementById('invoice-account-name-'+domId),noEl=document.getElementById('invoice-account-no-'+domId),contentEl=document.getElementById('invoice-content-'+domId),contentLabelEl=document.getElementById('invoice-content-label-'+domId),bankTitleEl=document.getElementById('invoice-bank-title-'+domId),vatRow=document.getElementById('invoice-vat-row-'+domId),noVatRow=document.getElementById('invoice-novat-row-'+domId),rentalEl=document.getElementById('invoice-rental-'+domId);
if(vatEl)vatEl.textContent=ff(info.vat);
if(totalEl)totalEl.textContent=ff(info.total);
if(rentalEl)rentalEl.textContent=ff(info.rentalFee);
if(nameEl)nameEl.textContent=info.bank.accountName;
if(noEl)noEl.textContent=info.bank.accountNoDisplay;
if(contentEl)contentEl.textContent=info.content;
if(contentLabelEl)contentLabelEl.textContent=getInvoiceContentLabel(info.hasVat);
if(bankTitleEl)bankTitleEl.textContent=getInvoiceBankTitle(info.hasVat,info.bank.bank);
if(vatRow)vatRow.style.display=info.hasVat?'block':'none';
if(noVatRow)noVatRow.style.display='none';
if(qrEl){qrEl.style.display='block';qrEl.src=getVietQrImageUrl(c,month,fee,sp);}
if(fbEl)fbEl.style.display='none';
}
async function saveClientMonthlyFee(clientId,month,rawVal){
if(!needAuth())return;
var fee=normalizeMoneyInput(rawVal),mk=monthKey(month);
var r=await sb2.from('client_monthly_fee').upsert({client_id:clientId,month:mk,service_fee:fee,updated_at:new Date().toISOString()},{onConflict:'client_id,month'});
if(r.error){
if(isMissingRelationError(r.error))toast('Thiếu bảng client_monthly_fee. Hãy chạy file SQL migration trước.',false);
else toast('Lỗi lưu phí tháng: '+r.error.message,false);
return;
}
var existing=getMonthlyFeeRecord(clientId,mk);
if(existing)existing.service_fee=fee;else monthlyFeeData.unshift({client_id:clientId,month:mk,service_fee:fee});
toast('Đã lưu phí dịch vụ T'+parseInt(mk.split('-')[1])+'/'+mk.split('-')[0],true);
render();
}
function copyClientInvoice(clientId,month,spend){
var c=clientList.find(function(x){return x.id===clientId;});if(!c)return;
var feeInput=document.getElementById('client-fee-'+invoiceDomId(clientId));
var fee=feeInput?normalizeMoneyInput(feeInput.value):getEffectiveServiceFee(clientId,month,c.service_fee);
var info=getInvoiceTotals(c,month,fee,spend),mLabel='T'+parseInt(month.split('-')[1]),yLabel=month.split('-')[0];
var lines=[c.name+' - '+mLabel+'/'+yLabel,'---','Tổng chi tiêu Quảng cáo: '+ff(spend)];
if(info.rentalFee>0){var rentalPctLabel=(Math.round(info.rentalPct*1000)/10)+'%';lines.push('Phí dịch vụ: '+ff(info.flatFee),'Phí thuê TKQC ('+rentalPctLabel+' × spend): '+ff(info.rentalFee));}
else lines.push('Phí dịch vụ: '+ff(info.fee));
if(info.hasVat)lines.push('VAT 8%: '+ff(info.vat));
lines.push('Tổng thanh toán: '+ff(info.total),'---','Chuyển khoản:',info.bank.bank+' - '+info.bank.accountNoDisplay,info.bank.accountName,getInvoiceContentLabel(info.hasVat)+' '+info.content);
navigator.clipboard.writeText(lines.join('\n'));toast('Đã sao chép',true);
}
function sanitizeFilenamePart(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'phieu';}
function triggerBlobDownload(blob,filename){
var url=URL.createObjectURL(blob),a=document.createElement('a');
a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
setTimeout(function(){URL.revokeObjectURL(url);},1000);
}
async function downloadClientInvoice(clientId,month,spend,btn){
var c=clientList.find(function(x){return x.id===clientId;});
var node=document.getElementById('client-invoice-'+invoiceDomId(clientId));
if(!c||!node){toast('Không tìm thấy phiếu thanh toán. Có thể dữ liệu đã bị xóa — hãy tải lại trang và thử lại.',false);return;}
var originalText=btn?btn.textContent:'';
if(btn){btn.disabled=true;btn.textContent='Đang tạo...';}
try{
if(typeof html2canvas==='undefined'){await new Promise(function(resolve,reject){var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';s.onload=resolve;s.onerror=function(){reject(new Error('Không tải được html2canvas'));};document.head.appendChild(s);});}
var actionBar=node.querySelector('.invoice-actions');
if(actionBar)actionBar.style.display='none';
var imgs=node.querySelectorAll('img');
var origSrcs=[];
imgs.forEach(function(img){origSrcs.push(img.src);});
for(var i=0;i<imgs.length;i++){
try{
var resp=await fetch(imgs[i].src,{mode:'cors'});
var blob=await resp.blob();
imgs[i].src=URL.createObjectURL(blob);
}catch(e){imgs[i].style.visibility='hidden';}
}
await new Promise(function(r){setTimeout(r,300);});
var canvas=await html2canvas(node,{scale:2,useCORS:false,allowTaint:false,backgroundColor:'#f2f6fb',logging:false});
imgs.forEach(function(img,idx){
if(img.src.startsWith('blob:'))URL.revokeObjectURL(img.src);
img.src=origSrcs[idx];img.style.visibility='';
});
if(actionBar)actionBar.style.display='';
var pngBlob=await new Promise(function(resolve,reject){
canvas.toBlob(function(blob){if(blob)resolve(blob);else reject(new Error('Không tạo được PNG'));},'image/png');
});
triggerBlobDownload(pngBlob,'phieu-thanh-toan-'+sanitizeFilenamePart(c.name)+'-'+month+'.png');
toast('Đã tải phiếu thanh toán',true);
}catch(e){
toast('Không thể tải ảnh: '+e.message,false);
var actionBar2=node.querySelector('.invoice-actions');if(actionBar2)actionBar2.style.display='';
node.querySelectorAll('img').forEach(function(img){img.style.visibility='';});
}finally{
if(btn){btn.disabled=false;btn.textContent=originalText||'Tải ảnh';}
}
}

// ═══ P4: TÀI CHÍNH ═══
function p4(){
var h='';
if(authUser&&!isAdmin()){
h+='<div class="logout-bar"><span>'+esc(authUser.email)+' <span class="badge b-blue" style="margin-left:6px;">'+esc(userRoleLabel(userRole))+'</span></span><button class="btn btn-ghost btn-sm" onclick="doLogout()">Đăng xuất</button></div>';}
h+='<div class="page-title">Tài chính</div>';
var canThuChi=canAccessKey('p4.thuchi'),canReconcile=canAccessKey('p4.reconcile');
// Auto-switch sang tab user có quyền nếu đang ở tab bị cấm
if(finTab==='thuchi'&&!canThuChi&&canReconcile)finTab='reconcile';
if(finTab==='reconcile'&&!canReconcile&&canThuChi)finTab='thuchi';
h+='<div class="client-tab-bar" role="tablist" style="margin-bottom:14px;">';
if(canThuChi)h+='<button role="tab" aria-selected="'+(finTab==='thuchi')+'" class="'+(finTab==='thuchi'?'active':'')+'" onclick="setFinTab(\'thuchi\')">Thu chi</button>';
if(canReconcile)h+='<button role="tab" aria-selected="'+(finTab==='reconcile')+'" class="'+(finTab==='reconcile'?'active':'')+'" onclick="setFinTab(\'reconcile\')">Đối soát VCB</button>';
h+='</div>';
return h+(finTab==='reconcile'?p4DoiSoat():p4ThuChi());
}
function setFinTab(t){finTab=t;render();}
function p4ThuChi(){
var am=new Set();txnData.forEach(function(t){am.add(t.month);});var sm=Array.from(am).sort().reverse();
if(!sm.includes(finMonth)&&sm.length)finMonth=sm[0];var mt=txnData.filter(function(t){return t.month===finMonth;}),inc=0,exp=0;
mt.forEach(function(t){if(t.txn_type==='income')inc+=t.amount;else exp+=t.amount;});var pr=inc-exp,mg=inc>0?(pr/inc*100).toFixed(1):0;
var h='<div class="month-filter"><label style="font-size:13px;color:var(--tx2);">Tháng:</label><select onchange="finMonth=this.value;render();">';
sm.forEach(function(m){h+='<option value="'+m+'"'+(m===finMonth?' selected':'')+'>T'+parseInt(m.split('-')[1])+'/'+m.split('-')[0]+'</option>';});h+='</select></div>';
h+='<div class="kpi-grid kpi-3"><div class="kpi"><div class="kpi-label">Doanh thu</div><div class="kpi-value" style="color:var(--green);">'+ff(inc)+'</div></div><div class="kpi"><div class="kpi-label">Chi phí</div><div class="kpi-value" style="color:var(--red);">'+ff(exp)+'</div></div><div class="kpi"><div class="kpi-label">Lợi nhuận</div><div class="kpi-value" style="color:var(--green);">'+ff(pr)+'</div><div class="kpi-note">Biên lợi nhuận '+mg+'%</div></div></div>';
if(authUser){
h+='<div class="form-card"><h3>Thêm giao dịch</h3><div class="form-row"><div class="form-group"><label>Ngày</label><input type="date" id="td2" value="'+td()+'"></div><div class="form-group"><label>Loại</label><select id="tt"><option value="income">Thu</option><option value="expense">Chi</option></select></div><div class="form-group"><label>Số tiền</label><input type="number" id="tv" placeholder="0"></div></div>';
h+='<div class="form-row"><div class="form-group"><label>Phân loại</label><select id="tc"><option value="service_fee">Phí dịch vụ</option><option value="salary">Lương</option><option value="rent">Mặt bằng</option><option value="other">Khác</option></select></div><div class="form-group"><label>Khách hàng</label><select id="tk"><option value="">—</option>';clientList.forEach(function(c2){h+='<option value="'+c2.id+'">'+esc(c2.name)+'</option>';});h+='</select></div><div class="form-group"><label>Nhân viên</label><select id="tn"><option value="">—</option>';staffList.forEach(function(s){h+='<option value="'+s.id+'">'+esc(s.short_name)+'</option>';});h+='</select></div></div>';
h+='<div class="form-row"><div class="form-group" style="grid-column:1/-1;"><label>Ghi chú</label><input type="text" id="tno" placeholder=""></div></div><div class="btn-row"><button class="btn btn-primary" onclick="svt(this)">Lưu</button></div></div>';
}
var cm2={service_fee:'Phí dịch vụ',salary:'Lương nhân viên',rent:'Chi phí vận hành',other:'Khác'};
h+='<div class="section-title">Giao dịch</div>';
if(!mt.length){
  h+='<div class="empty-state" role="status">';
  h+='<div class="empty-state-icon" aria-hidden="true">💸</div>';
  h+='<div class="empty-state-title">Chưa có giao dịch nào trong tháng này</div>';
  h+='<div class="empty-state-desc">Giao dịch sẽ tự động xuất hiện khi khách xác nhận thanh toán phiếu dịch vụ. Hoặc thêm thủ công bằng form "Thêm giao dịch" ở trên.</div>';
  h+='</div>';
  return h;
}
h+='<div class="table-wrap"><table><tr><th>Ngày</th><th>Loại</th><th>Khách hàng/Nhân sự</th><th>Phân loại</th><th>Nguồn</th><th style="text-align:right;">Số tiền</th>'+(authUser?'<th></th>':'')+'</tr>';
mt.forEach(function(t){var nm=esc(t.client?t.client.name:(t.staff?t.staff.short_name:(t.note||'—')));var isAuto=t.source==='invoice';
h+='<tr'+(isAuto?' style="background:var(--green-bg);"':'')+'><td>'+fd(t.txn_date)+'</td><td><span class="badge '+(t.txn_type==='income'?'b-green':'b-red')+'">'+(t.txn_type==='income'?'Thu':'Chi')+'</span></td><td>'+nm+'</td><td style="font-size:12px;color:var(--tx2);">'+(cm2[t.category]||t.category)+'</td>';
h+='<td>'+(isAuto?'<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:8px;font-size:10px;font-weight:500;background:var(--blue-bg);color:var(--blue-tx);">Từ phiếu Khách hàng</span>':'<span style="font-size:11px;color:var(--tx3);">Thủ công</span>')+'</td>';
h+='<td class="mono" style="text-align:right;color:'+(t.txn_type==='income'?'var(--green)':'var(--red)')+';font-weight:500;">'+(t.txn_type==='income'?'+':'-')+ff(t.amount)+'</td>';
if(authUser)h+='<td><button class="btn btn-red btn-sm" onclick="dlt(this,\''+t.id+'\')">Xóa</button></td>';
h+='</tr>';});
h+='</table></div>';return h;}


function loadXLSX(){
if(window.XLSX)return Promise.resolve(window.XLSX);
return new Promise(function(resolve,reject){
var s=document.createElement('script');
s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
s.onload=function(){resolve(window.XLSX);};
s.onerror=function(){reject(new Error('Không tải được thư viện XLSX'));};
document.head.appendChild(s);});}

// ═══ ĐỐI SOÁT VCB ═══
var BANK_TOLERANCE_PCT=1.1; // chênh ≤ 1.1% (phí NH + phí thẻ) coi là khớp
var VCB_MIN_FEE=9900; // phí thu tối thiểu của VCB; khi giao dịch nhỏ thì phí cố định = 9.900đ
function categorizeBankRow(desc){
  var d=String(desc||'');
  if(/\*MV4B\b/i.test(d))return 'meta_verified';
  if(/DG:FACEBK\s*\*[A-Z0-9]{6,}/i.test(d)||/DG:METAPAY\s*\*/i.test(d))return 'ads_meta';
  return 'other';
}
function extractMetaInvoiceCode(desc){
  var m=String(desc||'').match(/\*([A-Z0-9]{4,15})\b/);
  return m?m[1]:'';
}
var _reconcileSearchTimer=null;
function onReconcileSearch(v){
  reconcileSearch=v;
  if(_reconcileSearchTimer)clearTimeout(_reconcileSearchTimer);
  _reconcileSearchTimer=setTimeout(function(){render();},150);
}
function reconcileStatus(row){
  if(row.meta_amount==null||row.meta_amount==='')return{label:'Chưa đối soát',cls:'b-gray',diff:null};
  var bank=Number(row.bank_amount)||0,meta=Number(row.meta_amount)||0;
  if(bank===0)return{label:'Chưa đối soát',cls:'b-gray',diff:null};
  var absDiff=Math.abs(bank-meta);
  var diffPct=absDiff/bank*100;
  if(diffPct<=BANK_TOLERANCE_PCT||absDiff<=VCB_MIN_FEE)return{label:'Đã khớp',cls:'b-green',diff:diffPct};
  return{label:'Sai lệch',cls:'b-red',diff:diffPct};
}
function p4DoiSoat(){
  // Build month list từ bank_reconcile
  var months=new Set();bankReconcileData.forEach(function(r){if(r.bank_date)months.add(r.bank_date.substring(0,7));});
  var monthList=Array.from(months).sort().reverse();
  if(!reconcileMonth)reconcileMonth=monthList[0]||lm()||gm();
  var ms=reconcileMonth;
  var allRows=bankReconcileData.filter(function(r){return r.bank_date&&r.bank_date.substring(0,7)===ms;}).sort(function(a,b){return a.bank_date<b.bank_date?-1:1;});
  // KPI tính trên toàn tháng (không phụ thuộc search)
  var totBank=0,totMeta=0,matched=0,reconciled=0;
  allRows.forEach(function(r){
    totBank+=Number(r.bank_amount)||0;
    if(r.meta_amount!=null&&r.meta_amount!==''){
      totMeta+=Number(r.meta_amount)||0;
      reconciled++;
      var st=reconcileStatus(r);if(st.label==='Đã khớp')matched++;
    }
  });
  var pctReconciled=allRows.length?Math.round(reconciled/allRows.length*100):0;
  var totDiff=totBank-totMeta;
  var totDiffPct=totBank>0?Math.abs(totDiff)/totBank*100:0;
  // Filter rows hiển thị theo search query
  var q=(reconcileSearch||'').trim().toLowerCase();
  var qIsNumeric=q.length>0&&/^[\d.,\s]+$/.test(q); // chỉ digit/dấu phẩy/chấm/space → match số tiền
  var qNum=qIsNumeric?q.replace(/[^0-9]/g,''):'';
  var rows=allRows;
  if(q){
    rows=allRows.filter(function(r){
      if((r.meta_invoice_code||'').toLowerCase().indexOf(q)>=0)return true;
      if((r.meta_link||'').toLowerCase().indexOf(q)>=0)return true;
      if((r.bank_date||'').indexOf(q)>=0)return true;
      if(qNum){
        if(String(r.bank_amount||'').indexOf(qNum)>=0)return true;
        if(String(r.meta_amount||'').indexOf(qNum)>=0)return true;
      }
      return false;
    });
  }
  var h='';
  // Toolbar
  h+='<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px;">';
  h+='<label style="font-size:13px;color:var(--tx2);">Tháng:</label>';
  h+='<select class="fi" style="width:140px;" onchange="reconcileMonth=this.value;render();">';
  if(!monthList.length)h+='<option value="'+ms+'">T'+parseInt(ms.split("-")[1])+"/"+ms.split("-")[0]+"</option>";
  monthList.forEach(function(m){h+='<option value="'+m+'"'+(m===ms?' selected':'')+'>T'+parseInt(m.split("-")[1])+"/"+m.split("-")[0]+"</option>";});
  h+='</select>';
  if(authUser){
    h+='<button class="btn btn-primary btn-sm" onclick="openVcbImportModal()">📥 Nhập sao kê</button>';
  }
  h+='<div style="flex:1;display:flex;justify-content:flex-end;min-width:200px;"><div style="position:relative;display:inline-flex;align-items:center;">';
  h+='<span style="position:absolute;left:10px;color:var(--tx3);font-size:13px;pointer-events:none;">🔍</span>';
  h+='<input type="text" id="reconcile-search" class="fi" placeholder="Tìm mã giao dịch / số tiền / link..." value="'+esc(reconcileSearch)+'" oninput="onReconcileSearch(this.value)" style="width:280px;padding-left:30px;padding-right:'+(reconcileSearch?'28px':'10px')+';">';
  if(reconcileSearch)h+='<button onclick="onReconcileSearch(\'\')" style="position:absolute;right:6px;border:0;background:none;color:var(--tx3);cursor:pointer;font-size:14px;padding:0 4px;" title="Xóa">×</button>';
  h+='</div></div>';
  h+='</div>';
  // KPI
  h+='<div class="kpi-grid kpi-4" style="margin-bottom:18px;">';
  h+='<div class="kpi"><div class="kpi-label">Tổng VCB trừ</div><div class="kpi-value" style="color:var(--red);">'+(totBank?ff(totBank):'—')+'</div><div class="kpi-note">'+rows.length+' giao dịch</div></div>';
  h+='<div class="kpi"><div class="kpi-label">Tổng Meta đã nhập</div><div class="kpi-value" style="color:var(--blue-tx);">'+(totMeta?ff(totMeta):'—')+'</div><div class="kpi-note">'+reconciled+'/'+rows.length+' đã đối soát</div></div>';
  h+='<div class="kpi"><div class="kpi-label">Chênh lệch</div><div class="kpi-value" style="color:var(--amber);">'+(totMeta?ff(Math.abs(totDiff)):'—')+'</div><div class="kpi-note">'+(totMeta?totDiffPct.toFixed(2)+'%':'—')+' (ngưỡng '+BANK_TOLERANCE_PCT+'%)</div></div>';
  h+='<div class="kpi"><div class="kpi-label">Đã khớp</div><div class="kpi-value" style="color:var(--green);">'+matched+'/'+reconciled+'</div><div class="kpi-note">Tỷ lệ đối soát '+pctReconciled+'%</div></div>';
  h+='</div>';
  if(!allRows.length){
    h+='<div class="empty-state" role="status">';
    h+='<div class="empty-state-icon" aria-hidden="true">🏦</div>';
    h+='<div class="empty-state-title">Chưa có giao dịch đối soát trong tháng này</div>';
    h+='<div class="empty-state-desc">Bấm "Nhập sao kê" để upload file sao kê (.xlsx) từ Vietcombank. Hệ thống sẽ tự lọc các giao dịch trừ tiền Meta Ads + Tích xanh.</div>';
    h+='</div>';
    return h;
  }
  if(q){
    h+='<div style="font-size:12px;color:var(--tx3);margin-bottom:10px;padding:6px 12px;background:var(--bg2);border-radius:6px;display:inline-block;">🔍 Đang lọc theo "<b style="color:var(--tx2);">'+esc(reconcileSearch)+'</b>" — '+rows.length+'/'+allRows.length+' giao dịch khớp</div>';
  }
  if(!rows.length){
    h+='<div class="empty-state" role="status"><div class="empty-state-icon" aria-hidden="true">🔎</div><div class="empty-state-title">Không tìm thấy giao dịch nào</div><div class="empty-state-desc">Thử từ khóa khác — hoặc bấm × để xóa filter.</div></div>';
    return h;
  }
  // Bảng đối soát
  h+='<div class="table-wrap"><table style="font-size:13px;">';
  h+='<thead><tr>';
  h+='<th colspan="2" style="text-align:center;border-right:1px solid var(--bd1);">Ngân hàng</th>';
  h+='<th colspan="3" style="text-align:center;border-right:1px solid var(--bd1);">Meta</th>';
  h+='<th rowspan="2" style="text-align:right;">Chênh lệch</th>';
  h+='<th rowspan="2" style="text-align:center;">Trạng thái</th>';
  h+='</tr><tr>';
  h+='<th>Ngày</th>';
  h+='<th style="text-align:right;border-right:1px solid var(--bd1);">Số tiền</th>';
  h+='<th>Mã giao dịch</th>';
  h+='<th>Link giao dịch</th>';
  h+='<th style="text-align:right;border-right:1px solid var(--bd1);">Số tiền</th>';
  h+='</tr></thead><tbody>';
  rows.forEach(function(r){
    var st=reconcileStatus(r);
    var dp=r.bank_date.split('-');var dayLabel=dp[2]+'/'+dp[1]+'/'+dp[0];
    var diffNum=(r.meta_amount!=null&&r.meta_amount!=='')?Math.abs(Number(r.bank_amount)-Number(r.meta_amount)):null;
    var catBadge=r.category==='meta_verified'?'<span class="badge b-purple" style="font-size:10px;margin-left:4px;">Tích xanh</span>':(r.category==='ads_meta'?'<span class="badge b-blue" style="font-size:10px;margin-left:4px;">Ads</span>':'');
    h+='<tr>';
    h+='<td>'+dayLabel+catBadge+'</td>';
    h+='<td class="mono" style="text-align:right;font-weight:500;border-right:1px solid var(--bd1);">'+ff(r.bank_amount)+'</td>';
    h+='<td class="mono" style="font-size:11px;color:var(--tx2);">'+esc(r.meta_invoice_code||'—')+'</td>';
    if(authUser){
      var linkVal=r.meta_link||'';
      var isUrl=/^https?:\/\//i.test(linkVal);
      h+='<td><div style="display:flex;gap:4px;align-items:center;">';
      h+='<input type="text" value="'+esc(linkVal)+'" placeholder="https://business.facebook.com/..." style="flex:1;min-width:160px;font-size:11px;border:1px solid var(--bd1);border-radius:4px;padding:4px 6px;" onchange="saveReconcileEntry(\''+r.id+'\',\'meta_link\',this.value)">';
      if(isUrl)h+='<a href="'+esc(linkVal)+'" target="_blank" rel="noopener" title="Mở link giao dịch" style="flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:1px solid var(--bd1);border-radius:4px;text-decoration:none;font-size:13px;color:var(--blue-tx);background:var(--bg1);">↗</a>';
      h+='</div></td>';
      h+='<td style="border-right:1px solid var(--bd1);"><input type="text" inputmode="numeric" value="'+(r.meta_amount!=null?Number(r.meta_amount).toLocaleString('vi-VN'):'')+'" placeholder="0" style="width:120px;text-align:right;font-family:monospace;border:1px solid var(--bd1);border-radius:4px;padding:4px 6px;" oninput="formatMoneyInput(this)" onchange="saveReconcileEntry(\''+r.id+'\',\'meta_amount\',this.value)"></td>';
    }else{
      h+='<td>'+(r.meta_link?'<a href="'+esc(r.meta_link)+'" target="_blank" rel="noopener" style="font-size:11px;">Mở</a>':'<span style="color:var(--tx3);">—</span>')+'</td>';
      h+='<td class="mono" style="text-align:right;border-right:1px solid var(--bd1);">'+(r.meta_amount?ff(r.meta_amount):'—')+'</td>';
    }
    h+='<td class="mono" style="text-align:right;color:var(--amber);">'+(diffNum!=null?ff(diffNum)+(st.diff!=null?' <span style="font-size:10px;color:var(--tx3);">('+st.diff.toFixed(2)+'%)</span>':''):'—')+'</td>';
    h+='<td style="text-align:center;"><span class="badge '+st.cls+'">'+st.label+'</span></td>';
    h+='</tr>';
  });
  h+='</tbody></table></div>';
  // Lịch sử import file VCB
  if(bankImportLog&&bankImportLog.length){
    h+='<div class="section-title" style="margin-top:24px;">Lịch sử file VCB đã import</div>';
    h+='<div class="table-wrap"><table style="font-size:12px;">';
    h+='<thead><tr><th>Thời điểm upload</th><th>File</th><th>Kỳ sao kê</th><th style="text-align:right;">Tổng GD</th><th style="text-align:right;">Ads</th><th style="text-align:right;">Tích xanh</th><th>Người upload</th><th>Trạng thái</th></tr></thead><tbody>';
    bankImportLog.forEach(function(L){
      var dt=new Date(L.uploaded_at).toLocaleString('vi-VN');
      var period=(L.period_from&&L.period_to)?(fd(L.period_from)+' → '+fd(L.period_to)):'—';
      var stCls=L.status==='success'?'b-green':(L.status==='partial'?'b-amber':'b-red');
      var stLabel=L.status==='success'?'Thành công':(L.status==='partial'?'Một phần':'Lỗi');
      var sizeLbl=L.file_size?' ('+Math.round(L.file_size/1024)+' KB)':'';
      h+='<tr>';
      h+='<td>'+dt+'</td>';
      h+='<td style="font-family:monospace;font-size:11px;">'+esc(L.file_name||'—')+sizeLbl+'</td>';
      h+='<td>'+period+'</td>';
      h+='<td class="mono" style="text-align:right;">'+L.total_rows+'</td>';
      h+='<td class="mono" style="text-align:right;color:var(--blue-tx);">'+L.ads_rows+'</td>';
      h+='<td class="mono" style="text-align:right;color:var(--purple,#9333ea);">'+L.verified_rows+'</td>';
      h+='<td style="font-size:11px;color:var(--tx2);">'+esc(L.uploaded_by||'—')+'</td>';
      h+='<td><span class="badge '+stCls+'">'+stLabel+'</span>'+(L.error_message?'<div style="font-size:10px;color:var(--tx3);margin-top:2px;">'+esc(L.error_message)+'</div>':'')+'</td>';
      h+='</tr>';
    });
    h+='</tbody></table></div>';
  }
  return h;
}

async function saveReconcileEntry(id,field,value){
  if(!authUser){toast('Cần đăng nhập admin',false);return;}
  var update={};
  if(field==='meta_amount'){
    var num=parseInt(String(value||'').replace(/[^\d]/g,''))||0;
    update[field]=num||null;
  }else{
    update[field]=String(value||'').trim()||null;
  }
  var r=await sb2.from('bank_reconcile').update(update).eq('id',id);
  if(r.error){toast('Lỗi lưu: '+r.error.message,false);return;}
  // Cập nhật local cache
  var row=bankReconcileData.find(function(x){return x.id===id;});
  if(row){Object.assign(row,update);}
  // Re-render để cập nhật chênh lệch + trạng thái
  render();
}

function openVcbImportModal(){
  var root=document.getElementById('hc-modal-root')||(function(){var d=document.createElement('div');d.id='hc-modal-root';document.body.appendChild(d);return d;})();
  var ex=document.getElementById('vcb-import-modal');if(ex)ex.remove();
  var modal=document.createElement('div');modal.id='vcb-import-modal';modal.className='hc-modal-backdrop';
  modal.setAttribute('onclick','if(event.target===this)closeVcbImportModal()');
  modal.innerHTML=
    '<div class="hc-modal" style="max-width:560px;">'
    +'<div class="hc-modal-head"><h3>Nhập sao kê VCB</h3><button class="hc-modal-close" onclick="closeVcbImportModal()" aria-label="Đóng">×</button></div>'
    +'<div class="hc-modal-body">'
    +'<p style="font-size:13px;color:var(--tx2);margin-bottom:14px;">Chọn file <code>.xlsx</code> sao kê VCB (định dạng "Lịch sử giao dịch tài khoản"). Hệ thống sẽ tự lọc các giao dịch trừ tiền Meta Ads + Tích xanh, bỏ qua giao dịch khác.</p>'
    +'<input type="file" id="vcb-import-file" accept=".xlsx" style="font-size:13px;width:100%;padding:8px;border:1px dashed var(--bd2);border-radius:6px;background:var(--bg2);">'
    +'<div id="vcb-import-status" style="margin-top:12px;font-size:12px;color:var(--tx3);"></div>'
    +'<div class="btn-row" style="margin-top:18px;"><button class="btn btn-ghost" onclick="closeVcbImportModal()">Hủy</button><button class="btn btn-primary" onclick="runVcbImport(this)">Nhập</button></div>'
    +'</div></div>';
  root.appendChild(modal);
}
function closeVcbImportModal(){var m=document.getElementById('vcb-import-modal');if(m)m.remove();}
async function runVcbImport(btn){
  var f=document.getElementById('vcb-import-file');var status=document.getElementById('vcb-import-status');
  if(!f||!f.files||!f.files[0]){if(status)status.textContent='⚠ Chọn file trước';return;}
  if(btn){btn.disabled=true;btn.textContent='Đang xử lý...';}
  try{
    var XLSX=await loadXLSX();
    var data=await f.files[0].arrayBuffer();
    var wb=XLSX.read(data,{type:'array'});
    var ws=wb.Sheets[wb.SheetNames[0]];
    var arr=XLSX.utils.sheet_to_json(ws,{header:1,defval:null});
    // Tìm hàng header (chứa "STT" hoặc "Ngày")
    var headerIdx=-1;
    for(var i=0;i<Math.min(20,arr.length);i++){
      var row=(arr[i]||[]).map(function(c){return String(c||'');});
      if(row.some(function(c){return /STT/.test(c);})&&row.some(function(c){return /Ngày/.test(c);})){headerIdx=i;break;}
    }
    if(headerIdx<0){throw new Error('Không tìm thấy header bảng (STT, Ngày). Kiểm tra lại format file.');}
    var rows=[];
    for(var j=headerIdx+1;j<arr.length;j++){
      var r=arr[j]||[];
      // Format: [_, STT, "DD/MM/YYYY\nXXXX-XXXXX", debit, credit, balance, desc]
      // Có thể col 0 là NaN hoặc empty.
      var stt=null,dateDoc=null,debit=null,credit=null,desc=null;
      // Tìm cell chứa "DD/MM/YYYY"
      r.forEach(function(c){
        var s=String(c||'');
        if(!dateDoc&&/^\d{2}\/\d{2}\/\d{4}/.test(s))dateDoc=s;
      });
      if(!dateDoc)continue; // Skip non-data rows (totals, footer)
      // Lấy debit (cell sau dateDoc trong cùng row)
      var didx=r.findIndex(function(c){return String(c||'')===dateDoc;});
      debit=r[didx+1];
      credit=r[didx+2];
      desc=r[r.length-1]||r[didx+4]||'';
      // Skip nếu không có debit (chỉ giao dịch trừ)
      var debitNum=parseInt(String(debit||'').replace(/[^\d]/g,''))||0;
      if(!debitNum)continue;
      // Parse ngày
      var dm=dateDoc.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      if(!dm)continue;
      var bankDate=dm[3]+'-'+dm[2]+'-'+dm[1];
      // Lấy doc no (sau "\n")
      var docMatch=dateDoc.match(/\n([\d\-\s]+)/);
      var docNo=docMatch?docMatch[1].trim():'';
      var descStr=String(desc||'');
      var cat=categorizeBankRow(descStr);
      if(cat==='other')continue; // Bỏ qua giao dịch không liên quan Meta
      rows.push({
        bank_date:bankDate,
        bank_amount:debitNum,
        bank_doc_no:docNo,
        bank_desc:descStr,
        meta_invoice_code:extractMetaInvoiceCode(descStr),
        category:cat
      });
    }
    var fileObj=f.files[0];
    var fileName=fileObj.name,fileSize=fileObj.size;
    if(!rows.length){
      // Vẫn log để admin biết đã upload nhưng không có data Meta
      await sb2.from('bank_import_log').insert({file_name:fileName,file_size:fileSize,total_rows:0,ads_rows:0,verified_rows:0,status:'partial',error_message:'Không có giao dịch Meta nào trong file',uploaded_by:authUser&&authUser.email||null});
      if(status)status.innerHTML='<span style="color:var(--amber);">Không tìm thấy giao dịch Meta nào trong file.</span>';
      if(btn){btn.disabled=false;btn.textContent='Nhập';}
      return;
    }
    if(status)status.textContent='Tìm thấy '+rows.length+' giao dịch Meta, đang lưu...';
    // Upsert (theo bank_date + bank_doc_no UNIQUE)
    var saved=0,errors=0,firstErrMsg='';
    for(var k=0;k<rows.length;k+=50){
      var batch=rows.slice(k,k+50);
      var ur=await sb2.from('bank_reconcile').upsert(batch,{onConflict:'bank_date,bank_doc_no',ignoreDuplicates:false});
      if(ur.error){
        errors+=batch.length;
        if(!firstErrMsg)firstErrMsg=ur.error.message||String(ur.error);
        console.warn('[VCB import]',ur.error);
      }else saved+=batch.length;
    }
    if(errors&&!saved){
      // Toàn bộ fail — thường do migration chưa chạy hoặc RLS chặn
      var hint=firstErrMsg;
      if(/relation.*does not exist/i.test(firstErrMsg))hint='⚠ Bảng <code>bank_reconcile</code> chưa được tạo. Chạy migration <code>2026-05-04_bank_reconcile.sql</code> trên Supabase trước.';
      else if(/permission denied|row.level security|row-level security/i.test(firstErrMsg))hint='⚠ RLS policy đang chặn insert. Chạy migration <code>2026-05-04_bank_reconcile_rls.sql</code> trên Supabase để cấp quyền cho admin.';
      if(status)status.innerHTML='<span style="color:var(--red);">Lỗi '+errors+'/'+rows.length+' dòng:</span><br>'+hint;
      // Vẫn log thất bại
      await sb2.from('bank_import_log').insert({file_name:fileName,file_size:fileSize,total_rows:0,ads_rows:0,verified_rows:0,status:'failed',error_message:firstErrMsg.substring(0,200),uploaded_by:authUser&&authUser.email||null});
      if(btn){btn.disabled=false;btn.textContent='Nhập';}
      return;
    }
    // Log import
    var dates=rows.map(function(r){return r.bank_date;}).sort();
    var adsCnt=rows.filter(function(r){return r.category==='ads_meta';}).length;
    var vfCnt=rows.filter(function(r){return r.category==='meta_verified';}).length;
    var logEntry={
      file_name:fileName,file_size:fileSize,
      period_from:dates[0],period_to:dates[dates.length-1],
      total_rows:saved,ads_rows:adsCnt,verified_rows:vfCnt,
      status:errors?'partial':'success',
      error_message:errors?(errors+' dòng lỗi upsert'):null,
      uploaded_by:authUser&&authUser.email||null
    };
    await sb2.from('bank_import_log').insert(logEntry);
    if(status)status.innerHTML='<span style="color:var(--green);">✓ Import xong: '+saved+' giao dịch'+(errors?' ('+errors+' lỗi)':'')+'</span>';
    // Reload data + đóng modal sau 1.5s
    var[rl,lg]=await Promise.all([
      sb2.from('bank_reconcile').select('*').order('bank_date',{ascending:false}),
      sb2.from('bank_import_log').select('*').order('uploaded_at',{ascending:false}).limit(50)
    ]);
    if(rl&&!rl.error)bankReconcileData=rl.data||[];
    if(lg&&!lg.error)bankImportLog=lg.data||[];
    setTimeout(function(){closeVcbImportModal();render();},1500);
  }catch(e){
    if(status)status.innerHTML='<span style="color:var(--red);">Lỗi: '+esc(e.message)+'</span>';
    if(btn){btn.disabled=false;btn.textContent='Nhập';}
  }
}

async function showMetaSyncStatus(btn){
if(btn){btn.disabled=true;btn.textContent='Đang đọc...';}
var el=document.getElementById('meta-sync-status');
if(!el){if(btn){btn.disabled=false;btn.textContent='Trạng thái đồng bộ Meta';}return;}
el.innerHTML='<div style="padding:12px;color:var(--tx3);font-size:12px;">Đang đọc Supabase...</div>';
try{
var logQ=await sb2.from('meta_sync_log').select('*').order('started_at',{ascending:false}).limit(5);
var countQ=await sb2.from('meta_billing_transactions').select('transaction_id',{count:'exact',head:true});
var latestQ=await sb2.from('meta_billing_transactions').select('synced_at,date_iso').order('date_iso',{ascending:false}).limit(1);
var h='<div style="margin-top:14px;padding:16px;border:1px solid var(--bd1);border-radius:var(--radius-lg);background:var(--bg1);font-size:12px;">';
h+='<div style="font-weight:600;font-size:13px;margin-bottom:10px;">Trạng thái đồng bộ Meta Billing</div>';
if(logQ.error&&/relation.*does not exist/i.test(logQ.error.message||'')){
h+='<div style="color:var(--amber);padding:8px;background:var(--amber-bg);border-radius:6px;">Chưa tạo bảng <code>meta_billing_transactions</code>. Chạy <code>schema.sql</code> trong Supabase SQL Editor trước.</div>';
h+='</div>';el.innerHTML=h;if(btn){btn.disabled=false;btn.textContent='Trạng thái đồng bộ Meta';}return;}
var total=countQ.count||0;
var latest=(latestQ.data&&latestQ.data[0])||null;
h+='<div style="display:grid;grid-template-columns:160px 1fr;gap:6px 12px;margin-bottom:12px;">';
h+='<span style="color:var(--tx3);">Tổng giao dịch:</span><span style="font-weight:500;">'+total.toLocaleString('vi-VN')+'</span>';
if(latest){
h+='<span style="color:var(--tx3);">GD gần nhất:</span><span>'+esc(latest.date_iso)+'</span>';
h+='<span style="color:var(--tx3);">Sync gần nhất:</span><span>'+new Date(latest.synced_at).toLocaleString('vi-VN')+'</span>';}
h+='</div>';
if(logQ.data&&logQ.data.length){
h+='<div style="font-weight:500;margin:8px 0 4px;">5 lần sync gần nhất:</div>';
h+='<table style="width:100%;font-size:11px;"><thead><tr style="color:var(--tx3);"><th style="text-align:left;padding:4px 6px;">Thời gian</th><th style="text-align:left;padding:4px 6px;">Trạng thái</th><th style="text-align:right;padding:4px 6px;">Số GD</th></tr></thead><tbody>';
logQ.data.forEach(function(l){
var color=l.status==='success'?'var(--green)':(l.status==='error'?'var(--red)':'var(--amber)');
h+='<tr><td style="padding:4px 6px;">'+new Date(l.started_at).toLocaleString('vi-VN')+'</td>';
h+='<td style="padding:4px 6px;color:'+color+';">'+esc(l.status||'—')+'</td>';
h+='<td style="padding:4px 6px;text-align:right;">'+(l.transaction_count||0)+'</td></tr>';
if(l.error_message)h+='<tr><td colspan="3" style="padding:2px 6px;color:var(--red);font-size:10px;">'+esc(l.error_message.substring(0,200))+'</td></tr>';
});
h+='</tbody></table>';}
h+='<div style="margin-top:12px;padding:10px;background:var(--blue-bg);border-radius:6px;color:var(--blue-tx);font-size:11px;">Để đồng bộ: double-click <code>~/Downloads/meta-billing-scraper/Đối soát Meta.command</code></div>';
h+='</div>';
el.innerHTML=h;
}catch(e){el.innerHTML='<div style="padding:12px;color:var(--red);">Lỗi: '+esc(e.message)+'</div>';}
if(btn){btn.disabled=false;btn.textContent='Trạng thái đồng bộ Meta';}}

async function checkMetaTokenPermissions(btn){
if(btn){btn.disabled=true;btn.textContent='Đang kiểm tra...';}
var el=document.getElementById('token-check-result');
if(!el){if(btn){btn.disabled=false;btn.textContent='Kiểm tra quyền Meta Token';}return;}
el.innerHTML='<div style="padding:12px;color:var(--tx3);font-size:12px;">Đang gọi Meta API...</div>';
try{
var needed=['ads_read','ads_management','business_management'];
var billingNeeded=['ads_read'];
var d1=await metaGet('me/permissions');
var d2=await metaGet('debug_token');
var h='<div style="margin-top:14px;padding:16px;border:1px solid var(--bd1);border-radius:var(--radius-lg);background:var(--bg1);font-size:12px;">';
h+='<div style="font-weight:600;font-size:13px;margin-bottom:10px;">Kết quả kiểm tra Meta Token</div>';
if(d2.data){
var td2=d2.data;
h+='<div style="display:grid;grid-template-columns:140px 1fr;gap:4px 12px;margin-bottom:12px;">';
h+='<span style="color:var(--tx3);">App ID:</span><span>'+esc(td2.app_id||'—')+'</span>';
h+='<span style="color:var(--tx3);">Type:</span><span>'+esc(td2.type||'—')+'</span>';
h+='<span style="color:var(--tx3);">Valid:</span><span style="color:'+(td2.is_valid?'var(--green)':'var(--red)')+';">'+(td2.is_valid?'Hợp lệ':'Không hợp lệ')+'</span>';
if(td2.expires_at){var exp=new Date(td2.expires_at*1000);h+='<span style="color:var(--tx3);">Hết hạn:</span><span'+(td2.expires_at<Date.now()/1000?' style="color:var(--red);"':'')+'>'+exp.toLocaleDateString('vi-VN')+' '+exp.toLocaleTimeString('vi-VN')+'</span>';}
if(td2.scopes)h+='<span style="color:var(--tx3);">Scopes:</span><span style="word-break:break-all;">'+td2.scopes.join(', ')+'</span>';
h+='</div>';}
if(d1.data){
h+='<div style="font-weight:500;margin-bottom:6px;">Quyền đã cấp:</div>';
h+='<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px;">';
var grantedSet={};
d1.data.forEach(function(p){grantedSet[p.permission]=p.status;
var isGranted=p.status==='granted';
var isBilling=billingNeeded.indexOf(p.permission)>=0;
h+='<span style="display:inline-flex;padding:3px 8px;border-radius:8px;font-size:11px;font-weight:500;background:'+(isGranted?'var(--green-bg)':'var(--red-bg)')+';color:'+(isGranted?'var(--green-tx)':'var(--red-tx)')+';">'+esc(p.permission)+': '+(isGranted?'OK':'DENIED')+'</span>';});
h+='</div>';
h+='<div style="font-weight:500;margin-bottom:6px;">Quyền cần cho Billing / Đối soát:</div>';
h+='<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px;">';
needed.forEach(function(p){var st=grantedSet[p];var ok=st==='granted';
h+='<span style="display:inline-flex;padding:3px 10px;border-radius:8px;font-size:11px;font-weight:500;background:'+(ok?'var(--green-bg)':'var(--amber-bg)')+';color:'+(ok?'var(--green-tx)':'var(--amber-tx)')+';">'+p+': '+(ok?'OK':'THIẾU')+'</span>';});
h+='</div>';}
if(d1.error)h+='<div style="color:var(--red);padding:8px 0;">Lỗi permissions: '+esc(d1.error.message)+'</div>';
if(d2.error||d2.data&&d2.data.error)h+='<div style="color:var(--red);padding:8px 0;">Lỗi debug_token: '+esc((d2.error||d2.data.error||{}).message||'')+'</div>';
var testAcc=adList.find(function(a){return a.fb_account_id;});
if(testAcc){
h+='<div style="font-weight:500;margin-bottom:6px;">Test gọi /transactions:</div>';
try{
var td3=await metaGet(testAcc.fb_account_id+'/transactions?fields=id,time,billing_amount,fatura_id&limit=3');
if(td3.error){h+='<div style="padding:8px 12px;border-radius:8px;background:var(--red-bg);color:var(--red-tx);font-size:11px;"><strong>Lỗi:</strong> '+esc(td3.error.message)+'<br><strong>Code:</strong> '+td3.error.code+' / Subcode: '+(td3.error.error_subcode||'—')+'</div>';}
else if(td3.data){h+='<div style="padding:8px 12px;border-radius:8px;background:var(--green-bg);color:var(--green-tx);font-size:11px;"><strong>Thành công!</strong> Trả về '+td3.data.length+' giao dịch từ Tài khoản '+esc(testAcc.account_name)+'</div>';
if(td3.data.length)h+='<pre style="margin-top:6px;font-size:10px;background:var(--bg3);padding:8px;border-radius:6px;overflow-x:auto;max-height:120px;">'+esc(JSON.stringify(td3.data[0],null,2))+'</pre>';}
else{h+='<div style="padding:8px 12px;border-radius:8px;background:var(--amber-bg);color:var(--amber-tx);font-size:11px;">Không có dữ liệu trả về (response rỗng)</div>';
h+='<pre style="margin-top:6px;font-size:10px;background:var(--bg3);padding:8px;border-radius:6px;overflow-x:auto;">'+esc(JSON.stringify(td3,null,2))+'</pre>';}
}catch(e){h+='<div style="color:var(--red);">Lỗi kết nối: '+esc(e.message)+'</div>';}}
h+='<div style="margin-top:10px;padding:10px;background:var(--blue-bg);color:var(--blue-tx);border-radius:8px;font-size:11px;line-height:1.6;"><strong>Nếu thiếu quyền:</strong> Vào <a href="https://business.facebook.com/settings/system-users" target="_blank" style="color:var(--blue);text-decoration:underline;">Meta Business Settings → System Users</a> → chọn system user → bấm "Add Assets" → thêm quyền <code>ads_read</code>, <code>ads_management</code>, <code>business_management</code> → Generate new token với các quyền billing.</div>';
h+='</div>';
el.innerHTML=h;
}catch(e){el.innerHTML='<div style="margin-top:8px;color:var(--red);font-size:12px;">Lỗi: '+esc(e.message)+'</div>';}
finally{if(btn){btn.disabled=false;btn.textContent='Kiểm tra quyền Meta Token';}}}
function p5(){
if(!authUser)return'<div style="padding:40px;text-align:center;color:var(--tx2);">Cần đăng nhập.</div>';
if(!isAdmin())return'<div class="logout-bar"><span>Đăng nhập: '+esc(authUser.email)+' <span class="badge b-blue" style="margin-left:6px;">'+esc(userRole)+'</span></span><button class="btn btn-ghost btn-sm" onclick="doLogout()">Đăng xuất</button></div><div style="padding:40px;text-align:center;color:var(--tx2);"><div style="font-size:15px;font-weight:500;margin-bottom:8px;">Không có quyền truy cập</div><div style="font-size:13px;">Trang Admin chỉ dành cho tài khoản Admin.</div></div>';
if(adminTab>3)adminTab=0;
var h='<div class="logout-bar"><span>Đăng nhập: '+esc(authUser.email)+' <span class="badge b-red" style="margin-left:6px;">Admin</span></span><button class="btn btn-ghost btn-sm" onclick="doLogout()">Đăng xuất</button></div>';
h+='<div class="page-title">Admin</div><div class="page-sub">Quản lý dữ liệu hệ thống.</div>';
h+='<div id="ac">'+rat()+'</div>';return h;}
function pLogin(){return'<div class="login-box"><h2>Đăng nhập Admin</h2><p>Nhập email và mật khẩu để truy cập quản lý</p><div class="form-group"><label>Email</label><input type="email" id="login-email" placeholder="admin@example.com"></div><div class="form-group"><label>Mật khẩu</label><input type="password" id="login-pass" placeholder="••••••••" onkeydown="if(event.key===\'Enter\')doLogin(this)"></div><button class="btn btn-primary" onclick="doLogin(this)">Đăng nhập</button><div class="login-err" id="login-err"></div></div>';}

function renderLoginScreen(){
return'<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;">'
+'<div style="width:100%;max-width:380px;">'
+'<div style="text-align:center;margin-bottom:32px;">'
+'<div style="font-size:28px;font-weight:600;color:var(--tx1);letter-spacing:-0.5px;">HC Agency</div>'
+'<div style="font-size:13px;color:var(--tx3);margin-top:6px;">Hệ thống quản trị quảng cáo</div>'
+'</div>'
+'<div class="form-card" style="padding:28px;">'
+'<div style="font-size:16px;font-weight:500;margin-bottom:4px;">Đăng nhập</div>'
+'<div style="font-size:12px;color:var(--tx3);margin-bottom:20px;">Nhập tài khoản để truy cập hệ thống</div>'
+'<div class="form-group" style="margin-bottom:14px;"><label>Email</label><input type="email" id="login-email" placeholder="email@hcagency.vn" style="width:100%;"></div>'
+'<div class="form-group" style="margin-bottom:20px;"><label>Mật khẩu</label><input type="password" id="login-pass" placeholder="••••••••" style="width:100%;" onkeydown="if(event.key===\'Enter\')doLogin(this)"></div>'
+'<button class="btn btn-primary" style="width:100%;padding:12px;font-size:14px;" onclick="doLogin(this)">Đăng nhập</button>'
+'<div class="login-err" id="login-err" style="margin-top:10px;text-align:center;color:var(--red);font-size:12px;"></div>'
+'</div>'
+'<div style="text-align:center;margin-top:16px;font-size:11px;color:var(--tx3);">HC Agency &copy; 2026</div>'
+'</div></div>';}
async function doLogin(btn){btn.disabled=true;var email=document.getElementById('login-email').value,pass=document.getElementById('login-pass').value;var{data,error}=await sb2.auth.signInWithPassword({email:email,password:pass});btn.disabled=false;if(error){document.getElementById('login-err').textContent='Sai email hoặc mật khẩu';}else{authUser=data.user;await loadUserRole();await loadAppSettings();if(isAdmin())await loadAllUserRoles();await loadAll();if(userAllowedPages&&userAllowedPages.length){curPage=permKeyToPage(userAllowedPages[0]);}else{curPage=0;}toast('Đăng nhập thành công! ('+userRole+')',true);autoSync();render();}}
async function doLogout(){await sb2.auth.signOut();authUser=null;userRole='guest';userAllowedPages=null;currentUserRoleRecord=null;curPage=0;toast('Đã đăng xuất',true);render();}
async function checkAuth(){var{data}=await sb2.auth.getSession();if(data.session){authUser=data.session.user;await loadUserRole();}}
async function loadUserRole(){
if(!authUser){userRole='guest';userAllowedPages=null;currentUserRoleRecord=null;return;}
try{
var{data,error}=await sb2.from('user_roles').select('*').eq('email',authUser.email).maybeSingle();
if(data){currentUserRoleRecord=data;userRole=data.role||'accountant';userAllowedPages=data.allowed_pages||[4];}
else{currentUserRoleRecord=null;userRole='admin';userAllowedPages=null;}
}catch(e){currentUserRoleRecord=null;userRole='admin';userAllowedPages=null;}}
var USER_ROLE_OPTIONS=[
  {value:'accountant',label:'Kế toán'},
  {value:'marketing',label:'Marketing'},
  {value:'viewer',label:'Chỉ xem'}
];
function userRoleLabel(role){
  if(role==='admin')return'Admin';
  for(var i=0;i<USER_ROLE_OPTIONS.length;i++){
    if(USER_ROLE_OPTIONS[i].value===role)return USER_ROLE_OPTIONS[i].label;
  }
  return role||'';
}
function userRoleOptionsHtml(selectedRole){
  return USER_ROLE_OPTIONS.map(function(r){
    return '<option value="'+esc(r.value)+'"'+(selectedRole===r.value?' selected':'')+'>'+esc(r.label)+'</option>';
  }).join('');
}
function normalizePersonKey(v){
  return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9]+/g,'');
}
function normalizePersonAlias(v){
  return normalizePersonKey(v).replace(/y/g,'i');
}
function getCurrentUserStaff(){
  if(!authUser||isStrictAdmin())return null;
  var hints=[];
  if(currentUserRoleRecord&&currentUserRoleRecord.display_name)hints.push(currentUserRoleRecord.display_name);
  if(authUser.user_metadata&&authUser.user_metadata.display_name)hints.push(authUser.user_metadata.display_name);
  if(authUser.email)hints.push(String(authUser.email).split('@')[0]);
  hints=hints.map(normalizePersonAlias).filter(Boolean);
  if(!hints.length)return null;
  var list=allStaff.length?allStaff:staffList;
  for(var i=0;i<list.length;i++){
    var s=list[i];
    var keys=[s.short_name,s.full_name,s.code,s.campaign_keyword].map(normalizePersonAlias).filter(Boolean);
    for(var h=0;h<hints.length;h++){
      for(var k=0;k<keys.length;k++){
        if(hints[h]===keys[k]||hints[h].indexOf(keys[k])>=0||keys[k].indexOf(hints[h])>=0)return s;
      }
    }
  }
  return null;
}
function isStaffScopedRole(){
  return authUser&&!isStrictAdmin()&&userRole==='marketing';
}
function canSeeStaffScopedData(staff){
  if(!isStaffScopedRole())return true;
  var me=getCurrentUserStaff();
  return !!(me&&staff&&staff.id===me.id);
}
function filterAlertsForCurrentUser(alerts){
  if(!isStaffScopedRole())return alerts;
  return alerts.filter(function(al){return canSeeStaffScopedData(al.staff);});
}
// ═══ PERMISSION TREE ═══
// Cấu trúc phân quyền: page chính + sub-tab. Admin (không có user_roles entry) full quyền.
// User có "p4" → full page Tài chính; chỉ có "p4.reconcile" → chỉ vào sub-tab Đối soát.
var PERMISSION_TREE=[
  {key:'p0',label:'Tổng quan'},
  {key:'p1',label:'Tài khoản Quảng cáo',sub:[
    {key:'p1.tkqc',label:'Tài khoản quảng cáo'},
    {key:'p1.staff',label:'Chi tiêu theo nhân sự'},
    {key:'p1.client',label:'Chi tiêu theo khách hàng'}
  ]},
  {key:'p2',label:'Nhân sự',sub:[
    {key:'p2.salary',label:'Lương + Hoa hồng'},
    {key:'p2.penalty',label:'Sổ phạt'},
    {key:'p2.task',label:'Công việc'}
  ]},
  {key:'p3',label:'Khách hàng',sub:[
    {key:'p3.overview',label:'Tổng quan khách'},
    {key:'p3.report',label:'Báo cáo Ads khách'}
  ]},
  {key:'p4',label:'Tài chính',sub:[
    {key:'p4.thuchi',label:'Thu chi'},
    {key:'p4.reconcile',label:'Đối soát VCB'}
  ]},
  {key:'p6',label:'Cảnh báo',sub:[
    {key:'p6.mess',label:'Mess'},
    {key:'p6.form',label:'Form'},
    {key:'p6.balance',label:'Số dư'}
  ]},
  {key:'p7',label:'Quản trị công việc'}
];
function permissionLabel(k){
  for(var i=0;i<PERMISSION_TREE.length;i++){
    var n=PERMISSION_TREE[i];
    if(n.key===k)return n.label;
    if(n.sub){for(var j=0;j<n.sub.length;j++){if(n.sub[j].key===k)return n.label+' · '+n.sub[j].label;}}
  }
  // Legacy số (vd 4) → coi là full page
  if(/^\d+$/.test(String(k))){
    var num=parseInt(k);
    var node=PERMISSION_TREE.find(function(n){return n.key==='p'+num;});
    return node?node.label:('p'+num);
  }
  return String(k);
}
// Normalize user permission từ DB: chấp nhận cả số (legacy) lẫn string
function normalizePermKey(p){
  var s=String(p);
  if(/^\d+(\.\d+)?$/.test(s)){
    // Legacy: 4 → "p4". Bỏ qua phần thập phân (vd 4.1 → "p4")
    return 'p'+parseInt(s);
  }
  return s;
}
// Lấy số page (0-6) từ permission key bất kỳ. "p4" → 4, "p4.reconcile" → 4, 4 → 4, "4" → 4
function permKeyToPage(p){
  var s=normalizePermKey(p);
  var m=s.match(/^p(\d+)/);
  return m?parseInt(m[1]):0;
}
// Check user có quyền truy cập 1 key cụ thể (vd "p4.reconcile")
function canAccessKey(key){
  if(!authUser)return true;
  if(userRole==='admin'||!userAllowedPages)return true;
  for(var i=0;i<userAllowedPages.length;i++){
    var s=normalizePermKey(userAllowedPages[i]);
    if(s===key)return true;
    if(key.indexOf(s+'.')===0)return true; // user có quyền cha → cho child
  }
  return false;
}
function canAccessPage(pageNum){
  if(!authUser)return true;
  if(userRole==='admin'||!userAllowedPages)return true;
  var pageKey='p'+pageNum;
  for(var i=0;i<userAllowedPages.length;i++){
    var s=normalizePermKey(userAllowedPages[i]);
    if(s===pageKey)return true; // full page
    if(s.indexOf(pageKey+'.')===0)return true; // có sub → cho vào page
  }
  return false;
}
function isStrictAdmin(){return authUser&&userRole==='admin';}
function isAdmin(){return authUser&&(userRole==='admin'||!userAllowedPages);}
// Trả về staff_id nếu user hiện tại bị khoá vào 1 nhân sự cụ thể (xem được mỗi data của staff đó trong p2.*).
// Admin (hoặc không có entry user_roles) → null = full view.
// Ưu tiên: explicit link (user_roles.staff_id) → fallback fuzzy name match cho mọi non-admin (display_name vs staff name/code).
function getRestrictedStaffId(){
  if(!authUser||isAdmin())return null;
  if(currentUserRoleRecord&&currentUserRoleRecord.staff_id)return currentUserRoleRecord.staff_id;
  // Fuzzy fallback: nếu non-admin user (có entry user_roles) có display_name khớp với 1 staff → restrict
  var s=getCurrentUserStaff();
  if(s)return s.id;
  return null;
}
async function loadAllUserRoles(){
try{var{data}=await sb2.from('user_roles').select('*').order('created_at');allUserRoles=data||[];}catch(e){allUserRoles=[];}}
async function loadAppSettings(){
try{
var{data,error}=await sb2.from('app_settings').select('key,value');
if(error){console.warn('[app_settings]',String(error.message||error));return;}
if(!data)return;
data.forEach(function(r){
if(r.key==='META_BUSINESS_ID'&&r.value)META_BUSINESS_ID=r.value;
if(r.key==='META_GLOBAL_SCOPE_ID'&&r.value)META_GLOBAL_SCOPE_ID=r.value;
});
}catch(e){console.warn('[loadAppSettings]',e.message);}}
async function saveAppSetting(key,value){
if(!needAuth())return false;
var{error}=await sb2.from('app_settings').upsert({key:key,value:value,updated_at:new Date().toISOString()},{onConflict:'key'});
if(error){toast('Lỗi lưu: '+error.message,false);return false;}
return true;}
function sat(i){adminTab=i;expandedAd=null;syncSidebarNav();render();}
function rat(){if(adminTab===0)return a0();if(adminTab===1)return a2();if(adminTab===3){setTimeout(function(){if(typeof loadChatGPTOAuthStatus==='function')loadChatGPTOAuthStatus();},0);return a6Settings();}return'';}

// ═══ A0: TỔNG QUAN ADMIN ═══
function a0(){
var unassigned=adList.filter(function(a){return!getAssign(a.id,td()).length&&a.account_status===1;}).length;
var unpaid=clientList.filter(function(c){return c.payment_status!=='paid'&&c.status==='active';}).length;
var noFb=adList.filter(function(a){return!a.fb_account_id;}).length;
var lastDate=dates.length?dates[dates.length-1]:'—';
var h='<div class="kpi-grid kpi-4">';
h+='<div class="kpi"><div class="kpi-label">Tài khoản chưa gán Nhân sự</div><div class="kpi-value" style="color:'+(unassigned?'var(--red)':'var(--green)')+';">'+unassigned+'</div><div class="kpi-note">Đang hoạt động</div></div>';
h+='<div class="kpi"><div class="kpi-label">Khách hàng chưa thanh toán</div><div class="kpi-value" style="color:'+(unpaid?'var(--amber)':'var(--green)')+';">'+unpaid+'</div></div>';
h+='<div class="kpi"><div class="kpi-label">Tài khoản chưa ghép Meta</div><div class="kpi-value" style="color:'+(noFb?'var(--amber)':'var(--green)')+';">'+noFb+'</div></div>';
h+='<div class="kpi"><div class="kpi-label">Dữ liệu gần nhất</div><div class="kpi-value" style="font-size:16px;">'+lastDate+'</div></div></div>';
h+='<div class="section-title">Thống kê</div><div class="table-wrap"><table><tr><th>Hạng mục</th><th style="text-align:right;">Số lượng</th></tr>';
h+='<tr><td>Nhân sự hoạt động</td><td class="mono" style="text-align:right;">'+staffList.length+'</td></tr>';
h+='<tr><td>Khách hàng</td><td class="mono" style="text-align:right;">'+clientList.filter(function(c){return c.status!=='prospect';}).length+(clientList.filter(function(c){return c.status==='prospect';}).length?' <span style="color:var(--tx3);font-size:11px;">(+'+clientList.filter(function(c){return c.status==='prospect';}).length+' tiềm năng)</span>':'')+'</td></tr>';
h+='<tr><td>Tài khoản Quảng cáo</td><td class="mono" style="text-align:right;">'+adList.length+'</td></tr>';
h+='<tr><td>Lịch phân công</td><td class="mono" style="text-align:right;">'+assignData.length+'</td></tr>';
h+='<tr><td>Ngày có dữ liệu</td><td class="mono" style="text-align:right;">'+dates.length+'</td></tr></table></div>';
return h;}

// ═══ A1: TÀI KHOẢN Quảng cáo (redesign) ═══
function a1(){
var stLabel={1:'Hoạt động',2:'Vô hiệu hoá',3:'Cần thanh toán',7:'Đang xét duyệt'};
var stDot={1:'dot-ok',2:'dot-off',3:'dot-warn',7:'dot-ok'};
// Range data (preset hoặc custom)
var range=getAdViewRange();adViewDate=range.end;
var rangeTotal=spendTotalForRange(range.start,range.end);
var rangeDaysWithData=new Set();dailyData.filter(function(d){return d.report_date>=range.start&&d.report_date<=range.end;}).forEach(function(d){rangeDaysWithData.add(d.report_date);});
var rangeDayCount=daysBetween(range.start,range.end);
var avgPerDay=Math.round(rangeTotal/(rangeDayCount||1));
var activeCount=adList.filter(function(a){return(a.account_status||1)===1;}).length;
var disabledCount=adList.filter(function(a){return(a.account_status||1)===2;}).length;
var unassignedCount=adList.filter(function(a){return!getAssign(a.id,range.end).length&&(a.account_status||1)===1;}).length;
var sharedCount=adList.filter(function(a){return a.is_shared;}).length;
// Build ad rows data for sorting (spend = tổng trong range)
// getAssign đã tự fallback "latest-past" nếu không có active → không cần xử lý thêm
var rows=adList.map(function(a,i){
var ca=getAssign(a.id,range.end);
var ds=spendTotalForAccountRange(a.id,range.start,range.end);
var bal=hasComparableSpendCap(a)?a.spend_cap-a.amount_spent:null;
return{a:a,idx:i,assign:ca,spend:ds,status:a.account_status||1,balance:bal};});
// Sort
if(adSortCol==='spend')rows.sort(function(a,b){return adSortDir==='desc'?b.spend-a.spend:a.spend-b.spend;});
else if(adSortCol==='name')rows.sort(function(a,b){return adSortDir==='asc'?a.a.account_name.localeCompare(b.a.account_name):b.a.account_name.localeCompare(a.a.account_name);});
else if(adSortCol==='status')rows.sort(function(a,b){return adSortDir==='asc'?a.status-b.status:b.status-a.status;});
else if(adSortCol==='balance')rows.sort(function(a,b){var ba=a.balance===null?999999999999:a.balance;var bb=b.balance===null?999999999999:b.balance;return adSortDir==='asc'?ba-bb:bb-ba;});
var maxSpend=Math.max.apply(null,rows.map(function(r){return r.spend;}))||1;
// KPI cards — theo range đang chọn
var h='<div class="sum-grid">';
h+='<div class="sum-card"><div class="sum-label">Chi tiêu '+esc(range.short)+'</div><div class="sum-val" style="color:var(--teal);">'+ff(rangeTotal)+'</div><div class="sum-note">'+rows.filter(function(r){return r.spend>0;}).length+' tài khoản có chi tiêu · '+rangeDaysWithData.size+'/'+rangeDayCount+' ngày có data</div></div>';
h+='<div class="sum-card"><div class="sum-label">Trung bình/ngày</div><div class="sum-val" style="color:var(--teal);">'+fm(avgPerDay)+'</div><div class="sum-note">'+rangeDayCount+' ngày — '+esc(range.label)+'</div></div>';
h+='<div class="sum-card"><div class="sum-label">Hoạt động</div><div class="sum-val">'+activeCount+'<span style="font-size:13px;color:var(--tx3);font-weight:400;">/'+adList.length+'</span></div><div class="sum-note">'+disabledCount+' vô hiệu · '+unassignedCount+' chưa gán</div></div>';
h+='<div class="sum-card"><div class="sum-label">Dùng chung</div><div class="sum-val" style="color:var(--purple);">'+sharedCount+'</div><div class="sum-note">Tài khoản nhiều Nhân sự/Khách hàng</div></div></div>';
// Toolbar — Row 1: Period chips + (custom range nếu chọn) + actions
var pchip=function(mode,label){return '<button class="ad-period-chip'+(adViewMode===mode?' active':'')+'" onclick="setAdViewMode(\''+mode+'\')">'+label+'</button>';};
h+='<div class="ad-toolbar ad-toolbar-period">';
h+='<div class="ad-toolbar-main">';
h+='<div class="ad-period">'+pchip('today','Hôm nay')+pchip('yesterday','Hôm qua')+pchip('this_month','Tháng này')+pchip('last_month','Tháng trước')+pchip('custom','Tùy chỉnh')+'</div>';
if(adViewMode==='custom'){
  h+='<div class="ad-range-custom"><input type="date" value="'+(adRangeStart||td())+'" onchange="setAdCustomRange(\'start\',this.value)"><span class="arrow">→</span><input type="date" value="'+(adRangeEnd||td())+'" onchange="setAdCustomRange(\'end\',this.value)"></div>';
}
h+='</div>';
var syncLabel=(range.start===range.end)?('Đồng bộ '+fd(range.end)):('Đồng bộ '+fd(range.start)+' → '+fd(range.end)+' · '+rangeDayCount+' ngày');
h+='<div class="ad-toolbar-actions"><button class="ad-toolbar-note ad-toolbar-note-btn" onclick="syncCurrentRange(this)" title="Đã tự đồng bộ khi mở trang. Bấm để chốt lại toàn khoảng cho khớp Meta."><span class="ad-toolbar-note-dot"></span><span class="sync-btn-label">'+esc(syncLabel)+'</span></button><button class="btn btn-sm btn-add-account" onclick="toggleAddTk()"><span class="btn-add-account-plus">+</span><span>Thêm tài khoản</span></button></div></div>';
// Toolbar — Row 2: Search + filters + count
h+='<div class="ad-toolbar" style="margin-top:-4px;">';
h+='<div class="ad-toolbar-main">';
h+='<input type="text" id="search-ad" placeholder="Tìm tài khoản, khách hàng..." value="'+esc(adSearchText)+'" oninput="filterAdTable()" class="fi ad-toolbar-search">';
h+='<select id="filter-staff" onchange="filterAdTable()" class="fi ad-toolbar-filter"><option value="">Tất cả nhân viên</option>';
staffList.forEach(function(s){h+='<option value="'+s.id+'"'+(s.id===adFilterStaff?' selected':'')+'>'+esc(s.short_name)+'</option>';});
h+='<option value="none"'+(adFilterStaff==='none'?' selected':'')+'>— Chưa gán —</option></select>';
h+='<select id="filter-client" onchange="filterAdTable()" class="fi ad-toolbar-filter"><option value="">Tất cả khách hàng</option>';
clientList.forEach(function(c){h+='<option value="'+c.id+'"'+(c.id===adFilterClient?' selected':'')+'>'+esc(c.name)+'</option>';});
h+='<option value="none"'+(adFilterClient==='none'?' selected':'')+'>— Chưa phân loại —</option></select>';
h+='<select id="filter-status" onchange="filterAdTable()" class="fi ad-toolbar-filter"><option value="">Tất cả tình trạng</option><option value="1"'+(adFilterStatus==='1'?' selected':'')+'>● Hoạt động</option><option value="2"'+(adFilterStatus==='2'?' selected':'')+'>● Vô hiệu hoá</option><option value="3"'+(adFilterStatus==='3'?' selected':'')+'>● Cần thanh toán</option></select>';
h+='<span class="ad-toolbar-count" id="filter-count">'+adList.length+'/'+adList.length+' tài khoản</span></div>';
h+='</div>';
// Add Tài khoản form (hidden by default)
h+='<div id="add-tk-form" style="display:none;margin-bottom:12px;"><div class="form-card" style="margin-bottom:0;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><span style="font-weight:500;font-size:14px;">Thêm tài khoản quảng cáo</span><span style="font-size:18px;cursor:pointer;color:var(--tx3);" onclick="toggleAddTk()">×</span></div>';
h+='<div class="form-row"><div class="form-group"><label>Tên tài khoản</label><input type="text" id="new-tk-name" placeholder="VD: Tài khoản NBNB - 1234"></div><div class="form-group"><label>FB Account ID (bỏ trống = Tài khoản ngoài)</label><input type="text" id="new-tk-fbid" placeholder="act_123456789"></div></div>';
h+='<div class="form-row"><div class="form-group"><label>Khách hàng</label>'+
  searchableSelect({id:'new-tk-client',options:clientList.map(function(c2){return{value:c2.id,label:c2.name};}),placeholder:'— Chọn Khách hàng —'})+
  '</div><div class="form-group"><label>Nhân sự phụ trách</label><select id="new-tk-staff"><option value="">— Chọn Nhân sự —</option>';
staffList.forEach(function(s2){h+='<option value="'+s2.id+'">'+esc(s2.short_name)+'</option>';});
h+='</select></div><div class="form-group"><label>Loại</label><select id="new-tk-shared"><option value="false">Riêng (1 Nhân sự)</option><option value="true">Dùng chung (nhiều Nhân sự)</option></select></div></div>';
h+='<div style="display:flex;gap:8px;align-items:center;"><button class="btn btn-primary" onclick="saveNewTk(this)">+ Thêm Tài khoản</button><span style="font-size:11px;color:var(--tx3);">Bỏ trống FB ID = tài khoản ngoài Business Manager, nhập doanh số thủ công</span></div></div></div>';
h+='<div class="active-chips" id="active-chips"></div>';
// Table
var sa=function(col){return 'onclick="sortAd(\''+col+'\')"';};
var si=function(col){return adSortCol===col?'<span class="sort-arrow on">'+(adSortDir==='desc'?'▼':'▲')+'</span>':'<span class="sort-arrow">▼</span>';};
var th=function(label,sort,align){return '<th class="'+(sort?'sort-th':'')+'" '+(sort?sa(sort):'')+(align?' style="text-align:'+align+';"':'')+'><span class="th-label">'+label+(sort?' '+si(sort):'')+'</span></th>';};
h+='<div class="table-wrap"><table id="ad-table"><colgroup><col class="col-chk" data-col="chk"><col class="col-account" data-col="account"><col class="col-staff" data-col="staff"><col class="col-client" data-col="client"><col class="col-spend" data-col="spend"><col class="col-cap" data-col="cap"><col class="col-price" data-col="price"></colgroup><thead><tr>';
h+='<th><input type="checkbox" onchange="toggleCheckAll(this.checked)"></th>';
h+=th('Tài khoản','name');
h+=th('Nhân sự');
h+=th('Khách hàng');
h+=th(range.colHeader,'spend','right');
h+=th('Ngưỡng chi tiêu','balance','right');
h+=th('Giá tối đa',null,'right');
h+='</tr></thead><tbody>';
rows.forEach(function(row){
var a=row.a,ca=row.assign,ds=row.spend,status=row.status;
var hasAssign=ca.length>0;
var staffStrs=ca.map(function(x){var s=allStaff.find(function(ss){return ss.id===x.staff_id;});return s?s.id:'';});
var clientStrs=ca.map(function(x){return x.client_id||'';});
var allClientIds=clientStrs.concat(a.client_id?[a.client_id]:[]);
var searchStaffNames=ca.map(function(x){var s=allStaff.find(function(ss){return ss.id===x.staff_id;});return s?s.short_name:'';}).join(' ');
var searchClientNames=ca.map(function(x){var c2=clientList.find(function(cc){return cc.id===x.client_id;});return c2?c2.name:'';}).join(' ');
var directClient=a.client_id?clientList.find(function(c2){return c2.id===a.client_id;}):null;
var searchHay=[a.account_name,a.fb_account_id,searchStaffNames,searchClientNames,directClient?directClient.name:''].join(' ').toLowerCase();
h+='<tr class="ad-row'+(a.is_shared?' shared-row':'')+'" data-staff="'+staffStrs.join(',')+'" data-client="'+allClientIds.join(',')+'" data-status="'+status+'" data-name="'+esc(searchHay)+'" data-spend="'+ds+'" style="'+(status===2?'opacity:.3;':(!hasAssign&&status===1?'opacity:.6;':''))+'">';
h+='<td><input type="checkbox" class="ad-check" value="'+a.id+'" aria-label="Chọn Tài khoản '+esc(a.account_name||a.fb_account_id||'')+'"></td>';
h+='<td><div class="ad-account-cell"><div class="ad-account-top"><span class="state-pill '+(status===2?'off':(status===3?'warn':''))+'"><span class="dot '+(stDot[status]||'dot-ok')+'"></span>'+(stLabel[status]||'—')+'</span><div class="ad-account-name" onclick="toggleExpand(\''+a.id+'\')">'+esc(a.account_name)+'</div>'+(a.fb_account_id?'<button class="kh-edit-btn" onclick="event.stopPropagation();editAdAccountName(\''+a.id+'\')" title="Đổi tên TKQC trên Meta" aria-label="Đổi tên TKQC"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg></button><a href="https://adsmanager.facebook.com/adsmanager/manage/campaigns?act='+a.fb_account_id.replace('act_','')+'" target="_blank" rel="noopener" title="Mở Meta Ads Manager" style="flex-shrink:0;width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;border-radius:6px;background:var(--blue-bg);color:var(--blue);text-decoration:none;font-size:11px;transition:all .15s;" onmouseover="this.style.background=\'var(--blue)\';this.style.color=\'#fff\';" onmouseout="this.style.background=\'var(--blue-bg)\';this.style.color=\'var(--blue)\';">↗</a>':'')+'</div><div class="ad-account-meta">'+(a.fb_account_id?esc(a.fb_account_id):'<span style="color:var(--amber);">chưa ghép Meta</span>')+'<span class="account-type-pill '+(a.is_shared?'shared':'')+'" onclick="toggleShared(\''+a.id+'\','+!a.is_shared+')" title="Bấm để đổi loại">'+(a.is_shared?'Dùng chung':'Riêng')+'</span></div></div></td>';
// Staff column
h+='<td class="ad-select-cell">';
if(a.is_shared){
var sNames=ca.map(function(x){var s=allStaff.find(function(ss){return ss.id===x.staff_id;});return s?s.short_name:'?';});
var cNames=ca.map(function(x){var c2=clientList.find(function(cc){return cc.id===x.client_id;});return c2?c2.name:'?';});
h+='<div class="ad-shared-chips">';
var uniqS=[...new Set(sNames)];
if(uniqS.length){uniqS.slice(0,2).forEach(function(n){h+='<span class="ad-shared-chip">'+esc(n)+'</span>';});if(uniqS.length>2)h+='<span class="ad-shared-chip empty">+'+(uniqS.length-2)+'</span>';}else h+='<span class="ad-shared-chip empty">tự động</span>';
h+='</div>';
}else{
var curStaffId=hasAssign?ca[0].staff_id:'';
var curClientId=hasAssign?ca[0].client_id:(a.client_id||'');
h+='<select class="fi" onchange="quickAssignStaff(\''+a.id+'\',this.value)"><option value="">— Chọn Nhân sự —</option>';
staffList.forEach(function(s2){h+='<option value="'+s2.id+'"'+(s2.id===curStaffId?' selected':'')+'>'+s2.short_name+'</option>';});
h+='</select>';
}
h+='</td>';
// Client column
h+='<td class="ad-select-cell">';
if(a.is_shared){
h+='<div class="ad-shared-chips">';
var uniqC=[...new Set(cNames)];
if(uniqC.length){uniqC.slice(0,2).forEach(function(n){h+='<span class="ad-shared-chip client">'+esc(n)+'</span>';});if(uniqC.length>2)h+='<span class="ad-shared-chip empty">+'+(uniqC.length-2)+'</span>';}else h+='<span class="ad-shared-chip empty">tự động</span>';
h+='</div>';
}else{
h+=searchableSelect({options:clientList.map(function(c2){return{value:c2.id,label:c2.name};}),value:curClientId,placeholder:'— Chọn Khách hàng —',onChange:(function(adId){return function(v){quickAssignClient(adId,v);};})(a.id)});
}
h+='</td>';
// Spend column with bar
var pct=maxSpend>0?Math.round(ds/maxSpend*100):0;
h+='<td style="padding-right:16px;">'+(ds?'<div style="text-align:right;"><div class="spend-num">'+ff(ds)+'</div><div class="spend-bar"><div class="spend-fill" style="width:'+pct+'%;"></div></div></div>':'<div class="spend-zero">—</div>')+'</td>';
// Spend cap cell
if(a.spend_cap){
if(hasComparableSpendCap(a)){
var bal=a.spend_cap-(a.amount_spent||0),balPct=Math.round((a.amount_spent||0)/a.spend_cap*100),balCls=balPct>80?'bal-danger':(balPct>50?'bal-warn':'bal-ok'),barCls=balPct>80?'bal-used-danger':(balPct>50?'bal-used-warn':'bal-used-ok');
h+='<td class="spend-cap-cell" onclick="event.stopPropagation();editSpendCap(\''+a.id+'\')" title="Bấm để đổi ngưỡng trên Meta" style="cursor:pointer;"><div class="bal-val '+balCls+'">'+fm(bal)+'</div><div class="bal-track"><div class="bal-used '+barCls+'" style="width:'+Math.min(balPct,100)+'%;"></div></div><div class="bal-sub">'+fm(a.amount_spent||0)+'/'+fm(a.spend_cap)+'</div></td>';
}else{
h+='<td class="spend-cap-cell" onclick="event.stopPropagation();editSpendCap(\''+a.id+'\')" title="Bấm để đổi ngưỡng trên Meta" style="cursor:pointer;"><div class="bal-val bal-ok">'+fm(a.spend_cap)+'</div><div class="bal-track"><div class="bal-used bal-used-ok" style="width:0%;"></div></div><div class="bal-sub">Ngưỡng Meta</div></td>';
}
}else{h+='<td class="spend-cap-cell" onclick="event.stopPropagation();editSpendCap(\''+a.id+'\')" title="Bấm để đặt ngưỡng trên Meta" style="cursor:pointer;"><div class="bal-val bal-ok">—</div><div class="bal-track"><div class="bal-used" style="width:0%;"></div></div><div class="bal-sub">Không giới hạn</div></td>';}
// Max cost combined cell (Kết quả tối đa)
h+='<td class="td-price-pair"><div class="price-pair">';
h+='<div class="price-tag" onclick="editMaxMess(\''+a.id+'\','+(a.max_mess_cost||0)+')" title="Giá Messenger tối đa — bấm để sửa"><span class="price-tag-label">Mess</span>';
if(a.max_mess_cost){h+='<span class="price-tag-val">'+fm(a.max_mess_cost)+'</span>';}else{h+='<span class="price-tag-unset">—</span>';}
h+='</div>';
h+='<div class="price-tag" onclick="editMaxLead(\''+a.id+'\','+(a.max_lead_cost||0)+')" title="Giá form tối đa — bấm để sửa"><span class="price-tag-label form">Form</span>';
if(a.max_lead_cost){h+='<span class="price-tag-val lead">'+fm(a.max_lead_cost)+'</span>';}else{h+='<span class="price-tag-unset">—</span>';}
h+='</div></div></td>';
h+='</tr>';
// Expandable assignment panel
if(expandedAd===a.id){
h+='<tr><td colspan="7" style="padding:4px 0;"><div class="assign-panel">';
// Manual spend input section
var curSpend=spendTotalForAccountDate(a.id,adViewDate);
var isExternal=!a.fb_account_id;
h+='<div style="padding:12px 18px;border-bottom:1px solid var(--bd1);display:flex;align-items:center;gap:12px;flex-wrap:wrap;">';
h+='<span style="font-size:12px;color:var(--tx2);">Chi tiêu ngày '+fd(adViewDate)+':</span>';
h+='<span style="font-size:16px;font-weight:600;color:var(--teal);">'+ff(curSpend)+'</span>';
if(isExternal){h+='<span class="badge b-amber" style="font-size:10px;">Tài khoản ngoài Business Manager</span>';}
h+='<div style="display:flex;gap:6px;align-items:center;margin-left:auto;">';
h+='<input type="number" id="manual-spend-'+a.id+'" placeholder="Nhập số tiền" class="fi" style="width:140px;font-size:12px;text-align:right;" value="">';
h+='<button class="btn btn-green btn-sm" onclick="saveManualSpend(\''+a.id+'\')">Lưu</button></div></div>';
if(a.is_shared){
// Shared account: 2 tabs
var mySpends=dailyData.filter(function(dd){return sameId(dd.ad_account_id,a.id)&&dd.report_date===adViewDate&&dd.staff_id;});
var totalSharedSpend=mySpends.reduce(function(t,dd){return t+moneyVal(dd.spend_amount);},0);
// Group by staff
var staffSpends={};mySpends.forEach(function(dd){
if(!staffSpends[dd.staff_id])staffSpends[dd.staff_id]={total:0,clients:{}};
staffSpends[dd.staff_id].total+=moneyVal(dd.spend_amount);
var cid=dd.matched_client_id||'unknown';
if(!staffSpends[dd.staff_id].clients[cid])staffSpends[dd.staff_id].clients[cid]=0;
staffSpends[dd.staff_id].clients[cid]+=moneyVal(dd.spend_amount);});
h+='<div class="xp-head"><span style="font-weight:500;font-size:14px;color:var(--purple);">'+esc(a.account_name)+' — Chi tiết ngày '+fd(adViewDate)+'</span><span style="font-size:12px;color:var(--tx3);">Tổng: '+ff(totalSharedSpend)+'</span></div>';
h+='<div class="xp-tabs"><div class="xp-tab'+(expandTabIdx===0?' on':'')+'" onclick="switchExpandTab(0)">Chi tiết Nhân sự</div><div class="xp-tab'+(expandTabIdx===1?' on':'')+'" onclick="switchExpandTab(1)">Phân công</div></div>';
if(expandTabIdx===0){
// Tab: Chi tiết Nhân sự
var staffIds=Object.keys(staffSpends);
h+='<div class="xp-body"><div class="sc-grid">';
staffIds.forEach(function(sid){
var sObj=allStaff.find(function(x){return x.id===sid;});
var col=sObj?sc(sObj.color_code):{c:'var(--purple)',bg:'var(--purple-bg)',tx:'var(--purple-tx)'};
var sSpend=staffSpends[sid];
var pct=totalSharedSpend>0?Math.round(sSpend.total/totalSharedSpend*100):0;
var cKeys=Object.keys(sSpend.clients);
h+='<div class="sc-card"><div class="sc-head2"><div class="avatar" style="background:'+col.bg+';color:'+col.tx+';">'+(sObj?esc(sObj.avatar_initials):'?')+'</div><div><div style="font-weight:500;font-size:13px;">'+(sObj?esc(sObj.short_name):'—')+'</div><div style="font-size:11px;color:var(--tx3);">'+cKeys.length+' khách hàng</div></div></div>';
h+='<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--tx3);margin-bottom:2px;"><span>Chi tiêu ngày '+fd(adViewDate)+'</span><span style="color:'+col.c+';">'+pct+'% tổng Tài khoản</span></div>';
h+='<div class="sc-spend2" style="color:'+col.c+';">'+ff(sSpend.total)+'</div>';
h+='<div class="sc-bar2"><div class="sc-fill2" style="width:'+pct+'%;background:'+col.c+';"></div></div>';
cKeys.forEach(function(cid){
var cObj=clientList.find(function(x){return x.id===cid;});
var cVal=sSpend.clients[cid];
var cPct=sSpend.total>0?Math.round(cVal/sSpend.total*100):0;
h+='<div class="sc-cl"><span style="color:var(--tx2);">'+(cObj?esc(cObj.name):'Chưa xác định')+'</span><span><span style="font-weight:500;font-variant-numeric:tabular-nums;">'+ff(cVal)+'</span><span style="font-size:11px;color:var(--tx3);margin-left:6px;">'+cPct+'%</span></span></div>';});
h+='</div>';});
if(!staffIds.length)h+='<div style="grid-column:1/-1;font-size:12px;color:var(--tx3);padding:12px 0;">Chưa có dữ liệu chi tiêu cho ngày này. Hãy đồng bộ trước.</div>';
h+='</div></div>';
// Footer
h+='<div class="xp-footer"><span style="color:var(--tx2);">Tỷ trọng</span><div class="xp-minibar">';
staffIds.forEach(function(sid){var sObj=allStaff.find(function(x){return x.id===sid;});var col=sObj?sc(sObj.color_code):{c:'var(--purple)'};var pct=totalSharedSpend>0?Math.round(staffSpends[sid].total/totalSharedSpend*100):0;h+='<div style="width:'+pct+'%;background:'+col.c+';"></div>';});
h+='</div><span style="display:flex;gap:10px;font-size:11px;color:var(--tx3);">';
staffIds.forEach(function(sid){var sObj=allStaff.find(function(x){return x.id===sid;});var col=sObj?sc(sObj.color_code):{c:'var(--purple)'};var pct=totalSharedSpend>0?Math.round(staffSpends[sid].total/totalSharedSpend*100):0;h+='<span><span style="width:6px;height:6px;border-radius:50%;background:'+col.c+';display:inline-block;margin-right:2px;"></span>'+(sObj?esc(sObj.short_name):'?')+' '+pct+'%</span>';});
h+='</span><span style="font-size:15px;font-weight:600;color:var(--teal);font-variant-numeric:tabular-nums;">'+ff(totalSharedSpend)+'</span></div>';
}else{
// Tab: Phân công
h+='<div class="xp-body">';
h+='<div style="display:flex;justify-content:flex-end;margin-bottom:8px;"><button class="btn btn-primary btn-sm" onclick="addAssignment(\''+a.id+'\')">+ Thêm khoảng</button></div>';
var myA=assignData.filter(function(x){return x.ad_account_id===a.id;}).sort(function(a2,b2){return a2.start_date>b2.start_date?-1:1;});
if(myA.length){
h+='<div class="assign-row" style="font-size:10px;color:var(--tx3);border-bottom:1px solid var(--bd2);"><span>Nhân sự</span><span>Khách hàng</span><span>Từ ngày</span><span>Đến ngày</span><span></span></div>';
myA.forEach(function(ag){
var sn=allStaff.find(function(x){return x.id===ag.staff_id;});
var cn=clientList.find(function(x){return x.id===ag.client_id;});
var isAct=!ag.end_date||ag.end_date>=td();
h+='<div class="assign-row" style="'+(isAct?'':'opacity:.5;')+'">';
h+='<span style="display:flex;align-items:center;gap:4px;">'+(sn?'<div class="avatar" style="width:18px;height:18px;font-size:8px;background:'+sc(sn.color_code).bg+';color:'+sc(sn.color_code).tx+';">'+esc(sn.avatar_initials)+'</div>'+esc(sn.short_name):'—')+'</span>';
h+='<span>'+(cn?esc(cn.name):'—')+'</span>';
h+='<span><input type="date" class="fi" style="width:120px;font-size:11px;padding:3px 6px;text-align:center;" value="'+ag.start_date+'" onchange="updateAssignDate(\''+ag.id+'\',\'start_date\',this.value)"></span>';
h+='<span>'+(ag.end_date?'<input type="date" class="fi" style="width:120px;font-size:11px;padding:3px 6px;text-align:center;" value="'+ag.end_date+'" onchange="updateAssignDate(\''+ag.id+'\',\'end_date\',this.value)" title="Bỏ trống = đang chạy">':'<input type="date" class="fi" style="width:120px;font-size:11px;padding:3px 6px;text-align:center;border-color:var(--green);color:var(--green-tx);background:var(--green-bg);" value="" onchange="updateAssignDate(\''+ag.id+'\',\'end_date\',this.value)" title="Đang chạy · chọn ngày để đặt Đến ngày">')+'</span>';
h+='<span><button class="btn btn-red btn-sm" style="padding:2px 6px;" onclick="deleteAssign(\''+ag.id+'\')">Xóa</button></span></div>';});}
else h+='<div style="font-size:12px;color:var(--tx3);padding:8px 0;">Chưa có phân công — bấm "+ Thêm khoảng"</div>';
h+='<div style="font-size:11px;color:var(--tx3);padding:8px 18px;background:var(--bg2);border-top:1px solid var(--bd1);display:flex;align-items:center;gap:6px;"><span style="width:14px;height:14px;border-radius:50%;background:var(--blue-bg);color:var(--blue-tx);display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:500;">i</span>Sửa ngày trực tiếp → tự động lưu. Bỏ trống Đến ngày = đang chạy.</div>';
h+='</div>';}
}else{
// Non-shared: simple assignment panel
h+='<div class="xp-head"><span style="font-weight:500;font-size:13px;">Lịch sử phân công — '+esc(a.account_name)+'</span><button class="btn btn-primary btn-sm" onclick="addAssignment(\''+a.id+'\')">+ Thêm khoảng</button></div>';
h+='<div class="xp-body">';
var myA=assignData.filter(function(x){return x.ad_account_id===a.id;}).sort(function(a2,b2){return a2.start_date>b2.start_date?-1:1;});
if(myA.length){
h+='<div class="assign-row" style="font-size:10px;color:var(--tx3);border-bottom:1px solid var(--bd2);"><span>Nhân sự</span><span>Khách hàng</span><span>Từ ngày</span><span>Đến ngày</span><span></span></div>';
myA.forEach(function(ag){
var sn=allStaff.find(function(x){return x.id===ag.staff_id;});
var cn=clientList.find(function(x){return x.id===ag.client_id;});
var isAct=!ag.end_date||ag.end_date>=td();
h+='<div class="assign-row" style="'+(isAct?'':'opacity:.5;')+'">';
h+='<span style="display:flex;align-items:center;gap:4px;">'+(sn?'<div class="avatar" style="width:18px;height:18px;font-size:8px;background:'+sc(sn.color_code).bg+';color:'+sc(sn.color_code).tx+';">'+esc(sn.avatar_initials)+'</div>'+esc(sn.short_name):'—')+'</span>';
h+='<span>'+(cn?esc(cn.name):'—')+'</span>';
h+='<span><input type="date" class="fi" style="width:120px;font-size:11px;padding:3px 6px;text-align:center;" value="'+ag.start_date+'" onchange="updateAssignDate(\''+ag.id+'\',\'start_date\',this.value)"></span>';
h+='<span>'+(ag.end_date?'<input type="date" class="fi" style="width:120px;font-size:11px;padding:3px 6px;text-align:center;" value="'+ag.end_date+'" onchange="updateAssignDate(\''+ag.id+'\',\'end_date\',this.value)" title="Bỏ trống = đang chạy">':'<input type="date" class="fi" style="width:120px;font-size:11px;padding:3px 6px;text-align:center;border-color:var(--green);color:var(--green-tx);background:var(--green-bg);" value="" onchange="updateAssignDate(\''+ag.id+'\',\'end_date\',this.value)" title="Đang chạy · chọn ngày để đặt Đến ngày">')+'</span>';
h+='<span><button class="btn btn-red btn-sm" style="padding:2px 6px;" onclick="deleteAssign(\''+ag.id+'\')">Xóa</button></span></div>';});}
else h+='<div style="font-size:12px;color:var(--tx3);padding:8px 0;">Chưa có phân công — bấm "+ Thêm khoảng"</div>';
h+='<div style="font-size:11px;color:var(--tx3);padding:8px 18px;background:var(--bg2);border-top:1px solid var(--bd1);display:flex;align-items:center;gap:6px;"><span style="width:14px;height:14px;border-radius:50%;background:var(--blue-bg);color:var(--blue-tx);display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:500;">i</span>Sửa ngày trực tiếp → tự động lưu. Bỏ trống Đến ngày = đang chạy.</div>';
h+='</div>';}
h+='</div></td></tr>';}
});
// Footer row
h+='</tbody><tfoot><tr class="foot-row"><td></td><td colspan="3" style="font-size:12px;color:var(--tx2);">'+adList.length+' tài khoản</td>';
h+='<td style="padding-right:16px;"><div style="text-align:right;"><div class="spend-num" style="font-size:15px;color:var(--teal-tx);">'+ff(rangeTotal)+'</div></div></td><td></td><td></td></tr></tfoot></table></div>';
h+='<div style="display:flex;gap:8px;margin-top:10px;"><button class="btn btn-red btn-sm" onclick="deleteCheckedAd()">Xóa đã chọn</button></div>';
return h;}

// ═══ FILTER & SORT ═══
function restoreAdFilters(){
var search=document.getElementById('search-ad'),staff=document.getElementById('filter-staff'),client=document.getElementById('filter-client'),status=document.getElementById('filter-status');
if(search)search.value=adSearchText;
if(staff)staff.value=adFilterStaff;
if(client)client.value=adFilterClient;
if(status)status.value=adFilterStatus;
filterAdTable(true);
}
function filterAdTable(){
var sfEl=document.getElementById('filter-staff'),scEl=document.getElementById('filter-client'),ssEl=document.getElementById('filter-status'),sqEl=document.getElementById('search-ad');
if(!sfEl||!scEl||!ssEl||!sqEl)return;
var sf=sfEl.value,sc2=scEl.value,ss=ssEl.value,sq=(sqEl.value||'').toLowerCase();
adFilterStaff=sf;adFilterClient=sc2;adFilterStatus=ss;adSearchText=sqEl.value||'';
var shown=0,total=0;
document.querySelectorAll('.ad-row').forEach(function(r){
total++;
var matchStaff=!sf||(sf==='none'?!r.dataset.staff:r.dataset.staff.indexOf(sf)>=0);
var matchClient=!sc2||(sc2==='none'?r.dataset.client==='':r.dataset.client.indexOf(sc2)>=0);
var matchStatus=!ss||r.dataset.status===ss;
var matchSearch=!sq||r.dataset.name.indexOf(sq)>=0;
var show=matchStaff&&matchClient&&matchStatus&&matchSearch;
r.style.display=show?'':'none';
if(show)shown++;});
var fc=document.getElementById('filter-count');if(fc)fc.textContent=shown+'/'+total+' tài khoản';
// Active chips
var chips=[];
if(sf){var sel=document.getElementById('filter-staff');chips.push(sel.options[sel.selectedIndex].text);}
if(sc2){var sel2=document.getElementById('filter-client');chips.push(sel2.options[sel2.selectedIndex].text);}
if(ss){var sel3=document.getElementById('filter-status');chips.push(sel3.options[sel3.selectedIndex].text);}
var ce=document.getElementById('active-chips');
if(ce)ce.innerHTML=chips.map(function(c){return'<span class="chip">'+c+' <span class="x" onclick="clearFilters()">×</span></span>';}).join('');}
function clearFilters(){adSearchText='';adFilterStaff='';adFilterClient='';adFilterStatus='';var s=document.getElementById('search-ad');if(s)s.value='';document.getElementById('filter-staff').value='';document.getElementById('filter-client').value='';document.getElementById('filter-status').value='';filterAdTable();}
function sortAd(col){if(adSortCol===col)adSortDir=adSortDir==='desc'?'asc':'desc';else{adSortCol=col;adSortDir=col==='spend'?'desc':'asc';}if(curPage===1){render();return;}var el=document.getElementById('ac');if(el)el.innerHTML=rat();}
function toggleCheckAll(v){document.querySelectorAll('.ad-check').forEach(function(c){c.checked=v;});}
function toggleAddTk(){var f=document.getElementById('add-tk-form');if(f)f.style.display=f.style.display==='none'?'block':'none';}
async function saveManualSpend(adId){
if(!needAuth())return;
var el=document.getElementById('manual-spend-'+adId);
var amount=parseInt(el.value)||0;
if(!el.value.trim()){toast('Vui lòng nhập số tiền giao dịch.',false);return;}
await sb2.from('daily_spend').delete().eq('ad_account_id',adId).eq('report_date',adViewDate).is('staff_id',null);
var r=await sb2.from('daily_spend').insert({ad_account_id:adId,report_date:adViewDate,spend_amount:amount});
if(!r.error){toast('Đã lưu chi tiêu: '+ff(amount),true);await loadAll();if(curPage===1){render();}else{var elAc=document.getElementById('ac');if(elAc)elAc.innerHTML=rat();}}
else toast('Lỗi: '+r.error.message,false);}
async function saveNewTk(btn){
if(!needAuth())return;
btn.disabled=true;
var name=document.getElementById('new-tk-name').value.trim();
var fbid=document.getElementById('new-tk-fbid').value.trim()||null;
var clientId=document.getElementById('new-tk-client').value||null;
var staffId=document.getElementById('new-tk-staff').value||null;
var isShared=document.getElementById('new-tk-shared').value==='true';
if(!name){toast('Vui lòng nhập tên tài khoản quảng cáo.',false);btn.disabled=false;return;}
// Chống tạo trùng fb_account_id — kiểm tra local trước, rồi double-check DB
if(fbid){
var dupLocal=adList.find(function(a){return a.fb_account_id===fbid;});
if(dupLocal){toast('Tài khoản đã tồn tại: '+dupLocal.account_name+' ('+fbid+')',false);btn.disabled=false;return;}
var{data:dupDb}=await sb2.from('ad_account').select('id,account_name').eq('fb_account_id',fbid).maybeSingle();
if(dupDb){toast('DB đã có tài khoản với FB ID này: '+dupDb.account_name,false);btn.disabled=false;return;}
}
var ins={account_name:name,fb_account_id:fbid,client_id:clientId,is_shared:isShared,account_status:1};
var r=await sb2.from('ad_account').insert(ins).select('id').single();
btn.disabled=false;
if(r.error){toast('Lỗi: '+r.error.message,false);return;}
if(staffId&&r.data){
await _insertAssignment(_assignSnapshot(r.data.id,{ad_account_id:r.data.id,staff_id:staffId,client_id:clientId,start_date:td(),end_date:null}));}
toast('Đã thêm Tài khoản: '+name,true);
document.getElementById('new-tk-name').value='';document.getElementById('new-tk-fbid').value='';
toggleAddTk();await loadAll();stayPage();}async function quickAssignStaff(adId,staffId){
if(!needAuth())return;
if(!staffId){toast('Vui lòng chọn nhân sự phụ trách.',false);return;}
var existing=assignData.find(function(a){return a.ad_account_id===adId&&a.start_date<=adViewDate&&(!a.end_date||a.end_date>=adViewDate);});
if(existing){
var r=await sb2.from('assignment').update({staff_id:staffId}).eq('id',existing.id);
if(!r.error){toast('Đã cập nhật Nhân sự',true);await loadAll();stayPage();}else toast('Lỗi',false);
}else{
var ad=adList.find(function(a){return a.id===adId;});
var r2=await _insertAssignment(_assignSnapshot(adId,{ad_account_id:adId,staff_id:staffId,client_id:ad?ad.client_id:null,start_date:adViewDate,end_date:null}));
if(!r2.error){toast('Đã gán Nhân sự',true);await loadAll();stayPage();}else toast('Lỗi: '+r2.error.message,false);}}
async function quickAssignClient(adId,clientId){
if(!needAuth())return;
if(!clientId){return;}
var existing=assignData.find(function(a){return a.ad_account_id===adId&&a.start_date<=adViewDate&&(!a.end_date||a.end_date>=adViewDate);});
if(existing){
var r=await sb2.from('assignment').update({client_id:clientId}).eq('id',existing.id);
if(!r.error){toast('Đã cập nhật Khách hàng',true);await loadAll();stayPage();}else toast('Lỗi',false);
}else{
var r2=await _insertAssignment(_assignSnapshot(adId,{ad_account_id:adId,staff_id:null,client_id:clientId,start_date:adViewDate,end_date:null}));
if(!r2.error){toast('Đã gán Khách hàng',true);await loadAll();stayPage();}else toast('Lỗi: '+r2.error.message,false);}
// Also update ad_account.client_id
await sb2.from('ad_account').update({client_id:clientId}).eq('id',adId);}
function toggleExpand(id){expandTabIdx=0;expandedAd=(expandedAd===id)?null:id;if(curPage===1){render();}else{var el=document.getElementById('ac');if(el)el.innerHTML=rat();}}
function switchExpandTab(i){expandTabIdx=i;if(curPage===1){render();}else{var el=document.getElementById('ac');if(el)el.innerHTML=rat();}}
function stayPage(){if(curPage===1){render();}else{pg(5);}}
async function toggleShared(id,val){if(!needAuth())return;var r=await sb2.from('ad_account').update({is_shared:val}).eq('id',id);if(!r.error){toast(val?'Đánh dấu dùng chung':'Đánh dấu riêng',true);await loadAll();stayPage();}else toast('Lỗi',false);}
function editMaxMess(adId,curVal){
var v=prompt('Nhập giá Messenger tối đa (VNĐ):',curVal||'');if(v===null)return;
var num=parseInt(String(v).replace(/[^0-9]/g,''))||0;
saveMaxMess(adId,num);}
async function saveMaxMess(adId,val){
if(!needAuth())return;
var r=await sb2.from('ad_account').update({max_mess_cost:val||null}).eq('id',adId);
if(!r.error){toast('Đã lưu giá Messenger tối đa: '+ff(val),true);await loadAll();if(curPage===1){render();}else{var el=document.getElementById('ac');if(el)el.innerHTML=rat();}}
else toast('Lỗi: '+r.error.message,false);}
function editMaxLead(adId,curVal){
var v=prompt('Nhập giá form (lead) tối đa (VNĐ):',curVal||'');if(v===null)return;
var num=parseInt(String(v).replace(/[^0-9]/g,''))||0;
saveMaxLead(adId,num);}
async function saveMaxLead(adId,val){
if(!needAuth())return;
var r=await sb2.from('ad_account').update({max_lead_cost:val||null}).eq('id',adId);
if(!r.error){toast('Đã lưu giá form tối đa: '+ff(val),true);await loadAll();if(curPage===1){render();}else{var el=document.getElementById('ac');if(el)el.innerHTML=rat();}}
else toast('Lỗi: '+r.error.message,false);}
async function deleteCheckedAd(){if(!needAuth())return;var checks=document.querySelectorAll('.ad-check:checked');if(!checks.length){toast('Vui lòng chọn ít nhất một tài khoản quảng cáo.',false);return;}if(!confirm('Xóa '+checks.length+' tài khoản?'))return;var c=0;for(var i=0;i<checks.length;i++){var r=await sb2.from('ad_account').delete().eq('id',checks[i].value);if(!r.error)c++;}toast('Đã xóa '+c+' Tài khoản!',true);await loadAll();stayPage();}
// Đổi tên TKQC trên Meta (POST /{ad-account-id}?name=...) → đồng bộ về DB local
async function editAdAccountName(adId){
  if(!needAuth())return;
  var a=adList.find(function(x){return x.id===adId;});if(!a)return;
  if(!a.fb_account_id){toast('TKQC chưa ghép Meta — không đổi được tên qua API. Hãy ghép FB Account ID trước.',false);return;}
  var newName=prompt('Đổi tên TKQC trên Meta:\nTên hiện tại: '+(a.account_name||'')+'\n\nNhập tên mới:',a.account_name||'');
  if(newName===null)return;
  newName=(newName||'').trim();
  if(!newName){toast('Tên không được để trống',false);return;}
  if(newName===a.account_name)return;
  if(!confirm('Đổi tên TKQC trên Meta thành "'+newName+'"?\n→ Tên Ads Manager đổi theo, mọi nơi dùng Meta API sẽ thấy tên mới.\n→ Báo cáo lịch sử của khách cũ vẫn giữ tên cũ qua snapshot assignment.'))return;
  try{
    var data=await metaPost(a.fb_account_id+'?name='+encodeURIComponent(newName));
    if(data.error){toast('Meta lỗi: '+data.error.message,false);return;}
    if(data.success===false){toast('Meta không xác nhận thành công',false);return;}
    var r=await sb2.from('ad_account').update({account_name:newName}).eq('id',adId);
    if(r.error){toast('Đổi Meta OK nhưng lưu DB lỗi: '+r.error.message,false);return;}
    toast('Đã đổi tên TKQC → '+newName,true);
    await loadAll();stayPage();
  }catch(e){toast('Lỗi mạng: '+e.message,false);}
}
// Đổi ngưỡng chi tiêu (spend_cap) trên Meta (POST /{ad-account-id}?spend_cap=...) → đồng bộ về DB local
async function editSpendCap(adId){
  if(!needAuth())return;
  var a=adList.find(function(x){return x.id===adId;});if(!a)return;
  if(!a.fb_account_id){toast('TKQC chưa ghép Meta — không đổi được ngưỡng qua API.',false);return;}
  var cur=a.spend_cap||0,spent=a.amount_spent||0;
  var v=prompt('Đổi ngưỡng chi tiêu (spend_cap) trên Meta\nTKQC: '+(a.account_name||'')+'\nĐã chi: '+ff(spent)+' đ\nNgưỡng hiện tại: '+(cur?ff(cur)+' đ':'Không giới hạn')+'\n\nNhập ngưỡng mới (VNĐ, để trống = bỏ giới hạn):',cur||'');
  if(v===null)return;
  v=String(v).replace(/[^0-9]/g,'');
  var newCap=v===''?0:parseInt(v);
  if(newCap===cur)return;
  if(newCap>0&&newCap<spent){toast('Ngưỡng mới ('+ff(newCap)+') không được nhỏ hơn đã chi ('+ff(spent)+'). Meta sẽ reject.',false);return;}
  if(!confirm('Đổi spend_cap trên Meta = '+(newCap?ff(newCap)+' đ':'Không giới hạn')+'?\n→ Meta sẽ tự dừng ads khi đạt ngưỡng này.'))return;
  try{
    var data=await metaPost(a.fb_account_id+'?spend_cap='+newCap);
    if(data.error){toast('Meta lỗi: '+data.error.message,false);return;}
    if(data.success===false){toast('Meta không xác nhận thành công',false);return;}
    var r=await sb2.from('ad_account').update({spend_cap:newCap||null}).eq('id',adId);
    if(r.error){toast('Đổi Meta OK nhưng lưu DB lỗi: '+r.error.message,false);return;}
    toast('Đã đổi ngưỡng → '+(newCap?ff(newCap)+' đ':'Không giới hạn'),true);
    await loadAll();stayPage();
  }catch(e){toast('Lỗi mạng: '+e.message,false);}
}
// Helper: gắn snapshot tên TKQC tại thời điểm tạo assignment (giữ tên cũ trong báo cáo lịch sử dù admin đổi tên TKQC sau này)
function _assignSnapshot(adId,payload){var acc=adList.find(function(x){return x.id===adId;});payload.account_name_snapshot=acc?(acc.account_name||null):null;return payload;}
// Helper: insert assignment, fallback bỏ account_name_snapshot nếu DB chưa chạy migration
async function _insertAssignment(payload){
  var r=await sb2.from('assignment').insert(payload);
  if(r.error&&isMissingColumnError(r.error)&&'account_name_snapshot' in payload){
    var fb=Object.assign({},payload);delete fb.account_name_snapshot;
    r=await sb2.from('assignment').insert(fb);
  }
  return r;
}
async function addAssignment(adId){
if(!needAuth())return;
var staffId=prompt('Nhân sự (chọn số):\n'+staffList.map(function(s,i){return(i+1)+'. '+s.short_name;}).join('\n'));
if(!staffId)return;var si=staffList[parseInt(staffId)-1];if(!si){toast('Số không hợp lệ',false);return;}
var clientId=prompt('Khách hàng (chọn số):\n'+clientList.map(function(c,i){return(i+1)+'. '+c.name;}).join('\n'));
if(!clientId)return;var ci=clientList[parseInt(clientId)-1];if(!ci){toast('Số không hợp lệ',false);return;}
var sd=prompt('Từ ngày (YYYY-MM-DD):',td());if(!sd)return;
var ed=prompt('Đến ngày (YYYY-MM-DD, bỏ trống = đang chạy):','');
var r=await _insertAssignment(_assignSnapshot(adId,{ad_account_id:adId,staff_id:si.id,client_id:ci.id,start_date:sd,end_date:ed||null}));
if(r.error)toast('Lỗi: '+r.error.message,false);else{toast('Đã thêm phân công',true);await loadAll();stayPage();}}
async function updateAssignDate(id,field,val){
if(!needAuth())return;
if(field==='start_date'&&!val){toast('Ngày bắt đầu không được để trống. Muốn xoá phân công thì dùng nút "Xoá".',false);await loadAll();stayPage();return;}
var upd={};upd[field]=val||null;
var r=await sb2.from('assignment').update(upd).eq('id',id);
if(!r.error){toast('Đã cập nhật',true);await loadAll();if(curPage===1){render();}else{var el=document.getElementById('ac');if(el)el.innerHTML=rat();}}else toast('Lỗi: '+r.error.message,false);}
async function setEndDate(id){
if(!needAuth())return;
var val=prompt('Đến ngày (YYYY-MM-DD):',td());if(val===null)return;
val=(val||'').trim();
// Validate end_date >= start_date để tránh lỗi DB constraint hoặc data invalid
if(val){
  var ag=assignData.find(function(x){return x.id===id;});
  if(ag&&ag.start_date&&val<ag.start_date){toast('Đến ngày ('+val+') không được trước Từ ngày ('+ag.start_date+').',false);return;}
}
var r=await sb2.from('assignment').update({end_date:val||null}).eq('id',id);
if(!r.error){toast('Đã cập nhật',true);await loadAll();if(curPage===1){render();}else{var el=document.getElementById('ac');if(el)el.innerHTML=rat();}}else toast('Lỗi: '+r.error.message,false);}
async function deleteAssign(id){
if(!needAuth())return;if(!confirm('Xóa phân công này?'))return;
var r=await sb2.from('assignment').delete().eq('id',id);
if(!r.error){toast('Đã xóa',true);await loadAll();stayPage();}else toast('Lỗi: '+r.error.message,false);}

// ═══ CAMPAIGN ALERTS (MESS + FORM) ═══
// Quét cửa sổ 3 ngày D-3, D-2, D-1 (không gồm hôm nay) — data đã chốt, chính xác hơn
function buildCampAggregates(){
var today=td();
var d1=vnDateStr(-86400000),d2=vnDateStr(-172800000),d3=vnDateStr(-259200000);
var threeDays=[d3,d2,d1];
var latestStatus={};
campaignMessData.forEach(function(r){
var key=r.ad_account_id+'|'+r.campaign_id;
if(!latestStatus[key]||r.report_date>latestStatus[key].date){latestStatus[key]={date:r.report_date,status:r.campaign_status||'ACTIVE'};}});
var camps={};
campaignMessData.forEach(function(r){
if(threeDays.indexOf(r.report_date)<0)return;
var key=r.ad_account_id+'|'+r.campaign_id;
var st=latestStatus[key];
if(st&&st.status!=='ACTIVE')return;
if(!camps[key])camps[key]={aid:r.ad_account_id,cid:r.campaign_id,name:r.campaign_name,days:0,spend:0,mess:0,leads:0,ad:r.ad_account,type:r.campaign_type||null};
// Nếu dòng hiện tại có campaign_type mà aggregate chưa có → update (quét mới ghi đè quét cũ)
if(!camps[key].type&&r.campaign_type)camps[key].type=r.campaign_type;
if(r.spend>0)camps[key].days++;
camps[key].spend+=r.spend||0;
camps[key].mess+=r.mess_count||0;
camps[key].leads+=(r.lead_count||0);});
return{camps:camps,today:today};}
function getMessAlerts(){
var agg=buildCampAggregates(),camps=agg.camps,today=agg.today;
var alerts=[];
Object.keys(camps).forEach(function(k){
var c=camps[k];
if(c.days<3)return;
if(!c.ad||!c.ad.max_mess_cost)return;
// Chỉ cảnh báo camp loại "mess" (cuộc trò chuyện / CTWA / Messenger)
// Camp chưa phân loại (type=null, chưa quét lại sau deploy) → bỏ qua để tránh false-positive
if(c.type!=='mess')return;
var costPerMess=c.mess>0?Math.round(c.spend/c.mess):Infinity;
if(costPerMess>c.ad.max_mess_cost){
var acc=adList.find(function(a){return a.id===c.aid;});
var ca=acc?getAssign(acc.id,today):[];
var staffId=ca.length?ca[0].staff_id:null;
var staff=staffId?allStaff.find(function(s){return s.id===staffId;}):null;
alerts.push({campaign_name:c.name,campaign_id:c.cid,ad_account_id:c.aid,account_name:acc?acc.account_name:'',client_name:c.ad.client?c.ad.client.name:'',cost_per_mess:costPerMess,max_cost:c.ad.max_mess_cost,spend_4d:c.spend,mess_4d:c.mess,staff:staff,days:c.days,type:'mess'});}});
alerts.sort(function(a,b){return b.cost_per_mess-a.cost_per_mess;});
return filterAlertsForCurrentUser(alerts);}
function getLeadAlerts(){
var agg=buildCampAggregates(),camps=agg.camps,today=agg.today;
var alerts=[];
Object.keys(camps).forEach(function(k){
var c=camps[k];
if(c.days<3)return;
if(!c.ad||!c.ad.max_lead_cost)return;
// Chỉ cảnh báo camp loại "form" (mẫu phản hồi tức thì / Instant Form)
// Camp chưa phân loại (type=null, chưa quét lại sau deploy) → bỏ qua để tránh false-positive
if(c.type!=='form')return;
var costPerLead=c.leads>0?Math.round(c.spend/c.leads):Infinity;
if(costPerLead>c.ad.max_lead_cost){
var acc=adList.find(function(a){return a.id===c.aid;});
var ca=acc?getAssign(acc.id,today):[];
var staffId=ca.length?ca[0].staff_id:null;
var staff=staffId?allStaff.find(function(s){return s.id===staffId;}):null;
alerts.push({campaign_name:c.name,campaign_id:c.cid,ad_account_id:c.aid,account_name:acc?acc.account_name:'',client_name:c.ad.client?c.ad.client.name:'',cost_per_lead:costPerLead,max_cost:c.ad.max_lead_cost,spend_4d:c.spend,leads_4d:c.leads,staff:staff,days:c.days,type:'lead'});}});
alerts.sort(function(a,b){return b.cost_per_lead-a.cost_per_lead;});
return filterAlertsForCurrentUser(alerts);}

// Cảnh báo Tài khoản có số dư dưới ngưỡng BALANCE_ALERT_THRESHOLD
function getBalanceAlerts(){
var today=td();
// Tính spend trung bình 3 ngày gần nhất cho từng Tài khoản (để ước tính "còn chạy được ~X ngày")
var d1=vnDateStr(-86400000),d2=vnDateStr(-172800000),d3=vnDateStr(-259200000);
var days3=[d3,d2,d1];
var spendByAcc={};
dailyData.forEach(function(d){
if(days3.indexOf(d.report_date)<0)return;
if(!spendByAcc[d.ad_account_id])spendByAcc[d.ad_account_id]={total:0,days:{}};
spendByAcc[d.ad_account_id].total+=moneyVal(d.spend_amount);
spendByAcc[d.ad_account_id].days[d.report_date]=true;});
var alerts=[];
adList.forEach(function(a){
if(a.account_status!==1)return;
if(!hasComparableSpendCap(a))return;
var balance=a.spend_cap-a.amount_spent;
if(balance>=BALANCE_ALERT_THRESHOLD)return;
var sb=spendByAcc[a.id],dayCnt=sb?Object.keys(sb.days).length:0;
var avgDaily=dayCnt>0?sb.total/dayCnt:0;
var daysLeft=avgDaily>0?balance/avgDaily:null;
var ca=getAssign(a.id,today);
var staffId=ca.length?ca[0].staff_id:null;
var staff=staffId?allStaff.find(function(s){return s.id===staffId;}):null;
var clientId=ca.length?ca[0].client_id:a.client_id;
var client=clientId?clientList.find(function(c){return c.id===clientId;}):null;
alerts.push({ad_account_id:a.id,fb_account_id:a.fb_account_id,account_name:a.account_name,balance:balance<0?0:balance,spent:a.amount_spent,cap:a.spend_cap,avg_daily:avgDaily,days_left:daysLeft,staff:staff,client_name:client?client.name:''});});
alerts.sort(function(a,b){return a.balance-b.balance;});
return filterAlertsForCurrentUser(alerts);}

async function runLimited(items,limit,worker){
var out=new Array(items.length),next=0,count=Math.min(limit,items.length);
var runners=Array.from({length:count},async function(){
while(next<items.length){var idx=next++;out[idx]=await worker(items[idx],idx);}
});
await Promise.all(runners);
return out;
}
function chunkArray(arr,size){var chunks=[];for(var i=0;i<arr.length;i+=size)chunks.push(arr.slice(i,i+size));return chunks;}
function buildSharedSpendRows(a,rows,date){
var combo={};
(rows||[]).forEach(function(c){var spend=Math.round(parseFloat(c.spend||0));if(!spend)return;
var parts=(c.campaign_name||'').split('_'),sp=(parts[0]||'').trim(),cp=(parts[2]||'').trim();
var spLower=sp.toLowerCase(),cpLower=cp.toLowerCase();
var ms2=allStaff.find(function(s){return s.campaign_keyword&&spLower===s.campaign_keyword.toLowerCase();});
var mc=clientList.find(function(cl){return cl.campaign_keyword&&cpLower.indexOf(cl.campaign_keyword.toLowerCase())>=0;});
if(ms2){var key=ms2.id+'|'+(mc?mc.id:'');if(!combo[key])combo[key]={ad_account_id:a.id,report_date:date,spend_amount:0,staff_id:ms2.id,matched_client_id:mc?mc.id:null};combo[key].spend_amount+=spend;}
});
return Object.keys(combo).map(function(k){return combo[k];});
}
async function fetchSharedSpendRowsBatch(shared,date){
var rows=[],errors=0;
for(var b=0;b<shared.length;b+=50){
var chunk=shared.slice(b,b+50);
var batchReqs=chunk.map(function(a){return{method:'GET',relative_url:a.fb_account_id+'/insights?level=campaign&fields=campaign_name,spend&time_range={"since":"'+date+'","until":"'+date+'"}&limit=500'};});
try{
var bResults=await metaBatch(batchReqs);
if(!Array.isArray(bResults)){
var em=(bResults&&bResults.error&&bResults.error.message)||'Batch không phải mảng';
console.warn('[Shared spend sync]',date,'batch-level error:',em);
errors+=chunk.length;continue;
}
for(var j=0;j<chunk.length;j++){
var accId=chunk[j].fb_account_id;
try{
var body=JSON.parse((bResults[j]&&bResults[j].body)||'{}');
if(body.error){console.warn('[Shared spend sync]',date,'acc='+accId,'code='+body.error.code,body.error.message);errors++;continue;}
rows=rows.concat(buildSharedSpendRows(chunk[j],body.data||[],date));
}catch(e){errors++;}
}
}catch(e){errors+=chunk.length;}
}
return{rows:rows,errors:errors};
}
async function replaceSharedSpendRows(shared,date){
var ids=shared.map(function(a){return a.id;});
if(!ids.length)return{saved:0,errors:0};
var oldShared=await sb2.from('daily_spend').select('*').in('ad_account_id',ids).eq('report_date',date).not('staff_id','is',null);
var fetched=await fetchSharedSpendRowsBatch(shared,date),errors=fetched.errors,saved=0;
var del=await sb2.from('daily_spend').delete().in('ad_account_id',ids).eq('report_date',date).not('staff_id','is',null);
if(del.error){errors+=ids.length;return{saved:0,errors:errors};}
var batches=chunkArray(fetched.rows,500);
for(var i=0;i<batches.length;i++){
var ins=await sb2.from('daily_spend').insert(batches[i]);
if(ins.error){errors+=batches[i].length;}
else saved+=batches[i].length;
}
if(errors&&oldShared.data&&oldShared.data.length){
var restoreS=oldShared.data.map(function(row){var cp=Object.assign({},row);delete cp.id;return cp;});
await sb2.from('daily_spend').insert(restoreS);
}
return{saved:saved,errors:errors};
}
// Phân loại campaign theo optimization_goal + destination_type của ad set
// Trả về: 'mess' | 'form' | 'engagement' | 'other'
function classifyCampaign(optGoal,destType){
var g=(optGoal||'').toUpperCase();
var d=(destType||'').toUpperCase();
// Ưu tiên destination_type (chính xác hơn cho CTWA/Messenger)
if(d==='MESSENGER'||d==='CTWA_LINK'||d==='INSTAGRAM_DIRECT'||d==='WHATSAPP')return'mess';
if(d==='ON_AD')return'form'; // Instant Form (Mẫu phản hồi tức thì)
// Fallback theo optimization_goal
if(g==='CONVERSATIONS'||g==='REPLIES')return'mess';
if(g==='LEAD_GENERATION'||g==='QUALITY_LEAD')return'form';
if(g==='POST_ENGAGEMENT'||g==='PAGE_LIKES'||g==='LINK_CLICKS'||g==='REACH'||g==='IMPRESSIONS'||g==='VIDEO_VIEWS'||g==='THRUPLAY'||g==='LANDING_PAGE_VIEWS')return'engagement';
return'other';
}
function parseMessRows(a,campBody,insBody,adsetsBody){
var activeIds=new Set();
(campBody.data||[]).forEach(function(c){activeIds.add(c.id);});
// Build map campaign_id → {optimization_goal, destination_type, type}
// Nếu 1 campaign có nhiều ad set khác loại, ưu tiên cái KHÔNG phải 'other'
var campMeta={};
((adsetsBody&&adsetsBody.data)||[]).forEach(function(s){
var cid=s.campaign_id;if(!cid)return;
var t=classifyCampaign(s.optimization_goal,s.destination_type);
if(!campMeta[cid]||campMeta[cid].type==='other'){
campMeta[cid]={optimization_goal:s.optimization_goal||null,destination_type:s.destination_type||null,type:t};
}});
return (insBody.data||[]).map(function(r){
var spend=Math.round(parseFloat(r.spend||0)),messCount=0,leadCount=0,commentCount=0,checkoutCount=0;
if(r.actions){r.actions.forEach(function(act){
if(act.action_type&&(act.action_type.indexOf('messaging_conversation_started')>=0||act.action_type==='onsite_conversion.messaging_conversation_started_7d'))messCount+=parseInt(act.value)||0;
if(act.action_type&&(act.action_type==='lead'||act.action_type==='leadgen_grouped'))leadCount+=parseInt(act.value)||0;
if(act.action_type==='comment')commentCount+=parseInt(act.value)||0;
if(act.action_type&&(act.action_type==='offsite_conversion.fb_pixel_initiate_checkout'||act.action_type==='onsite_conversion.initiate_checkout'||act.action_type==='initiate_checkout'))checkoutCount+=parseInt(act.value)||0;
});}
var meta=campMeta[r.campaign_id]||{optimization_goal:null,destination_type:null,type:null};
return{ad_account_id:a.id,campaign_id:r.campaign_id,campaign_name:r.campaign_name,report_date:r.date_start,spend:spend,mess_count:messCount,lead_count:leadCount,comment_count:commentCount,checkout_count:checkoutCount,campaign_status:activeIds.has(r.campaign_id)?'ACTIVE':'PAUSED',campaign_type:meta.type,optimization_goal:meta.optimization_goal,destination_type:meta.destination_type};
});
}
async function fetchCampaignMessBatch(accounts,d3,d1){
var allRows=[],errors=0,errorSamples=[];
function pushErr(accId,phase,msg,code){
errors++;
if(errorSamples.length<5)errorSamples.push({accId:accId,phase:phase,msg:msg,code:code});
console.warn('[Mess sync]',phase,'acc='+accId,'code='+code,msg);
}
// 3 requests/account (campaigns + insights + adsets) → chunk 16 để <50 requests/batch
for(var b=0;b<accounts.length;b+=16){
var chunk=accounts.slice(b,b+16);
var batchReqs=[];
chunk.forEach(function(a){
batchReqs.push({method:'GET',relative_url:a.fb_account_id+'/campaigns?fields=id,effective_status&filtering=[{"field":"effective_status","operator":"IN","value":["ACTIVE"]}]&limit=500'});
batchReqs.push({method:'GET',relative_url:a.fb_account_id+'/insights?level=campaign&fields=campaign_id,campaign_name,spend,actions&time_range={"since":"'+d3+'","until":"'+d1+'"}&time_increment=1&limit=500'});
batchReqs.push({method:'GET',relative_url:a.fb_account_id+'/adsets?fields=campaign_id,optimization_goal,destination_type&limit=500'});
});
try{
var bResults=await metaBatch(batchReqs);
// Batch-level error (token invalid, app blocked, rate limit) — toàn bộ chunk fail, bResults là object thay vì array
if(!Array.isArray(bResults)){
var em=(bResults&&bResults.error&&bResults.error.message)||'Batch API trả về không phải mảng';
var ec=(bResults&&bResults.error&&bResults.error.code)||0;
chunk.forEach(function(a){pushErr(a.fb_account_id,'batch',em,ec);});
continue;
}
for(var j=0;j<chunk.length;j++){
var accId=chunk[j].fb_account_id;
try{
var campRaw=bResults[j*3],insRaw=bResults[j*3+1],adsRaw=bResults[j*3+2];
var campBody=JSON.parse((campRaw&&campRaw.body)||'{}');
var insBody=JSON.parse((insRaw&&insRaw.body)||'{}');
var adsetsBody=JSON.parse((adsRaw&&adsRaw.body)||'{}');
if(campBody.error){pushErr(accId,'campaigns',campBody.error.message,campBody.error.code);continue;}
if(insBody.error){pushErr(accId,'insights',insBody.error.message,insBody.error.code);continue;}
// adsetsBody.error không fatal — vẫn quét được spend/mess/lead, chỉ mất phân loại
if(adsetsBody.error)console.warn('[Mess sync] adsets non-fatal acc='+accId,adsetsBody.error.message);
allRows=allRows.concat(parseMessRows(chunk[j],campBody,insBody,adsetsBody));
}catch(e2){pushErr(accId,'parse',e2.message,0);}}
}catch(e){chunk.forEach(function(a){pushErr(a.fb_account_id,'network',e.message,0);});}}
return{rows:allRows,errors:errors,errorSamples:errorSamples};
}
async function syncCampaignMess(btn,skipRefresh){
var oldText=btn?btn.textContent:'Quét giá Messenger';
if(btn){btn.disabled=true;btn.textContent='Đang quét...';}
// Quét cửa sổ D-3 → D0 (gồm hôm nay) để báo cáo khách thấy realtime.
// Cảnh báo Mess/Form vẫn chỉ tính D-3..D-1 (xem buildCampAggregates) — D0 không trigger noti.
var d1=vnDateStr(0),d3=vnDateStr(-259200000);
var mapped=adList.filter(function(a){return a.fb_account_id&&(a.max_mess_cost||a.max_lead_cost);});
if(!mapped.length){if(btn){toast('Chưa có Tài khoản nào đặt ngưỡng giá Messenger/form',false);btn.disabled=false;btn.textContent=oldText;}return;}
var errors=0;
try{
if(btn)btn.textContent='Đang quét '+mapped.length+' Tài khoản...';
var result=await fetchCampaignMessBatch(mapped,d3,d1);
var rowsToSave=result.rows;errors=result.errors;
var saved=0,batches=chunkArray(rowsToSave,500);
for(var i=0;i<batches.length;i++){
if(btn)btn.textContent='Đang lưu '+(i+1)+'/'+batches.length;
var upsert=await sb2.from('campaign_daily_mess').upsert(batches[i],{onConflict:'ad_account_id,campaign_id,report_date'});
if(upsert.error){errors+=batches[i].length;console.warn('[Mess sync upsert]',upsert.error.message);}
else saved+=batches[i].length;
}
// Rút gọn lý do lỗi đầu tiên cho user (chi tiết đầy đủ ở console)
var hint='';
if(errors&&result.errorSamples&&result.errorSamples.length){
var s0=result.errorSamples[0];
var codeHint='';
if(s0.code===190)codeHint=' — Token hết hạn/thu hồi';
else if(s0.code===200||s0.code===100)codeHint=' — Thiếu quyền ads_read';
else if(s0.code===17||s0.code===4||s0.code===32||s0.code===613)codeHint=' — Rate limit, thử lại sau 1-2 phút';
else if(s0.code===803)codeHint=' — Tài khoản không truy cập được';
hint=' ('+s0.phase+(s0.code?' #'+s0.code:'')+codeHint+')';
console.warn('[Mess sync] Mẫu lỗi:',result.errorSamples);
}
toast('Quét xong: '+saved+' dòng'+(errors?' · '+errors+' lỗi'+hint:''),!errors);
if(!skipRefresh)await loadAll();
}catch(e){toast('Lỗi quét giá Messenger: '+e.message,false);}
finally{if(btn){btn.disabled=false;btn.textContent=oldText;}}}

// ═══ ONE-SHOT BACKFILL ad_daily_post (T4-T5 + debug) ═══
// Click → pull tất cả TK có max_mess_cost/max_lead_cost từ 2026-04-01 → hôm nay
// Sau khi xong sẽ toast cụ thể số dòng + lỗi (nếu có). Dùng để bù data hoặc force re-sync khi cron skip.
async function backfillAdPostsOnce(btn){
  if(!isAdmin()){toast('Chỉ admin',false);return;}
  if(!confirm('Backfill bài chạy T4 + T5/2026 từ Meta API?\n\nMất khoảng 1-2 phút. Có thể chạy lại nhiều lần (upsert idempotent — không trùng).'))return;
  var oldText=btn?btn.textContent:'';
  if(btn){btn.disabled=true;btn.textContent='Đang backfill...';}
  try{
    var dFrom='2026-04-01',dTo=vnDateStr(0);
    var mapped=adList.filter(function(a){return a.fb_account_id&&(a.max_mess_cost||a.max_lead_cost);});
    if(!mapped.length){toast('Không có TK nào đặt ngưỡng',false);return;}
    var allRows=[],errors=0,errorSamples=[],failedAccs=[];
    for(var b=0;b<mapped.length;b+=24){
      var chunk=mapped.slice(b,b+24);
      if(btn)btn.textContent='Backfill: TK '+Math.min(b+24,mapped.length)+'/'+mapped.length;
      var batchReqs=[];
      chunk.forEach(function(a){
        batchReqs.push({method:'GET',relative_url:a.fb_account_id+'/insights?level=ad&fields=ad_id,ad_name,campaign_id,campaign_name,spend,actions&time_range={"since":"'+dFrom+'","until":"'+dTo+'"}&time_increment=1&limit=500'});
        batchReqs.push({method:'GET',relative_url:a.fb_account_id+'/ads?fields=id,name,status,creative{effective_object_story_id,thumbnail_url}&limit=500'});
      });
      try{
        var bResults=await metaBatch(batchReqs);
        if(!Array.isArray(bResults)){
          errors+=chunk.length;
          chunk.forEach(function(a){failedAccs.push(a.account_name);});
          if(errorSamples.length<3)errorSamples.push((bResults&&bResults.error&&bResults.error.message)||'batch error');
          continue;
        }
        for(var j=0;j<chunk.length;j++){
          try{
            var insBody=JSON.parse((bResults[j*2]&&bResults[j*2].body)||'{}');
            var adsBody=JSON.parse((bResults[j*2+1]&&bResults[j*2+1].body)||'{}');
            if(insBody.error){
              errors++;
              failedAccs.push(chunk[j].account_name);
              if(errorSamples.length<3)errorSamples.push(chunk[j].account_name+': '+insBody.error.message);
              continue;
            }
            var adsMeta={};
            ((adsBody&&adsBody.data)||[]).forEach(function(ad){
              var c=ad.creative||{};var posid=c.effective_object_story_id||null,purl=null;
              if(posid&&posid.indexOf('_')>0){var parts=posid.split('_');purl='https://www.facebook.com/'+parts[0]+'/posts/'+parts[1];}
              adsMeta[ad.id]={status:ad.status||null,post_id:posid,post_url:purl,thumbnail_url:c.thumbnail_url||null};
            });
            (insBody.data||[]).forEach(function(r){
              var spend=Math.round(parseFloat(r.spend||0)),mc=0,lc=0,cc=0,kc=0;
              if(r.actions)r.actions.forEach(function(act){
                var t=act.action_type||'';
                if(t.indexOf('messaging_conversation_started')>=0||t==='onsite_conversion.messaging_conversation_started_7d')mc+=parseInt(act.value)||0;
                if(t==='lead'||t==='leadgen_grouped')lc+=parseInt(act.value)||0;
                if(t==='comment')cc+=parseInt(act.value)||0;
                if(t==='offsite_conversion.fb_pixel_initiate_checkout'||t==='onsite_conversion.initiate_checkout'||t==='initiate_checkout')kc+=parseInt(act.value)||0;
              });
              var m=adsMeta[r.ad_id]||{};
              allRows.push({
                ad_account_id:chunk[j].id,ad_id:r.ad_id,report_date:r.date_start,
                ad_name:r.ad_name||null,campaign_id:r.campaign_id||null,campaign_name:r.campaign_name||null,
                post_id:m.post_id||null,post_url:m.post_url||null,thumbnail_url:m.thumbnail_url||null,
                spend:spend,mess_count:mc,comment_count:cc,lead_count:lc,checkout_count:kc,
                ad_status:m.status||null
              });
            });
          }catch(e2){errors++;}
        }
      }catch(e){errors+=chunk.length;chunk.forEach(function(a){failedAccs.push(a.account_name);});}
    }
    var saved=0,batches=chunkArray(allRows,500);
    for(var i=0;i<batches.length;i++){
      if(btn)btn.textContent='Backfill: lưu '+(i+1)+'/'+batches.length;
      var up=await sb2.from('ad_daily_post').upsert(batches[i],{onConflict:'ad_account_id,ad_id,report_date'});
      if(up.error){errors+=batches[i].length;console.warn('[Backfill upsert]',up.error.message);}
      else saved+=batches[i].length;
    }
    var msg='Backfill xong: '+saved+' dòng';
    if(errors){
      msg+=' · '+errors+' lỗi';
      if(failedAccs.length)console.warn('[Backfill] TK fail:',failedAccs);
      if(errorSamples.length)console.warn('[Backfill] Mẫu lỗi:',errorSamples);
    }
    toast(msg,!errors);
    if(saved){
      var r=await sb2.from('ad_daily_post').select('*').gte('report_date','2026-04-01').order('report_date',{ascending:false}).limit(20000);
      if(r&&!r.error){adPostData=r.data||[];render();}
    }
  }catch(e){toast('Lỗi backfill: '+e.message,false);}
  finally{if(btn){btn.disabled=false;btn.textContent=oldText;}}
}

// ═══ P6: CẢNH BÁO GIÁ CHIẾN DỊCH ═══
var p6Tab=0;
function setP6Tab(i){p6Tab=i;syncSidebarNav();render();}
function p6(){
var messAlerts=getMessAlerts(),leadAlerts=getLeadAlerts(),balAlerts=getBalanceAlerts();
var canMess=canAccessKey('p6.mess'),canForm=canAccessKey('p6.form'),canBal=canAccessKey('p6.balance');
var totalAlerts=messAlerts.length+leadAlerts.length+balAlerts.length;
var d1Label=fd(vnDateStr(-86400000)),d3Label=fd(vnDateStr(-259200000));
var h='<div class="page-title">Cảnh báo</div><div class="page-sub">Giá trung bình 3 ngày ('+d3Label+' – '+d1Label+') · Số dư Tài khoản dưới '+ff(BALANCE_ALERT_THRESHOLD)+'đ</div>';
h+='<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center;">';
if(canMess||canForm){
h+='<button class="btn btn-primary" onclick="syncCampaignMess(this)">Quét giá Messenger & form</button>';
}
h+='<span style="font-size:11px;color:var(--tx3);">Bài chạy đã quét: '+adPostData.length+' dòng (cron mỗi 15p)</span>';
h+='</div>';
// KPI
var tkMess=adList.filter(function(a){return a.max_mess_cost;}).length;
var tkLead=adList.filter(function(a){return a.max_lead_cost;}).length;
var tkActive=adList.filter(function(a){return a.account_status===1&&hasComparableSpendCap(a);}).length;
h+='<div class="kpi-grid kpi-4">';
h+='<div class="kpi"><div class="kpi-label">Vượt ngưỡng Messenger</div><div class="kpi-value" style="color:'+(messAlerts.length?'var(--red)':'var(--green)')+';">'+messAlerts.length+'</div><div class="kpi-note">'+tkMess+' Tài khoản đặt ngưỡng Messenger</div></div>';
h+='<div class="kpi"><div class="kpi-label">Vượt ngưỡng Form</div><div class="kpi-value" style="color:'+(leadAlerts.length?'var(--red)':'var(--green)')+';">'+leadAlerts.length+'</div><div class="kpi-note">'+tkLead+' Tài khoản đặt ngưỡng form</div></div>';
h+='<div class="kpi"><div class="kpi-label">Tài khoản sắp hết tiền</div><div class="kpi-value" style="color:'+(balAlerts.length?'var(--red)':'var(--green)')+';">'+balAlerts.length+'</div><div class="kpi-note">Dưới '+ff(BALANCE_ALERT_THRESHOLD)+'đ · '+tkActive+' Tài khoản đang chạy</div></div>';
h+='<div class="kpi"><div class="kpi-label">Lần quét gần nhất</div><div class="kpi-value" style="font-size:14px;">'+(campaignMessData.length?campaignMessData[0].report_date:'Chưa quét')+'</div></div></div>';
// Auto-redirect nếu user không có quyền tab hiện tại
if(p6Tab===0&&!canMess){if(canForm)p6Tab=1;else if(canBal)p6Tab=2;}
else if(p6Tab===1&&!canForm){if(canMess)p6Tab=0;else if(canBal)p6Tab=2;}
else if(p6Tab===2&&!canBal){if(canMess)p6Tab=0;else if(canForm)p6Tab=1;}
// Tab điều khiển từ subnav
if(p6Tab===0&&canMess)h+=p6AlertList(messAlerts,'mess');
else if(p6Tab===1&&canForm)h+=p6AlertList(leadAlerts,'lead');
else if(p6Tab===2&&canBal)h+=p6BalanceList(balAlerts);
return h;}
function p6AlertList(alerts,type){
var isMess=type==='mess';
var resultLabel=isMess?'Mess':'Form';
var costKey=isMess?'cost_per_mess':'cost_per_lead';
var countKey=isMess?'mess_4d':'leads_4d';
var h='';
if(!alerts.length){
h+='<div style="text-align:center;padding:40px;color:var(--tx3);"><div style="font-size:36px;margin-bottom:8px;">✓</div><div style="font-size:15px;font-weight:500;color:var(--green);">Không có chiến dịch '+resultLabel+' nào vượt ngưỡng</div><div style="font-size:12px;margin-top:4px;">Tất cả chiến dịch đang trong mức cho phép</div></div>';
return h;}
var byStaff={};alerts.forEach(function(al){
var sk=al.staff?al.staff.id:'none';
if(!byStaff[sk])byStaff[sk]={staff:al.staff,clients:{}};
var ck=al.client_name||'Chưa phân loại';
if(!byStaff[sk].clients[ck])byStaff[sk].clients[ck]=[];
byStaff[sk].clients[ck].push(al);});
var staffKeys=Object.keys(byStaff).sort(function(a,b){
var ac=Object.values(byStaff[a].clients).reduce(function(t,arr){return t+arr.length;},0);
var bc=Object.values(byStaff[b].clients).reduce(function(t,arr){return t+arr.length;},0);
return bc-ac;});
staffKeys.forEach(function(sk){
var g=byStaff[sk],sObj=g.staff;
var sCol=sObj?sc(sObj.color_code):{bg:'var(--bg3)',tx:'var(--tx3)',c:'var(--tx3)'};
var clientKeys=Object.keys(g.clients).sort(function(a,b){return g.clients[b].length-g.clients[a].length;});
var totalCamps=clientKeys.reduce(function(t,k){return t+g.clients[k].length;},0);
h+='<div style="border:1px solid var(--bd1);border-radius:var(--radius-lg);overflow:hidden;margin-bottom:16px;">';
h+='<div style="padding:14px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--bd1);">';
h+='<div style="display:flex;align-items:center;gap:10px;"><div class="avatar" style="background:'+sCol.bg+';color:'+sCol.tx+';">'+(sObj?esc(sObj.avatar_initials):'?')+'</div><div><div style="font-size:15px;font-weight:600;">'+(sObj?esc(sObj.short_name):'Chưa gán Nhân sự')+'</div><div style="font-size:12px;color:var(--tx3);">'+clientKeys.length+' khách hàng · '+totalCamps+' chiến dịch vượt ngưỡng</div></div></div>';
h+='<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:var(--red-bg);color:var(--red-tx);font-weight:500;">'+totalCamps+'</span></div>';
clientKeys.forEach(function(cname){
var camps=g.clients[cname];
h+='<div style="border-bottom:1px solid var(--bd1);">';
h+='<div style="padding:10px 20px 10px 48px;background:var(--bg2);display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--bd1);"><div style="font-size:13px;font-weight:500;display:flex;align-items:center;gap:6px;"><span style="width:6px;height:6px;border-radius:50%;background:'+sCol.c+';"></span>'+esc(cname)+'</div><span style="font-size:10px;padding:2px 8px;border-radius:10px;background:var(--red-bg);color:var(--red-tx);font-weight:500;">'+camps.length+' chiến dịch</span></div>';
h+='<div style="display:grid;grid-template-columns:1fr 110px 70px 110px 90px;gap:6px;padding:4px 20px 4px 48px;font-size:10px;color:var(--tx3);text-transform:uppercase;letter-spacing:.3px;"><span>Chiến dịch</span><span style="text-align:right">Chi tiêu 3 ngày</span><span style="text-align:right">'+resultLabel+'</span><span style="text-align:right">Giá '+resultLabel+' TB</span><span style="text-align:right">Ngưỡng</span></div>';
camps.sort(function(a,b){return(b[costKey]||0)-(a[costKey]||0);}).forEach(function(al){
var costVal=al[costKey]||0;
// Tra fb_account_id để build link Meta Ads Manager (deep-link vào campaign cụ thể)
var accObj=adList.find(function(x){return x.id===al.ad_account_id;});
var fbId=accObj&&accObj.fb_account_id?String(accObj.fb_account_id).replace(/^act_/,''):'';
var camUrl=fbId?'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act='+fbId+'&selected_campaign_ids='+encodeURIComponent(al.campaign_id):'';
var accUrl=fbId?'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act='+fbId:'';
var camBtn=camUrl?'<a href="'+camUrl+'" target="_blank" rel="noopener" title="Mở chiến dịch trong Meta Ads Manager" class="alert-open-btn" onclick="event.stopPropagation()">↗</a>':'';
var accBtn=accUrl?'<a href="'+accUrl+'" target="_blank" rel="noopener" title="Mở Tài khoản trong Meta Ads Manager" class="alert-open-btn alert-open-btn-sm" onclick="event.stopPropagation()">↗</a>':'';
h+='<div style="display:grid;grid-template-columns:1fr 110px 70px 110px 90px;gap:6px;align-items:center;padding:8px 20px 8px 48px;border-bottom:1px solid var(--bd1);font-size:12px;background:var(--red-bg);">';
h+='<div><div style="font-weight:500;font-size:13px;display:flex;align-items:center;gap:6px;">'+esc(al.campaign_name)+camBtn+'</div><div style="font-size:11px;color:var(--tx3);margin-top:1px;display:flex;align-items:center;gap:4px;">'+esc(al.account_name)+accBtn+'</div></div>';
h+='<div class="mono" style="text-align:right;">'+ff(al.spend_4d)+'</div>';
h+='<div class="mono" style="text-align:right;">'+(al[countKey]||'0')+'</div>';
h+='<div class="mono" style="text-align:right;font-weight:600;color:var(--red);">'+(costVal===Infinity?'∞':ff(costVal))+'</div>';
h+='<div class="mono" style="text-align:right;color:var(--tx3);">'+ff(al.max_cost)+'</div></div>';});
h+='</div>';});
h+='</div>';});
return h;}

function p6BalanceList(alerts){
var h='';
if(!alerts.length){
h+='<div style="text-align:center;padding:40px;color:var(--tx3);"><div style="font-size:36px;margin-bottom:8px;">✓</div><div style="font-size:15px;font-weight:500;color:var(--green);">Tất cả Tài khoản đang đủ số dư</div><div style="font-size:12px;margin-top:4px;">Không có Tài khoản nào dưới '+ff(BALANCE_ALERT_THRESHOLD)+'đ</div></div>';
return h;}
// Group by staff → client
var byStaff={};alerts.forEach(function(al){
var sk=al.staff?al.staff.id:'none';
if(!byStaff[sk])byStaff[sk]={staff:al.staff,clients:{}};
var ck=al.client_name||'Chưa phân loại';
if(!byStaff[sk].clients[ck])byStaff[sk].clients[ck]=[];
byStaff[sk].clients[ck].push(al);});
var staffKeys=Object.keys(byStaff).sort(function(a,b){
var ac=Object.values(byStaff[a].clients).reduce(function(t,arr){return t+arr.length;},0);
var bc=Object.values(byStaff[b].clients).reduce(function(t,arr){return t+arr.length;},0);
return bc-ac;});
staffKeys.forEach(function(sk){
var g=byStaff[sk],sObj=g.staff;
var sCol=sObj?sc(sObj.color_code):{bg:'var(--bg3)',tx:'var(--tx3)',c:'var(--tx3)'};
var clientKeys=Object.keys(g.clients).sort(function(a,b){return g.clients[b].length-g.clients[a].length;});
var totalTk=clientKeys.reduce(function(t,k){return t+g.clients[k].length;},0);
h+='<div style="border:1px solid var(--bd1);border-radius:var(--radius-lg);overflow:hidden;margin-bottom:16px;">';
h+='<div style="padding:14px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--bd1);">';
h+='<div style="display:flex;align-items:center;gap:10px;"><div class="avatar" style="background:'+sCol.bg+';color:'+sCol.tx+';">'+(sObj?esc(sObj.avatar_initials):'?')+'</div><div><div style="font-size:15px;font-weight:600;">'+(sObj?esc(sObj.short_name):'Chưa gán Nhân sự')+'</div><div style="font-size:12px;color:var(--tx3);">'+clientKeys.length+' khách hàng · '+totalTk+' Tài khoản sắp hết tiền</div></div></div>';
h+='<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:var(--red-bg);color:var(--red-tx);font-weight:500;">'+totalTk+'</span></div>';
clientKeys.forEach(function(cname){
var tks=g.clients[cname];
h+='<div style="border-bottom:1px solid var(--bd1);">';
h+='<div style="padding:10px 20px 10px 48px;background:var(--bg2);display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--bd1);"><div style="font-size:13px;font-weight:500;display:flex;align-items:center;gap:6px;"><span style="width:6px;height:6px;border-radius:50%;background:'+sCol.c+';"></span>'+esc(cname)+'</div><span style="font-size:10px;padding:2px 8px;border-radius:10px;background:var(--red-bg);color:var(--red-tx);font-weight:500;">'+tks.length+' Tài khoản</span></div>';
h+='<div style="display:grid;grid-template-columns:1fr 120px 90px 130px 100px;gap:6px;padding:4px 20px 4px 48px;font-size:10px;color:var(--tx3);text-transform:uppercase;letter-spacing:.3px;"><span>Tài khoản</span><span style="text-align:right">Số dư còn</span><span style="text-align:right">Chi TB/ngày</span><span style="text-align:right">Còn chạy được</span><span style="text-align:right">Thao tác</span></div>';
tks.sort(function(a,b){return a.balance-b.balance;}).forEach(function(al){
var dlTxt;
if(al.days_left===null)dlTxt='<span style="color:var(--tx3);">—</span>';
else if(al.days_left<1)dlTxt='<span style="color:var(--red);font-weight:600;">&lt; 1 ngày</span>';
else if(al.days_left<3)dlTxt='<span style="color:var(--red);font-weight:600;">~'+al.days_left.toFixed(1)+' ngày</span>';
else dlTxt='<span style="color:var(--amber-tx);">~'+al.days_left.toFixed(1)+' ngày</span>';
var billingUrl=al.fb_account_id?'https://business.facebook.com/billing_hub/accounts/details?asset_id='+String(al.fb_account_id).replace(/^act_/,''):'';
var fbBalId=al.fb_account_id?String(al.fb_account_id).replace(/^act_/,''):'';
var balAccUrl=fbBalId?'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act='+fbBalId:'';
var balBtn=balAccUrl?'<a href="'+balAccUrl+'" target="_blank" rel="noopener" title="Mở Tài khoản trong Meta Ads Manager" class="alert-open-btn">↗</a>':'';
h+='<div style="display:grid;grid-template-columns:1fr 120px 90px 130px 100px;gap:6px;align-items:center;padding:8px 20px 8px 48px;border-bottom:1px solid var(--bd1);font-size:12px;background:var(--red-bg);">';
h+='<div><div style="font-weight:500;font-size:13px;display:flex;align-items:center;gap:6px;">'+esc(al.account_name||'—')+balBtn+'</div><div style="font-size:11px;color:var(--tx3);margin-top:1px;">Đã chi '+ff(al.spent)+' / '+ff(al.cap)+'</div></div>';
h+='<div class="mono" style="text-align:right;font-weight:600;color:var(--red);">'+ff(al.balance)+'</div>';
h+='<div class="mono" style="text-align:right;color:var(--tx2);">'+(al.avg_daily>0?ff(Math.round(al.avg_daily)):'—')+'</div>';
h+='<div class="mono" style="text-align:right;">'+dlTxt+'</div>';
h+='<div style="text-align:right;">'+(billingUrl?'<a href="'+billingUrl+'" target="_blank" rel="noopener" style="font-size:11px;padding:4px 10px;border-radius:6px;background:var(--blue);color:#fff;text-decoration:none;font-weight:500;">Nạp tiền ↗</a>':'<span style="color:var(--tx3);font-size:11px;">—</span>')+'</div>';
h+='</div>';});
h+='</div>';});
h+='</div>';});
return h;}

// ═══════════════════════════════════════════════════════════════════
// P7: QUẢN TRỊ CÔNG VIỆC — bảng điều hành đội ngũ
// ═══════════════════════════════════════════════════════════════════
var taskFilterStaff='all'; // 'all' | staff_id
var taskViewDate=null; // YYYY-MM-DD, mặc định = hôm nay
var taskRecurringEnsuredFor=null;
var taskExpandedIds={}; // taskId → true nếu đang expand subtasks
var _modalSubtasks=[];  // working buffer cho modal Giao việc
var TASK_PRIORITIES=[
  {key:'khan',label:'Khẩn',color:'var(--red)',bg:'var(--red-bg,#fee2e2)',rank:0},
  {key:'cao', label:'Cao', color:'var(--amber-tx)',bg:'var(--amber-bg)',rank:1},
  {key:'vua', label:'Vừa', color:'var(--blue)',bg:'rgba(59,130,246,0.1)',rank:2},
  {key:'thap',label:'Thấp',color:'var(--tx3)',bg:'var(--bg2)',rank:3}
];
function taskPriorityCfg(k){return TASK_PRIORITIES.find(function(p){return p.key===k;})||TASK_PRIORITIES[3];}
function taskPriorityRank(k){return taskPriorityCfg(k).rank;}
function todayStr(){var n=new Date();return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');}
function getOpenTaskCount(){
  var t=todayStr();
  return teamTaskData.filter(function(x){
    if(x.status==='done')return false;
    return x.task_date===t || x.task_date<t;
  }).length;
}
async function ensureRecurringTasksToday(){
  if(!authUser)return;
  var t=todayStr();
  if(taskRecurringEnsuredFor===t)return;
  taskRecurringEnsuredFor=t;
  // Lấy tasks hôm nay có recurring_key
  var todayKeys={};
  teamTaskData.forEach(function(x){if(x.task_date===t&&x.recurring_key)todayKeys[x.recurring_key]=true;});
  // Lấy template gần nhất theo recurring_key (date < today)
  var byKey={};
  teamTaskData.forEach(function(x){
    if(!x.is_recurring||!x.recurring_key)return;
    if(x.task_date>=t)return;
    var ex=byKey[x.recurring_key];
    if(!ex||x.task_date>ex.task_date)byKey[x.recurring_key]=x;
  });
  var toCreate=[];
  Object.keys(byKey).forEach(function(k){
    if(todayKeys[k])return;
    var src=byKey[k];
    var srcSubs=Array.isArray(src.subtasks)?src.subtasks.map(function(s){return{title:s.title,done:false};}):[];
    toCreate.push({
      task_date:t,title:src.title,description:src.description||null,
      assignee_staff_id:src.assignee_staff_id||null,
      due_at:null,priority:src.priority||'thap',status:'todo',
      is_recurring:true,recurring_key:k,
      subtasks:srcSubs,
      created_by:authUser?authUser.email:null
    });
  });
  if(!toCreate.length)return;
  var r=await sb2.from('team_task').insert(toCreate).select();
  if(r.error){console.warn('[ensureRecurringTasksToday]',r.error.message);return;}
  if(r.data&&r.data.length){teamTaskData=teamTaskData.concat(r.data);render();}
}
function p7(){
  var today=todayStr();
  if(!taskViewDate)taskViewDate=today;
  var isToday=taskViewDate===today;
  // Auto-sinh recurring chỉ khi xem ngày hôm nay
  if(isToday)ensureRecurringTasksToday();
  var t=taskViewDate;
  var todayTasks=teamTaskData.filter(function(x){return x.task_date===t;});
  // Trễ hạn chỉ hiện khi xem ngày hôm nay (ngày khác thì không có khái niệm "trễ hạn")
  var overdueTasks=isToday?teamTaskData.filter(function(x){return x.task_date<today&&x.status!=='done';}):[];
  // Apply staff filter
  var visibleStaff=staffList.slice();
  if(taskFilterStaff!=='all'){
    visibleStaff=staffList.filter(function(s){return s.id===taskFilterStaff;});
  }
  var filteredToday=taskFilterStaff==='all'?todayTasks:todayTasks.filter(function(x){return x.assignee_staff_id===taskFilterStaff;});
  var filteredOverdue=taskFilterStaff==='all'?overdueTasks:overdueTasks.filter(function(x){return x.assignee_staff_id===taskFilterStaff;});
  // KPIs
  var totalToday=filteredToday.length;
  var doneToday=filteredToday.filter(function(x){return x.status==='done';}).length;
  var doingToday=filteredToday.filter(function(x){return x.status==='doing';}).length;
  var adhocToday=filteredToday.filter(function(x){return !x.is_recurring;});
  // Header
  var weekdays=['Chủ Nhật','Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy'];
  var vd=t.split('-');
  var dObj=new Date(parseInt(vd[0]),parseInt(vd[1])-1,parseInt(vd[2]));
  var dateStr=weekdays[dObj.getDay()]+', '+vd[2]+'/'+vd[1]+'/'+vd[0];
  var dayDiff=Math.round((dObj-new Date(today.split('-')[0],parseInt(today.split('-')[1])-1,parseInt(today.split('-')[2])))/86400000);
  var relLabel=dayDiff===0?'hôm nay':(dayDiff===-1?'hôm qua':(dayDiff===1?'ngày mai':(dayDiff<0?Math.abs(dayDiff)+' ngày trước':'+'+dayDiff+' ngày')));
  var lastUpdate=teamTaskData.reduce(function(acc,x){var u=x.updated_at||x.created_at||'';return u>acc?u:acc;},'');
  var updateStr=lastUpdate?(' · cập nhật '+lastUpdate.substring(11,16)):'';
  var h='<div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:14px;padding-right:52px;">';
  h+='<div><div class="page-title">Bảng điều hành đội ngũ</div>';
  h+='<div class="page-sub" style="margin-top:4px;">📅 '+esc(dateStr)+' <span style="color:var(--tx3);">('+esc(relLabel)+')</span> · '+staffList.length+' thành viên'+esc(updateStr)+'</div></div>';
  // Date navigator + Giao việc
  h+='<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">';
  h+='<div style="display:flex;align-items:center;gap:4px;background:var(--bg2);border-radius:8px;padding:3px;">';
  h+='<button class="btn btn-ghost btn-sm" onclick="shiftTaskDate(-1)" title="Ngày trước" style="padding:4px 8px;font-size:14px;">‹</button>';
  h+='<input type="date" class="fi" value="'+esc(t)+'" onchange="setTaskViewDate(this.value)" style="border:0;background:transparent;font-size:12px;padding:4px;width:130px;">';
  h+='<button class="btn btn-ghost btn-sm" onclick="shiftTaskDate(1)" title="Ngày sau" style="padding:4px 8px;font-size:14px;">›</button>';
  h+='</div>';
  if(!isToday)h+='<button class="btn btn-ghost btn-sm" onclick="setTaskViewDate(\''+today+'\')" style="font-size:12px;">Hôm nay</button>';
  if(authUser&&isAdmin())h+='<button class="btn btn-primary btn-sm" onclick="openTaskModal()">+ Giao việc</button>';
  h+='</div>';
  h+='</div>';
  // KPI grid
  h+='<div class="kpi-grid kpi-4" style="margin-bottom:14px;">';
  h+='<div class="kpi"><div class="kpi-label">Tổng việc '+(isToday?'hôm nay':'ngày '+vd[2]+'/'+vd[1])+'</div><div class="kpi-value">'+totalToday+'</div><div class="kpi-note">'+(taskFilterStaff==='all'?'cả team':esc((staffList.find(function(s){return s.id===taskFilterStaff;})||{}).short_name||''))+'</div></div>';
  h+='<div class="kpi"><div class="kpi-label">Hoàn thành</div><div class="kpi-value" style="color:var(--green);">'+doneToday+'</div><div class="kpi-note">'+(totalToday?Math.round(doneToday*100/totalToday)+'%':'—')+'</div></div>';
  h+='<div class="kpi"><div class="kpi-label">Đang làm</div><div class="kpi-value" style="color:var(--blue);">'+doingToday+'</div><div class="kpi-note">in-progress</div></div>';
  h+='<div class="kpi"><div class="kpi-label">Phát sinh</div><div class="kpi-value" style="color:var(--amber-tx);">'+adhocToday.length+'</div><div class="kpi-note">việc ngoài checklist</div></div>';
  h+='</div>';
  // Filter chips
  h+='<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px;">';
  h+='<span style="font-size:12px;color:var(--tx3);">Lọc:</span>';
  h+='<button class="btn btn-sm '+(taskFilterStaff==='all'?'btn-primary':'btn-ghost')+'" onclick="setTaskFilter(\'all\')" style="padding:4px 12px;">Tất cả · '+todayTasks.length+'</button>';
  staffList.forEach(function(s){
    var n=todayTasks.filter(function(x){return x.assignee_staff_id===s.id;}).length;
    if(!n&&taskFilterStaff!==s.id)return;
    h+='<button class="btn btn-sm '+(taskFilterStaff===s.id?'btn-primary':'btn-ghost')+'" onclick="setTaskFilter(\''+s.id+'\')" style="padding:4px 12px;">'+esc(s.short_name)+(n?' · '+n:'')+'</button>';
  });
  h+='</div>';
  // ═══ Section 1: Checklist hằng ngày (group by staff) ═══
  var recurringToday=filteredToday.filter(function(x){return x.is_recurring;});
  h+='<div class="section-title" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">';
  h+='<div>📋 Checklist công việc hằng ngày</div>';
  h+='<div style="font-size:11px;color:var(--tx3);font-weight:400;">'+recurringToday.length+' việc · '+recurringToday.filter(function(x){return x.status==='done';}).length+' hoàn thành</div>';
  h+='</div>';
  if(!recurringToday.length){
    h+='<div class="empty-state" role="status" style="margin-bottom:18px;"><div class="empty-state-icon" aria-hidden="true">📒</div><div class="empty-state-title">Chưa có công việc hằng ngày</div><div class="empty-state-desc">'+(isAdmin()?'Bấm "+ Giao việc" và tick "Lặp lại hằng ngày" để thêm checklist cho team.':'Liên hệ admin để được giao việc.')+'</div></div>';
  }else{
    visibleStaff.forEach(function(s){
      var arr=recurringToday.filter(function(x){return x.assignee_staff_id===s.id;});
      if(!arr.length)return;
      var done=arr.filter(function(x){return x.status==='done';}).length;
      var pct=Math.round(done*100/arr.length);
      var c=sc(s.color_code);
      h+='<div class="form-card" style="padding:14px 16px;margin-bottom:10px;">';
      h+='<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">';
      h+='<div class="avatar" style="width:32px;height:32px;background:'+c.bg+';color:'+c.tx+';">'+esc(s.avatar_initials)+'</div>';
      h+='<div style="flex:1;"><div style="font-weight:600;font-size:13px;">'+esc(s.full_name)+'</div><div style="font-size:11px;color:var(--tx3);">'+done+'/'+arr.length+' hoàn thành</div></div>';
      h+='<div style="font-size:12px;font-weight:600;color:'+(pct>=100?'var(--green)':pct>=50?'var(--blue)':'var(--tx3)')+';padding:4px 10px;border-radius:12px;background:'+(pct>=100?'rgba(34,197,94,0.1)':pct>=50?'rgba(59,130,246,0.1)':'var(--bg2)')+';">'+pct+'%</div>';
      h+='</div>';
      // Progress bar
      h+='<div style="height:4px;background:var(--bg2);border-radius:2px;margin-bottom:10px;overflow:hidden;"><div style="height:100%;width:'+pct+'%;background:'+(pct>=100?'var(--green)':'var(--blue)')+';transition:width 0.3s;"></div></div>';
      // Tasks
      arr.sort(function(a,b){
        var sa=a.status==='done'?2:(a.status==='doing'?1:0);
        var sb_=b.status==='done'?2:(b.status==='doing'?1:0);
        if(sa!==sb_)return sa-sb_;
        return (a.due_at||'').localeCompare(b.due_at||'');
      });
      arr.forEach(function(t){h+=renderTaskRow(t);});
      h+='</div>';
    });
    // Việc chưa phân công (assignee_staff_id null) — chỉ hiện khi không filter theo staff
    var unassigned=taskFilterStaff==='all'?recurringToday.filter(function(x){return !x.assignee_staff_id;}):[];
    if(unassigned.length){
      var udone=unassigned.filter(function(x){return x.status==='done';}).length;
      var upct=Math.round(udone*100/unassigned.length);
      h+='<div class="form-card" style="padding:14px 16px;margin-bottom:10px;border-style:dashed;">';
      h+='<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">';
      h+='<div class="avatar" style="width:32px;height:32px;background:var(--bg2);color:var(--tx3);font-size:14px;">?</div>';
      h+='<div style="flex:1;"><div style="font-weight:600;font-size:13px;color:var(--tx2);">Chưa phân công</div><div style="font-size:11px;color:var(--tx3);">'+udone+'/'+unassigned.length+' hoàn thành · cần admin gán người làm</div></div>';
      h+='<div style="font-size:12px;font-weight:600;color:'+(upct>=100?'var(--green)':upct>=50?'var(--blue)':'var(--tx3)')+';padding:4px 10px;border-radius:12px;background:var(--bg2);">'+upct+'%</div>';
      h+='</div>';
      h+='<div style="height:4px;background:var(--bg2);border-radius:2px;margin-bottom:10px;overflow:hidden;"><div style="height:100%;width:'+upct+'%;background:var(--blue);transition:width 0.3s;"></div></div>';
      unassigned.sort(function(a,b){
        var sa=a.status==='done'?2:(a.status==='doing'?1:0);
        var sb_=b.status==='done'?2:(b.status==='doing'?1:0);
        if(sa!==sb_)return sa-sb_;
        return (a.due_at||'').localeCompare(b.due_at||'');
      });
      unassigned.forEach(function(t){h+=renderTaskRow(t);});
      h+='</div>';
    }
  }
  // ═══ Section 2: Việc phát sinh ═══
  var adhocList=filteredToday.filter(function(x){return !x.is_recurring;});
  adhocList.sort(function(a,b){
    var pa=taskPriorityRank(a.priority),pb=taskPriorityRank(b.priority);
    if(pa!==pb)return pa-pb;
    return (a.due_at||'').localeCompare(b.due_at||'');
  });
  if(adhocList.length){
    h+='<div class="section-title" style="margin-top:18px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">';
    h+='<div>⚡ Việc mới phát sinh trong ngày</div>';
    h+='<div style="font-size:11px;color:var(--tx3);font-weight:400;">'+adhocList.length+' việc</div>';
    h+='</div>';
    h+='<div class="form-card" style="padding:8px 0;">';
    adhocList.forEach(function(t){h+=renderTaskRow(t,true);});
    h+='</div>';
  }
  // ═══ Section 3: Trễ hạn ═══
  if(filteredOverdue.length){
    filteredOverdue.sort(function(a,b){return a.task_date.localeCompare(b.task_date);});
    h+='<div class="section-title" style="margin-top:18px;color:var(--red);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">';
    h+='<div>⏰ Việc trễ hạn</div>';
    h+='<div style="font-size:11px;color:var(--tx3);font-weight:400;">'+filteredOverdue.length+' việc</div>';
    h+='</div>';
    h+='<div class="form-card" style="padding:8px 0;border-color:var(--red);">';
    filteredOverdue.forEach(function(t){h+=renderTaskRow(t,true,true);});
    h+='</div>';
  }
  return h;
}
function renderTaskRow(t,showAssignee,isOverdue){
  var s=t.assignee_staff_id?(staffList.find(function(x){return x.id===t.assignee_staff_id;})||allStaff.find(function(x){return x.id===t.assignee_staff_id;})):null;
  var pri=taskPriorityCfg(t.priority);
  var checked=t.status==='done',doing=t.status==='doing';
  var dueStr='';
  if(t.due_at){
    try{var d=new Date(t.due_at);dueStr=String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}catch(e){}
  }
  var overdueLabel='';
  if(isOverdue&&t.task_date){
    var dt=t.task_date.split('-');
    if(dt.length===3)overdueLabel='hạn '+dt[2]+'/'+dt[1];
  }
  var canEdit=isAdmin();
  var canTick=true; // open mode (xem CLAUDE.md notes)
  var subsArr=Array.isArray(t.subtasks)?t.subtasks:[];
  var hasSubsRow=subsArr.length>0;
  var canExpandRow=hasSubsRow||canEdit;
  var h='<div style="display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid var(--bd1);'+(checked?'opacity:0.55;':'')+'">';
  // Checkbox
  if(canTick){
    h+='<button onclick="toggleTaskStatus(\''+t.id+'\')" style="width:22px;height:22px;flex-shrink:0;border:1.5px solid '+(checked?'var(--green)':doing?'var(--blue)':'var(--bd2)')+';background:'+(checked?'var(--green)':doing?'rgba(59,130,246,0.1)':'transparent')+';border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-size:13px;padding:0;" title="'+(checked?'Hoàn thành — click để bỏ':doing?'Đang làm — click để hoàn thành':'Chưa làm — click để đánh dấu đang làm')+'">'+(checked?'✓':doing?'<span style="color:var(--blue);font-size:10px;">●</span>':'')+'</button>';
  }
  // Title + meta (clickable to expand sub-tasks)
  var titleWrapStyle='flex:1;min-width:0;'+(canExpandRow?'cursor:pointer;':'');
  var titleWrapAttr=canExpandRow?' onclick="toggleTaskExpand(\''+t.id+'\')" title="'+(hasSubsRow?'Click để xem đầu việc nhỏ':'Click để thêm đầu việc nhỏ')+'"':'';
  h+='<div style="'+titleWrapStyle+'"'+titleWrapAttr+'>';
  h+='<div style="font-size:13px;'+(checked?'text-decoration:line-through;':'')+(isOverdue?'color:var(--red);':'')+'">'+esc(t.title||'')+'</div>';
  var metaParts=[];
  if(showAssignee&&s)metaParts.push('<span style="display:inline-flex;align-items:center;gap:4px;"><span class="avatar" style="width:16px;height:16px;font-size:9px;background:'+sc(s.color_code).bg+';color:'+sc(s.color_code).tx+';">'+esc(s.avatar_initials)+'</span>'+esc(s.short_name)+'</span>');
  if(t.priority&&t.priority!=='thap')metaParts.push('<span style="padding:1px 6px;border-radius:4px;background:'+pri.bg+';color:'+pri.color+';font-size:10px;font-weight:500;">'+pri.label+'</span>');
  if(t.is_recurring)metaParts.push('<span title="Việc lặp hằng ngày" style="color:var(--tx3);font-size:10px;">🔁</span>');
  if(overdueLabel)metaParts.push('<span style="color:var(--red);font-size:10px;font-weight:500;">'+esc(overdueLabel)+'</span>');
  if(t.description)metaParts.push('<span style="color:var(--tx3);font-size:11px;" title="'+esc(t.description)+'">'+esc(t.description.length>40?t.description.substring(0,40)+'…':t.description)+'</span>');
  if(metaParts.length)h+='<div style="font-size:11px;color:var(--tx2);margin-top:2px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">'+metaParts.join('<span style="color:var(--bd2);">·</span>')+'</div>';
  h+='</div>';
  // Subtask progress badge + expand button
  var subs=Array.isArray(t.subtasks)?t.subtasks:[];
  var subDone=subs.filter(function(s){return s&&s.done;}).length;
  var hasSubs=subs.length>0;
  var isExp=!!taskExpandedIds[t.id];
  if(hasSubs){
    var pct=Math.round(subDone*100/subs.length);
    var col=pct>=100?'var(--green)':pct>=50?'var(--blue)':'var(--tx3)';
    h+='<button onclick="toggleTaskExpand(\''+t.id+'\')" style="border:1px solid var(--bd2);background:var(--bg2);border-radius:10px;padding:2px 8px;font-size:11px;color:'+col+';cursor:pointer;font-weight:500;white-space:nowrap;display:inline-flex;align-items:center;gap:4px;" title="'+(isExp?'Thu gọn':'Mở chi tiết')+'">'+subDone+'/'+subs.length+' <span style="font-size:9px;">'+(isExp?'▴':'▾')+'</span></button>';
  }
  // Time + actions
  if(dueStr)h+='<div style="font-size:11px;color:var(--tx3);font-variant-numeric:tabular-nums;white-space:nowrap;">⏰ '+esc(dueStr)+'</div>';
  if(canEdit){
    h+='<div style="display:flex;gap:2px;flex-shrink:0;">';
    if(!hasSubs)h+='<button onclick="toggleTaskExpand(\''+t.id+'\')" style="border:0;background:none;color:var(--tx3);cursor:pointer;font-size:13px;padding:4px;" title="Thêm đầu việc nhỏ">＋</button>';
    h+='<button onclick="openTaskModal(\''+t.id+'\')" style="border:0;background:none;color:var(--tx3);cursor:pointer;font-size:13px;padding:4px;" title="Sửa">✎</button>';
    h+='<button onclick="deleteTeamTask(\''+t.id+'\')" style="border:0;background:none;color:var(--tx3);cursor:pointer;font-size:14px;padding:4px;" title="Xóa">×</button>';
    h+='</div>';
  }
  h+='</div>';
  // Inline expand: list subtasks
  if(isExp){
    h+='<div style="padding:8px 14px 12px 46px;background:var(--bg2);border-bottom:1px solid var(--bd1);">';
    if(subs.length){
      h+='<div style="display:flex;flex-direction:column;gap:4px;margin-bottom:8px;">';
      subs.forEach(function(sub,idx){
        var sd=!!sub.done;
        h+='<div style="display:flex;align-items:center;gap:8px;font-size:12px;'+(sd?'opacity:0.55;':'')+'">';
        h+='<button onclick="toggleSubtaskDone(\''+t.id+'\','+idx+')" style="width:16px;height:16px;border:1.5px solid '+(sd?'var(--green)':'var(--bd2)')+';background:'+(sd?'var(--green)':'transparent')+';border-radius:4px;cursor:pointer;color:#fff;font-size:10px;display:inline-flex;align-items:center;justify-content:center;padding:0;flex-shrink:0;">'+(sd?'✓':'')+'</button>';
        h+='<span style="flex:1;'+(sd?'text-decoration:line-through;':'')+'">'+esc(sub.title||'')+'</span>';
        if(canEdit)h+='<button onclick="removeSubtaskInline(\''+t.id+'\','+idx+')" style="border:0;background:none;color:var(--tx3);cursor:pointer;font-size:13px;padding:0 4px;" title="Xóa">×</button>';
        h+='</div>';
      });
      h+='</div>';
    }
    if(canEdit){
      h+='<form onsubmit="event.preventDefault();addSubtaskInline(\''+t.id+'\',this.querySelector(\'input\'));" style="display:flex;gap:6px;">';
      h+='<input type="text" class="fi" placeholder="+ Thêm đầu việc (VD: Getfit, Hibou…)" style="flex:1;font-size:12px;padding:5px 8px;">';
      h+='<button type="submit" class="btn btn-sm btn-ghost" style="font-size:11px;padding:4px 10px;">Thêm</button>';
      h+='</form>';
    }
    h+='</div>';
  }
  return h;
}
function setTaskFilter(v){taskFilterStaff=v;render();}
function toggleTaskExpand(id){
  taskExpandedIds[id]=!taskExpandedIds[id];
  render();
}
async function _persistSubtasks(id,subs){
  var t=teamTaskData.find(function(x){return x.id===id;});if(!t)return;
  var prev=Array.isArray(t.subtasks)?t.subtasks.slice():[];
  t.subtasks=subs;render();
  var r=await sb2.from('team_task').update({subtasks:subs}).eq('id',id);
  if(r.error){t.subtasks=prev;render();toast('Lỗi: '+r.error.message,false);}
}
function toggleSubtaskDone(taskId,idx){
  if(!needAuth())return;
  var t=teamTaskData.find(function(x){return x.id===taskId;});if(!t)return;
  var subs=Array.isArray(t.subtasks)?t.subtasks.slice():[];
  if(!subs[idx])return;
  subs[idx]=Object.assign({},subs[idx],{done:!subs[idx].done});
  _persistSubtasks(taskId,subs);
}
function addSubtaskInline(taskId,inputEl){
  if(!isAdmin()){toast('Chỉ admin mới thêm được',false);return;}
  if(!inputEl)return;
  var title=(inputEl.value||'').trim();if(!title)return;
  var t=teamTaskData.find(function(x){return x.id===taskId;});if(!t)return;
  var subs=Array.isArray(t.subtasks)?t.subtasks.slice():[];
  subs.push({title:title,done:false});
  inputEl.value='';
  _persistSubtasks(taskId,subs);
}
async function removeSubtaskInline(taskId,idx){
  if(!isAdmin()){toast('Chỉ admin mới xóa được',false);return;}
  var t=teamTaskData.find(function(x){return x.id===taskId;});if(!t)return;
  var subs=Array.isArray(t.subtasks)?t.subtasks.slice():[];
  if(!subs[idx])return;
  if(!(await hcConfirm({title:'Xóa đầu việc',message:'Xóa "'+subs[idx].title+'"?',confirmLabel:'Xóa',danger:true})))return;
  subs.splice(idx,1);
  _persistSubtasks(taskId,subs);
}
function setTaskViewDate(v){if(!v)return;taskViewDate=v;render();}
function shiftTaskDate(delta){
  var v=taskViewDate||todayStr();
  var p=v.split('-');
  var d=new Date(parseInt(p[0]),parseInt(p[1])-1,parseInt(p[2]));
  d.setDate(d.getDate()+delta);
  taskViewDate=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  render();
}
async function toggleTaskStatus(id){
  if(!needAuth())return;
  var t=teamTaskData.find(function(x){return x.id===id;});if(!t)return;
  var next=t.status==='done'?'todo':(t.status==='doing'?'done':'doing');
  var payload={status:next};
  if(next==='done'){payload.completed_at=new Date().toISOString();payload.completed_by=authUser?authUser.email:null;}
  else if(t.status==='done'){payload.completed_at=null;payload.completed_by=null;}
  // Optimistic update
  var prev={status:t.status,completed_at:t.completed_at,completed_by:t.completed_by};
  t.status=next;t.completed_at=payload.completed_at;t.completed_by=payload.completed_by;
  render();
  var r=await sb2.from('team_task').update(payload).eq('id',id);
  if(r.error){
    t.status=prev.status;t.completed_at=prev.completed_at;t.completed_by=prev.completed_by;
    render();toast('Lỗi: '+r.error.message,false);
  }
}
async function deleteTeamTask(id){
  if(!isAdmin()){toast('Chỉ admin mới xóa được',false);return;}
  var t=teamTaskData.find(function(x){return x.id===id;});if(!t)return;
  var msg='Xóa việc "'+t.title+'"?';
  if(t.is_recurring)msg+='\n\n⚠ Đây là việc hằng ngày — chỉ xóa instance hôm nay, ngày mai vẫn tự sinh lại nếu cùng recurring_key. Để dừng hẳn, sửa task → bỏ tick "Lặp lại hằng ngày".';
  if(!(await hcConfirm({title:'Xóa việc',message:msg,confirmLabel:'Xóa',danger:true})))return;
  var r=await sb2.from('team_task').delete().eq('id',id);
  if(r.error){toast('Lỗi: '+r.error.message,false);return;}
  teamTaskData=teamTaskData.filter(function(x){return x.id!==id;});
  toast('Đã xóa',true);render();
}
function openTaskModal(editId){
  if(!isAdmin()){toast('Chỉ admin mới giao việc được',false);return;}
  var root=document.getElementById('hc-modal-root')||(function(){var d=document.createElement('div');d.id='hc-modal-root';document.body.appendChild(d);return d;})();
  var ex=document.getElementById('team-task-modal');if(ex)ex.remove();
  var t=editId?teamTaskData.find(function(x){return x.id===editId;}):null;
  // Buffer subtasks
  _modalSubtasks=t&&Array.isArray(t.subtasks)?t.subtasks.map(function(s){return{title:s.title||'',done:!!s.done};}):[];
  var modal=document.createElement('div');modal.id='team-task-modal';modal.className='hc-modal-backdrop';
  modal.setAttribute('onclick','if(event.target===this)closeTaskModal()');
  var assignOpts=staffList.map(function(s){return '<option value="'+s.id+'"'+(t&&t.assignee_staff_id===s.id?' selected':'')+'>'+esc(s.full_name)+'</option>';}).join('');
  var priChips=TASK_PRIORITIES.map(function(p){
    var act=(t?t.priority:'thap')===p.key;
    return '<button type="button" data-pri="'+p.key+'" onclick="pickTaskPriority(\''+p.key+'\')" class="btn btn-sm '+(act?'btn-primary':'btn-ghost')+'" style="padding:5px 12px;font-size:12px;">'+esc(p.label)+'</button>';
  }).join('');
  var defaultDue=t&&t.due_at?String(t.due_at).substring(0,16):'';
  modal.innerHTML=
    '<div class="hc-modal" role="dialog" aria-modal="true" style="max-width:520px;">'
    +'<div class="hc-modal-head"><h3>'+(editId?'Sửa việc':'Giao việc')+'</h3><button class="hc-modal-close" onclick="closeTaskModal()" aria-label="Đóng">×</button></div>'
    +'<div class="hc-modal-body">'
    +'<input type="hidden" id="tk-id" value="'+(editId||'')+'">'
    +'<div style="margin-bottom:12px;"><label style="font-size:12px;color:var(--tx2);font-weight:500;">Tiêu đề việc <span style="color:var(--red);">*</span></label>'
    +'<input type="text" id="tk-title" class="fi" placeholder="VD: Họp đầu ngày với team" style="width:100%;margin-top:4px;" value="'+esc(t?t.title:'')+'"></div>'
    +'<div style="margin-bottom:12px;"><label style="font-size:12px;color:var(--tx2);font-weight:500;">Giao cho</label>'
    +'<select id="tk-assignee" class="fi" style="width:100%;margin-top:4px;"><option value="">— Chưa gán —</option>'+assignOpts+'</select></div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">'
    +'<div><label style="font-size:12px;color:var(--tx2);font-weight:500;">Hạn (giờ:phút)</label><input type="datetime-local" id="tk-due" class="fi" style="width:100%;margin-top:4px;" value="'+esc(defaultDue)+'"></div>'
    +'<div><label style="font-size:12px;color:var(--tx2);font-weight:500;">Trạng thái</label><select id="tk-status" class="fi" style="width:100%;margin-top:4px;"><option value="todo"'+(!t||t.status==='todo'?' selected':'')+'>Chưa làm</option><option value="doing"'+(t&&t.status==='doing'?' selected':'')+'>Đang làm</option><option value="done"'+(t&&t.status==='done'?' selected':'')+'>Hoàn thành</option></select></div>'
    +'</div>'
    +'<div style="margin-bottom:12px;"><label style="font-size:12px;color:var(--tx2);font-weight:500;">Ưu tiên</label>'
    +'<div id="tk-pri-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">'+priChips+'</div>'
    +'<input type="hidden" id="tk-priority" value="'+(t?t.priority:'thap')+'"></div>'
    +'<div style="margin-bottom:12px;"><label style="font-size:12px;color:var(--tx2);font-weight:500;">Mô tả thêm (không bắt buộc)</label>'
    +'<textarea id="tk-desc" class="fi" rows="2" style="width:100%;margin-top:4px;" placeholder="Thông tin chi tiết, link, file...">'+esc(t?(t.description||''):'')+'</textarea></div>'
    +'<div style="margin-bottom:12px;"><label style="font-size:12px;color:var(--tx2);font-weight:500;">Đầu việc nhỏ <span style="color:var(--tx3);font-weight:400;">(tick từng cái khi xong, VD: Getfit, Hibou)</span></label>'
    +'<div id="tk-subs-list" style="margin-top:6px;display:flex;flex-direction:column;gap:4px;"></div>'
    +'<form onsubmit="event.preventDefault();_addModalSubtask(this.querySelector(\'input\'));" style="display:flex;gap:6px;margin-top:6px;">'
    +'<input type="text" class="fi" placeholder="+ Thêm đầu việc rồi Enter" style="flex:1;font-size:12px;padding:5px 8px;">'
    +'<button type="submit" class="btn btn-sm btn-ghost" style="font-size:11px;padding:4px 10px;">Thêm</button>'
    +'</form></div>'
    +'<div style="margin-bottom:12px;display:flex;align-items:center;gap:8px;font-size:12px;color:var(--tx2);">'
    +'<label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="checkbox" id="tk-recurring" style="margin:0;"'+(t&&t.is_recurring?' checked':'')+'> 🔁 Lặp lại hằng ngày <span style="color:var(--tx3);">(tự sinh task mới mỗi sáng)</span></label></div>'
    +'<div class="btn-row" style="margin-top:18px;"><button class="btn btn-ghost" onclick="closeTaskModal()">Hủy</button><button class="btn btn-primary" onclick="saveTeamTask(this)">'+(editId?'Lưu':'Giao việc')+'</button></div>'
    +'</div></div>';
  root.appendChild(modal);
  _renderModalSubtasks();
  setTimeout(function(){var ti=document.getElementById('tk-title');if(ti&&!editId)ti.focus();},20);
}
function closeTaskModal(){var m=document.getElementById('team-task-modal');if(m)m.remove();_modalSubtasks=[];}
function _renderModalSubtasks(){
  var box=document.getElementById('tk-subs-list');if(!box)return;
  if(!_modalSubtasks.length){box.innerHTML='<div style="font-size:11px;color:var(--tx3);padding:4px 0;">Chưa có đầu việc nhỏ — nhập bên dưới</div>';return;}
  var html='';
  _modalSubtasks.forEach(function(s,idx){
    var sd=!!s.done;
    html+='<div style="display:flex;align-items:center;gap:8px;font-size:12px;padding:4px 8px;background:var(--bg2);border-radius:6px;'+(sd?'opacity:0.55;':'')+'">';
    html+='<button type="button" onclick="_toggleModalSubtask('+idx+')" style="width:16px;height:16px;border:1.5px solid '+(sd?'var(--green)':'var(--bd2)')+';background:'+(sd?'var(--green)':'transparent')+';border-radius:4px;cursor:pointer;color:#fff;font-size:10px;display:inline-flex;align-items:center;justify-content:center;padding:0;flex-shrink:0;">'+(sd?'✓':'')+'</button>';
    html+='<span style="flex:1;'+(sd?'text-decoration:line-through;':'')+'">'+esc(s.title)+'</span>';
    html+='<button type="button" onclick="_removeModalSubtask('+idx+')" style="border:0;background:none;color:var(--tx3);cursor:pointer;font-size:13px;padding:0 4px;" title="Xóa">×</button>';
    html+='</div>';
  });
  box.innerHTML=html;
}
function _addModalSubtask(input){
  if(!input)return;
  var v=(input.value||'').trim();if(!v)return;
  _modalSubtasks.push({title:v,done:false});
  input.value='';
  _renderModalSubtasks();
}
function _removeModalSubtask(idx){_modalSubtasks.splice(idx,1);_renderModalSubtasks();}
function _toggleModalSubtask(idx){if(!_modalSubtasks[idx])return;_modalSubtasks[idx].done=!_modalSubtasks[idx].done;_renderModalSubtasks();}
function pickTaskPriority(k){
  var input=document.getElementById('tk-priority');if(!input)return;
  input.value=k;
  document.querySelectorAll('#tk-pri-chips [data-pri]').forEach(function(c){
    if(c.getAttribute('data-pri')===k){c.classList.remove('btn-ghost');c.classList.add('btn-primary');}
    else{c.classList.add('btn-ghost');c.classList.remove('btn-primary');}
  });
}
async function saveTeamTask(btn){
  if(!needAuth())return;
  if(!isAdmin()){toast('Chỉ admin mới giao việc được',false);return;}
  var id=document.getElementById('tk-id').value;
  var title=document.getElementById('tk-title').value.trim();
  var assignee=document.getElementById('tk-assignee').value||null;
  var dueRaw=document.getElementById('tk-due').value;
  var status=document.getElementById('tk-status').value||'todo';
  var priority=document.getElementById('tk-priority').value||'thap';
  var desc=document.getElementById('tk-desc').value.trim();
  var recurring=document.getElementById('tk-recurring').checked;
  if(!title){toast('Cần nhập tiêu đề việc',false);return;}
  var due=dueRaw?new Date(dueRaw).toISOString():null;
  var payload={
    title:title,description:desc||null,
    assignee_staff_id:assignee,
    due_at:due,priority:priority,status:status,
    is_recurring:recurring,
    subtasks:_modalSubtasks.map(function(s){return{title:s.title,done:!!s.done};})
  };
  if(status==='done'&&!id){payload.completed_at=new Date().toISOString();payload.completed_by=authUser?authUser.email:null;}
  if(btn){btn.disabled=true;btn.textContent='Đang lưu...';}
  var r;
  if(id){
    var existing=teamTaskData.find(function(x){return x.id===id;});
    if(recurring&&existing&&!existing.recurring_key){
      payload.recurring_key='rec-'+Math.random().toString(36).slice(2,10);
    }
    if(!recurring)payload.recurring_key=null;
    r=await sb2.from('team_task').update(payload).eq('id',id).select().single();
  }else{
    payload.task_date=taskViewDate||todayStr();
    payload.created_by=authUser?authUser.email:null;
    if(recurring)payload.recurring_key='rec-'+Math.random().toString(36).slice(2,10);
    r=await sb2.from('team_task').insert(payload).select().single();
  }
  if(btn){btn.disabled=false;btn.textContent=id?'Lưu':'Giao việc';}
  if(r.error){toast('Lỗi: '+r.error.message,false);return;}
  if(id){teamTaskData=teamTaskData.map(function(x){return x.id===id?r.data:x;});}
  else{teamTaskData.unshift(r.data);}
  toast(id?'Đã cập nhật':'Đã giao việc',true);
  closeTaskModal();render();
}

// ═══ META SYNC ═══
// Đồng bộ lại toàn bộ ngày trong khoảng đang xem (chốt số khớp Meta sau adjustment)
async function syncCurrentRange(btn){
if(!needAuth())return;
var range=getAdViewRange();
var mapped=adList.filter(function(a){return a.fb_account_id;});
if(!mapped.length){toast('Chưa có Tài khoản nào ghép Meta',false);return;}
// Build danh sách ngày trong range
var dateList=[],cur=new Date(range.start+'T00:00:00'),endD=new Date(range.end+'T00:00:00');
while(cur<=endD){var y=cur.getFullYear(),m=('0'+(cur.getMonth()+1)).slice(-2),d=('0'+cur.getDate()).slice(-2);dateList.push(y+'-'+m+'-'+d);cur.setDate(cur.getDate()+1);}
if(!dateList.length){toast('Khoảng ngày không hợp lệ',false);return;}
var origHTML=btn?btn.innerHTML:'';
if(btn)btn.disabled=true;
var totalSaved=0,totalErrors=0;
for(var i=0;i<dateList.length;i++){
if(btn)btn.innerHTML='<span class="ad-toolbar-note-dot"></span><span class="sync-btn-label">Đang đồng bộ '+(i+1)+'/'+dateList.length+' · '+fd(dateList[i])+'…</span>';
var r=await syncOneDate(dateList[i],mapped);
totalSaved+=r.saved;totalErrors+=r.errors;}
if(btn){btn.disabled=false;btn.innerHTML=origHTML;}
toast('Đã chốt '+dateList.length+' ngày ('+fd(range.start)+' → '+fd(range.end)+'): '+totalSaved+' OK'+(totalErrors?' · '+totalErrors+' lỗi':''),!totalErrors);
await loadAll();stayPage();}
async function loadMetaAccounts(force,silent){
if(!force&&metaAccounts.length)return;
try{
var all=[],path='me/adaccounts?fields=id,name,account_status&limit=100';
while(path){
var data=await metaGet(path);
if(data.error){if(!silent)toast('Meta API lỗi: '+data.error.message,false);return;}
all=all.concat(data.data||[]);
var nextCursor=data.paging&&data.paging.next&&data.paging.cursors&&data.paging.cursors.after;
path=nextCursor?'me/adaccounts?fields=id,name,account_status&limit=100&after='+encodeURIComponent(nextCursor):null;
}
var detailed=[];
for(var b=0;b<all.length;b+=50){
var chunk=all.slice(b,b+50);
var batchReqs=chunk.map(function(a){return{method:'GET',relative_url:a.id+'?fields=id,name,account_status,spend_cap,amount_spent'};});
try{
var bResults=await metaBatch(batchReqs);
for(var j=0;j<chunk.length;j++){
try{var body=JSON.parse((bResults[j]&&bResults[j].body)||'{}');
if(!body.error&&body.id)detailed.push(body);else detailed.push(chunk[j]);
}catch(e2){detailed.push(chunk[j]);}
}
}catch(e){for(var k=0;k<chunk.length;k++)detailed.push(chunk[k]);}
}
metaAccounts=detailed;
}catch(e){if(!silent)toast('Lỗi: '+e.message,false);}
}
async function loadMetaAndSync(opts){
opts=opts||{};
var silent=!!opts.silent,skipAuth=!!opts.skipAuth,refreshAfter=opts.refreshAfter!==false;
if(skipAuth){if(!authUser)return{ok:false,reason:'auth'};}
else if(!needAuth())return{ok:false,reason:'auth'};
await loadMetaAccounts(true,silent);if(!metaAccounts.length)return{ok:false,reason:'empty'};
var seen=new Set();var uniqueMeta=metaAccounts.filter(function(m){if(seen.has(m.id))return false;seen.add(m.id);return true;});
var existFb=new Set();adList.forEach(function(a){if(a.fb_account_id)existFb.add(a.fb_account_id);});
var ph=clientList.find(function(c){return c.name==='Chưa phân loại';});var phId;
if(ph){phId=ph.id;}else{var{data:nc,error}=await sb2.from('client').insert({name:'Chưa phân loại',status:'active'}).select('id').single();if(error){if(!silent)toast('Lỗi',false);return{ok:false,reason:'placeholder'};}phId=nc.id;}
var imp=0,capOnlyCount=0;
var newAccounts=uniqueMeta.filter(function(m){return!existFb.has(m.id);});
if(newAccounts.length){
var insertRows=newAccounts.map(function(m){existFb.add(m.id);imp++;return{client_id:phId,account_name:m.name,fb_account_id:m.id,account_status:m.account_status};});
var insertBatches=chunkArray(insertRows,200);
for(var ib=0;ib<insertBatches.length;ib++){await sb2.from('ad_account').insert(insertBatches[ib]);}}
var updateItems=uniqueMeta.map(function(m2){var spendCap=metaNum(m2.spend_cap),amountSpent=metaNum(m2.amount_spent);if(spendCap&&amountSpent>spendCap)capOnlyCount++;return{id:m2.id,data:{account_name:m2.name,account_status:m2.account_status,spend_cap:spendCap,amount_spent:amountSpent}};});
await runLimited(updateItems,15,async function(item){await sb2.from('ad_account').update(item.data).eq('fb_account_id',item.id);});
if(!silent)toast((imp?'Nhập '+imp+' Tài khoản mới + ':'')+'Đã cập nhật Meta'+(capOnlyCount?' · '+capOnlyCount+' Tài khoản chỉ đồng bộ được ngưỡng':''),true);
if(refreshAfter)await loadAll();
return{ok:true,imported:imp,capOnlyCount:capOnlyCount};}

// ═══ A2: NHÂN SỰ ═══
function a2(){
// Gợi ý mã NS kế tiếp (lớn nhất hiện tại + 1, zero-pad 3 chữ số)
var maxNo=0;allStaff.forEach(function(s){var n=parseInt(s.display_code||'0');if(!isNaN(n)&&n>maxNo)maxNo=n;});
var suggestedNo=String(maxNo+1).padStart(3,'0');
var h='<div class="form-card"><h3>Thêm nhân sự</h3><div class="form-row"><div class="form-group"><label>Mã NS</label><input type="text" id="sno" placeholder="'+suggestedNo+'" maxlength="6" style="font-family:monospace;"></div><div class="form-group"><label>Họ tên</label><input type="text" id="sf" placeholder="VD: Nguyễn Văn A"></div><div class="form-group"><label>Tên ngắn</label><input type="text" id="ss" placeholder="VD: Văn A"></div></div>';
h+='<div class="form-row"><div class="form-group"><label>Mã code (định danh)</label><input type="text" id="sc2" placeholder="VD: vana"></div><div class="form-group"><label>Viết tắt</label><input type="text" id="si" placeholder="VA" maxlength="3"></div><div class="form-group"><label>Màu</label><select id="scl"><option value="purple">Tím</option><option value="teal">Xanh lá</option><option value="coral">Cam</option><option value="pink">Hồng</option><option value="blue">Xanh dương</option><option value="amber">Vàng</option></select></div></div>';
h+='<div class="form-row"><div class="form-group"><label>Ngân sách/tháng</label><input type="number" id="sb2" placeholder="250000000"></div><div class="form-group"><label>Từ khóa chiến dịch</label><input type="text" id="skw" placeholder="VD: Thư, KL (dùng cho Tài khoản dùng chung)"></div></div>';
h+='<div class="btn-row"><button class="btn btn-primary" onclick="svs(this)">Thêm</button></div></div>';
// ═══ Bảng GỘP — 1 dòng = 1 PERSON (nhân sự + tài khoản đăng nhập nếu có) ═══
// Match logic: explicit staff_id link → fuzzy name match → orphan
var usedURIds={};
function _matchURForStaff(s){
  // 1. Explicit
  var ex=allUserRoles.find(function(u){return u.staff_id===s.id;});
  if(ex)return{ur:ex,fuzzy:false};
  // 2. Fuzzy: chỉ match khi ur chưa gán staff_id, so theo display_name / email-prefix
  var sKeys=[s.short_name,s.full_name,s.code,s.campaign_keyword].map(normalizePersonAlias).filter(Boolean);
  for(var i=0;i<allUserRoles.length;i++){
    var ur=allUserRoles[i];
    if(ur.staff_id||usedURIds[ur.id])continue;
    var urKeys=[ur.display_name,ur.email?ur.email.split('@')[0]:''].map(normalizePersonAlias).filter(Boolean);
    for(var j=0;j<urKeys.length;j++){
      for(var k=0;k<sKeys.length;k++){
        var a=urKeys[j],b=sKeys[k];
        if(!a||!b||a.length<3||b.length<3)continue;
        if(a===b||a.indexOf(b)>=0||b.indexOf(a)>=0)return{ur:ur,fuzzy:true};
      }
    }
  }
  return null;
}
// Tạo danh sách person: 1 dòng/staff (kèm UR match), rồi UR orphan ở cuối
var people=[];
allStaff.slice().sort(function(a,b){return parseInt(a.display_code||'9999')-parseInt(b.display_code||'9999');}).forEach(function(s){
  var m=_matchURForStaff(s);
  if(m){usedURIds[m.ur.id]=1;people.push({staff:s,ur:m.ur,fuzzy:m.fuzzy});}
  else people.push({staff:s,ur:null,fuzzy:false});
});
allUserRoles.forEach(function(ur){if(!usedURIds[ur.id])people.push({staff:null,ur:ur,fuzzy:false});});

h+='<div class="section-title">Người dùng ('+people.length+')</div>';
h+='<div style="padding:10px 14px;background:var(--blue-bg);color:var(--blue-tx);border-radius:var(--radius);font-size:12px;line-height:1.6;margin-bottom:10px;">Bảng gộp: mỗi dòng = 1 người (nhân sự + tài khoản đăng nhập). Dòng có biểu tượng 🔗 = đang fuzzy-match tự động theo tên (chưa lưu DB) — bấm "🔗 Lưu liên kết" để chốt.</div>';
h+='<div class="table-wrap"><table><tr><th>Mã NS</th><th></th><th>Họ tên</th><th>Email đăng nhập</th><th>Vai trò</th><th>Quyền truy cập</th><th style="text-align:right;">Thao tác</th></tr>';
// Detect: staff này có phải là CEO (Hưng Coaching) → nếu chưa có user_role + đang đăng nhập admin
// thì hiển thị inline thông tin admin (admin mặc định không có entry trong user_roles).
function _isCEOStaff(s){return s&&((Number(s.default_base_salary)===0)||/h(ư|u)ng coaching|ceo/i.test((s.full_name||'')+' '+(s.short_name||'')));}
people.forEach(function(p){
  var s=p.staff,ur=p.ur;
  var c=s?sc(s.color_code):{bg:'var(--bg2)',tx:'var(--tx3)'};
  // Implicit admin row: staff là CEO, chưa match user_role, đang đăng nhập với quyền admin
  var implicitAdmin=!ur&&s&&_isCEOStaff(s)&&authUser&&isAdmin()&&!currentUserRoleRecord;
  var pagesHtml=ur?esc((ur.allowed_pages||[]).map(function(x){return permissionLabel(normalizePermKey(x));}).join(', ')||'—'):(implicitAdmin?'<span style="color:var(--green);font-weight:500;">Toàn quyền</span>':'<span style="color:var(--tx3);">—</span>');
  var nameDisplay=s?s.full_name:(ur.display_name||'(chưa đặt tên)');
  var rowStyle=(s&&!s.is_active)?' style="opacity:.5;"':(p.fuzzy?' style="background:#fffbeb;"':'');
  h+='<tr'+rowStyle+'>';
  h+='<td><span class="mono" style="font-weight:600;font-size:13px;color:'+(s&&s.display_code?'var(--blue)':'var(--tx3)')+';">'+esc(s&&s.display_code?s.display_code:'—')+'</span></td>';
  h+='<td>'+(s?'<div class="avatar" style="background:'+c.bg+';color:'+c.tx+';">'+esc(s.avatar_initials)+'</div>':'<div class="avatar" style="background:var(--bg2);color:var(--tx3);font-size:14px;">?</div>')+'</td>';
  h+='<td style="font-weight:500;">'+esc(nameDisplay)+(implicitAdmin?' <span title="Tài khoản đang đăng nhập" style="font-size:11px;color:var(--green);font-weight:600;">🟢 Bạn</span>':'')+(p.fuzzy?' <span title="Khớp tự động theo tên — chưa lưu vào DB" style="font-size:11px;color:var(--amber-tx);">🔗 tự khớp</span>':'')+(s?'<div style="font-size:11px;color:var(--tx3);font-weight:400;">'+esc(s.code||'')+(s.campaign_keyword?' · KW: <span style="color:var(--purple);">'+esc(s.campaign_keyword)+'</span>':'')+'</div>':(ur?'<div style="font-size:11px;color:var(--tx3);font-weight:400;">Không gắn nhân sự</div>':''))+'</td>';
  h+='<td style="font-size:12px;color:var(--tx2);">'+(ur?esc(ur.email):(implicitAdmin?esc(authUser.email):'<span style="color:var(--tx3);font-size:11px;">Chưa có TK</span>'))+'</td>';
  h+='<td>'+(ur?'<span class="badge b-blue">'+esc(userRoleLabel(ur.role))+'</span>':(implicitAdmin?'<span class="badge b-red">Admin</span>':'<span style="color:var(--tx3);font-size:11px;">—</span>'))+'</td>';
  h+='<td style="font-size:11px;">'+pagesHtml+'</td>';
  h+='<td style="text-align:right;white-space:nowrap;">';
  if(p.fuzzy&&s&&ur)h+='<button class="btn btn-primary btn-sm" onclick="confirmFuzzyLink(this,\''+ur.id+'\',\''+s.id+'\')" title="Lưu liên kết vào DB" style="margin-right:4px;">🔗</button>';
  h+='<button class="btn btn-ghost btn-sm" onclick="openPersonEditModal('+(s?'\''+s.id+'\'':'null')+','+(ur?'\''+ur.id+'\'':'null')+')" title="Sửa thông tin nhân sự, tài khoản & quyền">✏ Sửa</button>';
  h+='</td></tr>';
});
if(!people.length)h+='<tr><td colspan="7" style="text-align:center;color:var(--tx3);font-size:12px;padding:20px;">Chưa có người dùng nào.</td></tr>';
h+='</table></div>';
// ═══ Form Phân quyền tài khoản đăng nhập (chỉ form, không lặp lại bảng) ═══
h+=renderUserRolesSection();
return h;}
// Lưu liên kết fuzzy-match (user_roles.staff_id) vào DB
async function confirmFuzzyLink(btn,urId,staffId){
  if(!isAdmin())return;
  btn.disabled=true;var orig=btn.textContent;btn.textContent='Đang lưu...';
  var r=await sb2.from('user_roles').update({staff_id:staffId}).eq('id',urId);
  btn.disabled=false;btn.textContent=orig;
  if(r.error){toast('Lỗi: '+r.error.message,false);return;}
  toast('Đã lưu liên kết',true);await loadAllUserRoles();render();
}
// Click "+ TK" cạnh 1 nhân sự → mở form Phân quyền với staff pre-selected
function createUserRoleForStaff(staffId){
  editingUserRoleId=null;
  pendingNewUserRoleStaffId=staffId;
  render();
  setTimeout(function(){var el=document.getElementById('ur-form-card');if(el)el.scrollIntoView({behavior:'smooth',block:'start'});var nameEl=document.getElementById('ur-name');if(nameEl&&!nameEl.value){var s=allStaff.find(function(x){return x.id===staffId;});if(s)nameEl.value=s.full_name||s.short_name||'';}},50);
}
async function svs(btn){if(!needAuth())return;btn.disabled=true;
var noInput=document.getElementById('sno').value.trim();
var displayCode=noInput||document.getElementById('sno').placeholder; // fallback dùng suggested nếu để trống
var d={full_name:document.getElementById('sf').value,short_name:document.getElementById('ss').value,code:document.getElementById('sc2').value,avatar_initials:document.getElementById('si').value,color_code:document.getElementById('scl').value,monthly_budget:parseInt(document.getElementById('sb2').value)||0,campaign_keyword:document.getElementById('skw').value||null,display_code:displayCode||null};
if(!d.full_name||!d.code){toast('Nhập tên và code',false);btn.disabled=false;return;}
var r=await sb2.from('staff').insert(d);btn.disabled=false;
if(r.error)toast('Lỗi: '+r.error.message,false);else{toast('Đã thêm — Mã NS: '+(displayCode||'?'),true);['sno','sf','ss','sc2','si','sb2','skw'].forEach(function(x){var el=document.getElementById(x);if(el)el.value='';});await loadLight();}}
async function tgs(btn,id,v){if(!needAuth())return;btn.disabled=true;var r=await sb2.from('staff').update({is_active:v}).eq('id',id);btn.disabled=false;if(r.error)toast('Lỗi',false);else{toast('Đã lưu ngưỡng giá',true);await loadLight();}}
async function esp(id){if(!needAuth())return;var s=allStaff.find(function(x){return x.id===id;});if(!s)return;
var no=prompt('Mã NS (VD 001):',s.display_code||'');if(no===null)return;
var n=prompt('Họ tên:',s.full_name);if(n===null)return;
var b=prompt('Ngân sách/tháng:',s.monthly_budget);if(b===null)return;
var kw=prompt('Từ khóa chiến dịch:',s.campaign_keyword||'');if(kw===null)return;
var r=await sb2.from('staff').update({display_code:no.trim()||null,full_name:n,monthly_budget:parseInt(b)||0,campaign_keyword:kw||null}).eq('id',id);
if(r.error)toast('Lỗi: '+r.error.message,false);else{toast('Đã lưu',true);await loadLight();}}

async function toggleClientVat(id,newVal){
if(!needAuth())return;
var r=await sb2.from('client').update({has_vat:newVal}).eq('id',id);
if(r.error){toast('Lỗi: '+r.error.message,false);return;}
toast(newVal?'Đã bật VAT 8%':'Đã tắt VAT',true);
await loadAll();render();
}
// ═══ Sửa ngày bắt đầu quản lý khách (dùng cho tính hoa hồng 1%/2%) ═══
async function onClientStartDateChange(clientId,newDate){
if(!needAuth())return;
if(!newDate){toast('Ngày không hợp lệ',false);return;}
var statusEl=document.getElementById('client-sd-status-'+clientId);
if(statusEl){statusEl.textContent='Đang lưu...';statusEl.style.color='var(--tx3)';}
var r=await sb2.from('client').update({start_date:newDate}).eq('id',clientId);
if(r.error){
if(statusEl){statusEl.textContent='Lỗi: '+r.error.message;statusEl.style.color='var(--red)';}
toast('Lỗi: '+r.error.message,false);
return;
}
// Cập nhật local để không cần reload
var c=clientList.find(function(x){return x.id===clientId;});
if(c)c.start_date=newDate;
if(statusEl){statusEl.textContent='Đã lưu ✓';statusEl.style.color='var(--green)';}
toast('Đã lưu ngày bắt đầu',true);
// Re-render sau 600ms để cập nhật % hoa hồng trong bảng lương
setTimeout(function(){render();},600);
}

// ═══════════════════════════════════════════════════════════
// TÍNH NĂNG: HỢP ĐỒNG + KHÁCH TIỀM NĂNG
// ═══════════════════════════════════════════════════════════

// ═══ THÔNG TIN BÊN B (HC AGENCY) — chỉnh ở đây nếu thay đổi ═══
var PARTY_B_INFO={
  company_name:'CÔNG TY TNHH HC QUẢNG CÁO',
  address:'Số 111, tầng 2, Tòa PZ4, Vinhomes Smart City, Phường Tây Mỗ, Thành phố Hà Nội, Việt Nam',
  tax_code:'0111304733',
  phone:'0968915555',
  representative_salutation:'Ông',
  representative_name:'TRẦN TRỰC HƯNG',
  representative_title:'Giám đốc',
  bank_name:'Techcombank',
  bank_branch:'Chi nhánh Hội sở',
  bank_account_no:'68 91 5555',
  bank_account_name:'Công ty TNHH HC QUẢNG CÁO'
};

// ═══ BÁO GIÁ: GÓI DỊCH VỤ FANPAGE ═══
var FANPAGE_PACKAGES=[
  {id:1,name:'Gói 1',price:2000000,features:[
    'Fanpage bán hàng tên đẹp, chuẩn SEO',
    'Thiết kế bộ ảnh đại diện và banner đẹp mắt',
    '08 bài viết giới thiệu về sản phẩm và dịch vụ chất lượng cao, chuẩn SEO',
    'Tạo album phân loại sản phẩm trên Fanpage khoảng 30 ảnh sản phẩm',
    'Bàn giao fanpage trong thời gian 3 - 5 ngày',
    'Hỗ trợ giải đáp trong 1 tháng đầu tiên'
  ]},
  {id:2,name:'Gói 2',price:3000000,features:[
    'Fanpage bán hàng tên đẹp, chuẩn SEO',
    'Tăng like và Follow Fanpage: 5000 Like',
    'Thiết kế bộ ảnh đại diện và banner đẹp mắt',
    '08 bài viết giới thiệu về sản phẩm và dịch vụ chất lượng cao, chuẩn SEO',
    'Tạo album phân loại sản phẩm trên Fanpage khoảng 30 ảnh sản phẩm',
    'Bàn giao fanpage trong thời gian 3 - 5 ngày',
    'Hỗ trợ giải đáp trong 1 tháng đầu tiên'
  ]}
];

// ═══ BÁO GIÁ: BẬC PHÍ CHẠY QUẢNG CÁO THEO NGÂN SÁCH/THÁNG ═══
// Theo bảng giá PDF "Báo giá dưới 2tr"
var AD_FEE_TIERS=[
  {max:10999999,fee:2000000,label:'Ngân sách dưới 11.000.000/1 tháng',display:'2.000.000đ'},
  {max:15000000,fee:3000000,label:'Ngân sách từ 11.000.000 - 15.000.000/1 tháng',display:'3.000.000đ'},
  {max:20000000,fee:4000000,label:'Ngân sách từ 16.000.000 - 20.000.000/1 tháng',display:'4.000.000đ'},
  {max:30000000,fee:4500000,label:'Ngân sách từ 21.000.000 - 30.000.000/1 tháng',display:'4.500.000đ'},
  {max:34000000,fee:5000000,label:'Ngân sách từ 31.000.000 - 34.000.000/1 tháng',display:'5.000.000đ'},
  {max:59999999,pct:0.15,label:'Trên 34.000.000 - Dưới 60.000.000/1 tháng',display:'15% ngân sách quảng cáo'},
  {max:80000000,pct:0.14,label:'Từ 61.000.000 - 80.000.000/1 tháng',display:'14% ngân sách quảng cáo'},
  {max:100000000,pct:0.13,label:'Từ 81.000.000 - 100.000.000/1 tháng',display:'13% ngân sách quảng cáo'},
  {max:150000000,pct:0.12,label:'Từ 101.000.000 - 150.000.000/1 tháng',display:'12% ngân sách quảng cáo'},
  {max:199000000,pct:0.11,label:'Từ 151.000.000 - 199.000.000/1 tháng',display:'11% ngân sách quảng cáo'},
  {max:300000000,pct:0.10,label:'Từ 200.000.000 - 300.000.000/1 tháng',display:'10% ngân sách quảng cáo'},
  {max:Infinity,fee:0,label:'Trên 300.000.000/1 tháng',display:'Thoả thuận'}
];
function calcAdSupportFee(budget){
  var b=parseInt(budget)||0;if(b<=0)return 0;
  for(var i=0;i<AD_FEE_TIERS.length;i++){
    var t=AD_FEE_TIERS[i];
    if(b<=t.max)return t.fee!=null?t.fee:Math.round(b*t.pct);
  }return 0;
}
function findAdTier(budget){
  var b=parseInt(budget)||0;if(b<=0)return null;
  for(var i=0;i<AD_FEE_TIERS.length;i++){if(b<=AD_FEE_TIERS[i].max)return AD_FEE_TIERS[i];}
  return null;
}

// ═══ TẠO MÃ BÁO GIÁ TIẾP THEO ═══
function getNextQuotationNumber(prefix,year){
  prefix=prefix||'XXX';year=year||new Date().getFullYear();
  var n=1;
  quotationList.forEach(function(q){
    if(!q.quote_number)return;
    var m=q.quote_number.match(/^(\d+)\/(\d{4})\/Báo giá\/([^\/]+)\/HC$/);
    if(m&&m[2]==String(year)){var num=parseInt(m[1]);if(num>=n)n=num+1;}
  });
  return padNum(n,4)+'/'+year+'/Báo giá/'+prefix+'/HC';
}

// ═══ HELPERS ═══
function fmtVndPlain(n){n=parseInt(n)||0;return n.toLocaleString('en-US').replace(/,/g,'.');}
function numToVnWords(n){var w=['không','một','hai','ba','bốn','năm','sáu','bảy','tám','chín','mười','mười một','mười hai'];n=parseInt(n)||0;return w[n]||String(n);}
function padNum(n,len){n=String(n||'');while(n.length<len)n='0'+n;return n;}

// ═══ LAZY LOAD LIBRARIES ═══
async function loadScript(src){
  return new Promise(function(resolve,reject){
    var s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=function(){reject(new Error('Không tải được: '+src));};document.head.appendChild(s);
  });
}
async function ensureContractLibs(){
  if(typeof PizZip==='undefined')await loadScript('https://cdn.jsdelivr.net/npm/pizzip@3.1.6/dist/pizzip.min.js');
  if(typeof docxtemplater==='undefined')await loadScript('https://cdn.jsdelivr.net/npm/docxtemplater@3.50.0/build/docxtemplater.js');
}
async function ensureHtml2Pdf(){
  if(typeof html2pdf==='undefined')await loadScript('https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js');
}

// ═══ TẢI TEMPLATE .DOCX TỪ SUPABASE STORAGE ═══
var _contractTemplateBuf=null;
async function loadContractTemplate(){
  if(_contractTemplateBuf)return _contractTemplateBuf;
  var r=await sb2.storage.from('contract-templates').download('contract_template.docx');
  if(r.error)throw new Error('Không tải được template hợp đồng: '+r.error.message+'. Kiểm tra bucket "contract-templates" đã có file "contract_template.docx" chưa.');
  _contractTemplateBuf=await r.data.arrayBuffer();
  return _contractTemplateBuf;
}

// ═══ TẠO SỐ HỢP ĐỒNG TIẾP THEO ═══
function getNextContractNumber(prefix,year){
  prefix=prefix||'XXX';year=year||new Date().getFullYear();
  var n=1;
  contractList.forEach(function(c){
    if(!c.contract_number)return;
    var m=c.contract_number.match(/^(\d+)\/(\d{4})\/HDDV\/([^\/]+)\/HC$/);
    if(m&&m[2]==String(year)&&m[3]===prefix){
      var num=parseInt(m[1]);if(num>=n)n=num+1;
    }else if(m&&m[2]==String(year)){
      var num=parseInt(m[1]);if(num>=n)n=num+1;
    }
  });
  return padNum(n,4)+'/'+year+'/HDDV/'+prefix+'/HC';
}

// ═══ MỞ MODAL TẠO KHÁCH TIỀM NĂNG ═══
function openNewProspectModal(){
  if(!needAuth())return;
  newProspectModalOpen=true;render();
}
function closeNewProspectModal(){newProspectModalOpen=false;render();}
async function saveNewProspect(btn){
  if(!needAuth())return;
  var v=function(id){var el=document.getElementById(id);return el?el.value.trim():'';};
  var name=v('np-name'),companyFull=v('np-company-full'),contact=v('np-contact'),phone=v('np-phone'),addr=v('np-address'),tax=v('np-tax'),email=v('np-email'),repName=v('np-rep-name'),repTitle=v('np-rep-title')||'Giám đốc',repSal=v('np-rep-sal')||'Ông',industry=v('np-industry'),prefix=v('np-prefix'),note=v('np-note'),zalo=v('np-zalo'),care=v('np-care')||'new';
  // Lấy danh sách services đã tick
  var services=[];
  Array.prototype.forEach.call(document.querySelectorAll('.np-service:checked'),function(el){services.push(el.value);});
  if(!services.length)services=['fb_ads']; // fallback default
  if(!name){toast('Nhập tên khách',false);return;}
  // Phí thuê TKQC theo % spend (chỉ áp dụng nếu chọn dịch vụ tkqc_rental)
  var rentalEl=document.getElementById('np-rental-pct');
  var rentalPctNum=rentalEl?parseFloat(rentalEl.value):NaN;
  var rentalPct=null;
  if(services.indexOf('tkqc_rental')>=0&&rentalPctNum>0&&rentalPctNum<=20){
    rentalPct=Math.round(rentalPctNum*100)/10000; // 3 → 0.03
  }
  btn.disabled=true;
  var payload={name:name,company_full_name:companyFull||null,contact_person:contact||null,phone:phone||null,address:addr||null,tax_code:tax||null,email_invoice:email||null,representative_name:repName||null,representative_title:repTitle,representative_salutation:repSal,industry:industry||null,contract_prefix:(prefix||'').toUpperCase()||null,prospect_note:note||null,status:'prospect',payment_status:'unpaid',has_vat:false,service_fee:0,services:services,zalo:zalo||null,care_status:care,rental_fee_pct:rentalPct};
  var r=await sb2.from('client').insert(payload);
  // Nếu DB chưa có cột rental_fee_pct → retry không kèm cột đó
  if(r.error&&isMissingColumnError(r.error)){
    var fb=Object.assign({},payload);delete fb.rental_fee_pct;
    r=await sb2.from('client').insert(fb);
    if(!r.error&&rentalPct!==null)toast('⚠ Đã thêm khách nhưng chưa có cột rental_fee_pct. Hãy chạy migration để bật phí thuê TKQC.',false);
  }
  btn.disabled=false;
  if(r.error){toast('Lỗi: '+r.error.message,false);return;}
  toast('Đã thêm khách tiềm năng',true);
  newProspectModalOpen=false;
  await loadLight();
}

// ═══ MỞ MODAL TẠO KHÁCH CHÍNH THỨC ═══
function openNewActiveClientModal(){
  if(!needAuth())return;
  newActiveClientModalOpen=true;render();
}
function closeNewActiveClientModal(){newActiveClientModalOpen=false;render();}
async function saveNewActiveClient(btn){
  if(!needAuth())return;
  var v=function(id){var el=document.getElementById(id);return el?el.value.trim():'';};
  var name=v('nac-name'),companyFull=v('nac-company-full'),contact=v('nac-contact'),phone=v('nac-phone'),addr=v('nac-address'),tax=v('nac-tax'),email=v('nac-email'),repName=v('nac-rep-name'),repTitle=v('nac-rep-title')||'Giám đốc',repSal=v('nac-rep-sal')||'Ông',industry=v('nac-industry'),prefix=v('nac-prefix'),zalo=v('nac-zalo'),startDate=v('nac-start-date'),fee=parseInt(v('nac-fee'))||0,hasVat=document.getElementById('nac-vat')&&document.getElementById('nac-vat').checked;
  var services=[];
  Array.prototype.forEach.call(document.querySelectorAll('.nac-service:checked'),function(el){services.push(el.value);});
  if(!services.length)services=['fb_ads'];
  if(!name){toast('Nhập tên khách',false);return;}
  if(!startDate)startDate=new Date().toISOString().substring(0,10);
  var rentalEl=document.getElementById('nac-rental-pct');
  var rentalPctNum=rentalEl?parseFloat(rentalEl.value):NaN;
  var rentalPct=null;
  if(services.indexOf('tkqc_rental')>=0&&rentalPctNum>0&&rentalPctNum<=20){
    rentalPct=Math.round(rentalPctNum*100)/10000;
  }
  btn.disabled=true;
  var payload={name:name,company_full_name:companyFull||null,contact_person:contact||null,phone:phone||null,address:addr||null,tax_code:tax||null,email_invoice:email||null,representative_name:repName||null,representative_title:repTitle,representative_salutation:repSal,industry:industry||null,contract_prefix:(prefix||'').toUpperCase()||null,status:'active',start_date:startDate,payment_status:'unpaid',has_vat:!!hasVat,service_fee:fee,services:services,zalo:zalo||null,care_status:'won',rental_fee_pct:rentalPct};
  var r=await sb2.from('client').insert(payload);
  if(r.error&&isMissingColumnError(r.error)){
    var fb=Object.assign({},payload);delete fb.rental_fee_pct;
    r=await sb2.from('client').insert(fb);
    if(!r.error&&rentalPct!==null)toast('⚠ Đã thêm khách nhưng chưa có cột rental_fee_pct. Hãy chạy migration để bật phí thuê TKQC.',false);
  }
  btn.disabled=false;
  if(r.error){toast('Lỗi: '+r.error.message,false);return;}
  toast('Đã thêm khách chính thức ✓',true);
  newActiveClientModalOpen=false;
  await loadLight();
}
function toggleNacRentalRow(){
  var checked=document.querySelector('.nac-service[value="tkqc_rental"]:checked');
  var row=document.getElementById('nac-rental-row');
  if(row)row.style.display=checked?'':'none';
}

// ═══ CHỐT KÝ: CHUYỂN PROSPECT → ACTIVE ═══
async function convertProspectToActive(clientId){
  if(!needAuth())return;
  var c=clientList.find(function(x){return x.id===clientId;});if(!c)return;
  if(!confirm('Chuyển "'+c.name+'" thành khách chính thức?\nHệ thống sẽ:\n- Đổi trạng thái sang "Đang hoạt động"\n- Set ngày bắt đầu = hôm nay (để tính 90 ngày hoa hồng)'))return;
  var today=new Date().toISOString().substring(0,10);
  var r=await sb2.from('client').update({status:'active',start_date:today,care_status:'won'}).eq('id',clientId);
  if(r.error){toast('Lỗi: '+r.error.message,false);return;}
  toast('Đã chốt ký khách ✓',true);
  await loadLight();
}

// ═══ MỞ MODAL XUẤT HỢP ĐỒNG ═══
function openContractModal(clientId){
  if(!needAuth())return;
  contractModalClientId=clientId;render();
  setTimeout(function(){fillContractDefaults(clientId);},50);
}
function closeContractModal(){contractModalClientId=null;render();}

// Điền giá trị mặc định vào form
function fillContractDefaults(clientId){
  var c=clientList.find(function(x){return x.id===clientId;});if(!c)return;
  var t=new Date();var pad=function(n){return n<10?'0'+n:''+n;};
  var today=pad(t.getDate())+'/'+pad(t.getMonth()+1)+'/'+t.getFullYear();
  var set=function(id,val){var el=document.getElementById(id);if(el)el.value=val||'';};
  set('ct-number',getNextContractNumber(c.contract_prefix||'XXX',t.getFullYear()));
  set('ct-date',t.toISOString().substring(0,10));
  set('ct-location','Hà Nội');
  set('ct-company-full',c.company_full_name||c.name||'');
  set('ct-address',c.address||'');
  set('ct-tax',c.tax_code||'');
  set('ct-phone',c.phone||c.contact_person||'');
  set('ct-email',c.email_invoice||'');
  set('ct-rep-sal',c.representative_salutation||'Ông');
  set('ct-rep-name',c.representative_name||'');
  set('ct-rep-title',c.representative_title||'Giám đốc');
  set('ct-industry',c.industry||'');
  set('ct-prefix',c.contract_prefix||'');
  var terms=c.contract_terms||{};
  set('ct-budget-min',terms.budget_min||20000000);
  set('ct-budget-max',terms.budget_max||30000000);
  set('ct-kpi-mess-min',terms.kpi_mess_min||50000);
  set('ct-kpi-mess-max',terms.kpi_mess_max||60000);
  set('ct-kpi-lead-min',terms.kpi_lead_min||250000);
  set('ct-kpi-lead-max',terms.kpi_lead_max||300000);
  set('ct-duration',terms.duration_months||1);
  set('ct-payment-day',terms.payment_day||5);
}

// Thu thập dữ liệu từ form
function collectContractFormData(){
  var v=function(id){var el=document.getElementById(id);return el?el.value.trim():'';};
  var date=v('ct-date');var d=new Date(date);
  var pad=function(n){return n<10?'0'+n:''+n;};
  var duration=parseInt(v('ct-duration'))||1;
  var durationText=padNum(duration,2)+' ('+numToVnWords(duration)+') tháng';
  return {
    contract_number:v('ct-number'),
    contract_date:date,
    contract_day:pad(d.getDate()),
    contract_month:pad(d.getMonth()+1),
    contract_year:String(d.getFullYear()),
    contract_location:v('ct-location')||'Hà Nội',
    company_full_name:v('ct-company-full'),
    address:v('ct-address'),
    tax_code:v('ct-tax'),
    phone:v('ct-phone'),
    email_invoice:v('ct-email'),
    representative_salutation:v('ct-rep-sal')||'Ông',
    representative_name:v('ct-rep-name'),
    representative_title:v('ct-rep-title')||'Giám đốc',
    industry:v('ct-industry'),
    contract_prefix:v('ct-prefix'),
    budget_min:fmtVndPlain(v('ct-budget-min')),
    budget_max:fmtVndPlain(v('ct-budget-max')),
    kpi_mess_min:fmtVndPlain(v('ct-kpi-mess-min')),
    kpi_mess_max:fmtVndPlain(v('ct-kpi-mess-max')),
    kpi_lead_min:fmtVndPlain(v('ct-kpi-lead-min')),
    kpi_lead_max:fmtVndPlain(v('ct-kpi-lead-max')),
    duration_text:durationText,
    duration_months:duration,
    payment_day:parseInt(v('ct-payment-day'))||5,
    // raw numbers for saving
    _budget_min_n:parseInt(v('ct-budget-min'))||0,
    _budget_max_n:parseInt(v('ct-budget-max'))||0,
    _kpi_mess_min_n:parseInt(v('ct-kpi-mess-min'))||0,
    _kpi_mess_max_n:parseInt(v('ct-kpi-mess-max'))||0,
    _kpi_lead_min_n:parseInt(v('ct-kpi-lead-min'))||0,
    _kpi_lead_max_n:parseInt(v('ct-kpi-lead-max'))||0
  };
}

// ═══ XUẤT FILE WORD (.docx) ═══
async function exportContractDocx(btn){
  if(!needAuth())return;
  btn.disabled=true;var oldText=btn.textContent;btn.textContent='Đang tạo file Word...';
  try{
    await ensureContractLibs();
    var buf=await loadContractTemplate();
    var zip=new PizZip(buf);
    var doc=new docxtemplater(zip,{paragraphLoop:true,linebreaks:true});
    var data=collectContractFormData();
    doc.render(data);
    var out=doc.getZip().generate({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
    var fileName='HDDV_'+(data.contract_prefix||'Khách hàng')+'_'+data.contract_number.replace(/\//g,'-')+'.docx';
    var a=document.createElement('a');a.href=URL.createObjectURL(out);a.download=fileName;a.click();
    setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
    // Save contract record + update client defaults
    await saveContractRecord(data,'docx');
    toast('Đã tải Word ✓',true);
  }catch(e){
    console.error(e);toast('Lỗi: '+e.message,false);
  }finally{
    btn.disabled=false;btn.textContent=oldText;
  }
}

// ═══ XUẤT PDF (từ HTML preview dùng html2pdf) ═══
async function exportContractPdf(btn){
  if(!needAuth())return;
  btn.disabled=true;var oldText=btn.textContent;btn.textContent='Đang tạo PDF...';
  try{
    await ensureHtml2Pdf();
    var data=collectContractFormData();
    var html=renderContractHtml(data);
    var wrap=document.createElement('div');wrap.innerHTML=html;
    wrap.style.width='210mm';wrap.style.padding='20mm';
    wrap.style.background='#fff';wrap.style.fontFamily='"Times New Roman",Times,serif';
    wrap.style.fontSize='13pt';wrap.style.color='#000';wrap.style.lineHeight='1.5';
    document.body.appendChild(wrap);
    var fileName='HDDV_'+(data.contract_prefix||'Khách hàng')+'_'+data.contract_number.replace(/\//g,'-')+'.pdf';
    await html2pdf().set({margin:[0,0,0,0],filename:fileName,image:{type:'jpeg',quality:.98},html2canvas:{scale:2,useCORS:true},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'},pagebreak:{mode:['avoid-all','css','legacy']}}).from(wrap).save();
    document.body.removeChild(wrap);
    await saveContractRecord(data,'pdf');
    toast('Đã tải PDF ✓',true);
  }catch(e){
    console.error(e);toast('Lỗi: '+e.message,false);
  }finally{
    btn.disabled=false;btn.textContent=oldText;
  }
}

// ═══ IN BROWSER (Ctrl+P) ═══
function printContract(){
  if(!needAuth())return;
  var data=collectContractFormData();
  var html=renderContractHtml(data);
  var w=window.open('','_blank');
  w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>'+data.contract_number+'</title><style>@page{size:A4;margin:20mm;}body{font-family:"Times New Roman",Times,serif;font-size:13pt;color:#000;line-height:1.5;}h1{text-align:center;font-size:15pt;}h2{text-align:center;font-size:14pt;margin:16px 0 8px;}p{margin:6px 0;text-align:justify;}table{width:100%;}td{padding:4px 6px;vertical-align:top;}.center{text-align:center;}.sign{display:flex;justify-content:space-around;margin-top:40px;}</style></head><body>'+html+'<script>window.onload=function(){window.print();};<\/script></body></html>');
  w.document.close();
}

// ═══ RENDER HTML PREVIEW ═══
function renderContractHtml(d){
  var h='';
  h+='<p class="center"><strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong></p>';
  h+='<p class="center"><em>Độc lập – Tự do – Hạnh phúc</em></p>';
  h+='<p class="center"><em>'+esc(d.contract_location)+', ngày '+esc(d.contract_day)+' tháng '+esc(d.contract_month)+' năm '+esc(d.contract_year)+'</em></p>';
  h+='<h2>HỢP ĐỒNG CUNG CẤP DỊCH VỤ CHẠY QUẢNG CÁO</h2>';
  h+='<p class="center">Số: '+esc(d.contract_number)+'</p>';
  h+='<p>Hôm nay, ngày '+esc(d.contract_day)+' tháng '+esc(d.contract_month)+' năm '+esc(d.contract_year)+', tại '+esc(d.contract_location)+', chúng tôi gồm:</p>';
  h+='<p><strong>BÊN A: BÊN SỬ DỤNG DỊCH VỤ</strong></p>';
  h+='<table>';
  h+='<tr><td style="width:180px;">Tên đơn vị</td><td><strong>'+esc(d.company_full_name)+'</strong></td></tr>';
  h+='<tr><td>Địa chỉ</td><td>'+esc(d.address)+'</td></tr>';
  h+='<tr><td>Mã số thuế</td><td>'+esc(d.tax_code)+'</td></tr>';
  h+='<tr><td>Điện thoại</td><td>'+esc(d.phone)+'</td></tr>';
  h+='<tr><td>Email nhận hóa đơn</td><td>'+esc(d.email_invoice)+'</td></tr>';
  h+='<tr><td>Đại diện</td><td>'+esc(d.representative_salutation)+' '+esc(d.representative_name)+' – Chức vụ: '+esc(d.representative_title)+'</td></tr>';
  h+='</table>';
  h+='<p><em>(Sau đây gọi tắt là "Bên A")</em></p>';
  h+='<p><strong>BÊN B: BÊN CUNG ỨNG DỊCH VỤ</strong></p>';
  h+='<table>';
  h+='<tr><td style="width:180px;">Tên đơn vị</td><td><strong>'+esc(PARTY_B_INFO.company_name)+'</strong></td></tr>';
  h+='<tr><td>Địa chỉ</td><td>'+esc(PARTY_B_INFO.address)+'</td></tr>';
  h+='<tr><td>Mã số thuế</td><td>'+esc(PARTY_B_INFO.tax_code)+'</td></tr>';
  h+='<tr><td>Điện thoại</td><td>'+esc(PARTY_B_INFO.phone)+'</td></tr>';
  h+='<tr><td>Đại diện</td><td>'+esc(PARTY_B_INFO.representative_salutation)+' '+esc(PARTY_B_INFO.representative_name)+' – Chức vụ: '+esc(PARTY_B_INFO.representative_title)+'</td></tr>';
  h+='</table>';
  h+='<p><em>(Sau đây gọi tắt là "Bên B")</em></p>';
  h+='<p>Hai bên cùng thống nhất ký kết hợp đồng với các điều khoản như sau:</p>';
  h+='<p><strong>ĐIỀU 1. NỘI DUNG DỊCH VỤ</strong></p>';
  h+='<p>1. Bên B cung cấp dịch vụ chạy quảng cáo Facebook/Meta Ads phục vụ chiến dịch truyền thông, marketing online cho ngành '+esc(d.industry)+' của Bên A.</p>';
  h+='<p>2. Bên B đảm bảo thực hiện các nội dung sau:</p>';
  h+='<p style="padding-left:20px;">• Đưa ra ý tưởng nội dung truyền thông quảng cáo phù hợp với sản phẩm, thương hiệu và tệp khách hàng mục tiêu của Bên A.</p>';
  h+='<p style="padding-left:20px;">• Chạy quảng cáo nhắm đúng đối tượng khách hàng mục tiêu của ngành '+esc(d.industry)+'.</p>';
  h+='<p style="padding-left:20px;">• Báo cáo kết quả chạy quảng cáo hàng ngày, hàng tuần, hàng tháng.</p>';
  h+='<p style="padding-left:20px;">• Phối hợp với Bên A xây dựng và điều chỉnh định hướng chiến lược quảng cáo trên Facebook theo từng giai đoạn.</p>';
  h+='<p><strong>ĐIỀU 2. PHÍ DỊCH VỤ VÀ PHƯƠNG THỨC THANH TOÁN</strong></p>';
  h+='<p>Phí dịch vụ: Hai bên thống nhất Bên B được quyền tự chủ động xác định mức phí dịch vụ tương ứng với hiệu quả triển khai trên cơ sở quản lý ngân sách quảng cáo thực tế, quản lý ngân sách quảng cáo từ '+esc(d.budget_min)+' VNĐ đến tối đa '+esc(d.budget_max)+' VNĐ/01 tháng. Định kỳ thứ sáu hàng tuần (hoặc nếu 1 tháng check 1 lần => chọn 1 ngày trong tháng để gửi báo cáo), Bên B có trách nhiệm báo cáo chi tiết tổng chi phí đã sử dụng trong tuần/tháng cho Bên A. Mức phí này phải đảm bảo nằm trong sự tối ưu hóa ngân sách và tương thích với các mục tiêu KPI đã thỏa thuận tại Điều 4. Mức phí trên đã bao gồm ngân sách quảng cáo.</p>';
  h+='<p>Thanh toán trong thời hạn từ 03 đến 05 ngày kể từ thời điểm ký kết hợp đồng. Nếu hợp đồng được gia hạn, Bên A sẽ tiến hành thanh toán cho Bên B vào ngày '+esc(d.payment_day)+' hàng tháng. Bên A chuyển khoản vào tài khoản do Bên B cung cấp:</p>';
  h+='<p style="padding-left:20px;">• Chủ tài khoản: '+esc(PARTY_B_INFO.bank_account_name)+'</p>';
  h+='<p style="padding-left:20px;">• Số tài khoản: '+esc(PARTY_B_INFO.bank_account_no)+'</p>';
  h+='<p style="padding-left:20px;">• Ngân hàng: '+esc(PARTY_B_INFO.bank_name)+' – '+esc(PARTY_B_INFO.bank_branch)+'</p>';
  h+='<p>3. Phí dịch vụ không hoàn lại trong mọi trường hợp, trừ trường hợp Bên B phải dừng quảng cáo do sự kiện bất khả kháng hoặc sự cố ngoài khả năng kiểm soát. Khi đó, hai bên sẽ trao đổi và thống nhất phần phí cần điều chỉnh tương ứng với thời gian dịch vụ không thể thực hiện.</p>';
  h+='<p><strong>ĐIỀU 3. THỜI HẠN HỢP ĐỒNG</strong></p>';
  h+='<p>1. Hợp đồng có hiệu lực từ ngày '+esc(d.contract_day)+' tháng '+esc(d.contract_month)+' năm '+esc(d.contract_year)+'.</p>';
  h+='<p>2. Thời hạn hợp đồng: '+esc(d.duration_text)+'.</p>';
  h+='<p>3. Sau 03 (ba) ngày kể từ ngày hết thời hạn '+esc(d.duration_text)+', hợp đồng sẽ được tự động gia hạn theo từng tháng căn cứ trên kết quả chạy quảng cáo thực tế và sự thống nhất tiếp tục hợp tác của hai bên.</p>';
  h+='<p><strong>ĐIỀU 4. TRÁCH NHIỆM CỦA CÁC BÊN</strong></p>';
  h+='<p><em>4.1. Trách nhiệm của Bên A</em></p>';
  h+='<p style="padding-left:20px;">• Cung cấp đầy đủ thông tin sản phẩm, hình ảnh, tài khoản quảng cáo và các quyền truy cập cần thiết để triển khai chiến dịch.</p>';
  h+='<p style="padding-left:20px;">• Chịu trách nhiệm về tính hợp pháp của sản phẩm, dịch vụ và các tài liệu cung cấp cho Bên B.</p>';
  h+='<p style="padding-left:20px;">• Thanh toán đúng hạn phí dịch vụ theo thỏa thuận.</p>';
  h+='<p><em>4.2. Trách nhiệm của Bên B</em></p>';
  h+='<p style="padding-left:20px;">• Triển khai dịch vụ đúng tiến độ, tối ưu hiệu quả quảng cáo theo kế hoạch đã thống nhất với Bên A.</p>';
  h+='<p style="padding-left:20px;">• Mục tiêu KPI cam kết: chi phí tin nhắn dao động từ '+esc(d.kpi_mess_min)+' VNĐ đến tối đa '+esc(d.kpi_mess_max)+' VNĐ/01 tin nhắn; chi phí thu về 01 số điện thoại chất lượng dao động từ '+esc(d.kpi_lead_min)+' VNĐ đến tối đa '+esc(d.kpi_lead_max)+' VNĐ/01 số, tùy theo từng thời điểm, nội dung quảng cáo, mức độ cạnh tranh thị trường và chất lượng dữ liệu đầu vào do Bên A cung cấp.</p>';
  h+='<p style="padding-left:20px;">• Báo cáo kết quả định kỳ theo yêu cầu hoặc khi có phát sinh bất thường.</p>';
  h+='<p style="padding-left:20px;">• Bảo mật thông tin kinh doanh, dữ liệu và tài liệu do Bên A cung cấp hoặc phát sinh trong quá trình hợp tác; không cung cấp hoặc tiết lộ cho bất kỳ bên thứ ba nào nếu không có sự chấp thuận bằng văn bản của Bên A.</p>';
  h+='<p><strong>ĐIỀU 5. CHẤM DỨT HỢP ĐỒNG</strong></p>';
  h+='<p>Hợp đồng này có thể chấm dứt theo các điều khoản thỏa thuận của hai Bên hoặc theo quy định của pháp luật.</p>';
  h+='<p><strong>ĐIỀU 6. CAM KẾT CHUNG</strong></p>';
  h+='<p>• Hai bên cam kết thực hiện đúng các điều khoản của hợp đồng.</p>';
  h+='<p>• Mọi sửa đổi, bổ sung hợp đồng phải được lập thành văn bản và có chữ ký của đại diện hợp pháp của hai bên.</p>';
  h+='<p>• Mọi tranh chấp phát sinh sẽ được ưu tiên giải quyết bằng thương lượng. Trường hợp không thương lượng được, tranh chấp sẽ được giải quyết tại Tòa án nhân dân có thẩm quyền tại '+esc(d.contract_location)+'.</p>';
  h+='<p>Hợp đồng này được lập thành 02 (hai) bản có giá trị pháp lý như nhau, mỗi bên giữ 01 (một) bản và có hiệu lực kể từ ngày ký.</p>';
  h+='<div class="sign"><div class="center"><strong>ĐẠI DIỆN BÊN A</strong><br/><em>(Ký, ghi rõ họ tên, đóng dấu)</em><br/><br/><br/><br/><br/><strong>'+esc(d.representative_name)+'</strong></div>';
  h+='<div class="center"><strong>ĐẠI DIỆN BÊN B</strong><br/><em>(Ký, ghi rõ họ tên, đóng dấu)</em><br/><br/><br/><br/><br/><strong>'+esc(PARTY_B_INFO.representative_name)+'</strong></div></div>';
  return h;
}

// ═══ LƯU RECORD HỢP ĐỒNG + CẬP NHẬT DEFAULT CHO CLIENT ═══
async function saveContractRecord(data,fileType){
  var clientId=contractModalClientId;
  // 1. Lưu contract record
  var payload={
    client_id:clientId,
    contract_number:data.contract_number,
    contract_date:data.contract_date,
    snapshot:data,
    status:'draft',
    note:'Xuất định dạng '+fileType,
    created_by:(authUser&&authUser.email)||null
  };
  var r=await sb2.from('contract').insert(payload);
  if(r.error)console.warn('[contract insert]',r.error.message);
  // 2. Cập nhật thông tin khách (lưu mặc định cho lần sau)
  var clientUpdate={
    company_full_name:data.company_full_name,
    address:data.address,
    tax_code:data.tax_code,
    phone:data.phone,
    email_invoice:data.email_invoice,
    representative_name:data.representative_name,
    representative_title:data.representative_title,
    representative_salutation:data.representative_salutation,
    industry:data.industry,
    contract_prefix:data.contract_prefix,
    contract_terms:{
      budget_min:data._budget_min_n,
      budget_max:data._budget_max_n,
      kpi_mess_min:data._kpi_mess_min_n,
      kpi_mess_max:data._kpi_mess_max_n,
      kpi_lead_min:data._kpi_lead_min_n,
      kpi_lead_max:data._kpi_lead_max_n,
      payment_day:data.payment_day,
      duration_months:data.duration_months
    }
  };
  if(clientId){
    var r2=await sb2.from('client').update(clientUpdate).eq('id',clientId);
    if(r2.error)console.warn('[client update]',r2.error.message);
  }
  await loadLight();
}

// ═══ XOÁ CONTRACT ═══
async function deleteContract(contractId){
  if(!needAuth())return;
  if(!confirm('Xóa hợp đồng này khỏi lịch sử?'))return;
  var r=await sb2.from('contract').delete().eq('id',contractId);
  if(r.error){toast('Lỗi: '+r.error.message,false);return;}
  toast('Đã xóa',true);
  await loadLight();
}

// ═══ MỞ XEM LỊCH SỬ HỢP ĐỒNG ═══
function openContractHistory(clientId){
  contractHistoryClientId=clientId;render();
}
function closeContractHistory(){contractHistoryClientId=null;render();}

// ═══ XUẤT LẠI CONTRACT TỪ LỊCH SỬ ═══
async function reExportContractDocx(contractId,btn){
  if(!needAuth())return;
  var ct=contractList.find(function(x){return x.id===contractId;});if(!ct){toast('Không tìm thấy',false);return;}
  btn.disabled=true;var oldText=btn.textContent;btn.textContent='Đang tạo...';
  try{
    await ensureContractLibs();
    var buf=await loadContractTemplate();
    var zip=new PizZip(buf);
    var doc=new docxtemplater(zip,{paragraphLoop:true,linebreaks:true});
    doc.render(ct.snapshot||{});
    var out=doc.getZip().generate({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
    var fileName='HDDV_'+((ct.snapshot&&ct.snapshot.contract_prefix)||'Khách hàng')+'_'+ct.contract_number.replace(/\//g,'-')+'.docx';
    var a=document.createElement('a');a.href=URL.createObjectURL(out);a.download=fileName;a.click();
    setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
    toast('Đã tải lại ✓',true);
  }catch(e){console.error(e);toast('Lỗi: '+e.message,false);}
  finally{btn.disabled=false;btn.textContent=oldText;}
}

// ═══ ĐỔI TRẠNG THÁI HỢP ĐỒNG ═══
async function updateContractStatus(contractId,newStatus){
  if(!needAuth())return;
  var r=await sb2.from('contract').update({status:newStatus}).eq('id',contractId);
  if(r.error){toast('Lỗi',false);return;}
  toast('Đã cập nhật',true);
  await loadLight();
}

// ═══════════════════════════════════════════════════════════
// ═══ BÁO GIÁ (QUOTATION) ═══════════════════════════════════
// ═══════════════════════════════════════════════════════════

var QUOTATION_STATUS_META={
  draft:{label:'Nháp',class:'b-gray'},
  sent:{label:'Đã gửi',class:'b-blue'},
  accepted:{label:'Đã chốt',class:'b-green'},
  rejected:{label:'Từ chối',class:'b-red'},
  expired:{label:'Hết hạn',class:'b-amber'}
};

// Đọc 3 boolean include từ snapshot (mới) hoặc derive từ package_type (legacy)
function getQuotationIncludes(q){
  var s=(q&&q.snapshot)||{};
  if(typeof s.include_fanpage==='boolean'||typeof s.include_ads==='boolean'||typeof s.include_web==='boolean'){
    return{fp:!!s.include_fanpage,ads:!!s.include_ads,web:!!s.include_web};
  }
  var pt=(q&&q.package_type)||'combo';
  return{fp:(pt==='fanpage'||pt==='combo'),ads:(pt==='ads'||pt==='combo'),web:(pt==='webapp')};
}
function derivePackageType(inc){
  if(inc.fp&&!inc.ads&&!inc.web)return'fanpage';
  if(!inc.fp&&inc.ads&&!inc.web)return'ads';
  if(!inc.fp&&!inc.ads&&inc.web)return'webapp';
  return'combo';
}
function quotationTotals(q){
  var inc=getQuotationIncludes(q);
  var fpPrice=0;
  if(inc.fp){
    if(q.fanpage_price_override!=null&&q.fanpage_price_override!==''){
      fpPrice=parseInt(q.fanpage_price_override)||0;
    }else if(q.fanpage_package){
      var pkg=FANPAGE_PACKAGES.find(function(p){return p.id===q.fanpage_package;});
      if(pkg)fpPrice=pkg.price;
    }
  }
  var adFee=inc.ads?(q.support_fee!=null?parseInt(q.support_fee)||0:calcAdSupportFee(q.monthly_budget)):0;
  var webFee=inc.web?(parseInt(q.web_fee)||0):0;
  var total=fpPrice+adFee+webFee;
  return{fanpageFee:fpPrice,adFee:adFee,webFee:webFee,total:total,inc:inc};
}

// ═══ P3 QUOTATION LIST VIEW ═══
function p3Quotation(tabH){
  var h='<div class="page-title">Khách hàng</div><div class="page-sub">Quản lý báo giá dịch vụ — tạo mới, theo dõi trạng thái, chuyển thành hợp đồng khi khách chốt</div>';
  h+=tabH;
  // Toolbar
  h+='<div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap;">';
  h+='<button class="btn btn-primary" onclick="openQuotationModal()">➕ Tạo báo giá mới</button>';
  h+='<input type="text" id="quotation-search" placeholder="Tìm báo giá (khách, mã)..." value="'+esc(quotationSearchText)+'" oninput="quotationPage=1;hcSearchInput(\'quotationSearchText\',this.value)" class="fi" style="flex:1;max-width:280px;">';
  h+='<select class="fi" style="width:150px;" onchange="quotationPage=1;quotationFilterStatus=this.value;render();">';
  h+='<option value="">Tất cả trạng thái</option>';
  Object.keys(QUOTATION_STATUS_META).forEach(function(k){h+='<option value="'+k+'"'+(quotationFilterStatus===k?' selected':'')+'>'+QUOTATION_STATUS_META[k].label+'</option>';});
  h+='</select>';
  h+='<select class="fi" style="width:180px;" onchange="quotationPage=1;quotationFilterClient=this.value;render();">';
  h+='<option value="">Tất cả khách</option>';
  clientList.forEach(function(c){h+='<option value="'+c.id+'"'+(quotationFilterClient===c.id?' selected':'')+'>'+esc(c.name)+'</option>';});
  h+='</select>';
  h+='</div>';

  // Filter
  var rows=quotationList.slice();
  if(quotationSearchText){
    var q=quotationSearchText.toLowerCase();
    rows=rows.filter(function(r){
      return (r.quote_number||'').toLowerCase().indexOf(q)>=0
        ||((r.client&&r.client.name)||'').toLowerCase().indexOf(q)>=0
        ||((r.client&&r.client.company_full_name)||'').toLowerCase().indexOf(q)>=0;
    });
  }
  if(quotationFilterStatus)rows=rows.filter(function(r){return r.status===quotationFilterStatus;});
  if(quotationFilterClient)rows=rows.filter(function(r){return String(r.client_id)===String(quotationFilterClient);});
  rows=sortQuotations(rows,quotationSortCol,quotationSortDir);
  var totalRows=rows.length;
  var totalPages=Math.max(1,Math.ceil(totalRows/QT_PAGE_SIZE));
  if(quotationPage>totalPages)quotationPage=totalPages;
  if(quotationPage<1)quotationPage=1;
  var pagedRows=rows.slice((quotationPage-1)*QT_PAGE_SIZE,quotationPage*QT_PAGE_SIZE);

  if(!rows.length){
    h+='<div class="empty-state" role="status">';
    h+='<div class="empty-state-icon" aria-hidden="true">💰</div>';
    h+='<div class="empty-state-title">Chưa có báo giá nào</div>';
    h+='<div class="empty-state-desc">Bấm "Tạo báo giá mới" để lập báo giá dịch vụ Fanpage &amp; quảng cáo Facebook.</div>';
    h+='</div>';
    return h;
  }

  function sortCls(c){return quotationSortCol===c?'sortable sort-'+quotationSortDir:'sortable';}
  h+='<div class="qt-card-list"><div class="table-wrap"><table><thead><tr>';
  h+='<th style="width:30px;">#</th>';
  h+='<th class="'+sortCls('quote_number')+'" onclick="setQuotationSort(\'quote_number\')">Mã báo giá</th>';
  h+='<th class="'+sortCls('client')+'" onclick="setQuotationSort(\'client\')">Khách hàng</th>';
  h+='<th>Gói dịch vụ</th>';
  h+='<th class="'+sortCls('total')+'" style="text-align:right;" onclick="setQuotationSort(\'total\')">Tổng giá</th>';
  h+='<th class="'+sortCls('valid_until')+'" onclick="setQuotationSort(\'valid_until\')">Hiệu lực đến</th>';
  h+='<th class="'+sortCls('status')+'" onclick="setQuotationSort(\'status\')">Trạng thái</th>';
  h+='<th>Thao tác</th>';
  h+='</tr></thead><tbody>';
  pagedRows.forEach(function(q,i){
    i=(quotationPage-1)*QT_PAGE_SIZE+i;
    var c=q.client||clientList.find(function(x){return x.id===q.client_id;})||{};
    var tot=quotationTotals(q);
    var inc=tot.inc;
    var pkgParts=[];
    if(inc.fp)pkgParts.push('Fanpage'+(q.fanpage_package===2?' Gói 2':' Gói 1'));
    if(inc.ads)pkgParts.push('Quảng cáo');
    if(inc.web)pkgParts.push('Web App');
    var pkgLabel=pkgParts.length>1?'Combo ('+pkgParts.join(' + ')+')':(pkgParts[0]||'—');
    var stMeta=QUOTATION_STATUS_META[q.status]||QUOTATION_STATUS_META.draft;
    var isExpired=q.valid_until&&q.valid_until<td()&&q.status!=='accepted';
    h+='<tr>';
    h+='<td style="color:var(--tx3);">'+(i+1)+'</td>';
    h+='<td style="font-family:var(--mono,monospace);font-size:12px;">'+esc(q.quote_number||'—')+'</td>';
    h+='<td><div style="font-weight:500;">'+esc(c.name||'—')+'</div><div style="font-size:11px;color:var(--tx3);">'+esc(c.company_full_name||'')+'</div></td>';
    h+='<td style="font-size:12px;">'+esc(pkgLabel);
    if(inc.ads&&q.monthly_budget)h+='<div style="font-size:11px;color:var(--tx3);">Ngân sách '+ff(q.monthly_budget)+'đ/th</div>';
    h+='</td>';
    h+='<td style="text-align:right;font-weight:600;">'+ff(tot.total)+'đ</td>';
    h+='<td style="font-size:12px;'+(isExpired?'color:var(--red);':'')+'">'+esc(q.valid_until||'—')+(isExpired?' ⚠':'')+'</td>';
    h+='<td><span class="badge '+stMeta.class+'">'+stMeta.label+'</span></td>';
    var primaryBtn='';
    if(q.status==='draft')primaryBtn='<button class="btn btn-sm btn-primary" onclick="updateQuotationStatus(\''+q.id+'\',\'sent\')">Gửi báo giá</button>';
    else if(q.status==='sent')primaryBtn='<button class="btn btn-sm btn-green" onclick="updateQuotationStatus(\''+q.id+'\',\'accepted\')">Đánh dấu chốt</button>';
    else if(q.status==='accepted'&&c.status==='prospect')primaryBtn='<button class="btn btn-sm btn-purple" onclick="convertQuotationToContract(\''+q.id+'\')">Tạo hợp đồng</button>';
    else primaryBtn='<button class="btn btn-sm btn-ghost" onclick="previewQuotation(\''+q.id+'\')">Xem</button>';
    h+='<td style="white-space:nowrap;text-align:right;">';
    h+='<div class="qt-action-wrap">'+primaryBtn;
    h+='<button class="qt-action-more" onclick="toggleQuotationMenu(event,\''+q.id+'\')" aria-label="Thao tác khác" title="Thao tác khác" aria-haspopup="menu" aria-expanded="false" aria-controls="qt-menu-'+q.id+'">⋯</button>';
    h+='<div class="qt-action-menu" id="qt-menu-'+q.id+'" role="menu" aria-label="Thao tác báo giá" onclick="event.stopPropagation();">';
    h+='<button role="menuitem" onclick="previewQuotation(\''+q.id+'\');closeQuotationMenus();">Xem trước</button>';
    h+='<button role="menuitem" onclick="openQuotationModal(\''+q.id+'\');closeQuotationMenus();">Sửa báo giá</button>';
    if(q.status!=='draft')h+='<button role="menuitem" onclick="updateQuotationStatus(\''+q.id+'\',\'draft\');closeQuotationMenus();">Chuyển về nháp</button>';
    h+='<div class="sep" role="separator"></div>';
    h+='<button role="menuitem" class="danger" onclick="deleteQuotation(\''+q.id+'\');closeQuotationMenus();">Xóa báo giá</button>';
    h+='</div></div></td></tr>';
  });
  h+='</tbody></table></div>';
  // Mobile card view (cùng dữ liệu, hiển thị <768px)
  pagedRows.forEach(function(q){
    var c=q.client||clientList.find(function(x){return x.id===q.client_id;})||{};
    var tot=quotationTotals(q);
    var inc=tot.inc;
    var pkgParts=[];
    if(inc.fp)pkgParts.push('Fanpage'+(q.fanpage_package===2?' Gói 2':' Gói 1'));
    if(inc.ads)pkgParts.push('Quảng cáo');
    if(inc.web)pkgParts.push('Web App');
    var pkgLabel=pkgParts.length>1?'Combo ('+pkgParts.join(' + ')+')':(pkgParts[0]||'—');
    var stMeta=QUOTATION_STATUS_META[q.status]||QUOTATION_STATUS_META.draft;
    var isExpired=q.valid_until&&q.valid_until<td()&&q.status!=='accepted';
    var primaryBtn='';
    if(q.status==='draft')primaryBtn='<button class="btn btn-sm btn-primary" onclick="updateQuotationStatus(\''+q.id+'\',\'sent\')">Gửi</button>';
    else if(q.status==='sent')primaryBtn='<button class="btn btn-sm btn-green" onclick="updateQuotationStatus(\''+q.id+'\',\'accepted\')">Chốt</button>';
    else if(q.status==='accepted'&&c.status==='prospect')primaryBtn='<button class="btn btn-sm btn-purple" onclick="convertQuotationToContract(\''+q.id+'\')">Tạo Hợp đồng</button>';
    else primaryBtn='<button class="btn btn-sm btn-ghost" onclick="previewQuotation(\''+q.id+'\')">Xem</button>';
    h+='<div class="qt-mobile-card">';
    h+='<div class="qt-mobile-card-head">';
    h+='<div><div class="qt-mobile-card-title">'+esc(c.name||'—')+'</div>';
    h+='<div class="qt-mobile-card-sub">'+esc(q.quote_number||'—')+' · '+esc(pkgLabel)+'</div></div>';
    h+='<span class="badge '+stMeta.class+'">'+stMeta.label+'</span>';
    h+='</div>';
    h+='<div class="qt-mobile-card-meta">';
    h+='<span>Tổng: <b>'+ff(tot.total)+'đ</b></span>';
    h+='<span>HL: <b'+(isExpired?' style="color:var(--red);"':'')+'>'+esc(q.valid_until||'—')+(isExpired?' ⚠':'')+'</b></span>';
    h+='</div>';
    h+='<div class="qt-mobile-card-actions">';
    h+=primaryBtn;
    h+='<div class="qt-action-wrap">';
    h+='<button class="qt-action-more" onclick="toggleQuotationMenu(event,\''+q.id+'-m\')" aria-label="Thao tác khác" aria-haspopup="menu" aria-expanded="false" aria-controls="qt-menu-'+q.id+'-m">⋯</button>';
    h+='<div class="qt-action-menu" id="qt-menu-'+q.id+'-m" role="menu" aria-label="Thao tác báo giá" onclick="event.stopPropagation();">';
    h+='<button role="menuitem" onclick="previewQuotation(\''+q.id+'\');closeQuotationMenus();">Xem trước</button>';
    h+='<button role="menuitem" onclick="openQuotationModal(\''+q.id+'\');closeQuotationMenus();">Sửa báo giá</button>';
    if(q.status!=='draft')h+='<button role="menuitem" onclick="updateQuotationStatus(\''+q.id+'\',\'draft\');closeQuotationMenus();">Chuyển về nháp</button>';
    h+='<div class="sep" role="separator"></div>';
    h+='<button role="menuitem" class="danger" onclick="deleteQuotation(\''+q.id+'\');closeQuotationMenus();">Xóa báo giá</button>';
    h+='</div></div></div></div>';
  });
  h+='</div>';
  if(totalPages>1){
    var from=(quotationPage-1)*QT_PAGE_SIZE+1,to=Math.min(quotationPage*QT_PAGE_SIZE,totalRows);
    h+='<div class="hc-pagination" role="navigation" aria-label="Phân trang báo giá">';
    h+='<span class="hc-page-info">'+from+'–'+to+' / '+totalRows+'</span>';
    h+='<button class="btn btn-sm btn-ghost" '+(quotationPage<=1?'disabled':'')+' onclick="quotationPage=Math.max(1,quotationPage-1);render();" aria-label="Trang trước">‹</button>';
    h+='<span class="hc-page-cur">Trang '+quotationPage+' / '+totalPages+'</span>';
    h+='<button class="btn btn-sm btn-ghost" '+(quotationPage>=totalPages?'disabled':'')+' onclick="quotationPage=Math.min('+totalPages+',quotationPage+1);render();" aria-label="Trang sau">›</button>';
    h+='</div>';
  }
  return h;
}

// ═══ P3 — TAB BÁO CÁO: Báo cáo daily theo từng khách (data từ Meta API đã sync) ═══
// Helper: xác định client_id cho 1 dòng daily_spend (theo matched_client_id → assignment → ad_account.client_id)
function _rptClientForDaily(d){
  var cid=d.matched_client_id||null;
  if(!cid){var aa=adList.find(function(a){return a.id===d.ad_account_id;});if(aa){var asg=getAssign(d.ad_account_id,d.report_date);cid=asg.length?asg[0].client_id:aa.client_id;}}
  return cid;
}
// Helper: xác định client_id cho 1 dòng campaign_daily_mess
function _rptClientForMess(r){
  var aa=r.ad_account||adList.find(function(a){return a.id===r.ad_account_id;});
  if(!aa)return null;
  var asg=getAssign(r.ad_account_id,r.report_date);
  return asg.length?asg[0].client_id:aa.client_id;
}
// Render content báo cáo daily (không bao gồm page-title) — dùng làm sub-tab trong Khách chính thức
function p3ActiveReportContent(){
  var rows=clientList.filter(function(c){return c.status!=='prospect';});
  if(clientSearchText){
    var q=clientSearchText.toLowerCase();
    rows=rows.filter(function(c){return(c.name||'').toLowerCase().indexOf(q)>=0||(c.company_full_name||'').toLowerCase().indexOf(q)>=0||(c.contact_person||'').toLowerCase().indexOf(q)>=0;});
  }
  // Tháng đang xem (dùng chung clientMonth với tab Khách chính thức)
  var ms=clientMonth||lm();
  var allMonths=new Set();dates.forEach(function(d){allMonths.add(d.substring(0,7));});
  var monthList=Array.from(allMonths).sort().reverse();
  // Tính spend theo tháng cho mỗi khách → sort
  var spendByClient={};
  dailyData.filter(function(d){return d.report_date.substring(0,7)===ms;}).forEach(function(d){
    var cid=_rptClientForDaily(d);
    if(cid)spendByClient[cid]=(spendByClient[cid]||0)+(d.spend_amount||0);
  });
  rows.sort(function(a,b){return(spendByClient[b.id]||0)-(spendByClient[a.id]||0);});
  var mLabel='T'+parseInt(ms.split('-')[1])+'/'+ms.split('-')[0];
  var h='';
  // Toolbar: chọn tháng + search
  h+='<div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap;"><span style="font-size:12px;color:var(--tx3);">Tháng:</span><select class="fi" style="width:140px;" onchange="clientMonth=this.value;expandedClientId=null;render();">';
  if(!monthList.length)h+='<option>'+mLabel+'</option>';
  monthList.forEach(function(m){h+='<option value="'+m+'"'+(m===ms?' selected':'')+'>T'+parseInt(m.split('-')[1])+'/'+m.split('-')[0]+'</option>';});
  h+='</select>';
  h+='<input type="text" id="client-report-search" placeholder="Tìm khách hàng..." value="'+esc(clientSearchText)+'" oninput="expandedClientId=null;hcSearchInput(\'clientSearchText\',this.value)" class="fi" style="flex:1;max-width:280px;">';
  h+='</div>';
  if(!rows.length){
    h+='<div class="empty-state" role="status"><div class="empty-state-icon" aria-hidden="true">📊</div><div class="empty-state-title">Chưa có khách hàng</div><div class="empty-state-desc">'+(clientSearchText?'Không tìm thấy khách khớp từ khoá.':'Thêm khách chính thức trước.')+'</div></div>';
    return h;
  }
  h+='<div class="table-wrap"><table><thead><tr><th style="width:30px;">#</th><th>Khách hàng</th><th>Dịch vụ</th><th style="text-align:right;white-space:nowrap;">Chi phí '+mLabel+'</th><th style="text-align:center;width:140px;">Báo cáo</th></tr></thead><tbody>';
  rows.forEach(function(c,i){
    var sp=spendByClient[c.id]||0;
    var isExp=expandedClientId===c.id;
    h+='<tr style="'+(isExp?'background:var(--blue-bg);':'')+'">';
    h+='<td><span class="kh-num">'+(i+1)+'</span></td>';
    h+='<td><div class="kh-name-cell"><span class="kh-name-text">'+esc(c.name)+'</span></div></td>';
    h+='<td>'+renderServicesBadges(c.services,{compact:true})+'</td>';
    h+='<td style="text-align:right;font-variant-numeric:tabular-nums;">'+(sp?'<span style="color:var(--teal);font-weight:500;">'+fm(sp)+'</span>':'<span style="color:var(--tx3);">—</span>')+'</td>';
    h+='<td style="text-align:center;white-space:nowrap;"><button class="kh-open-btn'+(isExp?' is-active':'')+'" onclick="toggleReportClient(\''+c.id+'\')">'+(isExp?'Thu gọn':'Xem báo cáo')+'</button> <button class="btn btn-ghost btn-sm" onclick="copyClientReportLink(\''+c.id+'\',this)" title="Lấy link cho khách xem">📋</button></td>';
    h+='</tr>';
    if(isExp){
      h+='<tr><td colspan="5" style="padding:0;background:var(--bg2);">'+renderClientReportInline(c.id,ms)+'</td></tr>';
    }
  });
  h+='</tbody></table></div>';
  return h;
}
function toggleReportClient(clientId){
  expandedClientId=expandedClientId===clientId?null:clientId;render();
}
// Render bảng báo cáo daily cho 1 khách × tháng (giống Google Sheet: Ngày | Chi phí | Mess | Bình luận | Giá kết quả | Lượt thanh toán)
function renderClientReportInline(clientId,month){
  var dim=new Date(parseInt(month.split('-')[0]),parseInt(month.split('-')[1]),0).getDate();
  var year=parseInt(month.split('-')[0]);
  var mn=parseInt(month.split('-')[1]);
  // Khởi tạo data cho tất cả ngày trong tháng
  var data={};
  for(var d=1;d<=dim;d++){
    var ds=year+'-'+(mn<10?'0'+mn:mn)+'-'+(d<10?'0'+d:d);
    data[ds]={spend:0,mess:0,cmt:0,checkout:0};
  }
  // Spend từ daily_spend
  dailyData.filter(function(x){return x.report_date&&x.report_date.substring(0,7)===month;}).forEach(function(x){
    var cid=_rptClientForDaily(x);
    if(cid!==clientId)return;
    if(data[x.report_date])data[x.report_date].spend+=x.spend_amount||0;
  });
  // Mess + comment + checkout từ campaign_daily_mess
  campaignMessData.filter(function(x){return x.report_date&&x.report_date.substring(0,7)===month;}).forEach(function(x){
    var cid=_rptClientForMess(x);
    if(cid!==clientId)return;
    if(data[x.report_date]){
      data[x.report_date].mess+=x.mess_count||0;
      data[x.report_date].cmt+=x.comment_count||0;
      data[x.report_date].checkout+=x.checkout_count||0;
    }
  });
  // Tính tổng
  var totalSpend=0,totalMess=0,totalCmt=0,totalCheckout=0;
  Object.keys(data).forEach(function(k){
    totalSpend+=data[k].spend;totalMess+=data[k].mess;totalCmt+=data[k].cmt;totalCheckout+=data[k].checkout;
  });
  var totalResult=totalMess+totalCmt;
  var totalCostPer=totalResult?Math.round(totalSpend/totalResult):0;
  var totalCostCheckout=totalCheckout?Math.round(totalSpend/totalCheckout):0;
  // Tìm ngày data gần nhất để biết giới hạn (tránh hiển thị #DIV/0 cho ngày tương lai)
  var today=td();
  var c=clientList.find(function(x){return x.id===clientId;});
  var clientName=c?c.name:'';
  var hasMessSync=campaignMessData.some(function(x){var cid=_rptClientForMess(x);return cid===clientId;});
  var h='<div style="padding:14px 16px;">';
  h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">';
  h+='<div style="font-weight:600;font-size:14px;">📊 Báo cáo chi phí Ads — '+esc(clientName)+' — T'+mn+'/'+year+'</div>';
  if(!hasMessSync)h+='<div style="font-size:11px;color:var(--tx3);background:var(--amber-bg);color:var(--amber-tx);padding:4px 10px;border-radius:6px;">⚠ Chưa quét Mess/Bình luận cho khách này — vào Cảnh báo bấm "Quét giá Messenger"</div>';
  h+='</div>';
  h+='<div class="table-wrap" style="background:var(--bg1);border-radius:var(--radius);"><table style="font-size:13px;"><thead>';
  h+='<tr><th style="text-align:center;">NGÀY</th><th style="text-align:right;">CHI PHÍ ADS</th><th style="text-align:center;">Số Mess</th><th style="text-align:center;">Số Bình luận</th><th style="text-align:right;">Giá kết quả</th><th style="text-align:center;">Lượt thanh toán</th><th style="text-align:right;">Giá / Lượt thanh toán</th></tr>';
  h+='</thead><tbody>';
  // Dòng tổng
  h+='<tr style="background:var(--bg2);font-weight:600;color:var(--red);">';
  h+='<td style="text-align:center;">Tổng</td>';
  h+='<td style="text-align:right;font-variant-numeric:tabular-nums;">'+(totalSpend?fmtVndPlain(totalSpend)+' đ':'—')+'</td>';
  h+='<td style="text-align:center;">'+totalMess+'</td>';
  h+='<td style="text-align:center;">'+totalCmt+'</td>';
  h+='<td style="text-align:right;font-variant-numeric:tabular-nums;">'+(totalResult?fmtVndPlain(totalCostPer)+' đ':'—')+'</td>';
  h+='<td style="text-align:center;">'+totalCheckout+'</td>';
  h+='<td style="text-align:right;font-variant-numeric:tabular-nums;">'+(totalCheckout?fmtVndPlain(totalCostCheckout)+' đ':'—')+'</td>';
  h+='</tr>';
  // Daily rows
  Object.keys(data).sort().forEach(function(date){
    var x=data[date];
    var result=x.mess+x.cmt;
    var costPer=result?Math.round(x.spend/result):0;
    var costCheckout=x.checkout?Math.round(x.spend/x.checkout):0;
    var dp=date.split('-');
    var dayLabel=dp[2]+'/'+dp[1]+'/'+dp[0];
    var isFuture=date>today;
    var isToday=date===today;
    var dayCell=dayLabel+(isToday?' <span style="display:inline-block;font-size:10px;background:var(--amber-bg);color:var(--amber-tx);padding:1px 6px;border-radius:8px;font-weight:500;margin-left:4px;" title="Số liệu hôm nay đang cập nhật, chưa chốt">⟳ Đang cập nhật</span>':'');
    h+='<tr style="'+(isFuture?'opacity:.4;':'')+'">';
    h+='<td style="text-align:center;">'+dayCell+'</td>';
    h+='<td style="text-align:right;font-variant-numeric:tabular-nums;">'+(x.spend?fmtVndPlain(x.spend)+' đ':'<span style="color:var(--tx3);">—</span>')+'</td>';
    h+='<td style="text-align:center;">'+(x.mess||'<span style="color:var(--tx3);">—</span>')+'</td>';
    h+='<td style="text-align:center;">'+(x.cmt||'<span style="color:var(--tx3);">—</span>')+'</td>';
    h+='<td style="text-align:right;font-variant-numeric:tabular-nums;">'+(result?fmtVndPlain(costPer)+' đ':'<span style="color:var(--tx3);">—</span>')+'</td>';
    h+='<td style="text-align:center;">'+(x.checkout||'<span style="color:var(--tx3);">—</span>')+'</td>';
    h+='<td style="text-align:right;font-variant-numeric:tabular-nums;">'+(x.checkout?fmtVndPlain(costCheckout)+' đ':'<span style="color:var(--tx3);">—</span>')+'</td>';
    h+='</tr>';
  });
  h+='</tbody></table></div>';
  // ═══ Section: Hiệu quả theo bài chạy × tuần ═══
  h+=renderClientPostWeekly(clientId,month);
  h+='</div>';
  return h;
}

// Bảng "Hiệu quả theo bài chạy × tuần" — gom adPostData theo post_id, chia cột theo tuần ISO (T2-CN)
function renderClientPostWeekly(clientId,month){
  // Filter rows thuộc client + tháng
  var rows=adPostData.filter(function(x){
    if(!x.report_date||x.report_date.substring(0,7)!==month)return false;
    var aa=adList.find(function(a){return a.id===x.ad_account_id;});
    if(!aa)return false;
    var asg=getAssign(x.ad_account_id,x.report_date);
    var cid=asg.length?asg[0].client_id:aa.client_id;
    return cid===clientId;
  });
  var h='<div style="margin-top:18px;padding:0 2px;">';
  h+='<div style="font-weight:600;font-size:13px;margin-bottom:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">';
  h+='<span>Hiệu quả theo bài chạy × tuần</span>';
  h+='<span style="font-size:11px;color:var(--tx3);font-weight:400;">(gom theo post Facebook, sort theo chi phí/kết quả tăng dần)</span>';
  h+='</div>';
  if(!rows.length){
    h+='<div style="padding:14px;background:var(--bg2);border-radius:8px;font-size:12px;color:var(--tx3);">';
    h+='Chưa có dữ liệu bài chạy cho khách này trong tháng. Vào <b>Cảnh báo</b> bấm <b>"Quét giá Messenger & form"</b> để cập nhật dữ liệu mới nhất.';
    h+='</div></div>';
    return h;
  }
  // Tính tuần ISO (T2 → CN) cho từng ngày trong tháng có data — format local để tránh lệch ngày qua UTC
  function _fmtLocal(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function _weekStart(ds){
    var d=new Date(ds+'T00:00:00');
    var day=d.getDay(); // 0=CN,1=T2,...,6=T7
    var off=day===0?-6:(1-day);
    var m=new Date(d);m.setDate(d.getDate()+off);
    return _fmtLocal(m);
  }
  function _addDays(ds,n){var d=new Date(ds+'T00:00:00');d.setDate(d.getDate()+n);return _fmtLocal(d);}
  function _ddmm(ds){var p=ds.split('-');return p[2]+'/'+p[1];}
  // Group theo post_id (fallback ad_id nếu null), kèm aggregate per week
  var byPost={};
  var weekSet={};
  rows.forEach(function(r){
    var key=r.post_id||('ad_'+r.ad_id);
    if(!byPost[key]){
      byPost[key]={
        post_id:r.post_id||null,
        post_url:r.post_url||null,
        thumbnail_url:r.thumbnail_url||null,
        name:r.ad_name||r.campaign_name||'(không tên)',
        ad_id:r.ad_id,
        campaign_name:r.campaign_name||null,
        weeks:{},
        total:{spend:0,mess:0,cmt:0,lead:0,checkout:0}
      };
    }
    var ws=_weekStart(r.report_date);
    weekSet[ws]=true;
    var p=byPost[key];
    if(!p.weeks[ws])p.weeks[ws]={spend:0,mess:0,cmt:0,lead:0,checkout:0};
    p.weeks[ws].spend+=r.spend||0;p.weeks[ws].mess+=r.mess_count||0;p.weeks[ws].cmt+=r.comment_count||0;
    p.weeks[ws].lead+=r.lead_count||0;p.weeks[ws].checkout+=r.checkout_count||0;
    p.total.spend+=r.spend||0;p.total.mess+=r.mess_count||0;p.total.cmt+=r.comment_count||0;
    p.total.lead+=r.lead_count||0;p.total.checkout+=r.checkout_count||0;
    // Cập nhật name nếu có ad_name (ưu tiên hơn campaign_name)
    if(r.ad_name&&p.name==='(không tên)')p.name=r.ad_name;
  });
  var weeks=Object.keys(weekSet).sort();
  // Sort theo chi phí/kết quả tăng dần (rẻ nhất lên đầu); bài chưa có kết quả (mess+cmt=0) xuống cuối, tie-break theo spend giảm dần
  var posts=Object.keys(byPost).map(function(k){return byPost[k];}).sort(function(a,b){
    var ar=a.total.mess+a.total.cmt, br=b.total.mess+b.total.cmt;
    var ac=ar?a.total.spend/ar:Infinity, bc=br?b.total.spend/br:Infinity;
    if(ac!==bc)return ac-bc;
    return b.total.spend-a.total.spend;
  });
  // Header tuần
  h+='<div class="table-wrap" style="background:var(--bg1);border-radius:var(--radius);">';
  h+='<table style="font-size:12px;min-width:900px;"><thead><tr>';
  h+='<th style="text-align:left;min-width:280px;">BÀI CHẠY</th>';
  weeks.forEach(function(ws,i){
    var we=_addDays(ws,6);
    h+='<th style="text-align:right;white-space:nowrap;">Tuần '+(i+1)+'<div style="font-size:10px;color:var(--tx3);font-weight:400;">'+_ddmm(ws)+'–'+_ddmm(we)+'</div></th>';
  });
  h+='<th style="text-align:right;background:var(--bg2);white-space:nowrap;">Tổng tháng</th>';
  h+='</tr></thead><tbody>';
  // Từng bài chạy
  posts.forEach(function(p){
    h+='<tr>';
    // Cột bài chạy: thumbnail + tên + post_id + link
    h+='<td style="padding:6px 8px;">';
    h+='<div style="display:flex;gap:8px;align-items:flex-start;">';
    if(p.thumbnail_url)h+='<img src="'+esc(p.thumbnail_url)+'" alt="" style="width:40px;height:40px;border-radius:4px;object-fit:cover;flex-shrink:0;background:var(--bg2);" loading="lazy" onerror="this.style.display=\'none\'">';
    h+='<div style="min-width:0;flex:1;">';
    h+='<div style="font-weight:500;font-size:12px;line-height:1.3;color:var(--tx1);">'+esc(p.name)+'</div>';
    var idLine=[];
    if(p.post_id){
      var pidShort=p.post_id.split('_').pop()||p.post_id;
      idLine.push('<span style="font-family:monospace;font-size:10px;color:var(--tx3);" title="'+esc(p.post_id)+'">ID: '+esc(pidShort)+'</span>');
    }else{
      idLine.push('<span style="font-size:10px;color:var(--tx3);">ad #'+esc(p.ad_id)+'</span>');
    }
    if(p.post_url)idLine.push('<a href="'+esc(p.post_url)+'" target="_blank" rel="noopener" style="font-size:10px;color:var(--blue);text-decoration:none;">Xem post ↗</a>');
    h+='<div style="margin-top:2px;display:flex;gap:8px;flex-wrap:wrap;">'+idLine.join('')+'</div>';
    h+='</div></div></td>';
    // Cột từng tuần
    weeks.forEach(function(ws){
      var w=p.weeks[ws];
      if(!w||!w.spend){h+='<td style="text-align:right;color:var(--tx3);">—</td>';return;}
      var result=w.mess+w.cmt;
      var costPer=result?Math.round(w.spend/result):0;
      h+='<td style="text-align:right;font-variant-numeric:tabular-nums;padding:6px 8px;">';
      h+='<div style="font-weight:500;">'+fm(w.spend)+'</div>';
      h+='<div style="font-size:10px;color:var(--tx3);">'+w.mess+'m'+(w.cmt?' · '+w.cmt+'cmt':'')+(result?' · '+fm(costPer)+'/r':'')+'</div>';
      h+='</td>';
    });
    // Cột tổng tháng
    var tr=p.total.mess+p.total.cmt;
    var tcp=tr?Math.round(p.total.spend/tr):0;
    h+='<td style="text-align:right;font-variant-numeric:tabular-nums;background:var(--bg2);font-weight:600;padding:6px 8px;">';
    h+='<div>'+fm(p.total.spend)+'</div>';
    h+='<div style="font-size:10px;color:var(--tx3);font-weight:400;">'+p.total.mess+'m'+(p.total.cmt?' · '+p.total.cmt+'cmt':'')+(tr?' · '+fm(tcp)+'/r':'')+'</div>';
    h+='</td>';
    h+='</tr>';
  });
  // Dòng tổng cuối bảng
  var totWeek={},totAll={spend:0,mess:0,cmt:0};
  weeks.forEach(function(ws){totWeek[ws]={spend:0,mess:0,cmt:0};});
  posts.forEach(function(p){
    weeks.forEach(function(ws){
      if(p.weeks[ws]){totWeek[ws].spend+=p.weeks[ws].spend;totWeek[ws].mess+=p.weeks[ws].mess;totWeek[ws].cmt+=p.weeks[ws].cmt;}
    });
    totAll.spend+=p.total.spend;totAll.mess+=p.total.mess;totAll.cmt+=p.total.cmt;
  });
  h+='<tr style="background:var(--bg2);font-weight:600;border-top:2px solid var(--bd2);">';
  h+='<td style="padding:8px;color:var(--red);">Tổng '+posts.length+' bài chạy</td>';
  weeks.forEach(function(ws){
    var w=totWeek[ws];
    var r=w.mess+w.cmt,cp=r?Math.round(w.spend/r):0;
    h+='<td style="text-align:right;padding:8px;font-variant-numeric:tabular-nums;">';
    h+='<div>'+(w.spend?fm(w.spend):'—')+'</div>';
    if(w.spend)h+='<div style="font-size:10px;color:var(--tx3);font-weight:400;">'+w.mess+'m'+(r?' · '+fm(cp)+'/r':'')+'</div>';
    h+='</td>';
  });
  var trAll=totAll.mess+totAll.cmt;var tcpAll=trAll?Math.round(totAll.spend/trAll):0;
  h+='<td style="text-align:right;padding:8px;font-variant-numeric:tabular-nums;color:var(--red);">';
  h+='<div>'+fm(totAll.spend)+'</div>';
  h+='<div style="font-size:10px;color:var(--tx3);font-weight:400;">'+totAll.mess+'m'+(trAll?' · '+fm(tcpAll)+'/r':'')+'</div>';
  h+='</td></tr>';
  h+='</tbody></table></div>';
  h+='<div style="font-size:10px;color:var(--tx3);margin-top:6px;">Chú thích: <b>m</b>=Mess · <b>cmt</b>=Bình luận · <b>/r</b>=Giá trên 1 kết quả (mess+cmt)</div>';
  h+='</div>';
  return h;
}

// ═══ POPOVER ⋯ TRONG BẢNG BÁO GIÁ ═══
function closeQuotationMenus(){
  document.querySelectorAll('.qt-action-menu.open').forEach(function(el){
    el.classList.remove('open');
    el.classList.remove('flip-up');
    // Reset inline styles từ position:fixed
    el.style.position='';el.style.top='';el.style.right='';el.style.left='';el.style.bottom='';el.style.minWidth='';
    var trig=document.querySelector('[aria-controls="'+el.id+'"]');
    if(trig)trig.setAttribute('aria-expanded','false');
  });
}
// Định vị menu dùng position:fixed dựa trên rect của trigger
// → không bị parent overflow:hidden clip (table-wrap trong tab Tiềm năng)
function positionFixedMenu(menuEl,trig){
  if(!menuEl||!trig)return;
  var rect=trig.getBoundingClientRect();
  var viewH=window.innerHeight||document.documentElement.clientHeight;
  var viewW=window.innerWidth||document.documentElement.clientWidth;
  menuEl.style.position='fixed';
  menuEl.style.left='auto';
  menuEl.style.bottom='auto';
  menuEl.style.right=(viewW-rect.right)+'px';
  menuEl.style.top=(rect.bottom+6)+'px';
  menuEl.style.minWidth='200px';
  // Sau khi paint, kiểm tra overflow → flip lên nếu cần
  requestAnimationFrame(function(){
    var mRect=menuEl.getBoundingClientRect();
    if(mRect.bottom>viewH-12){
      menuEl.style.top='auto';
      menuEl.style.bottom=(viewH-rect.top+6)+'px';
    }
  });
}
function toggleQuotationMenu(ev,id){
  ev.stopPropagation();
  var m=document.getElementById('qt-menu-'+id);if(!m)return;
  var wasOpen=m.classList.contains('open');
  closeQuotationMenus();
  if(!wasOpen){
    m.classList.add('open');
    var trig=ev.currentTarget;if(trig)trig.setAttribute('aria-expanded','true');
    positionFixedMenu(m,trig);
    var first=m.querySelector('button[role="menuitem"]');if(first)first.focus();
  }
}
document.addEventListener('keydown',function(e){
  var menu=document.querySelector('.qt-action-menu.open');if(!menu)return;
  if(e.key!=='ArrowDown'&&e.key!=='ArrowUp'&&e.key!=='Home'&&e.key!=='End')return;
  e.preventDefault();
  var items=Array.prototype.slice.call(menu.querySelectorAll('button[role="menuitem"]'));
  if(!items.length)return;
  var idx=items.indexOf(document.activeElement);
  if(e.key==='ArrowDown')idx=idx<0?0:(idx+1)%items.length;
  else if(e.key==='ArrowUp')idx=idx<=0?items.length-1:idx-1;
  else if(e.key==='Home')idx=0;
  else if(e.key==='End')idx=items.length-1;
  items[idx].focus();
});
document.addEventListener('click',closeQuotationMenus);
document.addEventListener('keydown',function(e){
  if(e.key!=='Enter'&&e.key!==' ')return;
  var t=e.target;
  if(t&&t.classList&&(t.classList.contains('nav-item')||t.classList.contains('nav-subitem'))){
    e.preventDefault();
    t.click();
  }
});
document.addEventListener('keydown',function(e){
  if(e.key!=='Escape')return;
  if(quotationModalId){closeQuotationModal();return;}
  if(quotationPreviewId){closeQuotationPreview();return;}
  if(contractModalClientId){closeContractModal();return;}
  if(contractHistoryClientId){closeContractHistory();return;}
  if(newProspectModalOpen){closeNewProspectModal();return;}
  if(newActiveClientModalOpen){closeNewActiveClientModal();return;}
  closeQuotationMenus();
});

// ═══ MỞ MODAL: TẠO/SỬA BÁO GIÁ ═══
function openQuotationModal(id){
  if(!needAuth())return;
  quotationModalId=id||'new';render();
  setTimeout(function(){fillQuotationDefaults(id);},50);
}
function openQuotationForClient(clientId){
  if(!needAuth())return;
  quotationModalId='new';render();
  setTimeout(function(){
    fillQuotationDefaults(null);
    var el=document.getElementById('qt-client');if(el){el.value=clientId;onQuotationClientChange();}
  },50);
}
function closeQuotationModal(){quotationModalId=null;render();}

function fillQuotationDefaults(id){
  var q=id?quotationList.find(function(x){return x.id===id;}):null;
  var set=function(eid,val){var el=document.getElementById(eid);if(el)el.value=val==null?'':val;};
  var check=function(eid,v){var el=document.getElementById(eid);if(el)el.checked=!!v;};
  var t=new Date();
  var today=t.toISOString().substring(0,10);
  var defaultValidUntil=new Date(Date.now()+7*86400000).toISOString().substring(0,10);
  var inc=q?getQuotationIncludes(q):{fp:true,ads:true,web:false};
  if(q){
    set('qt-client',q.client_id);
    set('qt-number',q.quote_number||'');
    set('qt-issued',q.issued_date||today);
    set('qt-valid',q.valid_until||defaultValidUntil);
    set('qt-note',q.note||'');
    check('qt-inc-fp',inc.fp);
    check('qt-inc-ads',inc.ads);
    check('qt-inc-web',inc.web);
    set('qt-fanpage-pkg',q.fanpage_package||1);
    set('qt-fp-override',q.fanpage_price_override||'');
    set('qt-budget',q.monthly_budget||'');
    set('qt-support-fee',q.support_fee||'');
    set('qt-web-fee',q.web_fee||'');
    set('qt-web-note',q.web_note||'');
    check('qt-hide-low',shouldHideLowTiers(q));
  }else{
    set('qt-client','');
    set('qt-number','');
    set('qt-issued',today);
    set('qt-valid',defaultValidUntil);
    set('qt-note','');
    check('qt-inc-fp',true);
    check('qt-inc-ads',true);
    check('qt-inc-web',false);
    set('qt-fanpage-pkg',1);
    set('qt-fp-override','');
    set('qt-budget','');
    set('qt-support-fee','');
    set('qt-web-fee','');
    set('qt-web-note','');
    check('qt-hide-low',false);
  }
  formatMoneyInput(document.getElementById('qt-budget'));
  formatMoneyInput(document.getElementById('qt-support-fee'));
  formatMoneyInput(document.getElementById('qt-fp-override'));
  formatMoneyInput(document.getElementById('qt-web-fee'));
  onQuotationPackageChange();
  onQuotationBudgetChange();
  onQuotationClientChange();
}

function onQuotationClientChange(){
  var cid=document.getElementById('qt-client').value;
  var numberInput=document.getElementById('qt-number');
  if(numberInput&&!numberInput.value&&cid){
    var c=clientList.find(function(x){return x.id===cid;});
    var prefix=(c&&c.contract_prefix)||'XXX';
    numberInput.value=getNextQuotationNumber(prefix,new Date().getFullYear());
  }
  recalcQuotationPreview();
}

function onQuotationPackageChange(){
  var fp=document.getElementById('qt-inc-fp').checked;
  var ads=document.getElementById('qt-inc-ads').checked;
  var web=document.getElementById('qt-inc-web').checked;
  var fpGroup=document.getElementById('qt-fanpage-group');
  var adGroup=document.getElementById('qt-ad-group');
  var webGroup=document.getElementById('qt-web-group');
  if(fpGroup)fpGroup.style.display=fp?'':'none';
  if(adGroup)adGroup.style.display=ads?'':'none';
  if(webGroup)webGroup.style.display=web?'':'none';
  recalcQuotationPreview();
}
function onQuotationFanpagePkgChange(){
  // Khi đổi gói gợi ý → cập nhật ô override theo giá gói (nếu user chưa sửa tay)
  var ov=document.getElementById('qt-fp-override');
  if(!ov)return;
  if(ov.dataset.touched==='1'){recalcQuotationPreview();return;}
  var pkgId=parseInt(document.getElementById('qt-fanpage-pkg').value)||1;
  var pkg=FANPAGE_PACKAGES.find(function(p){return p.id===pkgId;});
  ov.value=pkg?pkg.price.toLocaleString('vi-VN'):'';
  recalcQuotationPreview();
}
function onQuotationFpOverrideChange(){
  var ov=document.getElementById('qt-fp-override');
  if(ov)ov.dataset.touched='1';
  recalcQuotationPreview();
}

function onQuotationBudgetChange(){
  var b=normalizeMoneyInput(document.getElementById('qt-budget').value);
  var auto=calcAdSupportFee(b);
  var feeInput=document.getElementById('qt-support-fee');
  var tier=findAdTier(b);
  var tierLabel=document.getElementById('qt-tier-label');
  if(tierLabel)tierLabel.textContent=tier?tier.label+' → '+tier.display:'Nhập ngân sách để xem bậc phí';
  if(feeInput&&(!feeInput.dataset.touched||feeInput.dataset.touched==='0')){feeInput.value=auto?auto.toLocaleString('vi-VN'):'';}
  var hideChk=document.getElementById('qt-hide-low');
  if(hideChk&&(!hideChk.dataset.touched||hideChk.dataset.touched==='0'))hideChk.checked=b>=30000000;
  recalcQuotationPreview();
}
function onQuotationHideLowChange(){
  var el=document.getElementById('qt-hide-low');if(el)el.dataset.touched='1';
  recalcQuotationPreview();
}

function onQuotationFeeManualChange(){
  var feeInput=document.getElementById('qt-support-fee');
  if(feeInput)feeInput.dataset.touched='1';
  recalcQuotationPreview();
}

function recalcQuotationPreview(){
  var fp=document.getElementById('qt-inc-fp').checked;
  var ads=document.getElementById('qt-inc-ads').checked;
  var web=document.getElementById('qt-inc-web').checked;
  var fpId=parseInt(document.getElementById('qt-fanpage-pkg').value)||1;
  var fpOverrideRaw=document.getElementById('qt-fp-override').value;
  var fpOverride=normalizeMoneyInput(fpOverrideRaw);
  var b=normalizeMoneyInput(document.getElementById('qt-budget').value);
  var fee=normalizeMoneyInput(document.getElementById('qt-support-fee').value);
  var webFee=normalizeMoneyInput(document.getElementById('qt-web-fee').value);
  var pkg=FANPAGE_PACKAGES.find(function(p){return p.id===fpId;});
  var fpPrice=fp?(fpOverride>0?fpOverride:(pkg?pkg.price:0)):0;
  var adFee=ads?fee:0;
  var wFee=web?webFee:0;
  var total=fpPrice+adFee+wFee;
  var box=document.getElementById('qt-total-box');
  if(box){
    var parts=[];
    if(fp)parts.push('Fanpage '+(pkg?pkg.name:'Gói 1')+(fpOverride>0&&pkg&&fpOverride!==pkg.price?' (chốt)':'')+': <strong>'+ff(fpPrice)+'đ</strong>');
    if(ads)parts.push('Phí hỗ trợ Quảng cáo: <strong>'+ff(adFee)+'đ</strong>'+(b?' (ngân sách '+ff(b)+'đ/tháng)':''));
    if(web)parts.push('Web App: <strong>'+ff(wFee)+'đ</strong>');
    if(!parts.length)parts.push('<em style="color:var(--red-tx);">Chưa chọn gói dịch vụ nào</em>');
    box.innerHTML='<div style="font-size:12px;color:var(--tx3);margin-bottom:4px;">'+parts.join(' &nbsp;•&nbsp; ')+'</div><div style="font-size:20px;font-weight:700;color:var(--blue-tx);">Tổng: '+ff(total)+'đ</div>';
  }
}

// ═══ RENDER MODAL: BÁO GIÁ ═══
function renderQuotationModal(){
  if(!quotationModalId)return '';
  var isEdit=quotationModalId!=='new';
  var h='<div class="hc-modal-backdrop" onclick="if(event.target===this)closeQuotationModal()">';
  h+='<div class="hc-modal" role="dialog" aria-modal="true" aria-labelledby="qt-modal-title" style="max-width:780px;">';
  h+='<div class="hc-modal-head"><h3 id="qt-modal-title">'+(isEdit?'Sửa báo giá':'Tạo báo giá mới')+'</h3><button class="hc-modal-close" aria-label="Đóng" onclick="closeQuotationModal()">×</button></div>';
  h+='<div class="hc-modal-body">';
  h+='<div style="background:var(--blue-bg);border:1px solid var(--blue);color:var(--blue-tx);padding:10px 12px;border-radius:var(--radius);font-size:12px;margin-bottom:14px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:6px;flex-shrink:0;"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>Phí hỗ trợ Quảng cáo tự động tính theo bậc ngân sách. Bạn có thể sửa tay nếu cần thoả thuận riêng.</div>';
  h+='<div class="hc-form-grid">';
  h+='<div style="grid-column:1/-1;"><label for="qt-client">Khách hàng *</label><select id="qt-client" class="fi" aria-required="true" aria-describedby="qt-client-err" onchange="onQuotationClientChange()"><option value="">— Chọn khách —</option>';
  clientList.forEach(function(c){h+='<option value="'+c.id+'">'+esc(c.name)+(c.status==='prospect'?' (tiềm năng)':'')+'</option>';});
  h+='</select><span id="qt-client-err" class="field-error" hidden>Vui lòng chọn khách hàng</span></div>';
  h+='<div><label>Mã báo giá</label><input id="qt-number" class="fi" placeholder="Sẽ tạo tự động sau khi chọn khách hàng"></div>';
  h+='<div><label>Ngày lập</label><input id="qt-issued" type="date" class="fi"></div>';
  h+='<div><label>Hiệu lực đến</label><input id="qt-valid" type="date" class="fi"></div>';
  h+='<div style="grid-column:1/-1;"><label>Gói dịch vụ <span style="color:var(--tx3);font-weight:400;text-transform:none;">(tick các mục cần báo giá — có thể chọn nhiều)</span></label>';
  h+='<div style="display:flex;gap:14px;flex-wrap:wrap;padding:10px 14px;border:1px solid var(--bd2);border-radius:var(--radius);background:var(--bg2);">';
  h+='<label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;font-weight:500;text-transform:none;letter-spacing:0;color:var(--tx1);"><input type="checkbox" id="qt-inc-fp" onchange="onQuotationPackageChange()" style="accent-color:var(--blue);width:16px;height:16px;">📘 Tạo Fanpage</label>';
  h+='<label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;font-weight:500;text-transform:none;letter-spacing:0;color:var(--tx1);"><input type="checkbox" id="qt-inc-ads" onchange="onQuotationPackageChange()" style="accent-color:var(--blue);width:16px;height:16px;">📣 Chạy Quảng cáo</label>';
  h+='<label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;font-weight:500;text-transform:none;letter-spacing:0;color:var(--tx1);"><input type="checkbox" id="qt-inc-web" onchange="onQuotationPackageChange()" style="accent-color:var(--blue);width:16px;height:16px;">💻 Lập trình Web App</label>';
  h+='</div></div>';
  h+='</div>';
  h+='<div id="qt-fanpage-group" style="margin-top:14px;padding:12px;background:var(--bg2);border-radius:var(--radius);">';
  h+='<div style="font-size:13px;font-weight:600;margin-bottom:8px;">📘 Gói Fanpage</div>';
  h+='<div class="hc-form-grid">';
  h+='<div><label>Chọn gói gợi ý</label><select id="qt-fanpage-pkg" class="fi" onchange="onQuotationFanpagePkgChange()">';
  FANPAGE_PACKAGES.forEach(function(p){h+='<option value="'+p.id+'">'+p.name+' — '+ff(p.price)+'đ</option>';});
  h+='</select></div>';
  h+='<div><label>Giá Fanpage chốt (VNĐ) <span style="color:var(--tx3);font-weight:400;text-transform:none;">(sửa nếu cần)</span></label><input id="qt-fp-override" type="text" inputmode="numeric" autocomplete="off" class="fi" oninput="formatMoneyInput(this);onQuotationFpOverrideChange()" placeholder="Theo gói chuẩn"></div>';
  h+='</div></div>';
  h+='<div id="qt-ad-group" style="margin-top:14px;padding:12px;background:var(--bg2);border-radius:var(--radius);">';
  h+='<div style="font-size:13px;font-weight:600;margin-bottom:8px;display:flex;align-items:center;gap:8px;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#378ADD;"></span>Gói chạy Quảng cáo</div>';
  h+='<div class="hc-form-grid">';
  h+='<div><label>Ngân sách dự kiến/tháng (VNĐ)</label><input id="qt-budget" type="text" inputmode="numeric" autocomplete="off" class="fi" oninput="formatMoneyInput(this);onQuotationBudgetChange()" placeholder="VD: 20.000.000"></div>';
  h+='<div><label>Phí hỗ trợ/tháng (VNĐ) <span style="color:var(--tx3);font-weight:400;text-transform:none;">(sửa tay nếu cần)</span></label><input id="qt-support-fee" type="text" inputmode="numeric" autocomplete="off" class="fi" oninput="formatMoneyInput(this);onQuotationFeeManualChange()" placeholder="Tự tính theo bậc"></div>';
  h+='<div style="grid-column:1/-1;font-size:11px;color:var(--tx3);" id="qt-tier-label">Nhập ngân sách để xem bậc phí</div>';
  h+='<div style="grid-column:1/-1;padding:8px 10px;background:var(--bg1);border:1px solid var(--bd1);border-radius:var(--radius);"><label style="display:flex;gap:8px;align-items:center;cursor:pointer;font-size:12.5px;color:var(--tx2);margin:0;"><input type="checkbox" id="qt-hide-low" onchange="onQuotationHideLowChange()" style="width:15px;height:15px;cursor:pointer;margin:0;"><span>Ẩn các bậc dưới 30tr khi in báo giá <span style="color:var(--tx3);">(tự bật khi ngân sách ≥ 30tr)</span></span></label></div>';
  h+='</div></div>';
  h+='<div id="qt-web-group" style="margin-top:14px;padding:12px;background:var(--bg2);border-radius:var(--radius);">';
  h+='<div style="font-size:13px;font-weight:600;margin-bottom:8px;display:flex;align-items:center;gap:8px;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#7F77DD;"></span>Gói Lập trình Web App</div>';
  h+='<div class="hc-form-grid">';
  h+='<div><label>Phí trọn gói (VNĐ) <span style="color:var(--tx3);font-weight:400;text-transform:none;">(thanh toán 1 lần)</span></label><input id="qt-web-fee" type="text" inputmode="numeric" autocomplete="off" class="fi" oninput="formatMoneyInput(this);recalcQuotationPreview()" placeholder="VD: 15.000.000"></div>';
  h+='<div></div>';
  h+='<div style="grid-column:1/-1;"><label>Phạm vi công việc / mô tả</label><input id="qt-web-note" class="fi" placeholder="VD: Landing page giới thiệu, form đăng ký, tích hợp Zalo/CRM…"></div>';
  h+='</div></div>';
  h+='<div class="hc-form-grid" style="margin-top:14px;">';
  h+='<div style="grid-column:1/-1;"><label>Ghi chú (ưu đãi riêng, điều khoản đặc biệt...)</label><input id="qt-note" class="fi"></div>';
  h+='</div>';
  h+='<div id="qt-total-box" style="margin-top:14px;padding:14px 16px;background:var(--blue-bg);border-radius:var(--radius);text-align:right;"></div>';
  h+='</div>';
  h+='<div class="hc-modal-foot" style="gap:8px;flex-wrap:wrap;">';
  h+='<button class="btn btn-ghost" onclick="closeQuotationModal()">Đóng</button>';
  if(isEdit)h+='<button class="btn btn-ghost" onclick="previewQuotation(quotationModalId)">Xem trước</button>';
  h+='<button class="btn btn-ghost" onclick="saveQuotation(this,false)">Lưu nháp</button>';
  h+='<button class="btn btn-primary" onclick="saveQuotation(this,true)">Lưu &amp; gửi</button>';
  h+='</div>';
  h+='</div></div>';
  return h;
}

// ═══ LƯU BÁO GIÁ ═══
async function saveQuotation(btn,markSent){
  if(!needAuth())return;
  var v=function(id){var el=document.getElementById(id);return el?el.value.trim():'';};
  var clientId=v('qt-client');
  var clientField=document.getElementById('qt-client');
  var clientErr=document.getElementById('qt-client-err');
  if(!clientId){
    if(clientField){clientField.classList.add('has-error');clientField.setAttribute('aria-invalid','true');clientField.focus();}
    if(clientErr)clientErr.hidden=false;
    toast('Vui lòng chọn khách hàng trước khi lưu báo giá.',false);return;
  }
  if(clientField){clientField.classList.remove('has-error');clientField.removeAttribute('aria-invalid');}
  if(clientErr)clientErr.hidden=true;
  // Đọc 3 checkboxes Gói dịch vụ
  var incFp=document.getElementById('qt-inc-fp').checked;
  var incAds=document.getElementById('qt-inc-ads').checked;
  var incWeb=document.getElementById('qt-inc-web').checked;
  if(!incFp&&!incAds&&!incWeb){toast('Tick ít nhất 1 gói dịch vụ trước khi lưu',false);if(btn){btn.disabled=false;btn.classList.remove('is-loading');}return;}
  if(btn){btn.disabled=true;btn.classList.add('is-loading');}
  var type=derivePackageType({fp:incFp,ads:incAds,web:incWeb});
  var fpId=parseInt(v('qt-fanpage-pkg'))||1;
  var budget=normalizeMoneyInput(v('qt-budget'));
  var fee=normalizeMoneyInput(v('qt-support-fee'));
  var fpOverride=normalizeMoneyInput(v('qt-fp-override'));
  var webFee=normalizeMoneyInput(v('qt-web-fee'));
  var webNote=v('qt-web-note');
  if(incAds&&!fee&&budget)fee=calcAdSupportFee(budget);
  var pkg=FANPAGE_PACKAGES.find(function(p){return p.id===fpId;});
  var fanpageFee=incFp?(fpOverride>0?fpOverride:(pkg?pkg.price:0)):0;
  var adFee=incAds?fee:0;
  var wFee=incWeb?webFee:0;
  var total=fanpageFee+adFee+wFee;
  var number=v('qt-number');
  if(!number){
    var c=clientList.find(function(x){return x.id===clientId;});
    number=getNextQuotationNumber((c&&c.contract_prefix)||'XXX',new Date().getFullYear());
  }
  var hideLowEl=document.getElementById('qt-hide-low');
  var hideLow=hideLowEl?!!hideLowEl.checked:(budget>=30000000);
  var snapshot={
    package_type:type,
    include_fanpage:incFp,
    include_ads:incAds,
    include_web:incWeb,
    fanpage_package:incFp?fpId:null,
    fanpage_price:fanpageFee,
    fanpage_price_override:(incFp&&fpOverride>0)?fpOverride:null,
    monthly_budget:budget,
    support_fee:adFee,
    web_fee:wFee,
    web_note:incWeb?webNote:null,
    total:total,
    hide_low_tiers:hideLow,
    features:(pkg?pkg.features:null)
  };
  var payload={
    client_id:clientId,
    quote_number:number,
    status:markSent?'sent':'draft',
    package_type:type,
    fanpage_package:snapshot.fanpage_package,
    fanpage_price_override:snapshot.fanpage_price_override,
    monthly_budget:budget||0,
    support_fee:adFee||0,
    web_fee:wFee||0,
    web_note:incWeb?(webNote||null):null,
    total_fee:total||0,
    issued_date:v('qt-issued')||td(),
    valid_until:v('qt-valid')||null,
    note:v('qt-note')||null,
    snapshot:snapshot,
    created_by:(authUser&&authUser.email)||null
  };
  if(markSent)payload.sent_at=new Date().toISOString();
  var r;
  var existingId=quotationModalId&&quotationModalId!=='new'?quotationModalId:null;
  async function tryUpsert(p){
    if(existingId)return await sb2.from('quotation').update(p).eq('id',existingId).select().maybeSingle();
    return await sb2.from('quotation').insert(p).select().maybeSingle();
  }
  try{
    r=await tryUpsert(payload);
    if(r.error&&isMissingColumnError(r.error)){
      // DB chưa có cột web_fee/web_note/fanpage_price_override → retry không kèm
      var fb=Object.assign({},payload);delete fb.web_fee;delete fb.web_note;delete fb.fanpage_price_override;
      r=await tryUpsert(fb);
      if(!r.error&&(incWeb||fpOverride>0))toast('⚠ Đã lưu nhưng chưa có cột mới trong DB. Chạy migration 2026-04-27_quotation_web_and_override.sql để bật đầy đủ.',false);
    }
  }finally{
    if(btn){btn.disabled=false;btn.classList.remove('is-loading');}
  }
  if(r.error){toast('Lỗi: '+r.error.message,false);return;}
  var savedId=existingId||(r.data&&r.data.id);
  toast('Đã lưu báo giá',true);
  quotationModalId=null;
  await loadLight();
  // Tự động mở preview của báo giá vừa lưu để user xem + tải PDF ngay
  if(savedId){
    setTimeout(function(){previewQuotation(savedId);},150);
  }
}

async function deleteQuotation(id){
  if(!needAuth())return;
  var q=quotationList.find(function(x){return x.id===id;});
  var label=q?(q.quote_number||'báo giá'):'báo giá';
  // Soft-undo: ẩn khỏi list ngay, chờ 5s mới commit xóa ở DB
  var orig=quotationList.slice();
  quotationList=quotationList.filter(function(x){return x.id!==id;});
  render();
  var cancelled=false;
  toast('Đã xóa '+label,true,{
    duration:5000,
    action:{label:'Hoàn tác',onClick:function(){cancelled=true;quotationList=orig;render();toast('Đã khôi phục',true);}}
  });
  setTimeout(async function(){
    if(cancelled)return;
    var r=await sb2.from('quotation').delete().eq('id',id);
    if(r.error){quotationList=orig;render();toast('Không thể xóa: '+r.error.message,false);return;}
    await loadLight();
  },5000);
}

async function updateQuotationStatus(id,status){
  if(!needAuth())return;
  var patch={status:status};
  if(status==='sent')patch.sent_at=new Date().toISOString();
  if(status==='accepted')patch.accepted_at=new Date().toISOString();
  var r=await sb2.from('quotation').update(patch).eq('id',id);
  if(r.error){toast('Lỗi: '+r.error.message,false);return;}
  toast('Đã cập nhật trạng thái',true);
  await loadLight();
}

async function convertQuotationToContract(id){
  var q=quotationList.find(function(x){return x.id===id;});if(!q)return;
  var c=clientList.find(function(x){return x.id===q.client_id;});if(!c)return;
  if(!confirm('Chuyển "'+(c.name)+'" thành khách chính thức và mở form xuất hợp đồng?'))return;
  if(c.status==='prospect'){
    var today=new Date().toISOString().substring(0,10);
    await sb2.from('client').update({status:'active',start_date:today}).eq('id',q.client_id);
    await loadLight();
  }
  openContractModal(q.client_id);
  setTimeout(function(){
    var setV=function(eid,val){var el=document.getElementById(eid);if(el&&val!=null)el.value=val;};
    if(q.monthly_budget){setV('ct-budget-min',q.monthly_budget);setV('ct-budget-max',q.monthly_budget);}
  },120);
}

// ═══ PREVIEW / IN BÁO GIÁ ═══
function previewQuotation(id){quotationPreviewId=id;renderQuotationPreview();}
function closeQuotationPreview(){quotationPreviewId=null;var ov=document.getElementById('qt-preview-overlay');if(ov)ov.remove();}

function renderQuotationPreview(){
  var q=quotationList.find(function(x){return x.id===quotationPreviewId;});
  if(!q)return;
  var c=q.client||clientList.find(function(x){return x.id===q.client_id;})||{};
  var html=renderQuotationHtml(q,c);
  var existing=document.getElementById('qt-preview-overlay');if(existing)existing.remove();
  var ov=document.createElement('div');ov.id='qt-preview-overlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:1200;overflow-y:auto;padding:20px;';
  ov.innerHTML='<div style="max-width:900px;margin:0 auto;">'
    +'<div style="display:flex;gap:8px;margin-bottom:12px;justify-content:flex-end;flex-wrap:wrap;">'
    +'<button class="btn" onclick="closeQuotationPreview()">✕ Đóng</button>'
    +'<button class="btn" onclick="printQuotation()">🖨️ In</button>'
    +'<button class="btn btn-primary" onclick="downloadQuotationPdf(this)">📄 Tải PDF</button>'
    +'</div>'
    +'<div id="qt-print-area">'+html+'</div>'
    +'</div>';
  ov.onclick=function(e){if(e.target===ov)closeQuotationPreview();};
  document.body.appendChild(ov);
}

function printQuotation(){
  var node=document.getElementById('qt-print-area');if(!node){toast('Không tìm thấy nội dung báo giá',false);return;}
  var w=window.open('','_blank','width=900,height=1200');
  if(!w){toast('Trình duyệt chặn cửa sổ — bấm "Tải PDF" thay thế',false);return;}
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Báo giá HC Agency</title>');
  w.document.write('<style>'+quotationPrintCss()+'</style></head><body>'+node.innerHTML+'</body></html>');
  w.document.close();setTimeout(function(){w.focus();w.print();},300);
}

// Tải PDF trực tiếp (không qua print dialog)
async function downloadQuotationPdf(btn){
  if(!quotationPreviewId){toast('Không tìm thấy báo giá',false);return;}
  var node=document.getElementById('qt-print-area');
  if(!node){toast('Không tìm thấy nội dung báo giá để tải',false);return;}
  var q=quotationList.find(function(x){return x.id===quotationPreviewId;});if(!q)return;
  var c=q.client||clientList.find(function(x){return x.id===q.client_id;})||{};
  var oldText=btn?btn.textContent:'';
  if(btn){btn.disabled=true;btn.textContent='Đang tạo PDF...';}
  var wrap=null;
  try{
    await ensureHtml2Pdf();
    wrap=document.createElement('div');
    wrap.innerHTML='<style>'+quotationPrintCss()+'</style>'+node.innerHTML;
    wrap.style.cssText='position:absolute;left:-99999px;top:0;width:210mm;background:#ffffff;';
    document.body.appendChild(wrap);
    var fname='Bao-gia_'+sanitizeFilenamePart(c.name||'KH')+'_'+String(q.quote_number||'').replace(/[\\/]/g,'-')+'.pdf';
    await html2pdf().set({
      margin:[0,0,0,0],
      filename:fname,
      image:{type:'jpeg',quality:.95},
      html2canvas:{scale:2,useCORS:true,backgroundColor:'#ffffff',logging:false},
      jsPDF:{unit:'mm',format:'a4',orientation:'portrait'},
      pagebreak:{mode:['avoid-all','css','legacy']}
    }).from(wrap).save();
    toast('Đã tải PDF ✓',true);
  }catch(e){
    console.error('downloadQuotationPdf:',e);
    toast('Lỗi tải PDF: '+e.message,false);
  }finally{
    if(wrap&&wrap.parentNode)wrap.parentNode.removeChild(wrap);
    if(btn){btn.disabled=false;btn.textContent=oldText||'📄 Tải PDF';}
  }
}

function quotationPrintCss(){
  // Đồng bộ với bảng màu + font website (system stack, blue/purple, nền slate)
  return '@page{size:A4;margin:0;}'
    +'*{box-sizing:border-box;}'
    +'body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:#0f172a;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;-webkit-print-color-adjust:exact;print-color-adjust:exact;background:linear-gradient(180deg,#f7f9fc 0%,#f2f5fa 100%);line-height:1.45;}'
    +'.qt-doc{width:210mm;margin:0 auto;background:#fff;border-radius:18px;box-shadow:0 16px 40px rgba(15,23,42,.08);overflow:hidden;border:1px solid rgba(15,23,42,.08);}'
    +'@media print{body{background:#fff;}.qt-doc{box-shadow:none;border:none;border-radius:0;}}'
    // HERO
    +'.qt-hero{position:relative;background:linear-gradient(135deg,#f8fbff 0%,#edf4ff 60%,#e6efff 100%);padding:40px 44px 36px;overflow:hidden;border-bottom:1px solid rgba(15,23,42,.08);}'
    +'.qt-hero::before{content:"";position:absolute;top:-80px;right:-80px;width:260px;height:260px;background:radial-gradient(circle,rgba(37,99,235,.14) 0%,transparent 70%);border-radius:50%;}'
    +'.qt-hero::after{content:"";position:absolute;bottom:-60px;left:-60px;width:200px;height:200px;background:radial-gradient(circle,rgba(91,76,230,.1) 0%,transparent 70%);border-radius:50%;}'
    +'.qt-hero-inner{position:relative;z-index:2;display:flex;gap:22px;align-items:flex-start;}'
    +'.qt-logo{width:72px;height:72px;border-radius:16px;background:linear-gradient(135deg,#2563eb 0%,#5b4ce6 100%);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:24px;color:#fff;letter-spacing:.5px;box-shadow:0 10px 24px rgba(37,99,235,.3);flex-shrink:0;}'
    +'.qt-hero-stack{flex:1;}'
    +'.qt-brand-line{font-size:11px;letter-spacing:3px;color:#1d4ed8;text-transform:uppercase;font-weight:600;margin-bottom:8px;}'
    +'.qt-hero-title{font-size:30px;font-weight:700;margin:0 0 6px;color:#0f172a;letter-spacing:-.03em;line-height:1.1;}'
    +'.qt-hero-sub{font-size:14px;color:#475569;margin:0 0 16px;}'
    +'.qt-badge-box{display:inline-flex;gap:18px;background:rgba(255,255,255,.7);border:1px solid rgba(37,99,235,.14);border-radius:12px;padding:10px 18px;}'
    +'.qt-badge-box div{display:flex;flex-direction:column;gap:2px;}'
    +'.qt-badge-box span{font-size:10px;color:#64748b;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;}'
    +'.qt-badge-box b{font-size:13px;color:#0f172a;font-weight:600;}'
    // CONTACT STRIP
    +'.qt-strip{background:#f8fafc;padding:12px 44px;display:flex;gap:24px;flex-wrap:wrap;font-size:12.5px;color:#475569;border-bottom:1px solid rgba(15,23,42,.08);}'
    +'.qt-strip div{display:flex;gap:8px;align-items:center;}'
    +'.qt-strip .dot{width:5px;height:5px;background:#2563eb;border-radius:50%;flex-shrink:0;}'
    // BODY
    +'.qt-body{padding:36px 44px 20px;background:#fff;}'
    +'.qt-greeting{background:#f8fafc;border:1px solid rgba(15,23,42,.08);padding:16px 20px;border-radius:12px;margin-bottom:28px;font-size:13.5px;line-height:1.6;color:#0f172a;}'
    +'.qt-greeting b{color:#1d4ed8;}'
    // SECTION
    +'.qt-section{margin-bottom:28px;page-break-inside:avoid;}'
    +'.qt-section-head{display:flex;gap:14px;align-items:center;margin-bottom:16px;}'
    +'.qt-section-icon{width:40px;height:40px;background:#eff6ff;color:#2563eb;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;border:1px solid rgba(37,99,235,.14);}'
    +'.qt-section-head h3{margin:0;color:#0f172a;font-size:17px;font-weight:600;letter-spacing:-.01em;}'
    +'.qt-section-head p{margin:2px 0 0;color:#64748b;font-size:12px;}'
    // PACKAGE CARD
    +'.qt-package{background:#fff;border:1px solid rgba(15,23,42,.08);border-radius:12px;padding:20px 22px;box-shadow:0 8px 24px rgba(15,23,42,.06);}'
    +'.qt-package-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid rgba(15,23,42,.08);}'
    +'.qt-package-name{font-size:15px;font-weight:600;color:#0f172a;margin:0 0 4px;letter-spacing:-.01em;}'
    +'.qt-package-tag{display:inline-block;background:#f3f0ff;color:#4338ca;padding:3px 10px;border-radius:20px;font-size:10px;letter-spacing:.5px;font-weight:600;text-transform:uppercase;}'
    +'.qt-package-price{background:linear-gradient(180deg,#f8fbff 0%,#edf4ff 100%);border:1px solid rgba(37,99,235,.22);color:#1d4ed8;padding:10px 16px;border-radius:12px;font-weight:700;font-size:17px;white-space:nowrap;text-align:right;letter-spacing:-.01em;min-width:160px;}'
    +'.qt-package-price small{display:block;font-size:9px;color:#64748b;letter-spacing:1px;font-weight:500;margin-bottom:2px;text-transform:uppercase;}'
    +'.qt-package-price .unit{display:block;font-size:10px;color:#64748b;margin-top:2px;text-transform:none;letter-spacing:0;font-weight:500;}'
    +'.qt-package-features{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:1fr 1fr;gap:8px;}'
    +'.qt-package-features li{display:flex;gap:10px;font-size:13px;color:#0f172a;line-height:1.5;}'
    +'.qt-package-features li::before{content:"";color:#2563eb;background:#eff6ff;width:18px;height:18px;border-radius:50%;flex-shrink:0;margin-top:1px;background-image:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2710%27 height=%2710%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%232563eb%27 stroke-width=%273%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpolyline points=%2720 6 9 17 4 12%27/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:center;}'
    // AD TIER TABLE
    +'.qt-tier-wrap{border-radius:12px;overflow:hidden;border:1px solid rgba(15,23,42,.08);box-shadow:0 8px 24px rgba(15,23,42,.06);}'
    +'.qt-tier-table{width:100%;border-collapse:collapse;font-size:13px;background:#fff;}'
    +'.qt-tier-table thead th{background:#f8fafc;color:#475569;padding:11px 16px;text-align:left;font-weight:600;font-size:11px;letter-spacing:.5px;text-transform:uppercase;border-bottom:1px solid rgba(15,23,42,.08);}'
    +'.qt-tier-table thead th:last-child{text-align:right;}'
    +'.qt-tier-table tbody td{padding:11px 16px;border-bottom:1px solid rgba(15,23,42,.08);color:#0f172a;}'
    +'.qt-tier-table tbody td:last-child{text-align:right;font-weight:600;color:#0f172a;white-space:nowrap;}'
    +'.qt-tier-table tbody tr:last-child td{border-bottom:none;}'
    +'.qt-tier-table tbody tr.current td{background:linear-gradient(90deg,rgba(37,99,235,.04) 0%,rgba(37,99,235,.1) 100%);color:#1d4ed8;font-weight:600;}'
    +'.qt-tier-table tbody tr.current td:first-child{position:relative;padding-left:32px;}'
    +'.qt-tier-table tbody tr.current td:first-child::before{content:"";position:absolute;left:14px;top:50%;transform:translateY(-50%);width:8px;height:8px;background:#2563eb;border-radius:50%;box-shadow:0 0 0 3px rgba(37,99,235,.16);}'
    +'.qt-applied{margin-top:12px;background:#eff6ff;border:1px solid rgba(37,99,235,.16);border-radius:12px;padding:12px 16px;font-size:13px;color:#0f172a;line-height:1.55;}'
    +'.qt-applied b{color:#1d4ed8;font-weight:600;}'
    // TOTAL BOX
    +'.qt-total{background:linear-gradient(135deg,#1d4ed8 0%,#2563eb 50%,#5b4ce6 100%);border-radius:18px;padding:24px 28px;margin-bottom:28px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 14px 32px rgba(37,99,235,.28);position:relative;overflow:hidden;page-break-inside:avoid;}'
    +'.qt-total::before{content:"";position:absolute;top:-60px;right:-60px;width:200px;height:200px;background:radial-gradient(circle,rgba(255,255,255,.14) 0%,transparent 70%);border-radius:50%;}'
    +'.qt-total-lbl{position:relative;z-index:2;}'
    +'.qt-total-lbl small{display:block;font-size:10px;letter-spacing:1.5px;color:rgba(255,255,255,.75);text-transform:uppercase;font-weight:600;margin-bottom:4px;}'
    +'.qt-total-lbl b{font-size:15px;color:#fff;font-weight:500;}'
    +'.qt-total-val{position:relative;z-index:2;font-size:30px;font-weight:700;color:#fff;letter-spacing:-.03em;text-align:right;line-height:1.1;}'
    +'.qt-total-val small{display:block;font-size:11px;font-weight:500;opacity:.75;letter-spacing:.5px;margin-top:2px;}'
    // COMMIT GRID
    +'.qt-commit{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:28px;}'
    +'.qt-commit-card{background:#f8fafc;border:1px solid rgba(15,23,42,.08);border-radius:12px;padding:16px 18px;}'
    +'.qt-commit-card h4{margin:0 0 10px;color:#0f172a;font-size:13px;display:flex;gap:8px;align-items:center;font-weight:600;letter-spacing:-.01em;}'
    +'.qt-commit-card h4::before{content:"";width:3px;height:14px;background:#2563eb;border-radius:2px;}'
    +'.qt-commit-card ul{margin:0;padding-left:16px;font-size:12.5px;line-height:1.6;color:#475569;}'
    // NOTE
    +'.qt-note{background:#fffbeb;border:1px solid rgba(217,119,6,.18);padding:12px 16px;border-radius:12px;margin-bottom:20px;font-size:12.5px;line-height:1.6;color:#0f172a;}'
    +'.qt-note b{color:#b45309;font-weight:600;}'
    // PAYMENT
    +'.qt-pay-grid{display:grid;grid-template-columns:1.2fr .8fr;gap:14px;margin-bottom:8px;}'
    +'.qt-pay-card{background:#fff;border:1px solid rgba(15,23,42,.08);border-radius:12px;padding:18px 20px;box-shadow:0 8px 24px rgba(15,23,42,.06);}'
    +'.qt-pay-card h4{margin:0 0 12px;color:#0f172a;font-size:12px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;display:flex;gap:8px;align-items:center;}'
    +'.qt-pay-card h4::before{content:"";width:3px;height:12px;background:#2563eb;border-radius:2px;}'
    +'.qt-pay-row{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid rgba(15,23,42,.08);font-size:13px;}'
    +'.qt-pay-row:last-child{border:none;}'
    +'.qt-pay-row span{color:#64748b;}'
    +'.qt-pay-row b{color:#0f172a;font-weight:600;text-align:right;}'
    +'.qt-qr{background:linear-gradient(180deg,#f8fbff 0%,#edf4ff 100%);border:1px solid rgba(37,99,235,.16);border-radius:12px;padding:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;}'
    +'.qt-qr img{width:100%;max-width:160px;height:auto;display:block;border-radius:8px;background:#fff;padding:4px;}'
    +'.qt-qr-lbl{font-size:10px;color:#1d4ed8;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;}'
    // FOOTER
    +'.qt-footer{background:#f8fafc;padding:26px 44px 24px;border-top:1px solid rgba(15,23,42,.08);}'
    +'.qt-thanks{color:#1d4ed8;font-size:22px;font-weight:700;letter-spacing:-.02em;margin:0;text-align:center;}'
    +'.qt-thanks-sub{color:#475569;font-size:12.5px;margin:4px 0 0;text-align:center;}'
    +'.qt-sign{margin-top:20px;display:grid;grid-template-columns:1fr 1fr;gap:40px;}'
    +'.qt-sign-col small{display:block;color:#64748b;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px;font-weight:600;}'
    +'.qt-sign-col b{color:#0f172a;font-size:13px;font-weight:600;}'
    +'.qt-sign-col .line{border-top:1px dashed rgba(15,23,42,.14);margin-top:52px;padding-top:6px;font-size:11px;color:#64748b;text-align:center;}'
    +'.qt-sign-col.right{text-align:right;}'
    +'.qt-sign-col.right .line{text-align:center;}';
}

// Ẩn các bậc <30tr khi khách hàng thuộc nhóm ngân sách lớn
function shouldHideLowTiers(q){
  if(!q)return false;
  if(q.snapshot&&q.snapshot.hide_low_tiers!=null)return !!q.snapshot.hide_low_tiers;
  var b=parseInt(q.monthly_budget)||0;
  return b>=30000000;
}

// Tạo URL VietQR cho báo giá — dùng STK doanh nghiệp mặc định
function getQuotationVietQrUrl(q,amount){
  var bp=(typeof BANK_PROFILES!=='undefined'&&BANK_PROFILES.business)?BANK_PROFILES.business:{bankCode:'TCB',accountNo:'68915555',accountName:'CONG TY TNHH HC QUANG CAO'};
  var content='BAO GIA '+(q.quote_number||'').replace(/\//g,' ');
  return 'https://img.vietqr.io/image/'+bp.bankCode+'-'+bp.accountNo+'-compact2.png?amount='+(parseInt(amount)||0)+'&addInfo='+encodeURIComponent(content)+'&accountName='+encodeURIComponent(bp.accountName);
}

function renderQuotationHtml(q,c){
  var tot=quotationTotals(q);
  var inc=tot.inc;
  var pkg=q.fanpage_package?FANPAGE_PACKAGES.find(function(p){return p.id===q.fanpage_package;}):null;
  var tier=findAdTier(q.monthly_budget);
  var hideLow=shouldHideLowTiers(q);
  var tiers=hideLow?AD_FEE_TIERS.filter(function(t){return t.max>=30000000;}):AD_FEE_TIERS;
  var sectionIdx=0;
  var hasFanpage=inc.fp;
  var hasAds=inc.ads;
  var hasWeb=inc.web;
  var clientDisplay=esc(c.company_full_name||c.name||'Quý khách');
  var budgetLine=q.monthly_budget?' với ngân sách <b>'+ff(q.monthly_budget)+'đ/tháng</b>':'';
  var qrUrl=getQuotationVietQrUrl(q,tot.total);
  var ctContent=(c.name||'Khách hàng').toUpperCase().replace(/\s+/g,' ').trim()+' '+(q.quote_number||'BAOGIA');

  var h='<style>'+quotationPrintCss()+'</style>';
  h+='<div class="qt-doc">';

  // HERO
  h+='<div class="qt-hero"><div class="qt-hero-inner">';
  h+='<div class="qt-logo">HC</div>';
  h+='<div class="qt-hero-stack">';
  h+='<div class="qt-brand-line">HC Agency · Digital Marketing</div>';
  h+='<h1 class="qt-hero-title">Báo giá dịch vụ</h1>';
  h+='<p class="qt-hero-sub">Quảng cáo Facebook · Vận hành Fanpage · Tư vấn thương hiệu</p>';
  h+='<div class="qt-badge-box">';
  h+='<div><span>Số báo giá</span><b>'+esc(q.quote_number||'—')+'</b></div>';
  h+='<div><span>Ngày phát hành</span><b>'+esc(q.issued_date||'—')+'</b></div>';
  h+='<div><span>Hiệu lực đến</span><b>'+esc(q.valid_until||'—')+'</b></div>';
  h+='</div>';
  h+='</div></div></div>';

  // CONTACT STRIP
  h+='<div class="qt-strip">';
  h+='<div><span class="dot"></span>'+esc(PARTY_B_INFO.representative_name)+'</div>';
  h+='<div><span class="dot"></span>'+esc(PARTY_B_INFO.phone)+'</div>';
  h+='<div><span class="dot"></span>'+esc(PARTY_B_INFO.address)+'</div>';
  h+='</div>';

  // BODY
  h+='<div class="qt-body">';
  h+='<div class="qt-greeting">Kính gửi <b>'+clientDisplay+'</b>'+(c.representative_name?' — '+esc((c.representative_salutation||'')+' '+c.representative_name):'')+',<br>Cảm ơn quý khách đã tin tưởng HC Agency. Dưới đây là báo giá dịch vụ được thiết kế riêng theo nhu cầu doanh nghiệp'+budgetLine+'.</div>';

  // Fanpage section
  if(hasFanpage&&pkg){
    sectionIdx++;
    var displayFpPrice=tot.fanpageFee||pkg.price;
    var hasOverride=q.fanpage_price_override!=null&&q.fanpage_price_override!==''&&parseInt(q.fanpage_price_override)>0&&parseInt(q.fanpage_price_override)!==pkg.price;
    h+='<div class="qt-section">';
    h+='<div class="qt-section-head"><div class="qt-section-icon">📘</div><div><h3>Gói vận hành Fanpage</h3><p>Thiết kế fanpage, viết bài, bàn giao trong 3–5 ngày</p></div></div>';
    h+='<div class="qt-package">';
    h+='<div class="qt-package-head"><div><h4 class="qt-package-name">'+esc(pkg.name)+(pkg.id===2?' — Nâng cao':' — Cơ bản')+'</h4><span class="qt-package-tag">'+(hasOverride?'Ưu đãi riêng':(pkg.id===2?'Premium':'Recommended'))+'</span></div>';
    h+='<div class="qt-package-price">'+(hasOverride?'<small>Chốt giá</small>':'<small>Chỉ từ</small>')+ff(displayFpPrice)+'đ<span class="unit">/gói (thanh toán 1 lần)</span></div></div>';
    h+='<ul class="qt-package-features">';pkg.features.forEach(function(f){h+='<li><span>'+esc(f)+'</span></li>';});h+='</ul>';
    h+='</div></div>';
  }

  // Ads section
  if(hasAds){
    sectionIdx++;
    h+='<div class="qt-section">';
    h+='<div class="qt-section-head"><div class="qt-section-icon">📊</div><div><h3>Phí hỗ trợ quảng cáo theo ngân sách</h3><p>'+(hideLow?'Dành cho khách hàng ngân sách từ 30.000.000đ/tháng':'Tính theo ngân sách chi Meta thực tế mỗi tháng')+'</p></div></div>';
    h+='<div class="qt-tier-wrap"><table class="qt-tier-table"><thead><tr><th>Mức ngân sách</th><th>Phí dịch vụ</th></tr></thead><tbody>';
    tiers.forEach(function(t){
      var isCurrent=tier&&t===tier;
      h+='<tr'+(isCurrent?' class="current"':'')+'><td>'+esc(t.label)+'</td><td>'+esc(t.display)+'</td></tr>';
    });
    h+='</tbody></table></div>';
    if(q.monthly_budget){
      h+='<div class="qt-applied">Ngân sách dự kiến <b>'+ff(q.monthly_budget)+'đ/tháng</b> → áp dụng phí <b>'+ff(tot.adFee)+'đ/tháng</b>.</div>';
    }
  }

  // Web App section
  if(hasWeb){
    sectionIdx++;
    h+='<div class="qt-section">';
    h+='<div class="qt-section-head"><div class="qt-section-icon">💻</div><div><h3>Gói Lập trình Web App</h3><p>Thiết kế, phát triển và bàn giao theo phạm vi công việc thoả thuận</p></div></div>';
    h+='<div class="qt-package">';
    h+='<div class="qt-package-head"><div><h4 class="qt-package-name">Web App theo yêu cầu</h4><span class="qt-package-tag">Custom</span></div>';
    h+='<div class="qt-package-price"><small>Trọn gói</small>'+ff(tot.webFee)+'đ<span class="unit">/dự án (thanh toán theo tiến độ)</span></div></div>';
    if(q.web_note)h+='<ul class="qt-package-features"><li><span>'+esc(q.web_note)+'</span></li></ul>';
    h+='</div></div>';
  }

  // TOTAL — label hiển thị theo combination
  var totalParts=[];
  if(hasFanpage)totalParts.push('Gói Fanpage');
  if(hasAds)totalParts.push('Phí quảng cáo');
  if(hasWeb)totalParts.push('Web App');
  var totalLabel=totalParts.length?totalParts.join(' + '):'Tổng dịch vụ';
  // Đơn vị: nếu chỉ có Fanpage hoặc Web (1 lần) thì khác Ads (mỗi tháng)
  var oneTimeOnly=(hasFanpage||hasWeb)&&!hasAds;
  var totalUnit=oneTimeOnly?'(thanh toán 1 lần, chưa bao gồm VAT)':(hasAds&&!hasFanpage&&!hasWeb?'/tháng (chưa bao gồm VAT)':'(Fanpage/Web 1 lần · Ads/tháng, chưa VAT)');
  h+='<div class="qt-total"><div class="qt-total-lbl"><small>TỔNG CHI PHÍ DỊCH VỤ</small><b>'+esc(totalLabel)+'</b></div><div class="qt-total-val">'+ff(tot.total)+'đ<small>'+esc(totalUnit)+'</small></div></div>';

  // Ghi chú
  if(q.note){h+='<div class="qt-note"><b>Ghi chú:</b> '+esc(q.note)+'</div>';}

  // COMMIT GRID
  h+='<div class="qt-commit">';
  h+='<div class="qt-commit-card"><h4>HC Agency cam kết</h4><ul>';
  h+='<li>Ra khách hàng tiềm năng thật, đúng đối tượng</li>';
  h+='<li>Tối ưu chi phí, không lãng phí ngân sách</li>';
  h+='<li>Báo cáo minh bạch, số liệu chi tiết hàng tuần</li>';
  h+='<li>Account Manager chuyên trách, hỗ trợ 1:1</li>';
  h+='</ul></div>';
  h+='<div class="qt-commit-card"><h4>Phạm vi công việc</h4><ul>';
  h+='<li>Lập kế hoạch &amp; target audience</li>';
  h+='<li>Thiết kế creative, viết content chạy Quảng cáo</li>';
  h+='<li>A/B test &amp; tối ưu conversion</li>';
  h+='<li>Tư vấn chiến lược sản phẩm &amp; nội dung</li>';
  h+='</ul></div>';
  h+='</div>';

  // PAYMENT
  h+='<div class="qt-pay-grid">';
  h+='<div class="qt-pay-card"><h4>Thông tin thanh toán</h4>';
  h+='<div class="qt-pay-row"><span>Ngân hàng</span><b>'+esc(PARTY_B_INFO.bank_name)+'</b></div>';
  h+='<div class="qt-pay-row"><span>Chi nhánh</span><b>'+esc(PARTY_B_INFO.bank_branch)+'</b></div>';
  h+='<div class="qt-pay-row"><span>Số tài khoản</span><b>'+esc(PARTY_B_INFO.bank_account_no)+'</b></div>';
  h+='<div class="qt-pay-row"><span>Chủ tài khoản</span><b>'+esc(PARTY_B_INFO.bank_account_name)+'</b></div>';
  h+='<div class="qt-pay-row"><span>Nội dung CK</span><b>'+esc(ctContent)+'</b></div>';
  h+='</div>';
  h+='<div class="qt-qr"><img src="'+esc(qrUrl)+'" alt="VietQR"><div class="qt-qr-lbl">Quét để chuyển khoản</div></div>';
  h+='</div>';

  h+='</div>'; // body

  // FOOTER
  h+='<div class="qt-footer">';
  h+='<p class="qt-thanks">Rất mong được đồng hành cùng quý khách</p>';
  h+='<p class="qt-thanks-sub">HC Agency — tăng trưởng bền vững cùng doanh nghiệp của bạn</p>';
  h+='<div class="qt-sign">';
  h+='<div class="qt-sign-col"><small>ĐẠI DIỆN BÊN A</small><b>'+clientDisplay+'</b><div class="line">Ký, ghi rõ họ tên</div></div>';
  h+='<div class="qt-sign-col right"><small>ĐẠI DIỆN BÊN B</small><b>'+esc(PARTY_B_INFO.company_name)+'</b><div class="line">Ký, ghi rõ họ tên</div></div>';
  h+='</div>';
  h+='</div>';

  h+='</div>'; // qt-doc
  return h;
}

// ═══ MODAL: SỬA DỊCH VỤ + ZALO + CHĂM SÓC (dùng cho mọi khách) ═══
function openClientEditModal(clientId){
  if(!needAuth())return;
  clientEditModalId=clientId;render();
}
function closeClientEditModal(){clientEditModalId=null;render();}
function renderClientEditModal(){
  if(!clientEditModalId)return'';
  var c=clientList.find(function(x){return x.id===clientEditModalId;});
  if(!c)return'';
  var curServices=Array.isArray(c.services)?c.services:(c.services?[c.services]:['fb_ads']);
  var curCare=c.care_status||'new';
  var curSal=c.representative_salutation||'Ông';
  var curRentalPctNum=getRentalFeePct(c)*100; // 0.03 → 3
  var isProspect=c.status==='prospect';
  var hasRentalChecked=curServices.indexOf('tkqc_rental')>=0;
  var h='<div class="hc-modal-backdrop" onclick="if(event.target===this)closeClientEditModal()">';
  h+='<div class="hc-modal" role="dialog" aria-modal="true" aria-labelledby="ce-modal-title" style="max-width:760px;">';
  h+='<div class="hc-modal-head"><h3 id="ce-modal-title">Chỉnh sửa khách hàng — '+esc(c.name)+'</h3><button class="hc-modal-close" aria-label="Đóng" onclick="closeClientEditModal()">×</button></div>';
  h+='<div class="hc-modal-body">';
  h+='<div style="background:var(--blue-bg);border:1px solid var(--blue);color:var(--blue-tx);padding:10px 12px;border-radius:var(--radius);font-size:12px;margin-bottom:14px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:6px;flex-shrink:0;"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>Thay đổi sẽ được lưu vào hồ sơ khách hàng và áp dụng cho các Phiếu thanh toán / Hợp đồng / Báo giá phát hành sau khi sửa.</div>';
  h+='<div class="ce-section-label">Thông tin chung</div>';
  h+='<div class="hc-form-grid">';
  h+='<div><label>Tên viết tắt <span style="color:var(--red);">*</span></label><input id="ce-name" class="fi" value="'+esc(c.name||'')+'"></div>';
  h+='<div><label>Mã viết tắt (số Hợp đồng)</label><input id="ce-prefix" class="fi" value="'+esc(c.contract_prefix||'')+'" style="text-transform:uppercase;"></div>';
  h+='<div style="grid-column:1/-1;"><label>Tên công ty đầy đủ</label><input id="ce-company-full" class="fi" value="'+esc(c.company_full_name||'')+'" placeholder="VD: CÔNG TY CỔ PHẦN ABC"></div>';
  h+='<div style="grid-column:1/-1;"><label>Địa chỉ</label><input id="ce-address" class="fi" value="'+esc(c.address||'')+'"></div>';
  h+='<div><label>Mã số thuế</label><input id="ce-tax" class="fi" value="'+esc(c.tax_code||'')+'"></div>';
  h+='<div><label>Ngành nghề</label><input id="ce-industry" class="fi" value="'+esc(c.industry||'')+'" placeholder="VD: chế biến sữa"></div>';
  h+='<div style="grid-column:1/-1;"><label>Từ khóa chiến dịch <span style="color:var(--tx3);font-weight:400;text-transform:none;">(tự khớp spend Meta Ads → khách theo tên chiến dịch)</span></label><input id="ce-kw" class="fi" value="'+esc(c.campaign_keyword||'')+'" placeholder="VD: Minh Quân, DAC"></div>';
  h+='</div>';
  h+='<div class="ce-section-label">Liên hệ</div>';
  h+='<div class="hc-form-grid">';
  h+='<div><label>Người liên hệ</label><input id="ce-contact" class="fi" value="'+esc(c.contact_person||'')+'"></div>';
  h+='<div><label>Điện thoại</label><input id="ce-phone" class="fi" value="'+esc(c.phone||'')+'"></div>';
  h+='<div><label>Email nhận hóa đơn</label><input id="ce-email" class="fi" value="'+esc(c.email_invoice||'')+'"></div>';
  h+='<div><label>Zalo <span style="color:var(--tx3);font-weight:400;text-transform:none;">(số / username / link)</span></label><input id="ce-zalo" class="fi" value="'+esc(c.zalo||'')+'" placeholder="0912345678 hoặc quanglx hoặc link đầy đủ"></div>';
  h+='</div>';
  h+='<div class="ce-section-label">Đại diện pháp lý</div>';
  h+='<div class="hc-form-grid">';
  h+='<div><label>Đại diện</label><select id="ce-rep-sal" class="fi"><option value="Ông"'+(curSal==='Ông'?' selected':'')+'>Ông</option><option value="Bà"'+(curSal==='Bà'?' selected':'')+'>Bà</option></select></div>';
  h+='<div><label>Tên người đại diện</label><input id="ce-rep-name" class="fi" value="'+esc(c.representative_name||'')+'"></div>';
  h+='<div><label>Chức vụ</label><input id="ce-rep-title" class="fi" value="'+esc(c.representative_title||'Giám đốc')+'"></div>';
  h+='</div>';
  h+='<div class="ce-section-label">CRM &amp; chăm sóc</div>';
  h+='<div class="hc-form-grid">';
  h+='<div style="grid-column:1/-1;"><label>Dịch vụ quan tâm <span style="color:var(--tx3);font-weight:400;text-transform:none;">(tick nhiều mục)</span></label><div style="display:flex;flex-wrap:wrap;gap:10px;padding:10px 12px;border:1px solid var(--bd2);border-radius:var(--radius);background:var(--bg2);">';
  Object.keys(SERVICES).forEach(function(code){var s=SERVICES[code];var checked=curServices.indexOf(code)>=0;var dotC=SERVICE_DOT_COLORS[s.color]||'#888780';h+='<label style="display:inline-flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:0;color:var(--tx1);"><input type="checkbox" class="ce-service" value="'+code+'"'+(checked?' checked':'')+' onchange="toggleCeRentalRow()" style="accent-color:var(--blue);"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:'+dotC+';"></span>'+esc(s.name)+'</label>';});
  h+='</div></div>';
  h+='<div id="ce-rental-row" style="grid-column:1/-1;'+(hasRentalChecked?'':'display:none;')+'"><label>% Phí thuê TKQC <span style="color:var(--tx3);font-weight:400;text-transform:none;">(VD: 3 = 3% spend, thường 3-4%)</span></label><div style="display:flex;align-items:center;gap:8px;"><input id="ce-rental-pct" class="fi" type="number" step="0.1" min="0" max="20" placeholder="VD: 3 hoặc 4" value="'+(curRentalPctNum>0?curRentalPctNum:'')+'" style="max-width:160px;"><span style="font-size:13px;color:var(--tx2);">%</span><span style="font-size:11px;color:var(--tx3);margin-left:8px;">Phí dịch vụ tháng = % × Spend (tự động cập nhật mỗi tháng)</span></div></div>';
  h+='<div><label>Trạng thái chăm sóc</label><select id="ce-care" class="fi">';
  CARE_ORDER.forEach(function(k){h+='<option value="'+k+'"'+(k===curCare?' selected':'')+'>'+esc(CARE_STATUS[k].name)+'</option>';});
  h+='</select></div>';
  if(!isProspect){
    var curStatus=c.status||'active';
    h+='<div><label>Trạng thái hoạt động <span style="color:var(--tx3);font-weight:400;text-transform:none;">(chỉ "Đang hoạt động" mới vào báo cáo chi tiêu)</span></label><select id="ce-status" class="fi"><option value="active"'+(curStatus==='active'?' selected':'')+'>Đang hoạt động</option><option value="paused"'+(curStatus==='paused'?' selected':'')+'>Tạm dừng</option><option value="stopped"'+(curStatus==='stopped'?' selected':'')+'>Dừng</option></select></div>';
  }
  if(isProspect){
    h+='<div><label>Ghi chú (nguồn lead, follow-up…)</label><input id="ce-note" class="fi" value="'+esc(c.prospect_note||'')+'"></div>';
  }
  h+='</div>';
  h+='</div>';
  h+='<div class="hc-modal-foot"><button class="btn btn-red btn-ghost" style="margin-right:auto;color:var(--red);border-color:var(--red);background:transparent;" onclick="deleteClientFromEditModal()">Xoá khách hàng</button><button class="btn" onclick="closeClientEditModal()">Hủy</button><button class="btn btn-primary" onclick="saveClientEditModal(this)">Lưu</button></div>';
  h+='</div></div>';
  return h;
}
async function deleteClientFromEditModal(){
  if(!needAuth())return;
  if(!clientEditModalId)return;
  var c=clientList.find(function(x){return x.id===clientEditModalId;});
  if(!c)return;
  var msg='Xoá vĩnh viễn "'+c.name+'"? Hành động không thể hoàn tác. Nếu khách đã có dữ liệu liên quan (phân công, spend, hợp đồng, giao dịch…), DB có thể chặn xoá — khi đó hãy đổi trạng thái sang "Dừng" thay vì xoá.';
  if(!(await hcConfirm({title:'Xoá khách hàng',message:msg,confirmLabel:'Xoá vĩnh viễn',danger:true})))return;
  var r=await sb2.from('client').delete().eq('id',clientEditModalId);
  if(r.error){toast('Không xoá được: '+r.error.message,false);return;}
  toast('Đã xoá khách hàng',true);
  clientEditModalId=null;
  await loadLight();
}
async function saveClientEditModal(btn){
  if(!needAuth())return;
  if(!clientEditModalId)return;
  var c=clientList.find(function(x){return x.id===clientEditModalId;});
  if(!c)return;
  var get=function(id){var el=document.getElementById(id);return el?el.value.trim():'';};
  var name=get('ce-name');
  if(!name){toast('Tên khách hàng không được để trống',false);return;}
  var services=[];
  Array.prototype.forEach.call(document.querySelectorAll('.ce-service:checked'),function(el){services.push(el.value);});
  if(!services.length)services=['fb_ads'];
  var rentalPctEl=document.getElementById('ce-rental-pct');
  var rentalPctNum=rentalPctEl?parseFloat(rentalPctEl.value):NaN;
  var rentalPct=null;
  if(services.indexOf('tkqc_rental')>=0&&rentalPctNum>0&&rentalPctNum<=20){
    rentalPct=Math.round(rentalPctNum*100)/10000; // 3 → 0.03
  }
  var payload={
    name:name,
    contract_prefix:(get('ce-prefix')||'').toUpperCase()||null,
    company_full_name:get('ce-company-full')||null,
    address:get('ce-address')||null,
    tax_code:get('ce-tax')||null,
    industry:get('ce-industry')||null,
    contact_person:get('ce-contact')||null,
    phone:get('ce-phone')||null,
    email_invoice:get('ce-email')||null,
    zalo:get('ce-zalo')||null,
    representative_salutation:get('ce-rep-sal')||'Ông',
    representative_name:get('ce-rep-name')||null,
    representative_title:get('ce-rep-title')||null,
    services:services,
    rental_fee_pct:rentalPct,
    care_status:get('ce-care')||'new',
    campaign_keyword:get('ce-kw')||null
  };
  if(c.status==='prospect'){payload.prospect_note=get('ce-note')||null;}
  else{var newStatus=get('ce-status');if(newStatus&&['active','paused','stopped'].indexOf(newStatus)>=0)payload.status=newStatus;}
  btn.disabled=true;btn.classList.add('is-loading');
  var r=await sb2.from('client').update(payload).eq('id',clientEditModalId);
  // Nếu DB chưa có cột rental_fee_pct → retry không kèm cột đó
  if(r.error&&isMissingColumnError(r.error)&&'rental_fee_pct' in payload){
    var fallback=Object.assign({},payload);delete fallback.rental_fee_pct;
    r=await sb2.from('client').update(fallback).eq('id',clientEditModalId);
    if(!r.error&&rentalPct!==null)toast('⚠ Đã lưu nhưng chưa có cột rental_fee_pct trong DB. Hãy chạy migration để bật phí thuê TKQC.',false);
  }
  btn.disabled=false;btn.classList.remove('is-loading');
  if(r.error){toast('Lỗi: '+r.error.message,false);return;}
  toast('Đã cập nhật ✓',true);
  clientEditModalId=null;
  await loadLight();
}
// Toggle hiển thị ô % phí thuê TKQC theo dịch vụ tick
function toggleCeRentalRow(){var checked=document.querySelector('.ce-service[value="tkqc_rental"]:checked');var row=document.getElementById('ce-rental-row');if(row)row.style.display=checked?'':'none';}
function toggleNpRentalRow(){var checked=document.querySelector('.np-service[value="tkqc_rental"]:checked');var row=document.getElementById('np-rental-row');if(row)row.style.display=checked?'':'none';}

// ═══ MODAL: TIỀN NẠP (DEPOSIT) ═══
function openDepositModal(clientId,month,depositId){
  if(!needAuth())return;
  depositModalCtx={clientId:clientId,month:month,depositId:depositId||null};
  render();
}
function closeDepositModal(){depositModalCtx=null;render();}
function renderDepositModal(){
  if(!depositModalCtx)return'';
  var ctx=depositModalCtx;
  var c=clientList.find(function(x){return x.id===ctx.clientId;});if(!c)return'';
  var existing=ctx.depositId?clientDepositData.find(function(d){return d.id===ctx.depositId;}):null;
  var defDate=existing?existing.deposit_date:td();
  var defAmount=existing?existing.amount:'';
  var defNote=existing?(existing.note||''):'';
  var h='<div class="hc-modal-backdrop" onclick="if(event.target===this)closeDepositModal()">';
  h+='<div class="hc-modal" role="dialog" aria-modal="true" style="max-width:480px;">';
  h+='<div class="hc-modal-head"><h3>'+(existing?'Sửa khoản nạp':'Thêm khoản nạp')+' — '+esc(c.name)+'</h3><button class="hc-modal-close" onclick="closeDepositModal()" aria-label="Đóng">×</button></div>';
  h+='<div class="hc-modal-body">';
  h+='<div class="hc-form-grid" style="grid-template-columns:1fr 1fr;">';
  h+='<div><label>Ngày nạp <span style="color:var(--red);">*</span></label><input id="dep-date" type="date" class="fi" value="'+esc(defDate)+'"></div>';
  h+='<div><label>Số tiền (VNĐ) <span style="color:var(--red);">*</span></label><input id="dep-amount" type="number" min="0" step="1000" class="fi" value="'+(defAmount||'')+'" placeholder="VD: 2000000"></div>';
  h+='<div style="grid-column:1/-1;"><label>Ghi chú (nguồn / số CK)</label><input id="dep-note" class="fi" value="'+esc(defNote)+'" placeholder="VD: CK Vietcombank lần đầu"></div>';
  h+='</div></div>';
  h+='<div class="hc-modal-foot"><button class="btn" onclick="closeDepositModal()">Hủy</button><button class="btn btn-primary" onclick="saveDeposit(this)">Lưu</button></div>';
  h+='</div></div>';
  return h;
}
async function saveDeposit(btn){
  if(!needAuth())return;
  if(!depositModalCtx)return;
  var date=document.getElementById('dep-date').value;
  var amount=parseInt(document.getElementById('dep-amount').value)||0;
  var note=document.getElementById('dep-note').value.trim();
  if(!date){toast('Chọn ngày nạp',false);return;}
  if(amount<=0){toast('Số tiền phải > 0',false);return;}
  btn.disabled=true;btn.classList.add('is-loading');
  var payload={client_id:depositModalCtx.clientId,deposit_date:date,amount:amount,note:note||null,created_by:authUser?authUser.email:null};
  var r;
  if(depositModalCtx.depositId)r=await sb2.from('client_deposit').update(payload).eq('id',depositModalCtx.depositId);
  else r=await sb2.from('client_deposit').insert(payload);
  btn.disabled=false;btn.classList.remove('is-loading');
  if(r.error){
    if(isMissingRelationError(r.error))toast('Thiếu bảng client_deposit. Chạy file migration 2026-04-27_add_client_deposit.sql trước.',false);
    else toast('Lỗi: '+r.error.message,false);
    return;
  }
  toast('Đã lưu khoản nạp ✓',true);
  depositModalCtx=null;
  await loadLight();
}
async function deleteDeposit(id){
  if(!needAuth())return;
  if(!(await hcConfirm({title:'Xóa khoản nạp',message:'Xóa khoản nạp này khỏi sổ?',confirmLabel:'Xóa',danger:true})))return;
  var r=await sb2.from('client_deposit').delete().eq('id',id);
  if(r.error){toast('Lỗi: '+r.error.message,false);return;}
  toast('Đã xóa khoản nạp',true);
  await loadLight();
}
// ═══ SYNC META cho 1 khách (dùng trên Sổ rental) ═══
async function syncMetaForClient(clientId,month,btn){
  if(!needAuth())return;
  // Lấy TKQC của khách (gắn cứng + assignment) có fb_account_id
  var clientAccIds={};
  adList.forEach(function(a){if(a.client_id===clientId&&a.fb_account_id)clientAccIds[a.id]=true;});
  assignData.forEach(function(ag){if(ag.client_id===clientId){var aa=adList.find(function(x){return x.id===ag.ad_account_id;});if(aa&&aa.fb_account_id)clientAccIds[aa.id]=true;}});
  var mapped=adList.filter(function(a){return clientAccIds[a.id];});
  if(!mapped.length){toast('Khách chưa có TKQC nào ghép Meta — vào Tài khoản QC để gán',false);return;}
  var oldText=btn?btn.textContent:'';
  if(btn){btn.disabled=true;btn.textContent='Đang sync...';}
  try{
    // Sync 3 ngày gần nhất (đủ cover lag từ Meta)
    var today=td();
    var d1=new Date(Date.now()-86400000).toISOString().substring(0,10);
    var d2=new Date(Date.now()-2*86400000).toISOString().substring(0,10);
    var totalSaved=0,totalErr=0;
    for(var i=0;i<3;i++){
      var dateStr=[today,d1,d2][i];
      var r=await syncOneDate(dateStr,mapped);
      totalSaved+=r.saved||0;totalErr+=r.errors||0;
    }
    toast('Sync xong '+mapped.length+' TKQC × 3 ngày: '+totalSaved+' bản ghi'+(totalErr?' · '+totalErr+' lỗi':''),totalErr===0);
    await loadAll();
  }catch(e){toast('Lỗi sync: '+e.message,false);}
  finally{if(btn){btn.disabled=false;btn.textContent=oldText||'🔄 Sync Meta';}}
}
// ═══ SHARE LINK CHO KHÁCH RENTAL ═══
function genShareToken(){var b=new Uint8Array(12);crypto.getRandomValues(b);return Array.from(b).map(function(x){return x.toString(16).padStart(2,'0');}).join('');}
async function copyClientShareLink(clientId,btn){
  if(!needAuth())return;
  var c=clientList.find(function(x){return x.id===clientId;});if(!c)return;
  var token=c.share_token;
  var oldText=btn?btn.textContent:'';
  if(!token){
    if(btn){btn.disabled=true;btn.textContent='Đang tạo link...';}
    token=genShareToken();
    var r=await sb2.from('client').update({share_token:token}).eq('id',clientId);
    if(btn){btn.disabled=false;btn.textContent=oldText||'🔗 Sao chép link';}
    if(r.error){
      if(isMissingColumnError(r.error))toast('Thiếu cột share_token. Chạy file migration 2026-04-27_add_share_token.sql trước.',false);
      else toast('Lỗi tạo link: '+r.error.message,false);
      return;
    }
    c.share_token=token;
  }
  var origin=window.location.origin,path=window.location.pathname.replace(/[^\/]*$/,'')+'index.html';
  var url=origin+path+'?ledger='+clientId+'&token='+token;
  try{await navigator.clipboard.writeText(url);toast('Đã sao chép link · gửi cho khách qua Zalo',true);}
  catch(e){window.prompt('Sao chép link sau (Ctrl+C):',url);}
}
// ═══ PUBLIC LEDGER MODE — khách xem Sổ rental qua URL ═══
function initPublicLedgerMode(){
  var p=new URLSearchParams(window.location.search);
  var lid=p.get('ledger'),tok=p.get('token');
  // Có ledger= → coi là public mode, kể cả khi thiếu token (sẽ render error rõ ràng thay vì login screen)
  if(!lid)return false;
  publicLedgerMode=true;publicLedgerClientId=lid;publicLedgerToken=tok||'';
  document.body.classList.add('public-mode');
  return true;
}
function isValidUuid(s){return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s||'');}
function renderPublicError(title,msg){
  return '<div class="public-error"><div class="public-error-icon" aria-hidden="true">⚠️</div><div class="public-error-title">'+esc(title)+'</div><div class="public-error-msg">'+esc(msg)+'</div></div>';
}
async function loadPublicLedger(){
  var sb=document.getElementById('sidebar'),appEl=document.getElementById('app');
  if(sb)sb.style.display='none';
  if(appEl)appEl.style.gridTemplateColumns='1fr';
  var page=document.getElementById('page');
  if(!isValidUuid(publicLedgerClientId)){
    page.innerHTML=renderPublicError('Link không hợp lệ','Mã khách trong link bị sai hoặc cắt thiếu (có dấu "..." giữa). Vui lòng nhờ HC Agency gửi lại link đầy đủ qua Zalo.');
    return;
  }
  if(!publicLedgerToken){
    page.innerHTML=renderPublicError('Link thiếu mã xác thực','Link bị thiếu đoạn &token=... — thường do app rút gọn link khi forward. Vui lòng nhờ HC Agency gửi lại link đầy đủ qua Zalo.');
    return;
  }
  if(!clientList.length)page.innerHTML='<div style="padding:80px;text-align:center;color:var(--tx2);font-size:14px;">Đang tải Sổ rental...</div>';
  try{
    // Gọi RPC SECURITY DEFINER để bypass RLS — chuẩn cho public share
    var r=await sb2.rpc('get_public_rental_ledger',{p_client_id:publicLedgerClientId,p_token:publicLedgerToken});
    if(r.error){
      var msg=String(r.error.message||r.error);
      if(/Invalid token|client not found/i.test(msg)){
        page.innerHTML=renderPublicError('Link không hợp lệ','Token không khớp hoặc đã thu hồi. Liên hệ HC Agency để lấy link mới.');
        return;
      }
      if(/function .* does not exist/i.test(msg)||/Could not find the function/i.test(msg)){
        page.innerHTML=renderPublicError('Hệ thống cần migration','Admin chưa chạy file SQL get_public_rental_ledger. Vui lòng báo HC Agency.');
        return;
      }
      page.innerHTML=renderPublicError('Không tải được dữ liệu',msg);
      return;
    }
    var d=r.data||{};
    if(!d.client){
      page.innerHTML=renderPublicError('Link không hợp lệ','Khách hàng không tồn tại.');
      return;
    }
    if(!hasRentalService(d.client)||!getRentalFeePct(d.client)){
      page.innerHTML=renderPublicError('Khách chưa cấu hình rental','Vui lòng liên hệ HC Agency để kích hoạt báo cáo này.');
      return;
    }
    clientList=[d.client];
    adList=d.ad_accounts||[];
    assignData=d.assignments||[];
    rebuildAssignIndex();
    dailyData=d.daily_spend||[];
    clientDepositData=d.deposits||[];
    monthlyFeeData=d.monthly_fees||[];
    if(!publicLedgerMonth)publicLedgerMonth=lm();
    renderPublicLedgerPage();
  }catch(e){page.innerHTML=renderPublicError('Lỗi tải dữ liệu',e.message);}
}
var publicLedgerLoadedAt=null,publicLedgerPollTimer=null;
async function reloadPublicLedger(btn){
  var oldText=btn?btn.textContent:'';
  if(btn){btn.disabled=true;btn.textContent='Đang tải...';}
  try{await loadPublicLedger();}
  finally{if(btn){btn.disabled=false;btn.textContent=oldText||'🔄 Tải lại';}}
}
function startPublicLedgerPoll(){
  if(publicLedgerPollTimer)clearInterval(publicLedgerPollTimer);
  publicLedgerPollTimer=setInterval(function(){if(document.visibilityState==='visible')loadPublicLedger();},120000); // 2 phút
}
function renderPublicLedgerPage(){
  var c=clientList[0];if(!c)return;
  var ms=publicLedgerMonth||lm();
  var sp=getMonthSpendForClient(c.id,ms);
  var invoice=getInvoiceTotals(c,ms,undefined,sp);
  var allMonths=new Set();
  dailyData.forEach(function(d){if(d.report_date)allMonths.add(d.report_date.substring(0,7));});
  clientDepositData.forEach(function(d){if(d.deposit_date)allMonths.add(d.deposit_date.substring(0,7));});
  if(!allMonths.size)allMonths.add(lm());
  var monthList=Array.from(allMonths).sort().reverse();
  var lastSpendDate='';
  var dsToday=dailyData.filter(function(d){return(d.matched_client_id===c.id)||(adList.find(function(a){return a.id===d.ad_account_id&&a.client_id===c.id;}));});
  if(dsToday.length){
    dsToday.sort(function(a,b){return(b.report_date||'').localeCompare(a.report_date||'');});
    var dpL=(dsToday[0].report_date||'').split('-');if(dpL.length===3)lastSpendDate=dpL[2]+'/'+dpL[1]+'/'+dpL[0];
  }
  publicLedgerLoadedAt=new Date();
  var loadedAtStr=publicLedgerLoadedAt.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})+' · '+publicLedgerLoadedAt.toLocaleDateString('vi-VN');
  var h='<div class="public-container">';
  h+='<div class="public-header">';
  h+='<div class="public-brand"><div class="public-brand-name">HC Agency</div><div class="public-brand-sub">Hệ thống quản trị quảng cáo</div></div>';
  h+='<div class="public-toolbar"><div class="public-month-pick"><span style="font-size:12px;color:var(--tx3);">Kỳ:</span> <select class="fi" onchange="publicLedgerMonth=this.value;renderPublicLedgerPage();">';
  monthList.forEach(function(m){h+='<option value="'+m+'"'+(m===ms?' selected':'')+'>T'+parseInt(m.split('-')[1])+'/'+m.split('-')[0]+'</option>';});
  h+='</select></div>';
  h+='<button class="btn btn-sm" onclick="reloadPublicLedger(this)" title="Tải dữ liệu mới nhất">🔄 Tải lại</button>';
  h+='</div>';
  h+='</div>';
  h+='<div class="public-info-banner"><div><strong>Báo cáo dùng chung</strong> · cập nhật từ Meta sau mỗi lần admin sync · '+(lastSpendDate?'spend mới nhất ngày <strong>'+esc(lastSpendDate)+'</strong>':'chưa có spend tháng này')+'</div><div class="public-loaded-at">⏱ Tải lúc '+esc(loadedAtStr)+' · tự refresh mỗi 2 phút</div></div>';
  h+=renderRentalLedger(c,ms,sp,invoice);
  h+='<div class="public-footer">Báo cáo HC Agency · Sổ rental tự động · Spend từ Facebook Marketing API · cần đối soát liên hệ HC Agency qua Zalo</div>';
  h+='</div>';
  document.getElementById('page').innerHTML=h;
  if(typeof enhanceUI==='function')try{enhanceUI();}catch(e){}
  startPublicLedgerPoll();
}

// ═══ SHARE LINK SỔ PHẠT CHUNG cho cả team ═══
// 1 link chung lưu trong app_settings.TEAM_PENALTY_TOKEN. Tất cả nhân sự bấm cùng URL → cùng thấy sổ team.
async function copyTeamPenaltyLink(btn){
  if(!needAuth())return;
  var oldText=btn?btn.textContent:'';
  if(btn){btn.disabled=true;btn.textContent='Đang tạo link...';}
  try{
    // Đọc token cũ từ DB (nếu có)
    var{data:rows,error}=await sb2.from('app_settings').select('value').eq('key','TEAM_PENALTY_TOKEN').limit(1);
    var token=rows&&rows[0]&&rows[0].value?rows[0].value:'';
    if(error){toast('Lỗi đọc token: '+error.message,false);return;}
    if(!token){
      token=genShareToken();
      var ok=await saveAppSetting('TEAM_PENALTY_TOKEN',token);
      if(!ok){toast('Không lưu được token',false);return;}
    }
    var origin=window.location.origin,path=window.location.pathname.replace(/[^\/]*$/,'')+'index.html';
    var url=origin+path+'?team_penalty='+token;
    try{await navigator.clipboard.writeText(url);toast('Đã sao chép link sổ phạt chung · gửi vào nhóm Zalo team',true);}
    catch(e){window.prompt('Sao chép link sau (Ctrl+C):',url);}
  }finally{if(btn){btn.disabled=false;btn.textContent=oldText||'📋 Sao chép link sổ chung';}}
}
async function rotateTeamPenaltyLink(btn){
  if(!needAuth())return;
  if(!(await hcConfirm({title:'Đổi token sổ phạt',message:'Sinh token mới sẽ làm link cũ mất hiệu lực — tất cả nhân sự đang dùng link cũ phải cập nhật. Tiếp tục?',confirmLabel:'Đổi token',danger:true})))return;
  var oldText=btn?btn.textContent:'';
  if(btn){btn.disabled=true;btn.textContent='Đang đổi...';}
  try{
    var token=genShareToken();
    var ok=await saveAppSetting('TEAM_PENALTY_TOKEN',token);
    if(!ok){toast('Không lưu được token',false);return;}
    toast('Đã đổi token. Bấm "Sao chép link" để lấy link mới.',true);
  }finally{if(btn){btn.disabled=false;btn.textContent=oldText||'🔄 Đổi token';}}
}

// ═══ PUBLIC PENALTY MODE — sổ phạt CHUNG team, 1 link cho tất cả ═══
// URL: ?team_penalty=<token>
// Trả về phạt của tất cả nhân sự trong tháng (tên + lý do + tiền). Không trả lương/hoa hồng.
var publicPenaltyMode=false,publicPenaltyToken=null,publicPenaltyMonth=null,publicPenaltyData=null,publicPenaltyPollTimer=null,publicPenaltyLoadedAt=null;
function initPublicPenaltyMode(){
  var p=new URLSearchParams(window.location.search);
  var tok=p.get('team_penalty');
  if(!tok)return false;
  publicPenaltyMode=true;publicPenaltyToken=tok;
  document.body.classList.add('public-mode');
  return true;
}
async function loadPublicPenalty(){
  var sb=document.getElementById('sidebar'),appEl=document.getElementById('app');
  if(sb)sb.style.display='none';
  if(appEl)appEl.style.gridTemplateColumns='1fr';
  var page=document.getElementById('page');
  if(!publicPenaltyToken){
    page.innerHTML=renderPublicError('Link thiếu mã xác thực','Link bị thiếu đoạn ?team_penalty=... — vui lòng nhờ admin gửi lại link đầy đủ qua Zalo.');
    return;
  }
  page.innerHTML='<div style="padding:80px;text-align:center;color:var(--tx2);font-size:14px;">Đang tải sổ phạt team...</div>';
  try{
    var r=await sb2.rpc('get_public_team_penalty',{p_token:publicPenaltyToken,p_month:publicPenaltyMonth});
    if(r.error){
      var msg=String(r.error.message||r.error);
      if(/Invalid token/i.test(msg)){
        page.innerHTML=renderPublicError('Link không hợp lệ','Token không khớp hoặc admin đã đổi token. Hỏi admin xin link mới.');
        return;
      }
      if(/function .* does not exist/i.test(msg)||/Could not find the function/i.test(msg)){
        page.innerHTML=renderPublicError('Hệ thống cần migration','Admin chưa chạy file SQL 2026-05-08_team_penalty_share.sql. Vui lòng báo admin.');
        return;
      }
      page.innerHTML=renderPublicError('Không tải được dữ liệu',msg);
      return;
    }
    publicPenaltyData=r.data||{};
    publicPenaltyMonth=publicPenaltyData.month||publicPenaltyMonth;
    renderPublicPenaltyPage();
    startPublicPenaltyPoll();
  }catch(e){page.innerHTML=renderPublicError('Lỗi tải dữ liệu',e.message);}
}
function startPublicPenaltyPoll(){
  if(publicPenaltyPollTimer)clearInterval(publicPenaltyPollTimer);
  publicPenaltyPollTimer=setInterval(function(){if(document.visibilityState==='visible')loadPublicPenalty();},120000); // 2 phút
}
async function reloadPublicPenalty(btn){
  var oldText=btn?btn.textContent:'';
  if(btn){btn.disabled=true;btn.textContent='Đang tải...';}
  try{await loadPublicPenalty();}
  finally{if(btn){btn.disabled=false;btn.textContent=oldText||'🔄 Tải lại';}}
}
function changePublicPenaltyMonth(m){publicPenaltyMonth=m;loadPublicPenalty();}
function renderPublicPenaltyPage(){
  var d=publicPenaltyData||{},pens=d.penalties||[],perStaff=d.per_staff||[],total=Number(d.total)||0,count=Number(d.count)||0;
  var months=Array.isArray(d.available_months)?d.available_months.slice():[];
  var ms=publicPenaltyMonth||lm();
  if(months.indexOf(ms)<0)months.unshift(ms);
  publicPenaltyLoadedAt=new Date();
  var loadedAtStr=publicPenaltyLoadedAt.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})+' · '+publicPenaltyLoadedAt.toLocaleDateString('vi-VN');
  var h='<div class="public-container">';
  h+='<div class="public-header">';
  h+='<div class="public-brand"><div class="public-brand-name">HC Agency</div><div class="public-brand-sub">Sổ phạt team</div></div>';
  h+='<div class="public-toolbar"><div class="public-month-pick"><span style="font-size:12px;color:var(--tx3);">Kỳ:</span> <select class="fi" onchange="changePublicPenaltyMonth(this.value)">';
  months.forEach(function(m){h+='<option value="'+m+'"'+(m===ms?' selected':'')+'>T'+parseInt(m.split('-')[1])+'/'+m.split('-')[0]+'</option>';});
  h+='</select></div>';
  h+='<button class="btn btn-sm" onclick="reloadPublicPenalty(this)" title="Tải dữ liệu mới nhất">🔄 Tải lại</button>';
  h+='</div></div>';
  // KPI tổng team
  h+='<div class="kpi-grid kpi-2" style="margin-bottom:14px;">';
  h+='<div class="kpi"><div class="kpi-label">Tổng số lần phạt</div><div class="kpi-value" style="color:'+(count?'var(--red)':'var(--green)')+';">'+count+'</div><div class="kpi-note">cả team trong tháng</div></div>';
  h+='<div class="kpi"><div class="kpi-label">Tổng tiền phạt</div><div class="kpi-value" style="color:'+(total>0?'var(--red)':'var(--green)')+';">'+(total>0?'−'+ff(total):'0')+'</div><div class="kpi-note">đã trừ/sẽ trừ vào lương tháng</div></div>';
  h+='</div>';
  // ═══ QUỸ TEAM (public view) ═══
  var fundBal=Number(d.fund_balance)||0;
  var fundQ=Number(d.fund_quarter_collected)||0;
  var fundY=Number(d.fund_year_collected)||0;
  var fundWd=Number(d.fund_total_withdrawn)||0;
  var withdrawals=Array.isArray(d.withdrawals)?d.withdrawals:[];
  var nowD=new Date(),qNow=Math.floor(nowD.getMonth()/3)+1,yNow=nowD.getFullYear();
  h+='<div class="form-card" style="padding:16px 18px;margin-bottom:14px;background:linear-gradient(135deg,rgba(34,197,94,0.06),rgba(59,130,246,0.04));">';
  h+='<div style="font-weight:600;font-size:14px;margin-bottom:4px;">💰 Quỹ team</div>';
  h+='<div style="font-size:12px;color:var(--tx3);margin-bottom:12px;">Tiền phạt được gộp vào quỹ chung · trích cho liên hoan, thưởng, team building</div>';
  h+='<div class="kpi-grid kpi-4" style="gap:10px;">';
  h+='<div class="kpi" style="padding:12px;"><div class="kpi-label">Quỹ hiện có</div><div class="kpi-value" style="color:'+(fundBal>0?'var(--green)':'var(--tx2)')+';">'+ff(fundBal)+'</div><div class="kpi-note">đ — sau khi đã trích</div></div>';
  h+='<div class="kpi" style="padding:12px;"><div class="kpi-label">Q'+qNow+'/'+yNow+' đã thu</div><div class="kpi-value">'+ff(fundQ)+'</div><div class="kpi-note">phạt từ đầu quý</div></div>';
  h+='<div class="kpi" style="padding:12px;"><div class="kpi-label">Năm '+yNow+' đã thu</div><div class="kpi-value">'+ff(fundY)+'</div><div class="kpi-note">phạt từ đầu năm</div></div>';
  h+='<div class="kpi" style="padding:12px;"><div class="kpi-label">Đã trích</div><div class="kpi-value" style="color:var(--red);">'+ff(fundWd)+'</div><div class="kpi-note">'+withdrawals.length+' lần</div></div>';
  h+='</div>';
  if(withdrawals.length){
    h+='<div style="margin-top:14px;border-top:1px solid var(--bd1);padding-top:12px;">';
    h+='<div style="font-size:12px;font-weight:600;color:var(--tx2);margin-bottom:8px;">Lịch sử trích quỹ</div>';
    h+='<div class="table-wrap" style="margin:0;"><table style="margin:0;font-size:12px;"><thead><tr><th>Ngày</th><th>Mục đích</th><th>Phân loại</th><th style="text-align:right;">Số tiền</th></tr></thead><tbody>';
    withdrawals.slice(0,15).forEach(function(w){
      var dt=(w.withdrawal_date||'').split('-');
      var dStr=dt.length===3?(dt[2]+'/'+dt[1]+'/'+dt[0]):'';
      h+='<tr>';
      h+='<td class="mono" style="white-space:nowrap;">'+esc(dStr)+'</td>';
      h+='<td>'+esc(w.purpose||'')+(w.note?'<div style="font-size:11px;color:var(--tx3);margin-top:2px;">'+esc(w.note)+'</div>':'')+'</td>';
      h+='<td style="font-size:11px;color:var(--tx3);">'+esc((typeof teamFundCategoryLabel==='function')?teamFundCategoryLabel(w.category||'khac'):(w.category||'khác'))+'</td>';
      h+='<td class="mono" style="text-align:right;color:var(--red);font-weight:500;">−'+ff(Number(w.amount)||0)+'</td>';
      h+='</tr>';
    });
    if(withdrawals.length>15)h+='<tr><td colspan="4" style="text-align:center;color:var(--tx3);font-size:11px;padding:8px;">… và '+(withdrawals.length-15)+' lần trước đó</td></tr>';
    h+='</tbody></table></div></div>';
  }
  h+='</div>';
  // Bảng tổng theo nhân sự
  if(perStaff.length){
    h+='<div class="form-card" style="padding:0;overflow:hidden;margin-bottom:14px;"><div style="padding:14px 18px;border-bottom:1px solid var(--bd1);"><div style="font-weight:600;font-size:14px;">Tổng theo nhân sự — T'+parseInt(ms.split('-')[1])+'/'+ms.split('-')[0]+'</div></div>';
    h+='<div class="table-wrap"><table style="margin:0;"><thead><tr><th style="padding-left:18px;"></th><th>Nhân sự</th><th style="text-align:right;">Số lần</th><th style="text-align:right;padding-right:18px;">Tổng tiền</th></tr></thead><tbody>';
    perStaff.forEach(function(ps){
      var c=sc(ps.color_code||'blue');
      h+='<tr><td style="padding-left:18px;"><div class="avatar" style="background:'+c.bg+';color:'+c.tx+';">'+esc(ps.avatar_initials||'?')+'</div></td>';
      h+='<td style="font-weight:500;">'+esc(ps.full_name||'')+'</td>';
      h+='<td style="text-align:right;" class="mono">'+(ps.pen_count||0)+'</td>';
      h+='<td style="text-align:right;padding-right:18px;color:var(--red);font-weight:500;" class="mono">−'+ff(Number(ps.pen_total)||0)+'</td></tr>';
    });
    h+='</tbody></table></div></div>';
  }
  // Bảng chi tiết phạt
  if(pens.length){
    var hasExcluded=pens.some(function(p){return p.excluded_from_fund;});
    h+='<div class="form-card" style="padding:0;overflow:hidden;"><div style="padding:14px 18px;border-bottom:1px solid var(--bd1);"><div style="font-weight:600;font-size:14px;">Chi tiết phạt</div><div style="font-size:11px;color:var(--tx3);margin-top:2px;">Sắp xếp theo ngày mới nhất'+(hasExcluded?' · 🏥 = phạt bồi thường khách (vẫn trừ lương, không vào quỹ chung)':'')+'</div></div>';
    h+='<div class="table-wrap"><table style="margin:0;"><thead><tr><th style="padding-left:18px;">Ngày</th><th>Nhân sự</th><th>Lý do</th><th style="text-align:right;padding-right:18px;">Số tiền</th></tr></thead><tbody>';
    pens.forEach(function(p){
      var dt=(p.penalty_date||'').split('-');
      var dateStr=dt.length===3?(dt[2]+'/'+dt[1]+'/'+dt[0]):'';
      var c=sc(p.staff_color||'blue');
      var ex=!!p.excluded_from_fund;
      h+='<tr'+(ex?' style="background:var(--bg2);"':'')+'>';
      h+='<td style="padding-left:18px;font-weight:500;" class="mono">'+esc(dateStr)+'</td>';
      h+='<td><div style="display:inline-flex;align-items:center;gap:8px;"><div class="avatar" style="width:24px;height:24px;font-size:10px;background:'+c.bg+';color:'+c.tx+';">'+esc(p.staff_initials||'?')+'</div><span>'+esc(p.staff_name||'')+'</span></div></td>';
      h+='<td>'+(ex?'<span title="Bồi thường khách — không vào quỹ team" style="font-size:11px;padding:2px 6px;border-radius:4px;background:var(--amber-bg);color:var(--amber-tx);margin-right:6px;">🏥 bù khách</span>':'')+esc(p.reason||'(không ghi lý do)')+'</td>';
      h+='<td style="text-align:right;padding-right:18px;color:'+(ex?'var(--amber-tx)':'var(--red)')+';font-weight:500;" class="mono">−'+ff(Number(p.amount)||0)+'</td></tr>';
    });
    h+='</tbody></table></div>';
  }else{
    h+='<div class="form-card" style="text-align:center;padding:40px 20px;color:var(--tx3);"><div style="font-size:36px;margin-bottom:8px;">🎉</div><div style="font-size:14px;color:var(--tx2);font-weight:500;">Tháng này team không bị phạt lần nào</div><div style="font-size:12px;margin-top:4px;">Cả team đang giữ phong độ tốt!</div></div>';
  }
  h+='<div class="public-footer" style="margin-top:18px;">Báo cáo HC Agency · ⏱ Tải lúc '+esc(loadedAtStr)+' · tự refresh mỗi 2 phút · có thắc mắc liên hệ admin qua Zalo</div>';
  h+='</div>';
  document.getElementById('page').innerHTML=h;
  if(typeof enhanceUI==='function')try{enhanceUI();}catch(e){}
}

// ═══ PUBLIC REPORT MODE — khách xem báo cáo Ads daily qua URL ═══
// URL: ?report=<client_id>&token=<share_token>
var publicReportMode=false,publicReportClientId=null,publicReportToken=null,publicReportMonth=null,publicReportPollTimer=null;
function initPublicReportMode(){
  var p=new URLSearchParams(window.location.search);
  var rid=p.get('report'),tok=p.get('token');
  if(!rid)return false;
  publicReportMode=true;publicReportClientId=rid;publicReportToken=tok||'';
  document.body.classList.add('public-mode');
  return true;
}
async function loadPublicReport(){
  var sb=document.getElementById('sidebar'),appEl=document.getElementById('app');
  if(sb)sb.style.display='none';
  if(appEl)appEl.style.gridTemplateColumns='1fr';
  var page=document.getElementById('page');
  if(!isValidUuid(publicReportClientId)){
    page.innerHTML=renderPublicError('Link không hợp lệ','Mã khách trong link bị sai hoặc cắt thiếu (có dấu "..." giữa). Vui lòng nhờ HC Agency gửi lại link đầy đủ qua Zalo.');
    return;
  }
  if(!publicReportToken){
    page.innerHTML=renderPublicError('Link thiếu mã xác thực','Link bị thiếu đoạn &token=... — thường do app rút gọn link khi forward. Vui lòng nhờ HC Agency gửi lại link đầy đủ qua Zalo.');
    return;
  }
  page.innerHTML='<div style="padding:80px;text-align:center;color:var(--tx2);font-size:14px;">Đang tải báo cáo...</div>';
  try{
    var r=await sb2.rpc('get_public_client_report',{p_client_id:publicReportClientId,p_token:publicReportToken});
    if(r.error){
      var msg=String(r.error.message||r.error);
      if(/Invalid token|client not found/i.test(msg)){
        page.innerHTML=renderPublicError('Link không hợp lệ','Token không khớp hoặc đã thu hồi. Liên hệ HC Agency để lấy link mới.');
        return;
      }
      if(/function .* does not exist/i.test(msg)||/Could not find the function/i.test(msg)){
        page.innerHTML=renderPublicError('Hệ thống cần migration','Admin chưa chạy file SQL get_public_client_report. Báo HC Agency.');
        return;
      }
      page.innerHTML=renderPublicError('Không tải được dữ liệu',msg);
      return;
    }
    var d=r.data||{};
    if(!d.client){page.innerHTML=renderPublicError('Link không hợp lệ','Khách hàng không tồn tại.');return;}
    clientList=[d.client];
    adList=d.ad_accounts||[];
    assignData=d.assignments||[];
    rebuildAssignIndex();
    dailyData=d.daily_spend||[];
    campaignMessData=d.campaign_mess||[];
    adPostData=d.ad_post||[];
    if(!publicReportMonth)publicReportMonth=lm()||gm();
    renderPublicReportPage();
    startPublicReportPoll();
  }catch(e){page.innerHTML=renderPublicError('Lỗi tải dữ liệu',e.message);}
}
async function reloadPublicReport(btn){
  var oldText=btn?btn.textContent:'';
  if(btn){btn.disabled=true;btn.textContent='Đang tải...';}
  try{await loadPublicReport();}
  finally{if(btn){btn.disabled=false;btn.textContent=oldText||'🔄 Tải lại';}}
}
function startPublicReportPoll(){
  if(publicReportPollTimer)clearInterval(publicReportPollTimer);
  publicReportPollTimer=setInterval(function(){if(document.visibilityState==='visible')loadPublicReport();},120000);
}
function renderPublicReportPage(){
  var c=clientList[0];if(!c)return;
  var ms=publicReportMonth||lm()||gm();
  // List tháng từ daily_spend
  var allMonths=new Set();
  dailyData.forEach(function(d){if(d.report_date)allMonths.add(d.report_date.substring(0,7));});
  if(!allMonths.size)allMonths.add(ms);
  var monthList=Array.from(allMonths).sort().reverse();
  var mn=parseInt(ms.split('-')[1]),year=parseInt(ms.split('-')[0]);
  var dim=new Date(year,mn,0).getDate();
  // Build data theo ngày
  var data={};
  for(var d=1;d<=dim;d++){
    var ds=year+'-'+(mn<10?'0'+mn:mn)+'-'+(d<10?'0'+d:d);
    data[ds]={spend:0,mess:0,cmt:0,checkout:0};
  }
  dailyData.filter(function(x){return x.report_date&&x.report_date.substring(0,7)===ms;}).forEach(function(x){
    if(data[x.report_date])data[x.report_date].spend+=x.spend_amount||0;
  });
  campaignMessData.filter(function(x){return x.report_date&&x.report_date.substring(0,7)===ms;}).forEach(function(x){
    if(data[x.report_date]){data[x.report_date].mess+=x.mess_count||0;data[x.report_date].cmt+=x.comment_count||0;data[x.report_date].checkout+=x.checkout_count||0;}
  });
  var totalSpend=0,totalMess=0,totalCmt=0,totalCheckout=0;
  Object.keys(data).forEach(function(k){totalSpend+=data[k].spend;totalMess+=data[k].mess;totalCmt+=data[k].cmt;totalCheckout+=data[k].checkout;});
  var totalResult=totalMess+totalCmt;
  var totalCostPer=totalResult?Math.round(totalSpend/totalResult):0;
  var totalCostCheckout=totalCheckout?Math.round(totalSpend/totalCheckout):0;
  var today=td();
  var hasMess=campaignMessData.length>0;
  var h='<div class="public-wrap" style="max-width:980px;margin:0 auto;padding:24px 16px 60px;">';
  h+='<div class="public-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--bd1);">';
  h+='<div><div style="font-size:22px;font-weight:700;color:var(--tx1);">📊 Báo cáo chi phí Ads</div><div style="font-size:14px;color:var(--tx2);margin-top:4px;">'+esc(c.name)+(c.company_full_name?' · '+esc(c.company_full_name):'')+'</div></div>';
  h+='<div style="text-align:right;"><div style="font-size:11px;color:var(--tx3);text-transform:uppercase;letter-spacing:.4px;">Cung cấp bởi</div><div style="font-size:14px;font-weight:600;color:var(--blue-tx);">HC Agency</div></div>';
  h+='</div>';
  // Toolbar
  h+='<div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap;"><span style="font-size:12px;color:var(--tx3);">Kỳ báo cáo:</span><select class="fi" style="width:140px;" onchange="publicReportMonth=this.value;renderPublicReportPage();">';
  monthList.forEach(function(m){h+='<option value="'+m+'"'+(m===ms?' selected':'')+'>T'+parseInt(m.split('-')[1])+'/'+m.split('-')[0]+'</option>';});
  h+='</select>';
  h+='<button class="btn btn-sm btn-ghost" onclick="reloadPublicReport(this)" title="Tải dữ liệu mới nhất">🔄 Tải lại</button>';
  h+='</div>';
  if(!hasMess)h+='<div style="background:var(--amber-bg);color:var(--amber-tx);padding:8px 12px;border-radius:8px;font-size:12px;margin-bottom:12px;">⚠ Chưa có data Mess/Bình luận — sẽ hiển thị khi HC Agency cập nhật.</div>';
  // KPI tổng
  h+='<div class="kpi-grid kpi-4" style="margin-bottom:18px;">';
  h+='<div class="kpi"><div class="kpi-label">Tổng chi phí</div><div class="kpi-value" style="color:var(--teal);">'+(totalSpend?fmtVndPlain(totalSpend)+' đ':'—')+'</div></div>';
  h+='<div class="kpi"><div class="kpi-label">Tổng Mess</div><div class="kpi-value">'+totalMess+'</div></div>';
  h+='<div class="kpi"><div class="kpi-label">Tổng Bình luận</div><div class="kpi-value">'+totalCmt+'</div></div>';
  h+='<div class="kpi"><div class="kpi-label">Giá kết quả TB</div><div class="kpi-value" style="color:var(--blue-tx);">'+(totalResult?fmtVndPlain(totalCostPer)+' đ':'—')+'</div></div>';
  h+='</div>';
  // Bảng daily
  h+='<div class="table-wrap" style="background:var(--bg1);border:1px solid var(--bd1);border-radius:var(--radius);"><table style="font-size:13px;"><thead>';
  h+='<tr><th style="text-align:center;">NGÀY</th><th style="text-align:right;">CHI PHÍ ADS</th><th style="text-align:center;">Số Mess</th><th style="text-align:center;">Số Bình luận</th><th style="text-align:right;">Giá kết quả</th><th style="text-align:center;">Lượt thanh toán</th><th style="text-align:right;">Giá / Lượt thanh toán</th></tr>';
  h+='</thead><tbody>';
  h+='<tr style="background:var(--bg2);font-weight:600;color:var(--red);">';
  h+='<td style="text-align:center;">Tổng</td>';
  h+='<td style="text-align:right;font-variant-numeric:tabular-nums;">'+(totalSpend?fmtVndPlain(totalSpend)+' đ':'—')+'</td>';
  h+='<td style="text-align:center;">'+totalMess+'</td>';
  h+='<td style="text-align:center;">'+totalCmt+'</td>';
  h+='<td style="text-align:right;font-variant-numeric:tabular-nums;">'+(totalResult?fmtVndPlain(totalCostPer)+' đ':'—')+'</td>';
  h+='<td style="text-align:center;">'+totalCheckout+'</td>';
  h+='<td style="text-align:right;font-variant-numeric:tabular-nums;">'+(totalCheckout?fmtVndPlain(totalCostCheckout)+' đ':'—')+'</td>';
  h+='</tr>';
  Object.keys(data).sort().forEach(function(date){
    var x=data[date];
    var result=x.mess+x.cmt;
    var costPer=result?Math.round(x.spend/result):0;
    var costCheckout=x.checkout?Math.round(x.spend/x.checkout):0;
    var dp=date.split('-');
    var dayLabel=dp[2]+'/'+dp[1]+'/'+dp[0];
    var isFuture=date>today;
    var isToday=date===today;
    var dayCell=dayLabel+(isToday?' <span style="display:inline-block;font-size:10px;background:var(--amber-bg);color:var(--amber-tx);padding:1px 6px;border-radius:8px;font-weight:500;margin-left:4px;" title="Số liệu hôm nay đang cập nhật, chưa chốt">⟳ Đang cập nhật</span>':'');
    h+='<tr style="'+(isFuture?'opacity:.4;':'')+'">';
    h+='<td style="text-align:center;">'+dayCell+'</td>';
    h+='<td style="text-align:right;font-variant-numeric:tabular-nums;">'+(x.spend?fmtVndPlain(x.spend)+' đ':'<span style="color:var(--tx3);">—</span>')+'</td>';
    h+='<td style="text-align:center;">'+(x.mess||'<span style="color:var(--tx3);">—</span>')+'</td>';
    h+='<td style="text-align:center;">'+(x.cmt||'<span style="color:var(--tx3);">—</span>')+'</td>';
    h+='<td style="text-align:right;font-variant-numeric:tabular-nums;">'+(result?fmtVndPlain(costPer)+' đ':'<span style="color:var(--tx3);">—</span>')+'</td>';
    h+='<td style="text-align:center;">'+(x.checkout||'<span style="color:var(--tx3);">—</span>')+'</td>';
    h+='<td style="text-align:right;font-variant-numeric:tabular-nums;">'+(x.checkout?fmtVndPlain(costCheckout)+' đ':'<span style="color:var(--tx3);">—</span>')+'</td>';
    h+='</tr>';
  });
  h+='</tbody></table></div>';
  // Bảng "Hiệu quả theo bài chạy × tuần" — dùng chung function với báo cáo admin
  h+=renderClientPostWeekly(c.id,ms);
  h+='<div style="margin-top:24px;text-align:center;font-size:11px;color:var(--tx3);">Báo cáo tự động sync từ Meta Ads API · Cập nhật mỗi 2 phút khi mở trang · © HC Agency</div>';
  h+='</div>';
  document.getElementById('page').innerHTML=h;
}
// Copy URL public report cho khách
async function copyClientReportLink(clientId,btn){
  if(!needAuth())return;
  var c=clientList.find(function(x){return x.id===clientId;});if(!c)return;
  var token=c.share_token;
  var oldText=btn?btn.textContent:'';
  if(!token){
    if(btn){btn.disabled=true;btn.textContent='Đang tạo link...';}
    token=genShareToken();
    var r=await sb2.from('client').update({share_token:token}).eq('id',clientId);
    if(btn){btn.disabled=false;btn.textContent=oldText||'📋 Lấy link';}
    if(r.error){
      if(isMissingColumnError(r.error))toast('Thiếu cột share_token. Chạy migration 2026-04-27_add_share_token.sql trước.',false);
      else toast('Lỗi: '+r.error.message,false);
      return;
    }
    c.share_token=token;
  }
  var origin=window.location.origin,path=window.location.pathname.replace(/[^\/]*$/,'')+'index.html';
  var url=origin+path+'?report='+clientId+'&token='+token;
  try{await navigator.clipboard.writeText(url);toast('Đã sao chép link · gửi cho khách qua Zalo',true);}
  catch(e){window.prompt('Sao chép link sau (Ctrl+C):',url);}
}

// ═══ PHASE 1.1 CRM: PUBLIC LEAD FORM — NỘI DUNG CÓ THỂ SỬA TẠI ĐÂY ═══
var LEAD_COPY = {
  // ── HERO ──────────────────────────────────────────────────────────────
  heroPill:        '🎯 Tư vấn chiến lược quảng cáo Facebook miễn phí',
  heroTitle:       'Nhận tư vấn 1:1 từ <span class="lead-hero-h1-blue">chuyên gia quảng cáo Facebook</span>',
  heroDesc:        'Giúp bạn xây dựng chiến lược quảng cáo phù hợp với sản phẩm, ngân sách và mục tiêu kinh doanh.',
  heroSub:         'Tiếp cận đúng khách hàng tiềm năng - Tối ưu ngân sách - Tăng tỷ lệ ra đơn',
  trust1Title:     '9 năm thực chiến · 2 triệu USD ngân sách Ads',
  trust1Sub:       'Trực tiếp triển khai và cố vấn cho hàng trăm fanpage – nhãn hàng trên Facebook trong 9 năm',
  trust2Title:     'Cố vấn marketing cho 15+ nhãn hàng',
  trust2Sub:       'Túi xách, thời trang, đồ gia dụng, nội thất, phụ kiện ô tô, kính mắt, đồ mẹ và bé, rèm cửa…',
  trust3Title:     'Tư vấn 1:1 theo từng mô hình kinh doanh',
  trust3Sub:       'Không áp dụng công thức chung, đề xuất giải pháp dựa trên tình trạng thực tế của bạn',
  // ── MOCK DASHBOARD ───────────────────────────────────────────────────
  mockRevLabel:    'Doanh thu',
  mockRevVal:      '3.250.000.000đ',
  mockRevUp:       '↑ 158%',
  mockCvLabel:     'Tỷ lệ ra đơn',
  mockCvVal:       '8.6%',
  mockCvUp:        '↑ 2.7%',
  mockPanelTitle:  'Tổng quan hiệu quả',
  mockAdCostLabel: 'Chi phí quảng cáo',
  mockAdCostVal:   '450.000.000đ',
  mockOrdersLabel: 'Số đơn hàng',
  mockOrdersVal:   '2.806',
  mockCpaLabel:    'Cost/đơn hàng',
  mockCpaVal:      '160.236đ',
  mockConvLabel:   'Tỷ lệ chuyển đổi',
  mockConvVal:     '2,8%',
  mockNote:        'Cam kết tư vấn minh bạch - Chiến lược rõ ràng - Hiệu quả đo lường được',
  // ── PROOF / CASE STUDY ───────────────────────────────────────────────
  proofEyebrow:    'Case study có số liệu thật',
  proofTitle:      'Những kết quả đã tạo ra cho khách hàng',
  proofSub:        'Các số liệu dưới đây được tổng hợp từ portfolio khách hàng đã chạy quảng cáo cùng Hưng Coaching / HC Agency.',
  proofCases:      [
    {brand:'Lagin Túi Xách (by Tatu)',     tag:'Fanpage 195K follow',  metric:'Lợi nhuận 150-200 triệu/tháng', desc:'Khách hàng Hoài Thanh Vũ. Duy trì ngân sách quảng cáo đều đặn 35-40 triệu/tháng.', img:'/assets/cases/lagin.jpg'},
    {brand:'Fitcity - Private Fitness',    tag:'Mùa hè 2022',          metric:'Doanh thu 3,85 tỷ trong 3 tháng', desc:'Team PT Hoàng Cầu. Chạy quảng cáo 3 tháng hè, doanh thu tăng mạnh trên cùng tệp khách.', img:'/assets/cases/Fitcity.jpg'},
    {brand:'Đồ Gỗ Minh Vân',               tag:'Livestream ads',       metric:'Doanh số 1 tỷ/tháng',           desc:'Chạy quảng cáo livestream đều đặn với ngân sách khoảng 190 triệu/tháng.'},
    {brand:'Tổng kho nội thất Minh Khuê',  tag:'Nội thất',             metric:'Lợi nhuận 100-150 triệu/tháng', desc:'Hợp tác từ 2020 đến nay, tổng chi tiêu quảng cáo hơn 650 triệu.'},
    {brand:'Hang Doan Boutique',           tag:'Thời trang nữ',        metric:'Lợi nhuận 120-150 triệu/tháng', desc:'Từ 5/2022 đến nay, ngân sách quảng cáo ~100 triệu/tháng, lợi nhuận thực sau khi trừ chi phí.'},
    {brand:'Samkids VNXK - Xuất Dư',       tag:'Thời trang trẻ em',    metric:'300-400 đơn/ngày',              desc:'Giai đoạn 2019-2021, duy trì lượng đơn hàng trung bình cao đều mỗi ngày.'}
  ],
  proofFooter:     'Bạn không cần điền nhiều thông tin. Chỉ cần để lại SĐT, chuyên gia sẽ xem mô hình kinh doanh và gợi ý hướng chạy phù hợp trước khi báo phí.',
  // ── SIDEBAR ──────────────────────────────────────────────────────────
  sidebarTitle:    'Quy trình tư vấn',
  step1Name:       'Thông tin cơ bản',
  step1Time:       '(30 giây)',
  step2Name:       'Nhu cầu & ngân sách',
  step2Time:       '(1 phút)',
  step3Name:       'Gửi yêu cầu tư vấn',
  step3Time:       '(Hoàn tất)',
  testimonialQuote:  'Dù làm một việc gì bạn cũng phải cố gắng làm tốt hơn cái người ta mong chờ. Đó là bước đầu để tiến đến một sự nghiệp lớn.',
  testimonialName:   'Mr. Hưng Coaching',
  testimonialRole:   'CEO HC Agency · 9 năm Facebook Ads',
  trustedTitle:    'Thương hiệu đã tin tưởng',
  trustedLogos:    [
    {name:'Bắc Việt', img:'/assets/brands/bac-viet-logo.png'},
    {name:'Getfit VinHomes Green Bay', img:'/assets/brands/getfit-vinhomes-green-bay-logo.png'},
    {name:'Live Fit', img:'/assets/brands/live-fit-logo.png'},
    {name:'Power Gym Private Fitness', img:'/assets/brands/power-gym-logo.png'},
    {name:'Fourcats Camera', img:'/assets/brands/fourcats-camera-logo.png'},
    {name:'Mysterise Fitness', img:'/assets/brands/mysterise-fitness-logo.png'}
  ],
  secureTitle:     '🛡️ Cam kết bảo mật',
  secureBody:      'Thông tin của bạn được bảo mật tuyệt đối và chỉ sử dụng để tư vấn.',
  // ── BƯỚC 1 ───────────────────────────────────────────────────────────
  step1Tag:        'BƯỚC 1/3',
  step1Title:      'Để lại SĐT để nhận phân tích miễn phí',
  step1Desc:       'Chuyên gia sẽ liên hệ, hỏi nhanh tình trạng hiện tại và gợi ý hướng chạy phù hợp với sản phẩm của bạn.',
  lblName:         'Họ và tên',
  phName:          'VD: Nguyễn Văn A',
  lblPhone:        'Số điện thoại',
  phPhone:         'VD: 0912 345 678',
  lblIndustry:     'Ngành nghề kinh doanh',
  phIndustry:      'Chọn ngành nghề của bạn',
  industries:      ['Spa & Làm đẹp','Thời trang','F&B (Ăn uống)','Giáo dục & đào tạo','Bất động sản','Y tế & sức khỏe','Du lịch & dịch vụ','Nội thất & xây dựng','Bán lẻ','Khác'],
  btnStart:        'Nhận tư vấn miễn phí',
  btnNext:         'Tiếp tục',
  step1Secure:     '🔒 Không spam, chỉ dùng để tư vấn',
  // ── BƯỚC 2 ───────────────────────────────────────────────────────────
  step2Tag:        'BƯỚC 2/3',
  step2Title:      'Bạn muốn cải thiện điều gì?',
  step2Desc:       'Thông tin này giúp chuyên gia ước lượng chiến lược, ngân sách và điểm cần tối ưu trước khi gọi lại.',
  lblBudget:       'Ngân sách quảng cáo dự kiến / tháng',
  budgets:         [
    {key:'Dưới 10 triệu',  icon:'💰'},
    {key:'10 – 30 triệu',  icon:'💵'},
    {key:'30 – 100 triệu', icon:'💸'},
    {key:'Trên 100 triệu', icon:'🚀'}
  ],
  lblService:      'Dịch vụ bạn quan tâm',
  lblServiceOpt:   '(có thể chọn nhiều)',
  services:        [
    {code:'fb_ads',      icon:'📣', title:'Quảng cáo Facebook',          desc:'Tối ưu chiến dịch, tăng chuyển đổi'},
    {code:'tkqc_rental', icon:'🔑', title:'Thuê tài khoản quảng cáo',    desc:'TKQC ổn định, BM chất lượng'},
    {code:'web_dev',     icon:'💻', title:'Thiết kế & Lập trình Web/App', desc:'Website chuẩn SEO, tối ưu UX/UI'}
  ],
  lblMessage:      'Nhu cầu hiện tại của bạn',
  lblMessageOpt:   '(không bắt buộc)',
  phMessage:       'VD: đang chạy nhưng giá inbox cao, chưa ra đơn ổn định, muốn tăng doanh số, cần thuê TKQC ổn định…',
  btnBack:         '← Quay lại',
  // ── BƯỚC 3 ───────────────────────────────────────────────────────────
  step3Tag:        'BƯỚC 3/3',
  step3Title:      'Gửi yêu cầu tư vấn',
  step3Desc:       'Xác nhận thông tin và gửi yêu cầu để chuyên gia liên hệ với bạn.',
  lblCaptcha:      'Vui lòng giải phép tính (chống spam)',
  btnSubmit:       '📨 Gửi yêu cầu tư vấn',
  // ── SUMMARY LABELS ───────────────────────────────────────────────────
  sumName:         'Họ tên',
  sumPhone:        'Số điện thoại',
  sumIndustry:     'Ngành nghề',
  sumBudget:       'Ngân sách',
  sumService:      'Dịch vụ quan tâm',
  sumMsg:          'Nhu cầu',
  // ── BOTTOM BAR + FOOTER ──────────────────────────────────────────────
  ctaTitle:        'Nhận chiến lược Ads riêng cho tôi',
  ctaSub:          'Chuyên gia sẽ liên hệ trong 15 – 30 phút',
  bottomTrust:     '🛡️ Không hiệu quả – Hoàn phí setup. Chúng tôi cam kết đồng hành đến khi bạn đạt kết quả.',
  footerText:      'HC Agency · Hotline / Zalo:',
  hotline:         '0968 91 5555',
  hotlineTel:      '0968915555',
  // ── VALIDATION ERRORS ────────────────────────────────────────────────
  errName:         'Vui lòng nhập họ và tên',
  errPhone:        'Số điện thoại không hợp lệ (phải 9-11 chữ số)',
  errIndustry:     'Vui lòng chọn ngành nghề kinh doanh',
  errService:      'Vui lòng chọn ít nhất 1 dịch vụ quan tâm',
  errCaptcha:      'Phép tính sai. Kiểm tra lại để chứng minh bạn không phải bot.',
  errSystem:       'Hệ thống chưa kích hoạt form. Vui lòng liên hệ Zalo 0968 91 5555.',
  btnSending:      'Đang gửi...',
  btnSubmitRetry:  '📨 Gửi thông tin tư vấn',
  // ── TRANG THÀNH CÔNG ─────────────────────────────────────────────────
  succTitleNew:    'Đã nhận yêu cầu tư vấn',
  succTitleDup:    'Đã ghi nhận lần liên hệ mới',
  succSubNew:      'Cảm ơn bạn đã tin tưởng HC Agency. Chuyên gia sẽ liên hệ tư vấn giải pháp Quảng cáo Facebook phù hợp <strong>trong vòng 24 giờ</strong> qua Zalo hoặc điện thoại.',
  succSubDup:      'Cảm ơn bạn đã quay lại! Yêu cầu mới đã được thêm vào hồ sơ. Chuyên gia HC Agency sẽ liên hệ tư vấn sớm nhất.',
  timelineTitle:   'Quy trình tiếp theo',
  tl1Time:         '30 phút',
  tl1Desc:         'Chuyên gia gọi xác nhận thông tin và lắng nghe nhu cầu',
  tl2Time:         '4 giờ',
  tl2Desc:         'Phân tích nhu cầu, chuẩn bị chiến lược riêng cho bạn',
  tl3Time:         '24 giờ',
  tl3Desc:         'Tư vấn 1-1, gửi đề xuất chiến lược chi tiết qua Zalo',
  ctaUrgent:       'Cần hỗ trợ gấp? Liên hệ trực tiếp ngay:',
  zaloLabel:       'Chat Zalo ngay',
  zaloMeta:        'Phản hồi trong 5–10 phút',
  zaloUrl:         'https://zalo.me/0968915555',
  callLabel:       'Gọi 0968 91 5555',
  callMeta:        'T2 – T7 · 8h00 – 21h00',
  succSecure:      'Thông tin của bạn được mã hoá &amp; bảo mật 100%'
};
// ═══ PHASE 1.1 CRM: PUBLIC LEAD FORM (?form=lead) ═══
function initPublicLeadFormMode(){
  var p=new URLSearchParams(window.location.search);
  if(p.get('form')!=='lead')return false;
  publicLeadFormMode=true;
  publicLeadFormSource=(p.get('source')||'web_form').substring(0,40);
  document.body.classList.add('public-mode');
  return true;
}
function renderLeadFormPage(){
  var sb=document.getElementById('sidebar'),appEl=document.getElementById('app');
  if(sb)sb.style.display='none';
  if(appEl)appEl.style.gridTemplateColumns='1fr';
  var a=Math.floor(Math.random()*9)+1,b=Math.floor(Math.random()*9)+1;
  publicLeadFormCaptcha=a+b;
  publicLeadFormCurrentStep=1;
  var LC=LEAD_COPY;
  var h='<div class="lead-page-wrap">';
  // HERO
  h+='<div class="lead-hero-card">';
  h+='<div class="lead-hero-content">';
  h+='<div class="lead-hero-pill">'+LC.heroPill+'</div>';
  h+='<h1 class="lead-hero-h1">'+LC.heroTitle+'</h1>';
  h+='<p class="lead-hero-desc">'+LC.heroDesc+'</p>';
  h+='<p class="lead-hero-sub">'+LC.heroSub+'</p>';
  h+='<div class="lead-hero-trust">';
  h+='<div class="lead-trust-item"><span class="lead-trust-icon">🎖️</span><div><div class="lead-trust-title">'+LC.trust1Title+'</div><div class="lead-trust-sub">'+LC.trust1Sub+'</div></div></div>';
  h+='<div class="lead-trust-item"><span class="lead-trust-icon">🤝</span><div><div class="lead-trust-title">'+LC.trust2Title+'</div><div class="lead-trust-sub">'+LC.trust2Sub+'</div></div></div>';
  h+='<div class="lead-trust-item"><span class="lead-trust-icon">🧩</span><div><div class="lead-trust-title">'+LC.trust3Title+'</div><div class="lead-trust-sub">'+LC.trust3Sub+'</div></div></div>';
  h+='</div>';
  h+='<div class="lead-hero-brand-strip"><div class="lead-hero-brand-title">'+LC.trustedTitle+'</div><div class="lead-hero-brand-grid">';
  LC.trustedLogos.forEach(function(item){
    var logo=typeof item==='string'?{name:item}:item;
    var name=esc(logo.name||'Thương hiệu');
    if(logo.img)h+='<div class="lead-hero-brand-logo" title="'+name+'"><img src="'+esc(logo.img)+'" alt="'+name+'" loading="lazy"></div>';
    else h+='<div class="lead-hero-brand-logo">'+name+'</div>';
  });
  h+='</div></div>';
  h+='</div>';
  // Mock dashboard
  h+='<div class="lead-hero-mock">';
  h+='<div class="lead-mock-card lead-mock-card-1">';
  h+='<div class="lead-mock-lbl">'+LC.mockRevLabel+'</div>';
  h+='<div class="lead-mock-val">'+LC.mockRevVal+'</div>';
  h+='<div class="lead-mock-up">'+LC.mockRevUp+' so với kỳ trước</div>';
  h+='</div>';
  h+='<div class="lead-mock-card lead-mock-card-2"><div class="lead-mock-lbl">'+LC.mockCvLabel+'</div><div class="lead-mock-val-sm">'+LC.mockCvVal+'</div><div class="lead-mock-up">'+LC.mockCvUp+' so với kỳ trước</div></div>';
  h+='<div class="lead-mock-panel">';
  h+='<div class="lead-mock-panel-title">'+LC.mockPanelTitle+'</div>';
  h+='<div class="lead-mock-bars"><span style="height:35%"></span><span style="height:48%"></span><span style="height:58%"></span><span style="height:70%"></span><span style="height:84%"></span><span style="height:96%"></span></div>';
  h+='<div class="lead-mock-stats">';
  h+='<div class="lead-mock-stat"><span class="lead-mock-stat-ic">$</span><div>'+LC.mockAdCostLabel+'<b>'+LC.mockAdCostVal+'</b></div></div>';
  h+='<div class="lead-mock-stat"><span class="lead-mock-stat-ic">🛒</span><div>'+LC.mockOrdersLabel+'<b>'+LC.mockOrdersVal+'</b></div></div>';
  h+='<div class="lead-mock-stat"><span class="lead-mock-stat-ic">↗</span><div>'+LC.mockCpaLabel+'<b>'+LC.mockCpaVal+'</b></div></div>';
  h+='<div class="lead-mock-stat"><span class="lead-mock-stat-ic">%</span><div>'+LC.mockConvLabel+'<b>'+LC.mockConvVal+'</b></div></div>';
  h+='</div>';
  h+='</div>';
  h+='<div class="lead-mock-note">🛡️ '+LC.mockNote+'</div>';
  h+='</div>';
  h+='</div>';
  // GRID 2-col
  h+='<div class="lead-grid">';
  // SIDEBAR
  h+='<div class="lead-sidebar">';
  h+='<div class="lead-side-card">';
  h+='<div class="lead-side-title">'+LC.sidebarTitle+'</div>';
  h+='<div class="lead-process-step active" data-step="1"><div class="lead-process-num">1</div><div><div class="lead-process-name">'+LC.step1Name+'</div><div class="lead-process-time">'+LC.step1Time+'</div></div></div>';
  h+='<div class="lead-process-step" data-step="2"><div class="lead-process-num">2</div><div><div class="lead-process-name">'+LC.step2Name+'</div><div class="lead-process-time">'+LC.step2Time+'</div></div></div>';
  h+='<div class="lead-process-step" data-step="3"><div class="lead-process-num">3</div><div><div class="lead-process-name">'+LC.step3Name+'</div><div class="lead-process-time">'+LC.step3Time+'</div></div></div>';
  h+='</div>';
  h+='<div class="lead-side-card lead-testimonial">';
  h+='<div class="lead-quote-mark">"</div>';
  h+='<p class="lead-quote-text">'+LC.testimonialQuote+'</p>';
  h+='<div class="lead-quote-author"><div class="lead-quote-avatar">H</div><div><div class="lead-quote-name">'+LC.testimonialName+'</div><div class="lead-quote-role">'+LC.testimonialRole+'</div></div></div>';
  h+='</div>';
  h+='<div class="lead-side-card lead-secure">';
  h+='<div class="lead-secure-head">'+LC.secureTitle+'</div>';
  h+='<div class="lead-secure-body">'+LC.secureBody+'</div>';
  h+='</div>';
  h+='</div>';
  // RIGHT — STEP CARDS
  h+='<div class="lead-main">';
  // STEP 1
  h+='<div class="lead-step lead-step-active" id="lead-step-1" data-step="1">';
  h+='<div class="lead-step-head"><span class="lead-step-tag">'+LC.step1Tag+'</span><h2 class="lead-step-title">'+LC.step1Title+'</h2><p class="lead-step-desc">'+LC.step1Desc+'</p></div>';
  h+='<div class="lead-form-grid-2">';
  h+='<div class="lead-form-row"><label>'+LC.lblName+' <span class="req">*</span></label><input id="lf-name" class="lead-fi" type="text" placeholder="'+LC.phName+'" autocomplete="name"></div>';
  h+='<div class="lead-form-row"><label>'+LC.lblPhone+' <span class="req">*</span></label><input id="lf-phone" class="lead-fi" type="tel" placeholder="'+LC.phPhone+'" autocomplete="tel" inputmode="tel"></div>';
  h+='</div>';
  h+='<div class="lead-form-row"><label>'+LC.lblIndustry+' <span class="req">*</span></label><select id="lf-industry" class="lead-fi"><option value="">'+LC.phIndustry+'</option>';
  LC.industries.forEach(function(ind){h+='<option value="'+esc(ind)+'">'+esc(ind)+'</option>';});
  h+='</select></div>';
  h+='<div id="lf-error-1" class="lead-form-error" hidden></div>';
  h+='<div class="lead-step-foot">';
  h+='<button class="btn btn-primary lead-step-btn" onclick="nextLeadStep(1)">'+LC.btnStart+' <span class="lead-step-arrow">→</span></button>';
  h+='<div class="lead-step-secure">'+LC.step1Secure+'</div>';
  h+='</div>';
  h+='</div>';
  // STEP 2
  h+='<div class="lead-step" id="lead-step-2" data-step="2">';
  h+='<div class="lead-step-head"><span class="lead-step-tag">'+LC.step2Tag+'</span><h2 class="lead-step-title">'+LC.step2Title+'</h2><p class="lead-step-desc">'+LC.step2Desc+'</p></div>';
  h+='<div class="lead-form-grid-2">';
  // Budget left col
  h+='<div class="lead-form-row"><label>'+LC.lblBudget+'</label>';
  h+='<div class="lead-budget-grid">';
  LC.budgets.forEach(function(b,i){h+='<label class="lead-budget-tile"><input type="radio" name="lf-budget" value="'+esc(b.key)+'"'+(i===1?' checked':'')+'><div class="lead-budget-label">'+esc(b.key)+'</div><div class="lead-budget-radio"></div></label>';});
  h+='</div></div>';
  // Service right col
  h+='<div class="lead-form-row"><label>'+LC.lblService+' <span class="opt">'+LC.lblServiceOpt+'</span></label>';
  h+='<div class="lead-service-list">';
  LC.services.forEach(function(s,i){h+='<label class="lead-service-tile"><input type="checkbox" class="lf-service" value="'+s.code+'"'+(i===0?' checked':'')+'><div class="lead-service-text"><div class="lead-service-title">'+esc(s.title)+'</div><div class="lead-service-desc">'+esc(s.desc)+'</div></div><div class="lead-service-check">✓</div></label>';});
  h+='</div></div>';
  h+='</div>';
  h+='<div class="lead-form-row"><label>'+LC.lblMessage+' <span class="opt">'+LC.lblMessageOpt+'</span></label><textarea id="lf-message" class="lead-fi" rows="3" placeholder="'+LC.phMessage+'"></textarea></div>';
  h+='<div id="lf-error-2" class="lead-form-error" hidden></div>';
  h+='<div class="lead-step-foot">';
  h+='<button class="btn lead-step-back" onclick="prevLeadStep(2)">'+LC.btnBack+'</button>';
  h+='<button class="btn btn-primary lead-step-btn" onclick="nextLeadStep(2)">'+LC.btnNext+' <span class="lead-step-arrow">→</span></button>';
  h+='</div>';
  h+='</div>';
  // STEP 3
  h+='<div class="lead-step" id="lead-step-3" data-step="3">';
  h+='<div class="lead-step-head"><span class="lead-step-tag">'+LC.step3Tag+'</span><h2 class="lead-step-title">'+LC.step3Title+'</h2><p class="lead-step-desc">'+LC.step3Desc+'</p></div>';
  h+='<div class="lead-confirm-summary" id="lf-summary"></div>';
  h+='<div class="lead-form-row"><label>'+LC.lblCaptcha+'</label><div class="lead-captcha-row"><span class="lead-captcha-q">'+a+' + '+b+' = </span><input id="lf-captcha" class="lead-fi" type="number" inputmode="numeric" style="max-width:140px;" autocomplete="off"></div></div>';
  h+='<div style="position:absolute;left:-9999px;height:0;overflow:hidden;" aria-hidden="true"><input id="lf-website" name="website" tabindex="-1" autocomplete="off"></div>';
  h+='<div id="lf-error-3" class="lead-form-error" hidden></div>';
  h+='<div class="lead-step-foot">';
  h+='<button class="btn lead-step-back" onclick="prevLeadStep(3)">'+LC.btnBack+'</button>';
  h+='<button class="btn btn-primary lead-step-btn lead-submit-btn" onclick="submitPublicLead(this)">'+LC.btnSubmit+'</button>';
  h+='</div>';
  h+='</div>';
  h+='</div>';
  h+='</div>';
  // Proof / case studies
  h+='<div class="lead-proof-section">';
  h+='<div class="lead-proof-head"><div><div class="lead-proof-eyebrow">'+LC.proofEyebrow+'</div><h2 class="lead-proof-title">'+LC.proofTitle+'</h2></div><p class="lead-proof-sub">'+LC.proofSub+'</p></div>';
  h+='<div class="lead-proof-grid">';
  LC.proofCases.forEach(function(c,i){
    h+='<div class="lead-proof-card'+(i<3?' featured':'')+'">';
    h+='<div class="lead-proof-brand">'+esc(c.brand)+'</div>';
    h+='<div class="lead-proof-tag">'+esc(c.tag)+'</div>';
    h+='<div class="lead-proof-metric">'+esc(c.metric)+'</div>';
    h+='<div class="lead-proof-desc">'+esc(c.desc)+'</div>';
    if(c.img){
      h+='<button type="button" class="lead-proof-thumb" onclick="openLeadProofImg('+i+')" aria-label="Xem ảnh chi tiết '+esc(c.brand)+'">';
      h+='<img src="'+esc(c.img)+'" alt="'+esc(c.brand)+'" loading="lazy">';
      h+='<span class="lead-proof-thumb-zoom">🔍 Xem ảnh</span>';
      h+='</button>';
    }
    h+='</div>';
  });
  h+='</div>';
  h+='<div class="lead-proof-footer">'+LC.proofFooter+'</div>';
  h+='</div>';
  // Bottom CTA bar
  h+='<div class="lead-cta-bar">';
  h+='<div class="lead-cta-icon">🎁</div>';
  h+='<div class="lead-cta-text"><div class="lead-cta-title">'+LC.ctaTitle+'</div><div class="lead-cta-sub">'+LC.ctaSub+'</div></div>';
  h+='</div>';
  h+='<div class="lead-footer-mini">'+LC.footerText+' <a href="tel:'+LC.hotlineTel+'" style="color:var(--blue-tx);font-weight:600;">'+LC.hotline+'</a></div>';
  h+='</div>';
  // Floating Zalo chat FAB
  h+='<a href="'+esc(LC.zaloUrl)+'" target="_blank" rel="noopener" class="lead-zalo-fab" aria-label="Chat Zalo với chuyên gia">';
  h+='<span class="lead-zalo-fab-icon"><svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 4C9.4 4 4 8.5 4 14c0 3 1.7 5.7 4.4 7.5L7 28l5-2.7c1.2.3 2.5.4 4 .4 6.6 0 12-4.5 12-10S22.6 4 16 4z" fill="#0068FF"/><text x="16" y="18" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="8.5" font-weight="900" fill="#fff" letter-spacing="-0.5">Zalo</text></svg></span>';
  h+='<span class="lead-zalo-fab-text"><b>Nhắn tin Zalo</b><small>Tư vấn 1:1 trong vài phút</small></span>';
  h+='</a>';
  document.getElementById('page').innerHTML=h;
}
var leadProofLightboxIdx=-1;
function openLeadProofImg(idx){
  var cases=(window.LEAD_COPY||{}).proofCases||[];
  if(!cases[idx]||!cases[idx].img)return;
  leadProofLightboxIdx=idx;
  closeLeadProofImg();
  var c=cases[idx];
  var box=document.createElement('div');
  box.className='lead-proof-lightbox';
  box.id='lead-proof-lightbox';
  box.onclick=function(e){if(e.target===box)closeLeadProofImg();};
  box.innerHTML=
    '<button type="button" class="lead-proof-lightbox-close" onclick="closeLeadProofImg()" aria-label="Đóng">✕</button>'+
    (cases.length>1?'<button type="button" class="lead-proof-lightbox-nav prev" onclick="navLeadProofImg(-1)" aria-label="Ảnh trước">‹</button>':'')+
    (cases.length>1?'<button type="button" class="lead-proof-lightbox-nav next" onclick="navLeadProofImg(1)" aria-label="Ảnh sau">›</button>':'')+
    '<img class="lead-proof-lightbox-img" src="'+esc(c.img)+'" alt="'+esc(c.brand)+'">'+
    '<div class="lead-proof-lightbox-caption">'+esc(c.brand)+' — '+esc(c.metric)+'</div>';
  document.body.appendChild(box);
  document.body.style.overflow='hidden';
  document.addEventListener('keydown',leadProofKeyHandler);
}
function closeLeadProofImg(){
  var el=document.getElementById('lead-proof-lightbox');
  if(el)el.remove();
  document.body.style.overflow='';
  document.removeEventListener('keydown',leadProofKeyHandler);
}
function navLeadProofImg(dir){
  var cases=(window.LEAD_COPY||{}).proofCases||[];
  var withImg=cases.map(function(c,i){return c.img?i:-1;}).filter(function(i){return i>=0;});
  if(!withImg.length)return;
  var pos=withImg.indexOf(leadProofLightboxIdx);
  if(pos<0)pos=0;
  pos=(pos+dir+withImg.length)%withImg.length;
  openLeadProofImg(withImg[pos]);
}
function leadProofKeyHandler(e){
  if(e.key==='Escape')closeLeadProofImg();
  else if(e.key==='ArrowLeft')navLeadProofImg(-1);
  else if(e.key==='ArrowRight')navLeadProofImg(1);
}
function setLeadStepActive(step){
  publicLeadFormCurrentStep=step;
  document.querySelectorAll('.lead-process-step').forEach(function(el){
    var s=parseInt(el.dataset.step);
    el.classList.toggle('active',s===step);
    el.classList.toggle('complete',s<step);
  });
  document.querySelectorAll('.lead-step').forEach(function(el){
    var s=parseInt(el.dataset.step);
    el.classList.toggle('lead-step-active',s===step);
  });
}
function validateLeadStep(step){
  var errEl=document.getElementById('lf-error-'+step);
  function showErr(msg){if(errEl){errEl.textContent=msg;errEl.hidden=false;}}
  function clearErr(){if(errEl)errEl.hidden=true;}
  clearErr();
  if(step===1){
    var name=document.getElementById('lf-name').value.trim();
    var phone=document.getElementById('lf-phone').value.trim();
    var industry=document.getElementById('lf-industry').value;
    if(!name){showErr(LEAD_COPY.errName);return false;}
    var cleanPhone=phone.replace(/\D/g,'');
    if(cleanPhone.length<9||cleanPhone.length>11){showErr(LEAD_COPY.errPhone);return false;}
    if(!industry){showErr(LEAD_COPY.errIndustry);return false;}
    return true;
  }
  if(step===2){
    var anyService=document.querySelectorAll('.lf-service:checked').length>0;
    if(!anyService){showErr(LEAD_COPY.errService);return false;}
    return true;
  }
  return true;
}
function nextLeadStep(currentStep){
  if(!validateLeadStep(currentStep))return;
  var nextEl=document.getElementById('lead-step-'+(currentStep+1));
  if(nextEl){
    setLeadStepActive(currentStep+1);
    if(currentStep+1===3)updateLeadSummary();
    setTimeout(function(){nextEl.scrollIntoView({behavior:'smooth',block:'start'});},80);
  }
}
function prevLeadStep(currentStep){
  var prevEl=document.getElementById('lead-step-'+(currentStep-1));
  if(prevEl){
    setLeadStepActive(currentStep-1);
    setTimeout(function(){prevEl.scrollIntoView({behavior:'smooth',block:'start'});},80);
  }
}
function updateLeadSummary(){
  var name=document.getElementById('lf-name').value.trim();
  var phone=document.getElementById('lf-phone').value.trim();
  var industry=document.getElementById('lf-industry').value;
  var budgetEl=document.querySelector('input[name="lf-budget"]:checked');
  var budget=budgetEl?budgetEl.value:'Chưa chọn';
  var services=[];
  document.querySelectorAll('.lf-service:checked').forEach(function(el){
    var titleEl=el.closest('.lead-service-tile').querySelector('.lead-service-title');
    if(titleEl)services.push(titleEl.textContent);
  });
  var msg=document.getElementById('lf-message').value.trim();
  var sumEl=document.getElementById('lf-summary');
  if(sumEl){
    var html='';
    var LC=LEAD_COPY;
    html+='<div class="lead-sum-row"><span>'+LC.sumName+'</span><b>'+esc(name||'—')+'</b></div>';
    html+='<div class="lead-sum-row"><span>'+LC.sumPhone+'</span><b>'+esc(phone||'—')+'</b></div>';
    html+='<div class="lead-sum-row"><span>'+LC.sumIndustry+'</span><b>'+esc(industry||'—')+'</b></div>';
    html+='<div class="lead-sum-row"><span>'+LC.sumBudget+'</span><b>'+esc(budget)+'</b></div>';
    html+='<div class="lead-sum-row"><span>'+LC.sumService+'</span><b>'+esc(services.join(', ')||'—')+'</b></div>';
    if(msg)html+='<div class="lead-sum-row"><span>'+LC.sumMsg+'</span><b>'+esc(msg)+'</b></div>';
    sumEl.innerHTML=html;
  }
}
async function submitPublicLead(btn){
  var get=function(id){var el=document.getElementById(id);return el?el.value.trim():'';};
  var errEl=document.getElementById('lf-error');
  function showErr(msg){if(errEl){errEl.textContent=msg;errEl.hidden=false;errEl.scrollIntoView({behavior:'smooth',block:'center'});}}
  function clearErr(){if(errEl)errEl.hidden=true;}
  clearErr();
  // Honeypot — bot điền field này → giả vờ thành công
  if(get('lf-website')){showLeadFormSuccess({duplicate:false,silent:true});return;}
  var name=get('lf-name'),phone=get('lf-phone');
  if(!name){showErr(LEAD_COPY.errName);return;}
  var cleanPhone=phone.replace(/\D/g,'');
  if(cleanPhone.length<9||cleanPhone.length>11){showErr(LEAD_COPY.errPhone);return;}
  var captchaAns=parseInt(get('lf-captcha'));
  if(isNaN(captchaAns)||captchaAns!==publicLeadFormCaptcha){showErr(LEAD_COPY.errCaptcha);return;}
  var services=[];
  document.querySelectorAll('.lf-service:checked').forEach(function(el){services.push(el.value);});
  if(!services.length)services=['fb_ads'];
  var budgetEl=document.querySelector('input[name="lf-budget"]:checked');
  var budget=budgetEl?budgetEl.value:'';
  btn.disabled=true;btn.textContent=LEAD_COPY.btnSending;
  try{
    var r=await sb2.rpc('submit_public_lead',{p_data:{name:name,phone:phone,zalo:get('lf-zalo'),email:get('lf-email'),industry:get('lf-industry'),monthly_budget:budget,services:services,message:get('lf-message'),source:publicLeadFormSource}});
    if(r.error){
      var msg=String(r.error.message||r.error);
      if(/function .* does not exist/i.test(msg)||/Could not find the function/i.test(msg)){
        showErr(LEAD_COPY.errSystem);
      }else if(/P0001/.test(JSON.stringify(r.error))||msg.indexOf('không hợp lệ')>=0||msg.indexOf('Vui lòng')>=0){
        showErr(msg.replace(/^[^:]*:\s*/,''));
      }else{
        showErr('Lỗi: '+msg);
      }
      btn.disabled=false;btn.textContent=LEAD_COPY.btnSubmitRetry;
      return;
    }
    showLeadFormSuccess(r.data||{});
  }catch(e){
    showErr('Lỗi kết nối: '+e.message);
    btn.disabled=false;btn.textContent='📨 Gửi thông tin tư vấn';
  }
}
function showLeadFormSuccess(result){
  var dup=result&&result.duplicate;
  var h='<div class="lead-page-wrap">';
  h+='<div class="lead-success-v2">';
  // Animated check
  h+='<div class="lead-succ-icon-wrap">';
  h+='<div class="lead-succ-ring"></div>';
  h+='<div class="lead-succ-check"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>';
  h+='</div>';
  var LC=LEAD_COPY;
  // Headline
  h+='<h1 class="lead-succ-h">'+(dup?LC.succTitleDup:LC.succTitleNew)+'</h1>';
  h+='<p class="lead-succ-sub">'+(dup?LC.succSubDup:LC.succSubNew)+'</p>';
  // Timeline
  h+='<div class="lead-timeline">';
  h+='<div class="lead-timeline-title">'+LC.timelineTitle+'</div>';
  h+='<div class="lead-timeline-row"><div class="lead-timeline-icon icon-1"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><div class="lead-timeline-time">'+LC.tl1Time+'</div><div class="lead-timeline-desc">'+LC.tl1Desc+'</div></div>';
  h+='<div class="lead-timeline-row"><div class="lead-timeline-icon icon-2"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 16l4-6 4 4 5-7"/></svg></div><div class="lead-timeline-time">'+LC.tl2Time+'</div><div class="lead-timeline-desc">'+LC.tl2Desc+'</div></div>';
  h+='<div class="lead-timeline-row"><div class="lead-timeline-icon icon-3"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg></div><div class="lead-timeline-time">'+LC.tl3Time+'</div><div class="lead-timeline-desc">'+LC.tl3Desc+'</div></div>';
  h+='</div>';
  // CTAs
  h+='<div class="lead-succ-cta-label">'+LC.ctaUrgent+'</div>';
  h+='<div class="lead-succ-cta-grid">';
  h+='<a href="'+LC.zaloUrl+'" target="_blank" rel="noopener" class="lead-succ-cta-card lead-succ-cta-zalo">';
  h+='<div class="lead-succ-cta-icon"><svg width="34" height="34" viewBox="0 0 32 32"><path d="M16 4C9.4 4 4 8.5 4 14c0 3 1.7 5.7 4.4 7.5L7 28l5-2.7c1.2.3 2.5.4 4 .4 6.6 0 12-4.5 12-10S22.6 4 16 4z" fill="#fff"/><text x="16" y="18" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="8.5" font-weight="900" fill="#0068FF" letter-spacing="-0.5">Zalo</text></svg></div>';
  h+='<div class="lead-succ-cta-stack"><div class="lead-succ-cta-title">'+LC.zaloLabel+'</div><div class="lead-succ-cta-meta">'+LC.zaloMeta+'</div></div>';
  h+='<div class="lead-succ-cta-arrow">→</div>';
  h+='</a>';
  h+='<a href="tel:'+LC.hotlineTel+'" class="lead-succ-cta-card lead-succ-cta-phone">';
  h+='<div class="lead-succ-cta-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg></div>';
  h+='<div class="lead-succ-cta-stack"><div class="lead-succ-cta-title">'+LC.callLabel+'</div><div class="lead-succ-cta-meta">'+LC.callMeta+'</div></div>';
  h+='<div class="lead-succ-cta-arrow">→</div>';
  h+='</a>';
  h+='</div>';
  // Trust footer
  h+='<div class="lead-succ-secure"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> '+LC.succSecure+'</div>';
  h+='</div>';
  h+='</div>';
  document.getElementById('page').innerHTML=h;
}

// ═══ RENDER MODAL: TẠO KHÁCH TIỀM NĂNG ═══
function renderNewProspectModal(){
  if(!newProspectModalOpen)return '';
  var h='<div class="hc-modal-backdrop" onclick="if(event.target===this)closeNewProspectModal()">';
  h+='<div class="hc-modal" role="dialog" aria-modal="true" aria-labelledby="np-modal-title" style="max-width:720px;">';
  h+='<div class="hc-modal-head"><h3 id="np-modal-title">Thêm khách tiềm năng</h3><button class="hc-modal-close" aria-label="Đóng" onclick="closeNewProspectModal()">×</button></div>';
  h+='<div class="hc-modal-body">';
  h+='<p style="font-size:12px;color:var(--tx3);margin-bottom:14px;">Khách tiềm năng sẽ <strong>không xuất hiện</strong> trong báo cáo chi tiêu, cảnh báo hay bảng lương. Sau khi ký, bạn có thể chuyển thành khách chính thức bằng 1 click.</p>';
  h+='<div class="hc-form-grid">';
  h+='<div><label>Tên viết tắt <span style="color:var(--red);">*</span></label><input id="np-name" placeholder="VD: HOHA" class="fi"></div>';
  h+='<div><label>Mã viết tắt (dùng cho số Hợp đồng)</label><input id="np-prefix" placeholder="VD: HOHA" class="fi" style="text-transform:uppercase;"></div>';
  h+='<div style="grid-column:1/-1;"><label>Tên công ty đầy đủ</label><input id="np-company-full" placeholder="VD: CÔNG TY CỔ PHẦN ABC" class="fi"></div>';
  h+='<div style="grid-column:1/-1;"><label>Địa chỉ</label><input id="np-address" class="fi"></div>';
  h+='<div><label>Mã số thuế</label><input id="np-tax" class="fi"></div>';
  h+='<div><label>Điện thoại</label><input id="np-phone" class="fi"></div>';
  h+='<div><label>Email nhận hóa đơn</label><input id="np-email" class="fi"></div>';
  h+='<div><label>Người liên hệ</label><input id="np-contact" class="fi"></div>';
  h+='<div><label>Đại diện (Ông/Bà)</label><select id="np-rep-sal" class="fi"><option>Ông</option><option>Bà</option></select></div>';
  h+='<div><label>Tên người đại diện</label><input id="np-rep-name" class="fi"></div>';
  h+='<div><label>Chức vụ</label><input id="np-rep-title" value="Giám đốc" class="fi"></div>';
  h+='<div><label>Ngành nghề (đưa vào Hợp đồng)</label><input id="np-industry" placeholder="VD: chế biến sữa" class="fi"></div>';
  h+='<div><label>Zalo (số phone / username / link)</label><input id="np-zalo" placeholder="0912345678 hoặc quanglx hoặc link đầy đủ" class="fi"></div>';
  h+='<div style="grid-column:1/-1;"><label>Dịch vụ quan tâm <span style="color:var(--tx3);font-weight:400;">(tick nhiều mục)</span></label><div style="display:flex;flex-wrap:wrap;gap:10px;padding:8px 10px;border:1px solid var(--bd2);border-radius:var(--radius);background:var(--bg2);">';
  Object.keys(SERVICES).forEach(function(code){var s=SERVICES[code];var dotC=SERVICE_DOT_COLORS[s.color]||'#888780';h+='<label style="display:inline-flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:0;color:var(--tx1);"><input type="checkbox" class="np-service" value="'+code+'"'+(code==='fb_ads'?' checked':'')+' onchange="toggleNpRentalRow()" style="accent-color:var(--blue);"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:'+dotC+';"></span>'+esc(s.name)+'</label>';});
  h+='</div></div>';
  h+='<div id="np-rental-row" style="grid-column:1/-1;display:none;"><label>% Phí thuê TKQC <span style="color:var(--tx3);font-weight:400;text-transform:none;">(VD: 3 = 3% spend, thường 3-4%)</span></label><div style="display:flex;align-items:center;gap:8px;"><input id="np-rental-pct" class="fi" type="number" step="0.1" min="0" max="20" placeholder="VD: 3 hoặc 4" style="max-width:160px;"><span style="font-size:13px;color:var(--tx2);">%</span><span style="font-size:11px;color:var(--tx3);margin-left:8px;">Phí dịch vụ tháng = % × Spend (tự động cập nhật)</span></div></div>';
  h+='<div><label>Trạng thái chăm sóc</label><select id="np-care" class="fi">';
  CARE_ORDER.forEach(function(k){h+='<option value="'+k+'"'+(k==='new'?' selected':'')+'>'+esc(CARE_STATUS[k].name)+'</option>';});
  h+='</select></div>';
  h+='<div style="grid-column:1/-1;"><label>Ghi chú (nguồn lead, follow-up…)</label><input id="np-note" class="fi"></div>';
  h+='</div>';
  h+='</div>';
  h+='<div class="hc-modal-foot"><button class="btn" onclick="closeNewProspectModal()">Hủy</button><button class="btn btn-primary" onclick="saveNewProspect(this)">Lưu khách tiềm năng</button></div>';
  h+='</div></div>';
  return h;
}

// ═══ RENDER MODAL: TẠO KHÁCH CHÍNH THỨC ═══
function renderNewActiveClientModal(){
  if(!newActiveClientModalOpen)return '';
  var today=new Date().toISOString().substring(0,10);
  var h='<div class="hc-modal-backdrop" onclick="if(event.target===this)closeNewActiveClientModal()">';
  h+='<div class="hc-modal" role="dialog" aria-modal="true" aria-labelledby="nac-modal-title" style="max-width:720px;">';
  h+='<div class="hc-modal-head"><h3 id="nac-modal-title">Thêm khách chính thức</h3><button class="hc-modal-close" aria-label="Đóng" onclick="closeNewActiveClientModal()">×</button></div>';
  h+='<div class="hc-modal-body">';
  h+='<p style="font-size:12px;color:var(--tx3);margin-bottom:14px;">Khách chính thức xuất hiện ngay trong báo cáo chi tiêu, bảng lương và phiếu thanh toán. Ngày bắt đầu dùng để tính 90 ngày hoa hồng cho nhân sự.</p>';
  h+='<div class="hc-form-grid">';
  h+='<div><label>Tên viết tắt <span style="color:var(--red);">*</span></label><input id="nac-name" placeholder="VD: HOHA" class="fi"></div>';
  h+='<div><label>Mã viết tắt (dùng cho số Hợp đồng)</label><input id="nac-prefix" placeholder="VD: HOHA" class="fi" style="text-transform:uppercase;"></div>';
  h+='<div><label>Ngày bắt đầu <span style="color:var(--tx3);font-weight:400;text-transform:none;">(tính 90 ngày hoa hồng)</span></label><input id="nac-start-date" type="date" value="'+today+'" class="fi"></div>';
  h+='<div><label>Phí dịch vụ/tháng (VNĐ)</label><input id="nac-fee" type="number" min="0" placeholder="VD: 4000000" class="fi"></div>';
  h+='<div style="grid-column:1/-1;"><label>Tên công ty đầy đủ</label><input id="nac-company-full" placeholder="VD: CÔNG TY CỔ PHẦN ABC" class="fi"></div>';
  h+='<div style="grid-column:1/-1;"><label>Địa chỉ</label><input id="nac-address" class="fi"></div>';
  h+='<div><label>Mã số thuế</label><input id="nac-tax" class="fi"></div>';
  h+='<div><label>Điện thoại</label><input id="nac-phone" class="fi"></div>';
  h+='<div><label>Email nhận hóa đơn</label><input id="nac-email" class="fi"></div>';
  h+='<div><label>Người liên hệ</label><input id="nac-contact" class="fi"></div>';
  h+='<div><label>Đại diện (Ông/Bà)</label><select id="nac-rep-sal" class="fi"><option>Ông</option><option>Bà</option></select></div>';
  h+='<div><label>Tên người đại diện</label><input id="nac-rep-name" class="fi"></div>';
  h+='<div><label>Chức vụ</label><input id="nac-rep-title" value="Giám đốc" class="fi"></div>';
  h+='<div><label>Ngành nghề (đưa vào Hợp đồng)</label><input id="nac-industry" placeholder="VD: chế biến sữa" class="fi"></div>';
  h+='<div><label>Zalo (số phone / username / link)</label><input id="nac-zalo" placeholder="0912345678 hoặc quanglx" class="fi"></div>';
  h+='<div><label>VAT</label><div style="padding:8px 10px;border:1px solid var(--bd2);border-radius:var(--radius);background:var(--bg2);"><label style="display:inline-flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:0;color:var(--tx1);"><input type="checkbox" id="nac-vat" style="accent-color:var(--blue);">Có VAT 8%</label></div></div>';
  h+='<div style="grid-column:1/-1;"><label>Dịch vụ <span style="color:var(--tx3);font-weight:400;">(tick nhiều mục)</span></label><div style="display:flex;flex-wrap:wrap;gap:10px;padding:8px 10px;border:1px solid var(--bd2);border-radius:var(--radius);background:var(--bg2);">';
  Object.keys(SERVICES).forEach(function(code){var s=SERVICES[code];var dotC=SERVICE_DOT_COLORS[s.color]||'#888780';h+='<label style="display:inline-flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;font-weight:400;text-transform:none;letter-spacing:0;color:var(--tx1);"><input type="checkbox" class="nac-service" value="'+code+'"'+(code==='fb_ads'?' checked':'')+' onchange="toggleNacRentalRow()" style="accent-color:var(--blue);"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:'+dotC+';"></span>'+esc(s.name)+'</label>';});
  h+='</div></div>';
  h+='<div id="nac-rental-row" style="grid-column:1/-1;display:none;"><label>% Phí thuê TKQC <span style="color:var(--tx3);font-weight:400;text-transform:none;">(VD: 3 = 3% spend, thường 3-4%)</span></label><div style="display:flex;align-items:center;gap:8px;"><input id="nac-rental-pct" class="fi" type="number" step="0.1" min="0" max="20" placeholder="VD: 3 hoặc 4" style="max-width:160px;"><span style="font-size:13px;color:var(--tx2);">%</span><span style="font-size:11px;color:var(--tx3);margin-left:8px;">Phí dịch vụ tháng = % × Spend</span></div></div>';
  h+='</div>';
  h+='</div>';
  h+='<div class="hc-modal-foot"><button class="btn" onclick="closeNewActiveClientModal()">Hủy</button><button class="btn btn-primary" onclick="saveNewActiveClient(this)">Lưu khách chính thức</button></div>';
  h+='</div></div>';
  return h;
}

// ═══ RENDER MODAL: XUẤT HỢP ĐỒNG ═══
function renderContractModal(){
  if(!contractModalClientId)return '';
  var c=clientList.find(function(x){return x.id===contractModalClientId;});
  if(!c)return '';
  var h='<div class="hc-modal-backdrop" onclick="if(event.target===this)closeContractModal()">';
  h+='<div class="hc-modal" role="dialog" aria-modal="true" aria-labelledby="ct-modal-title" style="max-width:900px;">';
  h+='<div class="hc-modal-head"><h3 id="ct-modal-title">Xuất hợp đồng — '+esc(c.name)+'</h3><button class="hc-modal-close" aria-label="Đóng" onclick="closeContractModal()">×</button></div>';
  h+='<div class="hc-modal-body">';
  h+='<div style="background:var(--blue-bg);border:1px solid var(--blue);color:var(--blue-tx);padding:10px 12px;border-radius:var(--radius);font-size:12px;margin-bottom:14px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:6px;flex-shrink:0;"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>Chỉnh sửa các trường dưới đây trước khi tải. Sau khi tải, thông tin sẽ được <strong>lưu làm mặc định</strong> cho lần xuất tiếp theo.</div>';
  h+='<details open><summary style="font-weight:600;cursor:pointer;margin-bottom:10px;">📋 Thông tin hợp đồng</summary>';
  h+='<div class="hc-form-grid">';
  h+='<div><label>Số hợp đồng</label><input id="ct-number" class="fi"></div>';
  h+='<div><label>Ngày ký</label><input id="ct-date" type="date" class="fi"></div>';
  h+='<div><label>Địa điểm ký</label><input id="ct-location" class="fi"></div>';
  h+='<div><label>Thời hạn (tháng)</label><input id="ct-duration" type="number" min="1" max="12" class="fi"></div>';
  h+='<div><label>Ngày thanh toán hàng tháng</label><input id="ct-payment-day" type="number" min="1" max="31" class="fi"></div>';
  h+='<div><label>Mã viết tắt (Hợp đồng)</label><input id="ct-prefix" style="text-transform:uppercase;" class="fi"></div>';
  h+='</div></details>';
  h+='<details open style="margin-top:14px;"><summary style="font-weight:600;cursor:pointer;margin-bottom:10px;">🏢 Thông tin Bên A (Khách hàng)</summary>';
  h+='<div class="hc-form-grid">';
  h+='<div style="grid-column:1/-1;"><label>Tên công ty đầy đủ</label><input id="ct-company-full" class="fi"></div>';
  h+='<div style="grid-column:1/-1;"><label>Địa chỉ</label><input id="ct-address" class="fi"></div>';
  h+='<div><label>Mã số thuế</label><input id="ct-tax" class="fi"></div>';
  h+='<div><label>Điện thoại</label><input id="ct-phone" class="fi"></div>';
  h+='<div style="grid-column:1/-1;"><label>Email nhận hóa đơn</label><input id="ct-email" class="fi"></div>';
  h+='<div><label>Đại diện (Ông/Bà)</label><select id="ct-rep-sal" class="fi"><option>Ông</option><option>Bà</option></select></div>';
  h+='<div><label>Họ tên đại diện</label><input id="ct-rep-name" class="fi"></div>';
  h+='<div><label>Chức vụ</label><input id="ct-rep-title" class="fi"></div>';
  h+='<div><label>Ngành nghề (cho Điều 1)</label><input id="ct-industry" class="fi"></div>';
  h+='</div></details>';
  h+='<details open style="margin-top:14px;"><summary style="font-weight:600;cursor:pointer;margin-bottom:10px;">💰 Ngân sách & KPI (Điều 2 & 4)</summary>';
  h+='<div class="hc-form-grid">';
  h+='<div><label>Ngân sách tối thiểu/tháng (VNĐ)</label><input id="ct-budget-min" type="number" class="fi"></div>';
  h+='<div><label>Ngân sách tối đa/tháng (VNĐ)</label><input id="ct-budget-max" type="number" class="fi"></div>';
  h+='<div><label>KPI tin nhắn min (VNĐ)</label><input id="ct-kpi-mess-min" type="number" class="fi"></div>';
  h+='<div><label>KPI tin nhắn max (VNĐ)</label><input id="ct-kpi-mess-max" type="number" class="fi"></div>';
  h+='<div><label>KPI lead min (VNĐ)</label><input id="ct-kpi-lead-min" type="number" class="fi"></div>';
  h+='<div><label>KPI lead max (VNĐ)</label><input id="ct-kpi-lead-max" type="number" class="fi"></div>';
  h+='</div></details>';
  h+='</div>';
  h+='<div class="hc-modal-foot" style="gap:8px;flex-wrap:wrap;">';
  h+='<button class="btn" onclick="closeContractModal()">Đóng</button>';
  h+='<button class="btn" onclick="printContract()" title="Mở tab in để Ctrl+P lưu PDF">🖨️ In</button>';
  h+='<button class="btn" onclick="exportContractPdf(this)">📕 Tải PDF</button>';
  h+='<button class="btn btn-primary" onclick="exportContractDocx(this)">📄 Tải Word (.docx)</button>';
  h+='</div>';
  h+='</div></div>';
  return h;
}

// ═══ RENDER MODAL: LỊCH SỬ HỢP ĐỒNG ═══
function renderContractHistoryModal(){
  if(!contractHistoryClientId)return '';
  var c=clientList.find(function(x){return x.id===contractHistoryClientId;});
  if(!c)return '';
  var ctrs=contractList.filter(function(x){return x.client_id===contractHistoryClientId;});
  var h='<div class="hc-modal-backdrop" onclick="if(event.target===this)closeContractHistory()">';
  h+='<div class="hc-modal" role="dialog" aria-modal="true" aria-labelledby="ch-modal-title" style="max-width:760px;">';
  h+='<div class="hc-modal-head"><h3 id="ch-modal-title">Lịch sử hợp đồng — '+esc(c.name)+'</h3><button class="hc-modal-close" aria-label="Đóng" onclick="closeContractHistory()">×</button></div>';
  h+='<div class="hc-modal-body">';
  if(!ctrs.length){h+='<div class="empty-state" role="status"><div class="empty-state-icon" aria-hidden="true">📄</div><div class="empty-state-title">Chưa có hợp đồng nào với khách này</div><div class="empty-state-desc">Tạo hợp đồng từ tab "Thêm hợp đồng" hoặc từ phiếu báo giá đã duyệt để lịch sử hiển thị tại đây.</div></div>';}
  else{
    h+='<div class="table-wrap"><table><thead><tr><th>Số Hợp đồng</th><th>Ngày ký</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>';
    ctrs.forEach(function(ct){
      var st=ct.status||'draft';
      var stBadge={draft:'b-gray',sent:'b-blue',signed:'b-green',rejected:'b-red',expired:'b-amber'}[st]||'b-gray';
      var stLabel={draft:'Nháp',sent:'Đã gửi',signed:'Đã ký',rejected:'Từ chối',expired:'Hết hạn'}[st]||st;
      h+='<tr>';
      h+='<td style="font-family:monospace;font-size:12px;">'+esc(ct.contract_number)+'</td>';
      h+='<td>'+esc(ct.contract_date||'')+'</td>';
      h+='<td><select class="fi" style="font-size:11px;padding:3px 6px;" onchange="updateContractStatus(\''+ct.id+'\',this.value)"><option value="draft"'+(st==='draft'?' selected':'')+'>Nháp</option><option value="sent"'+(st==='sent'?' selected':'')+'>Đã gửi</option><option value="signed"'+(st==='signed'?' selected':'')+'>Đã ký</option><option value="rejected"'+(st==='rejected'?' selected':'')+'>Từ chối</option><option value="expired"'+(st==='expired'?' selected':'')+'>Hết hạn</option></select></td>';
      h+='<td><button class="btn btn-sm" onclick="reExportContractDocx(\''+ct.id+'\',this)">Tải lại</button> <button class="btn btn-sm btn-red" onclick="deleteContract(\''+ct.id+'\')">Xóa</button></td>';
      h+='</tr>';
    });
    h+='</tbody></table></div>';
  }
  h+='</div>';
  h+='<div class="hc-modal-foot"><button class="btn" onclick="closeContractHistory()">Đóng</button></div>';
  h+='</div></div>';
  return h;
}

// ═══ A4: THU CHI ═══
async function svt(btn){if(!needAuth())return;btn.disabled=true;var d=document.getElementById('td2').value,tp=document.getElementById('tt').value,v=parseInt(document.getElementById('tv').value)||0,cat=document.getElementById('tc').value,ci=document.getElementById('tk').value||null,si=document.getElementById('tn').value||null,no=document.getElementById('tno').value;if(!v){toast('Vui lòng nhập số tiền giao dịch.',false);btn.disabled=false;return;}var r=await sb2.from('transaction').insert({txn_date:d,txn_type:tp,amount:v,category:cat,client_id:ci,staff_id:si,note:no,month:d.substring(0,7),source:'manual'});btn.disabled=false;if(r.error)toast('Lỗi: '+r.error.message,false);else{toast('Đã lưu',true);document.getElementById('tv').value='';document.getElementById('tno').value='';await loadLight();}}
async function dlt(btn,id){
  if(!needAuth())return;
  var t=txnData.find(function(x){return x.id===id;});
  var label=t?(t.txn_type==='income'?'Thu':'Chi')+' '+ff(t.amount)+'đ ngày '+fd(t.txn_date):'giao dịch';
  if(!(await hcConfirm({title:'Xóa giao dịch',message:'Xóa '+label+'? Thao tác này không thể hoàn tác.',confirmLabel:'Xóa giao dịch',danger:true})))return;
  btn.disabled=true;btn.classList.add('is-loading');
  var r=await sb2.from('transaction').delete().eq('id',id);
  if(r.error){errToast('xóa giao dịch',r.error);btn.disabled=false;btn.classList.remove('is-loading');}
  else{toast('Đã xóa '+label.toLowerCase(),true);await loadLight();}
}

// ═══ A5: LƯƠNG ═══

// ═══ HANDLERS BẢNG LƯƠNG TỰ ĐỘNG ═══
function toggleSalaryExpand(staffId){
expandedSalaryStaffId=(expandedSalaryStaffId===staffId)?null:staffId;render();}

// Format số có dấu chấm ngàn khi nhập (4000000 → 4.000.000), giữ vị trí con trỏ
function fmtSalaryInput(el,staffId,field){
var raw=(el.value||'').replace(/\D/g,'');
var num=parseInt(raw)||0;
var caret=el.selectionStart||0;
var digitsBefore=((el.value||'').slice(0,caret).match(/\d/g)||[]).length;
var formatted=num?num.toLocaleString('vi-VN'):'';
el.value=formatted;
if(digitsBefore>0){
var newCaret=0,seen=0;
for(var i=0;i<formatted.length;i++){if(/\d/.test(formatted[i]))seen++;newCaret=i+1;if(seen>=digitsBefore)break;}
try{el.setSelectionRange(newCaret,newCaret);}catch(e){}
}
onSalaryEdit(staffId,field,String(num));
}

// Autosave debounce 800ms khi user sửa lương cứng/thưởng/ghi chú
function onSalaryEdit(staffId,field,value){
var key=staffId+'|'+salaryMonth;
if(salarySaveTimers[key])clearTimeout(salarySaveTimers[key]);
// Lưu pending value vào 1 map tạm (merge với state hiện tại)
if(!window._salaryPending)window._salaryPending={};
if(!window._salaryPending[key])window._salaryPending[key]={};
window._salaryPending[key][field]=value;
salarySaveTimers[key]=setTimeout(function(){saveSalaryRow(staffId).catch(function(e){console.warn('[salary save]',e);});},800);}

async function saveSalaryRow(staffId){
if(!needAuth())return;
var key=staffId+'|'+salaryMonth;
var pending=(window._salaryPending&&window._salaryPending[key])||{};
var staff=staffList.find(function(s){return s.id===staffId;});if(!staff)return;
var isCEO=(Number(staff.default_base_salary)===0)||/hưng coaching|hung coaching|ceo/i.test((staff.full_name||'')+' '+(staff.short_name||''));
var existing=salaryData.find(function(x){return x.staff_id===staffId&&x.month===salaryMonth;});
// Hoa hồng luôn tính tự động từ data
var comm=isCEO?{total:0,detail:[]}:computeStaffCommission(staffId,salaryMonth);
// Ưu tiên giá trị pending, sau đó DB, sau đó default
var base=pending.base_salary!=null?(parseInt(pending.base_salary)||0):(existing&&existing.base_salary!=null?Number(existing.base_salary):(isCEO?0:(Number(staff.default_base_salary)||4000000)));
var bonus=pending.bonus!=null?(parseInt(pending.bonus)||0):(existing&&existing.bonus!=null?Number(existing.bonus):0);
var note=pending.note!=null?String(pending.note):(existing&&existing.note?existing.note:'');
var total=base+comm.total+bonus;
var payload={staff_id:staffId,month:salaryMonth,base_salary:base,commission:comm.total,commission_detail:comm.detail,bonus:bonus,total:total,note:note};
var r=await sb2.from('salary').upsert(payload,{onConflict:'staff_id,month'});
if(r.error){
// Fallback: nếu cột commission/commission_detail chưa tồn tại trong DB → lưu tối thiểu
if(/commission/.test(r.error.message||'')){
var fallback={staff_id:staffId,month:salaryMonth,base_salary:base,bonus:bonus+comm.total,total:total,note:note+(comm.total>0?(note?' | ':'')+'Hoa hồng: '+ff(comm.total)+'đ':'')};
var r2=await sb2.from('salary').upsert(fallback,{onConflict:'staff_id,month'});
if(r2.error){toast('Lỗi lưu lương: '+r2.error.message,false);return;}
toast('⚠ Chưa chạy migration — đã lưu ghép hoa hồng vào thưởng',true);
}else{toast('Lỗi lưu lương: '+r.error.message,false);return;}
}
delete window._salaryPending[key];
// Silent reload — không render để không mất focus input
try{var{data}=await sb2.from('salary').select('*,staff(short_name)').order('month',{ascending:false});if(data)salaryData=data;}catch(e){}}

async function recomputeAllCommissions(btn){
if(!needAuth())return;
btn.disabled=true;btn.textContent='Đang tính...';
var count=0;
for(var i=0;i<staffList.length;i++){
var s=staffList[i];
var isCEO=(Number(s.default_base_salary)===0)||/hưng coaching|hung coaching|ceo/i.test((s.full_name||'')+' '+(s.short_name||''));
if(isCEO)continue;
var comm=computeStaffCommission(s.id,salaryMonth);
var existing=salaryData.find(function(x){return x.staff_id===s.id&&x.month===salaryMonth;});
var base=existing&&existing.base_salary!=null?Number(existing.base_salary):(Number(s.default_base_salary)||4000000);
var bonus=existing&&existing.bonus!=null?Number(existing.bonus):0;
var note=existing&&existing.note?existing.note:'';
var payload={staff_id:s.id,month:salaryMonth,base_salary:base,commission:comm.total,commission_detail:comm.detail,bonus:bonus,total:base+comm.total+bonus,note:note};
var r=await sb2.from('salary').upsert(payload,{onConflict:'staff_id,month'});
if(!r.error)count++;
}
btn.disabled=false;btn.textContent='🔄 Tính lại hoa hồng';
toast('Đã tính lại hoa hồng cho '+count+' Nhân sự',true);
await loadLight();}
// ═══ A6: CÀI ĐẶT ═══
function a6Settings(){
var h='<div class="form-card"><h3>Cấu hình Meta API</h3>';
h+='<div style="padding:10px 14px;background:var(--green-bg);color:var(--green-tx);border-radius:var(--radius);font-size:12px;line-height:1.6;margin-bottom:14px;"><b>Meta access token đã được chuyển ra Vercel env</b> — không còn lộ ở trình duyệt. Mọi call Meta API đi qua proxy <code>/api/meta</code> (whitelist + JWT auth). Để đổi token, sửa biến <code>META_TOKEN</code> trong Vercel Project Settings → Environment Variables → Redeploy.</div>';
h+='<div class="form-row"><div class="form-group"><label>Business ID</label><input type="text" id="set-business-id" value="'+esc(META_BUSINESS_ID)+'" placeholder="906359547034707" style="font-family:monospace;font-size:12px;"></div><div class="form-group"><label>Global scope ID</label><input type="text" id="set-global-scope" value="'+esc(META_GLOBAL_SCOPE_ID)+'" placeholder="5673838172639075" style="font-family:monospace;font-size:12px;"></div></div>';
h+='<div class="btn-row"><button class="btn btn-primary" onclick="saveMetaSettings(this)">Lưu cài đặt</button><button class="btn btn-ghost" onclick="checkMetaTokenPermissions(this)">Kiểm tra quyền token</button></div>';
h+='<div id="token-check-result"></div>';
h+='</div>';
// AI API keys
var openaiPreview=OPENAI_KEY?('***'+OPENAI_KEY.slice(-6)):'Chưa nhập';
var claudePreview=CLAUDE_KEY?('***'+CLAUDE_KEY.slice(-6)):'Chưa nhập';
h+='<div class="form-card"><h3>Cấu hình API Key AI (HC AI)</h3>';
h+='<div style="padding:10px 14px;background:var(--amber-bg);color:var(--amber-tx);border-radius:var(--radius);font-size:12px;line-height:1.6;margin-bottom:14px;">⚠ Key lưu trong <b>localStorage của trình duyệt này</b> — không đồng bộ với máy khác. Mỗi trình duyệt/thiết bị phải cấu hình riêng để bảo mật. Xóa cache trình duyệt sẽ mất key.</div>';
h+='<div class="form-row"><div class="form-group" style="grid-column:1/-1;"><label>OpenAI API Key (dùng cho GPT-5.4)</label><div style="display:flex;gap:8px;align-items:center;"><input type="password" id="set-openai-key" value="'+esc(OPENAI_KEY)+'" placeholder="sk-proj-..." style="flex:1;font-family:monospace;font-size:12px;"><button class="btn btn-ghost btn-sm" onclick="var el=document.getElementById(\'set-openai-key\');el.type=el.type===\'password\'?\'text\':\'password\';">Hiện/Ẩn</button></div><div style="font-size:11px;color:var(--tx3);margin-top:4px;">Hiện tại: '+openaiPreview+' · <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener" style="color:var(--blue);">Lấy key tại đây ↗</a></div></div></div>';
h+='<div class="form-row"><div class="form-group" style="grid-column:1/-1;"><label>Anthropic Claude API Key (dùng cho Claude Haiku/Sonnet)</label><div style="display:flex;gap:8px;align-items:center;"><input type="password" id="set-claude-key" value="'+esc(CLAUDE_KEY)+'" placeholder="sk-ant-..." style="flex:1;font-family:monospace;font-size:12px;"><button class="btn btn-ghost btn-sm" onclick="var el=document.getElementById(\'set-claude-key\');el.type=el.type===\'password\'?\'text\':\'password\';">Hiện/Ẩn</button></div><div style="font-size:11px;color:var(--tx3);margin-top:4px;">Hiện tại: '+claudePreview+' · <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener" style="color:var(--blue);">Lấy key tại đây ↗</a></div></div></div>';
h+='<div class="btn-row"><button class="btn btn-primary" onclick="saveAIKeys(this)">Lưu API Key</button><button class="btn btn-ghost" onclick="clearAIKeys(this)">Xóa tất cả</button></div>';
h+='</div>';
// Kết nối ChatGPT Plus qua OAuth (PKCE) — dùng subscription thay vì trả tiền API
h+='<div class="form-card"><h3>Kết nối ChatGPT Plus (OAuth — miễn phí)</h3>';
h+='<div style="padding:10px 14px;background:var(--blue-bg);color:var(--blue-tx);border-radius:var(--radius);font-size:12px;line-height:1.6;margin-bottom:14px;">Dùng subscription ChatGPT Plus của anh để gọi GPT-5.4 mà không tốn token API. Token lưu server-side (Supabase), tự động refresh. <b>Lưu ý:</b> đây là endpoint nội bộ của ChatGPT, không chính thức — có rủi ro nhỏ về ToS. Cần đã login ChatGPT Plus trên trình duyệt máy local.</div>';
h+='<div id="chatgpt-oauth-status" style="margin-bottom:14px;padding:10px 14px;background:var(--bg3);border-radius:var(--radius);font-size:12px;color:var(--tx2);">Đang kiểm tra trạng thái…</div>';
h+='<div id="chatgpt-oauth-actions"></div>';
h+='</div>';
h+='<div class="form-card"><h3>Thông tin ngân hàng (phiếu thanh toán)</h3>';
h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">';
h+='<div><div style="font-size:12px;font-weight:500;color:var(--green);margin-bottom:8px;">STK doanh nghiệp (có VAT)</div>';
h+='<div style="font-size:12px;color:var(--tx2);line-height:1.8;">Ngân hàng: '+esc(BANK_PROFILES.business.bank)+'<br>STK: '+esc(BANK_PROFILES.business.accountNo)+'<br>Chủ Tài khoản: '+esc(BANK_PROFILES.business.accountName)+'</div></div>';
h+='<div><div style="font-size:12px;font-weight:500;color:var(--blue);margin-bottom:8px;">STK cá nhân (không VAT)</div>';
h+='<div style="font-size:12px;color:var(--tx2);line-height:1.8;">Ngân hàng: '+esc(BANK_PROFILES.personal.bank)+'<br>STK: '+esc(BANK_PROFILES.personal.accountNo)+'<br>Chủ Tài khoản: '+esc(BANK_PROFILES.personal.accountName)+'</div></div>';
h+='</div><div style="font-size:11px;color:var(--tx3);margin-top:10px;">Thông tin ngân hàng đang hardcode trong code. Liên hệ dev để thay đổi.</div></div>';
return h;}

// ═══ USER ROLES form — dùng trong tab Người dùng (a2). Bảng đã gộp ở trên. ═══
function renderUserRolesSection(){
var editingUR=editingUserRoleId?allUserRoles.find(function(u){return u.id===editingUserRoleId;}):null;
var formTitle=editingUR?'Cập nhật tài khoản — '+esc(editingUR.email):'Thêm tài khoản đăng nhập';
var btnLabel=editingUR?'Lưu cập nhật':'Thêm tài khoản';
var h='<div class="form-card" id="ur-form-card"><h3>'+formTitle+'</h3>';
if(editingUR){
  h+='<div style="padding:10px 14px;background:var(--amber-bg);color:var(--amber-tx);border-radius:var(--radius);font-size:12px;line-height:1.6;margin-bottom:14px;">Đang sửa quyền cho <b>'+esc(editingUR.display_name||editingUR.email)+'</b>. Email không đổi được. Mật khẩu để trống = giữ nguyên mật khẩu cũ.</div>';
}else if(pendingNewUserRoleStaffId){
  var ps=allStaff.find(function(x){return x.id===pendingNewUserRoleStaffId;});
  h+='<div style="padding:10px 14px;background:var(--green-bg);color:var(--green-tx);border-radius:var(--radius);font-size:12px;line-height:1.6;margin-bottom:14px;">Tạo tài khoản đăng nhập cho nhân sự: <b>'+(ps?esc((ps.display_code?'['+ps.display_code+'] ':'')+ps.full_name):'(không rõ)')+'</b>. Đã pre-fill ô "Gán với nhân sự" → chỉ cần điền email/mật khẩu.</div>';
}else{
  h+='<div style="padding:10px 14px;background:var(--blue-bg);color:var(--blue-tx);border-radius:var(--radius);font-size:12px;line-height:1.6;margin-bottom:14px;">Nếu email không có trong danh sách này, tài khoản sẽ mặc định là Admin (toàn quyền). Thêm email vào đây để giới hạn quyền.</div>';
}
var emailVal=editingUR?esc(editingUR.email):'';
var nameVal=editingUR?esc(editingUR.display_name||''):'';
var roleVal=editingUR?editingUR.role:'accountant';
var staffIdVal=editingUR?(editingUR.staff_id||''):(pendingNewUserRoleStaffId||'');
h+='<div class="form-row"><div class="form-group"><label>Email</label><input type="email" id="ur-email" value="'+emailVal+'" placeholder="VD: linh.kt@hcagency.vn"'+(editingUR?' readonly style="background:var(--bg2);color:var(--tx3);"':'')+'></div><div class="form-group"><label>Tên hiển thị</label><input type="text" id="ur-name" value="'+nameVal+'" placeholder="VD: Ngọc Linh"></div></div>';
h+='<div class="form-row"><div class="form-group"><label>Mật khẩu '+(editingUR?'(chỉ áp dụng nếu user chưa có Auth account)':'đăng nhập')+'</label><input type="text" id="ur-pass" placeholder="'+(editingUR?'Để trống nếu không đổi':'Tạo mật khẩu cho tài khoản này')+'" style="font-family:monospace;"></div><div class="form-group"><label>Vai trò</label><select id="ur-role">'+userRoleOptionsHtml(roleVal)+'</select></div></div>';
h+='<div class="form-row"><div class="form-group" style="grid-column:1/-1;"><label>Gán với nhân sự (nếu có)</label><select id="ur-staff"><option value="">— Không gán (full view trang Nhân sự) —</option>';
(allStaff.length?allStaff:staffList).slice().sort(function(a,b){var an=parseInt(a.display_code||'9999'),bn=parseInt(b.display_code||'9999');return an-bn;}).forEach(function(s){var codePrefix=s.display_code?'['+s.display_code+'] ':'';h+='<option value="'+esc(s.id)+'"'+(staffIdVal===s.id?' selected':'')+'>'+codePrefix+esc(s.full_name||s.short_name)+(s.short_name&&s.full_name!==s.short_name?' — '+esc(s.short_name):'')+'</option>';});
h+='</select><div style="font-size:11px;color:var(--tx3);margin-top:4px;">Nếu gán, user này chỉ xem được Lương / Sổ phạt / Công việc của chính nhân sự được gán. Admin/Kế toán giữ full view → để trống.</div></div></div>';
if(editingUR){
  h+='<div style="font-size:11px;color:var(--tx3);margin:4px 0 10px;background:var(--bg2);padding:8px 12px;border-radius:6px;border-left:3px solid var(--blue);">⚠ Supabase không cho admin đổi mật khẩu user khác từ trình duyệt. Để user quên/đổi mật khẩu, bấm nút bên dưới — Supabase sẽ gửi email link đặt lại password cho user đó.</div>';
  h+='<div class="btn-row" style="margin-bottom:14px;"><button class="btn btn-ghost btn-sm" onclick="sendPasswordResetLink(this,\''+esc(editingUR.email)+'\')">📧 Gửi link đặt lại mật khẩu cho '+esc(editingUR.email)+'</button></div>';
}
h+='<div style="font-size:12px;font-weight:500;color:var(--tx2);margin:8px 0 6px;">Quyền truy cập</div>';
h+='<div style="font-size:11px;color:var(--tx3);margin-bottom:10px;">Chọn quyền cho từng mục lớn (toàn quyền page) hoặc mục nhỏ (chỉ sub-tab cụ thể). Tick mục lớn = toàn quyền, tự bỏ tick các mục nhỏ.</div>';
var preChecked=new Set();
if(editingUR&&editingUR.allowed_pages){editingUR.allowed_pages.forEach(function(p){preChecked.add(normalizePermKey(p));});}
h+='<div style="display:flex;flex-direction:column;gap:8px;border:1px solid var(--bd1);border-radius:var(--radius);padding:12px;background:var(--bg2);">';
PERMISSION_TREE.forEach(function(node){
  var parentChecked=preChecked.has(node.key)?' checked':'';
  h+='<div style="border-bottom:1px solid var(--bd1);padding-bottom:8px;">';
  h+='<label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:500;cursor:pointer;"><input type="checkbox" class="ur-perm-cb ur-perm-parent" data-key="'+node.key+'"'+parentChecked+' onchange="onPermParentChange(this)"> '+esc(node.label)+'</label>';
  if(node.sub){
    h+='<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;margin-left:24px;">';
    node.sub.forEach(function(c){
      var childChecked=preChecked.has(c.key)?' checked':'';
      h+='<label style="display:flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid var(--bd1);border-radius:var(--radius);font-size:12px;cursor:pointer;background:var(--bg1);"><input type="checkbox" class="ur-perm-cb ur-perm-child" data-key="'+c.key+'" data-parent="'+node.key+'"'+childChecked+' onchange="onPermChildChange(this)"> '+esc(c.label)+'</label>';
    });
    h+='</div>';
  }
  h+='</div>';
});
h+='</div>';
h+='<div class="btn-row" style="margin-top:10px;"><button class="btn btn-primary btn-sm" onclick="addUserRole(this)">'+btnLabel+'</button>';
if(editingUR||pendingNewUserRoleStaffId)h+='<button class="btn btn-ghost btn-sm" onclick="cancelEditUserRole()">Hủy</button>';
h+='</div></div>';
return h;}

function editUserRole(id){
  editingUserRoleId=id;
  render();
  // Scroll to form sau khi render
  setTimeout(function(){var el=document.getElementById('ur-form-card');if(el)el.scrollIntoView({behavior:'smooth',block:'start'});},50);
}
function cancelEditUserRole(){editingUserRoleId=null;pendingNewUserRoleStaffId=null;render();}
async function sendPasswordResetLink(btn,email){
  if(!isAdmin())return;
  if(!email){toast('Thiếu email',false);return;}
  btn.disabled=true;var oldText=btn.textContent;btn.textContent='Đang gửi...';
  try{
    var{error}=await sb2.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin});
    if(error)throw error;
    toast('Đã gửi link đặt lại mật khẩu tới '+email+'. User check email và click link để đổi password.',true,{duration:6000});
  }catch(e){
    toast('Lỗi: '+(e.message||e),false);
  }finally{btn.disabled=false;btn.textContent=oldText;}
}

// Tick parent → bỏ tick children (vì parent đã cover toàn bộ)
function onPermParentChange(cb){
  if(!cb.checked)return;
  document.querySelectorAll('.ur-perm-child[data-parent="'+cb.dataset.key+'"]').forEach(function(c){c.checked=false;});
}
// Tick child → bỏ tick parent (để chỉ giới hạn ở sub-tab)
function onPermChildChange(cb){
  if(!cb.checked)return;
  var parentCb=document.querySelector('.ur-perm-parent[data-key="'+cb.dataset.parent+'"]');
  if(parentCb)parentCb.checked=false;
}

async function saveMetaSettings(btn){
if(!isAdmin())return;
btn.disabled=true;btn.textContent='Đang lưu...';
var bizId=document.getElementById('set-business-id').value.trim();
var gsId=document.getElementById('set-global-scope').value.trim();
var ok1=await saveAppSetting('META_BUSINESS_ID',bizId);
var ok2=await saveAppSetting('META_GLOBAL_SCOPE_ID',gsId);
if(ok1&&ok2){
META_BUSINESS_ID=bizId;META_GLOBAL_SCOPE_ID=gsId;
toast('Đã lưu cài đặt Meta',true);
}else{toast('Có lỗi khi lưu',false);}
btn.disabled=false;btn.textContent='Lưu cài đặt';
render();}

function saveAIKeys(btn){
if(!isAdmin())return;
btn.disabled=true;btn.textContent='Đang lưu...';
var oKey=document.getElementById('set-openai-key').value.trim();
var cKey=document.getElementById('set-claude-key').value.trim();
if(oKey){localStorage.setItem('hc_openai_key',oKey);OPENAI_KEY=oKey;}
else{localStorage.removeItem('hc_openai_key');OPENAI_KEY='';}
if(cKey){localStorage.setItem('hc_claude_key',cKey);CLAUDE_KEY=cKey;}
else{localStorage.removeItem('hc_claude_key');CLAUDE_KEY='';}
// Reset AI conversation để lần hỏi tiếp theo dùng key mới
aiMessages=[];aiInitDone=false;
var msgsEl=document.getElementById('ai-msgs');if(msgsEl)msgsEl.innerHTML='';
toast('Đã lưu API key AI vào trình duyệt này',true);
btn.disabled=false;btn.textContent='Lưu API Key';
render();}

function clearAIKeys(btn){
if(!isAdmin())return;
if(!confirm('Xóa toàn bộ API key AI khỏi trình duyệt này?'))return;
localStorage.removeItem('hc_openai_key');localStorage.removeItem('hc_claude_key');
OPENAI_KEY='';CLAUDE_KEY='';
aiMessages=[];aiInitDone=false;
var msgsEl=document.getElementById('ai-msgs');if(msgsEl)msgsEl.innerHTML='';
toast('Đã xóa API key AI',true);
render();}

// ═══ ChatGPT Plus OAuth (PKCE) ═══
// Luồng: client gọi /api/chatgpt-auth?action=start để lấy auth_url + verifier + state.
// User mở auth_url ở tab mới, login ChatGPT, browser sẽ redirect về localhost:1455 (báo lỗi
// "không kết nối được" — không sao). User copy URL paste vào textarea, bấm Hoàn tất →
// gọi /api/chatgpt-auth?action=callback để đổi code lấy token.
function renderChatGPTOAuthPasteForm(){
var actionsEl=document.getElementById('chatgpt-oauth-actions');
if(!actionsEl)return;
actionsEl.innerHTML=''
+'<div style="padding:10px 14px;background:var(--amber-bg);color:var(--amber-tx);border-radius:var(--radius);font-size:12px;line-height:1.6;margin-bottom:12px;">'
+'<b>Đang chờ paste URL callback</b><br>'
+'1. Tab ChatGPT đã mở → đăng nhập, bấm "Authorize".<br>'
+'2. Trình duyệt redirect về <code>http://localhost:1455/auth/callback?code=…</code> báo <i>"không kết nối được"</i> — bình thường.<br>'
+'3. <b>Click vào thanh địa chỉ → Cmd+A → Cmd+C</b> để copy nguyên URL (đừng kéo chuột bôi đen, sẽ thiếu phần đuôi).<br>'
+'4. Paste vào ô bên dưới → bấm Hoàn tất.'
+'</div>'
+'<label style="display:block;font-size:12px;font-weight:500;color:var(--tx2);margin-bottom:6px;">URL callback đã copy</label>'
+'<textarea id="chatgpt-oauth-redirect" rows="3" placeholder="http://localhost:1455/auth/callback?code=...&state=..." style="width:100%;padding:8px;font-family:monospace;font-size:11px;border:1px solid var(--bd1);border-radius:var(--radius);"></textarea>'
+'<div class="btn-row" style="margin-top:10px;"><button class="btn btn-primary" onclick="submitChatGPTOAuthCallback(this)">Hoàn tất kết nối</button><button class="btn btn-ghost" onclick="cancelChatGPTOAuth()">Huỷ phiên</button></div>';
}

async function loadChatGPTOAuthStatus(){
var statusEl=document.getElementById('chatgpt-oauth-status');
var actionsEl=document.getElementById('chatgpt-oauth-actions');
if(!statusEl||!actionsEl)return;
try{
var resp=await fetch('/api/chatgpt-auth?action=status');
var data=await resp.json();
if(data.connected){
var exp=data.expires_at?new Date(data.expires_at).toLocaleString('vi-VN'):'?';
var plan=data.plan_type||'(không xác định)';
var acct=data.account_id?(' · acct '+data.account_id.slice(0,12)+'…'):'';
statusEl.innerHTML='<b style="color:var(--green);">✓ Đã kết nối</b> — Plan: '+esc(plan)+acct+'<br><span style="color:var(--tx3);">Access token hết hạn: '+esc(exp)+' (tự refresh)</span>';
actionsEl.innerHTML='<div class="btn-row"><button class="btn btn-ghost" onclick="disconnectChatGPTOAuth(this)">Ngắt kết nối</button></div>';
}else{
// Nếu có pending state (đã bấm Kết nối trước đó) → render lại form paste để user paste tiếp
var pendingState=localStorage.getItem('hc_chatgpt_oauth_state');
var pendingVerifier=localStorage.getItem('hc_chatgpt_oauth_verifier');
if(pendingState&&pendingVerifier){
statusEl.innerHTML='<b style="color:var(--amber);">◐ Đang trong phiên kết nối</b> — paste URL callback để hoàn tất.';
renderChatGPTOAuthPasteForm();
}else{
statusEl.innerHTML='<b style="color:var(--tx3);">○ Chưa kết nối</b> — chưa thể dùng option <i>"GPT-5.4 qua subscription"</i> trong AI panel.';
actionsEl.innerHTML='<div class="btn-row"><button class="btn btn-primary" onclick="startChatGPTOAuth(this)">Kết nối ChatGPT Plus</button></div>';
}
}
}catch(e){statusEl.innerHTML='<span style="color:var(--red);">Lỗi load trạng thái: '+esc(e.message||String(e))+'</span>';}
}

async function startChatGPTOAuth(btn){
if(!isAdmin())return;
btn.disabled=true;btn.textContent='Đang sinh URL...';
try{
var resp=await fetch('/api/chatgpt-auth?action=start');
var data=await resp.json();
if(!resp.ok||!data.auth_url)throw new Error(data.error||'HTTP '+resp.status);
// Lưu state + verifier vào localStorage để dùng ở bước callback (sống qua refresh)
localStorage.setItem('hc_chatgpt_oauth_state',data.state);
localStorage.setItem('hc_chatgpt_oauth_verifier',data.code_verifier);
window.open(data.auth_url,'_blank','noopener');
renderChatGPTOAuthPasteForm();
}catch(e){toast('Lỗi: '+(e.message||e),false);btn.disabled=false;btn.textContent='Kết nối ChatGPT Plus';}
}

function cancelChatGPTOAuth(){
localStorage.removeItem('hc_chatgpt_oauth_state');
localStorage.removeItem('hc_chatgpt_oauth_verifier');
loadChatGPTOAuthStatus();
}

async function submitChatGPTOAuthCallback(btn){
if(!isAdmin())return;
var ta=document.getElementById('chatgpt-oauth-redirect');
var url=(ta&&ta.value||'').trim();
if(!url){toast('Chưa paste URL callback',false);return;}
var state=localStorage.getItem('hc_chatgpt_oauth_state');
var verifier=localStorage.getItem('hc_chatgpt_oauth_verifier');
if(!state||!verifier){toast('Phiên kết nối hết hạn — bấm "Kết nối ChatGPT Plus" lại từ đầu',false);return;}
btn.disabled=true;btn.textContent='Đang đổi code...';
try{
var resp=await fetch('/api/chatgpt-auth?action=callback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({redirect_url:url,state:state,code_verifier:verifier})});
var data=await resp.json();
if(!resp.ok||data.error)throw new Error(data.error||'HTTP '+resp.status);
localStorage.removeItem('hc_chatgpt_oauth_state');
localStorage.removeItem('hc_chatgpt_oauth_verifier');
// Auto-switch dropdown AI sang OAuth model + reset hội thoại để dùng ngay
setAIModel('chatgpt-codex');
aiMessages=[];aiInitDone=false;
var msgsEl=document.getElementById('ai-msgs');if(msgsEl)msgsEl.innerHTML='';
toast('✓ Đã kết nối ChatGPT Plus — AI panel đã chuyển sang dùng subscription',true);
loadChatGPTOAuthStatus();
}catch(e){toast('Lỗi callback: '+(e.message||e),false);btn.disabled=false;btn.textContent='Hoàn tất kết nối';}
}

async function disconnectChatGPTOAuth(btn){
if(!isAdmin())return;
if(!confirm('Ngắt kết nối ChatGPT Plus? Token sẽ bị xoá khỏi server.'))return;
btn.disabled=true;btn.textContent='Đang xoá...';
try{
var resp=await fetch('/api/chatgpt-auth?action=logout',{method:'POST'});
var data=await resp.json();
if(!resp.ok)throw new Error(data.error||'HTTP '+resp.status);
// Nếu AI panel đang chọn OAuth, fallback về gpt-5.4-mini để không bị stuck
if(getAIModel&&getAIModel()==='chatgpt-codex'){setAIModel('gpt-5.4-mini');aiMessages=[];aiInitDone=false;var msgsEl=document.getElementById('ai-msgs');if(msgsEl)msgsEl.innerHTML='';}
toast('Đã ngắt kết nối',true);
loadChatGPTOAuthStatus();
}catch(e){toast('Lỗi: '+(e.message||e),false);btn.disabled=false;btn.textContent='Ngắt kết nối';}
}

async function addUserRole(btn){
if(!isAdmin())return;
var isEdit=!!editingUserRoleId;
var origLabel=isEdit?'Lưu cập nhật':'Thêm tài khoản';
var email=document.getElementById('ur-email').value.trim();
var name=document.getElementById('ur-name').value.trim();
var pass=document.getElementById('ur-pass').value.trim();
var role=document.getElementById('ur-role').value;
if(!email){toast('Vui lòng nhập email.',false);return;}
var pages=[];document.querySelectorAll('.ur-perm-cb:checked').forEach(function(cb){pages.push(cb.dataset.key);});
if(!pages.length){toast('Vui lòng chọn ít nhất 1 quyền truy cập.',false);return;}
btn.disabled=true;btn.textContent=isEdit?'Đang lưu...':'Đang tạo...';
// Tạo tài khoản đăng nhập nếu có mật khẩu (cả Add lẫn Edit có pass mới đều signup; nếu user đã tồn tại Supabase báo lỗi và mình bỏ qua)
if(pass){
if(pass.length<6){toast('Mật khẩu phải có ít nhất 6 ký tự.',false);btn.disabled=false;btn.textContent=origLabel;return;}
var{data:signData,error:signErr}=await sb2.auth.signUp({email:email,password:pass,options:{data:{display_name:name}}});
if(signErr){
if(signErr.message.indexOf('already registered')>=0||signErr.message.indexOf('already been registered')>=0){
// User đã tồn tại → OK, chỉ cần lưu role. Lưu ý: Supabase không cho update mật khẩu user khác qua client SDK — anh phải reset trong Supabase Dashboard nếu muốn đổi pass user cũ.
}else{toast('Lỗi tạo tài khoản: '+signErr.message,false);btn.disabled=false;btn.textContent=origLabel;return;}}
}
// Lưu/cập nhật phân quyền
var staffSel=document.getElementById('ur-staff');
var staffId=staffSel&&staffSel.value?staffSel.value:null;
var payload={email:email,display_name:name,role:role,allowed_pages:pages,staff_id:staffId};
var resp;
if(isEdit){
  resp=await sb2.from('user_roles').update(payload).eq('id',editingUserRoleId);
}else{
  resp=await sb2.from('user_roles').upsert(payload,{onConflict:'email'});
}
btn.disabled=false;btn.textContent=origLabel;
if(resp.error){toast('Lỗi lưu quyền: '+resp.error.message,false);return;}
toast(isEdit?'Đã cập nhật: '+email:'Đã tạo: '+email+' ('+userRoleLabel(role)+')'+(pass?' + tài khoản đăng nhập':''),true);
editingUserRoleId=null;pendingNewUserRoleStaffId=null;
await loadAllUserRoles();render();}

async function deleteUserRole(btn,id){
if(!isAdmin())return;
if(!confirm('Xóa phân quyền này? Tài khoản sẽ trở thành Admin mặc định.'))return;
btn.disabled=true;
var{error}=await sb2.from('user_roles').delete().eq('id',id);
btn.disabled=false;
if(error){toast('Lỗi',false);}
else{toast('Đã xóa',true);await loadAllUserRoles();render();}}

// ═══ Modal Sửa hợp nhất: nhân sự + tài khoản đăng nhập + quyền ═══
function openPersonEditModal(staffId,urId){
  if(!isAdmin()){toast('Chỉ admin mới sửa được',false);return;}
  var s=staffId?allStaff.find(function(x){return x.id===staffId;}):null;
  var ur=urId?allUserRoles.find(function(x){return x.id===urId;}):null;
  var root=document.getElementById('hc-modal-root')||(function(){var d=document.createElement('div');d.id='hc-modal-root';document.body.appendChild(d);return d;})();
  var ex=document.getElementById('person-edit-modal');if(ex)ex.remove();
  var title=s?(s.full_name||s.short_name):(ur?(ur.display_name||ur.email):'Sửa');
  var hasUR=!!ur;
  // Pre-check perms
  var preChecked=new Set();
  if(ur&&ur.allowed_pages)ur.allowed_pages.forEach(function(p){preChecked.add(normalizePermKey(p));});
  var h='';
  // Section nhân sự
  if(s){
    h+='<div style="margin-bottom:16px;"><h4 style="margin:0 0 10px 0;font-size:13px;color:var(--tx2);text-transform:uppercase;letter-spacing:.5px;">Nhân sự</h4>';
    h+='<div style="display:grid;grid-template-columns:80px 1fr 1fr;gap:8px;margin-bottom:8px;">';
    h+='<div><label style="font-size:11px;color:var(--tx3);">Mã NS</label><input type="text" id="pe-code" value="'+esc(s.display_code||'')+'" maxlength="6" style="width:100%;font-family:monospace;font-weight:600;color:var(--blue);" class="fi"></div>';
    h+='<div><label style="font-size:11px;color:var(--tx3);">Họ tên</label><input type="text" id="pe-full" value="'+esc(s.full_name||'')+'" style="width:100%;" class="fi"></div>';
    h+='<div><label style="font-size:11px;color:var(--tx3);">Tên ngắn</label><input type="text" id="pe-short" value="'+esc(s.short_name||'')+'" style="width:100%;" class="fi"></div>';
    h+='</div>';
    h+='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px;">';
    h+='<div><label style="font-size:11px;color:var(--tx3);">Code định danh</label><input type="text" id="pe-id-code" value="'+esc(s.code||'')+'" style="width:100%;" class="fi"></div>';
    h+='<div><label style="font-size:11px;color:var(--tx3);">Viết tắt avatar</label><input type="text" id="pe-init" value="'+esc(s.avatar_initials||'')+'" maxlength="3" style="width:100%;" class="fi"></div>';
    h+='<div><label style="font-size:11px;color:var(--tx3);">Ngân sách/tháng</label><input type="number" id="pe-budget" value="'+(s.monthly_budget||0)+'" style="width:100%;" class="fi"></div>';
    h+='</div>';
    h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">';
    h+='<div><label style="font-size:11px;color:var(--tx3);">Từ khóa chiến dịch</label><input type="text" id="pe-kw" value="'+esc(s.campaign_keyword||'')+'" style="width:100%;" class="fi"></div>';
    h+='<div><label style="font-size:11px;color:var(--tx3);">Trạng thái</label><select id="pe-active" class="fi" style="width:100%;"><option value="true"'+(s.is_active?' selected':'')+'>Đang hoạt động</option><option value="false"'+(!s.is_active?' selected':'')+'>Đã tắt</option></select></div>';
    h+='</div></div>';
  }
  // Section tài khoản
  if(hasUR){
    h+='<div style="margin-bottom:16px;"><h4 style="margin:0 0 10px 0;font-size:13px;color:var(--tx2);text-transform:uppercase;letter-spacing:.5px;">Tài khoản đăng nhập</h4>';
    h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">';
    h+='<div><label style="font-size:11px;color:var(--tx3);">Email</label><input type="email" id="pe-email" value="'+esc(ur.email)+'" readonly style="width:100%;background:var(--bg2);color:var(--tx3);" class="fi"></div>';
    h+='<div><label style="font-size:11px;color:var(--tx3);">Tên hiển thị</label><input type="text" id="pe-display" value="'+esc(ur.display_name||'')+'" style="width:100%;" class="fi"></div>';
    h+='</div>';
    h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">';
    h+='<div><label style="font-size:11px;color:var(--tx3);">Vai trò</label><select id="pe-role" class="fi" style="width:100%;">'+userRoleOptionsHtml(ur.role)+'</select></div>';
    h+='<div><label style="font-size:11px;color:var(--tx3);">&nbsp;</label><button class="btn btn-ghost btn-sm" onclick="sendPasswordResetLink(this,\''+esc(ur.email)+'\')" style="width:100%;height:36px;">📧 Gửi link đặt lại mật khẩu</button></div>';
    h+='</div>';
    // Permission tree
    h+='<div style="font-size:11px;color:var(--tx3);margin-bottom:6px;">Quyền truy cập — tick mục lớn = toàn page, tick mục nhỏ = chỉ sub-tab.</div>';
    h+='<div style="display:flex;flex-direction:column;gap:6px;border:1px solid var(--bd1);border-radius:var(--radius);padding:10px;background:var(--bg2);max-height:240px;overflow-y:auto;">';
    PERMISSION_TREE.forEach(function(node){
      var parentChecked=preChecked.has(node.key)?' checked':'';
      h+='<div style="border-bottom:1px solid var(--bd1);padding-bottom:6px;">';
      h+='<label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:500;cursor:pointer;"><input type="checkbox" class="pe-perm-cb pe-perm-parent" data-key="'+node.key+'"'+parentChecked+' onchange="onPePermParentChange(this)"> '+esc(node.label)+'</label>';
      if(node.sub){
        h+='<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;margin-left:20px;">';
        node.sub.forEach(function(c){
          var childChecked=preChecked.has(c.key)?' checked':'';
          h+='<label style="display:flex;align-items:center;gap:4px;padding:3px 8px;border:1px solid var(--bd1);border-radius:var(--radius);font-size:11px;cursor:pointer;background:var(--bg1);"><input type="checkbox" class="pe-perm-cb pe-perm-child" data-key="'+c.key+'" data-parent="'+node.key+'"'+childChecked+' onchange="onPePermChildChange(this)"> '+esc(c.label)+'</label>';
        });
        h+='</div>';
      }
      h+='</div>';
    });
    h+='</div></div>';
  }else if(s){
    h+='<div style="padding:10px 14px;background:var(--bg2);border-radius:var(--radius);font-size:12px;color:var(--tx3);margin-bottom:12px;">Nhân sự này chưa có tài khoản đăng nhập. Dùng nút "+ Tạo TK đăng nhập" trong bảng để tạo.</div>';
  }
  // Footer
  var footer='<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:18px;border-top:1px solid var(--bd1);padding-top:14px;">';
  footer+='<div>';
  if(hasUR)footer+='<button class="btn btn-red btn-sm" onclick="deletePersonUserRole(this,\''+ur.id+'\')">🗑 Xóa tài khoản</button>';
  footer+='</div>';
  footer+='<div style="display:flex;gap:8px;"><button class="btn btn-ghost" onclick="closePersonEditModal()">Hủy</button><button class="btn btn-primary" onclick="savePersonEdit(this,'+(s?'\''+s.id+'\'':'null')+','+(hasUR?'\''+ur.id+'\'':'null')+')">💾 Lưu</button></div></div>';
  var modal=document.createElement('div');modal.id='person-edit-modal';modal.className='hc-modal-backdrop';
  modal.setAttribute('onclick','if(event.target===this)closePersonEditModal()');
  modal.innerHTML='<div class="hc-modal" role="dialog" aria-modal="true" style="max-width:680px;"><div class="hc-modal-head"><h3>Sửa: '+esc(title)+'</h3><button class="hc-modal-close" onclick="closePersonEditModal()" aria-label="Đóng">×</button></div><div class="hc-modal-body">'+h+footer+'</div></div>';
  root.appendChild(modal);
}
function closePersonEditModal(){var m=document.getElementById('person-edit-modal');if(m)m.remove();}
function onPePermParentChange(cb){if(!cb.checked)return;document.querySelectorAll('.pe-perm-child[data-parent="'+cb.dataset.key+'"]').forEach(function(c){c.checked=false;});}
function onPePermChildChange(cb){if(!cb.checked)return;var p=document.querySelector('.pe-perm-parent[data-key="'+cb.dataset.parent+'"]');if(p)p.checked=false;}
async function deletePersonUserRole(btn,urId){
  if(!isAdmin())return;
  if(!confirm('Xóa tài khoản đăng nhập này? Tài khoản sẽ trở thành Admin mặc định nếu vẫn login được.'))return;
  btn.disabled=true;
  var r=await sb2.from('user_roles').delete().eq('id',urId);
  btn.disabled=false;
  if(r.error){toast('Lỗi: '+r.error.message,false);return;}
  toast('Đã xóa tài khoản',true);closePersonEditModal();await loadAllUserRoles();render();
}
async function savePersonEdit(btn,staffId,urId){
  if(!isAdmin())return;
  btn.disabled=true;var orig=btn.textContent;btn.textContent='Đang lưu...';
  try{
    // Save staff fields
    if(staffId){
      var sp={
        display_code:document.getElementById('pe-code').value.trim()||null,
        full_name:document.getElementById('pe-full').value.trim(),
        short_name:document.getElementById('pe-short').value.trim()||null,
        code:document.getElementById('pe-id-code').value.trim(),
        avatar_initials:document.getElementById('pe-init').value.trim()||null,
        monthly_budget:parseInt(document.getElementById('pe-budget').value)||0,
        campaign_keyword:document.getElementById('pe-kw').value.trim()||null,
        is_active:document.getElementById('pe-active').value==='true'
      };
      var rs=await sb2.from('staff').update(sp).eq('id',staffId);
      if(rs.error)throw new Error('Lưu nhân sự: '+rs.error.message);
    }
    // Save user_role fields + perms
    if(urId){
      var pages=[];document.querySelectorAll('.pe-perm-cb:checked').forEach(function(cb){pages.push(cb.dataset.key);});
      if(!pages.length)throw new Error('Chọn ít nhất 1 quyền truy cập');
      var up={
        display_name:document.getElementById('pe-display').value.trim()||null,
        role:document.getElementById('pe-role').value,
        allowed_pages:pages
      };
      var ru=await sb2.from('user_roles').update(up).eq('id',urId);
      if(ru.error)throw new Error('Lưu tài khoản: '+ru.error.message);
    }
    toast('Đã lưu',true);closePersonEditModal();
    await loadLight();if(urId)await loadAllUserRoles();render();
  }catch(e){toast('Lỗi: '+(e.message||e),false);btn.disabled=false;btn.textContent=orig;}
}

// ═══ AI CHAT (Multi-model: OpenAI + Claude) ═══
var OPENAI_KEY=localStorage.getItem('hc_openai_key')||'';
var CLAUDE_KEY=localStorage.getItem('hc_claude_key')||'';
var aiMessages=[];var aiOpen=false;var aiInitDone=false;

function getAIModel(){return document.getElementById('ai-model').value;}
function isClaude(m){return m.indexOf('claude')===0;}
function setAIModel(m){
var sel=document.getElementById('ai-model');
if(!sel)return;
sel.value=m;
localStorage.setItem('hc_ai_model',m);
}
// Khôi phục lựa chọn model từ phiên trước (nếu có) — chạy lần đầu khi DOM ready
(function restoreAIModel(){
function apply(){
var saved=localStorage.getItem('hc_ai_model');
var sel=document.getElementById('ai-model');
if(!saved||!sel)return;
// Bỏ qua chatgpt-codex cho đến khi proxy local được setup — fallback default
if(saved==='chatgpt-codex'){localStorage.removeItem('hc_ai_model');return;}
// Chỉ apply nếu option đó còn tồn tại trong dropdown
for(var i=0;i<sel.options.length;i++){if(sel.options[i].value===saved){sel.value=saved;return;}}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply);
else apply();
})();

function isChatGPTOAuth(m){return m==='chatgpt-codex';}
function ensureKey(){
var m=getAIModel();
if(isChatGPTOAuth(m))return true; // OAuth dùng token server-side, không cần API key
if(isClaude(m)&&!CLAUDE_KEY){CLAUDE_KEY=prompt('Nhập Anthropic API key (sk-ant-...):')||'';if(CLAUDE_KEY)localStorage.setItem('hc_claude_key',CLAUDE_KEY);else return false;}
if(!isClaude(m)&&!OPENAI_KEY){OPENAI_KEY=prompt('Nhập OpenAI API key (sk-proj-...):')||'';if(OPENAI_KEY)localStorage.setItem('hc_openai_key',OPENAI_KEY);else return false;}
return true;}

function toggleAI(){aiOpen=!aiOpen;document.getElementById('ai-panel').classList.toggle('open',aiOpen);if(aiOpen&&!aiInitDone){if(!ensureKey())return;aiInitDone=true;autoAnalyze();}}

function onModelChange(){
localStorage.setItem('hc_ai_model',getAIModel());
aiMessages=[];aiInitDone=false;document.getElementById('ai-msgs').innerHTML='';
if(!ensureKey())return;
aiInitDone=true;autoAnalyze();}

function getDataSummary(){
var cm=lm();var nd=dates.filter(function(d){return d.substring(0,7)===cm;}).length||1;
var dim=new Date(parseInt(cm.split('-')[0]),parseInt(cm.split('-')[1]),0).getDate();
// Staff spend
var st={};staffList.forEach(function(s){st[s.id]={name:s.short_name,budget:s.monthly_budget,spend:0};});
dailyData.filter(function(d){return d.report_date.substring(0,7)===cm;}).forEach(function(d){
var sid=gsfa(d.ad_account_id,d.report_date,d.staff_id);if(sid&&st[sid])st[sid].spend+=d.spend_amount;});
// Client spend (loại trừ khách tiềm năng)
var cs={};clientList.forEach(function(c){if(c.status==='prospect')return;cs[c.id]={name:c.name,fee:getEffectiveServiceFee(c.id,cm,c.service_fee),payment:c.payment_status,status:c.status,spend:0,tkCount:0};});
adList.forEach(function(a){if(a.client_id&&cs[a.client_id])cs[a.client_id].tkCount++;});
dailyData.filter(function(d){return d.report_date.substring(0,7)===cm;}).forEach(function(d){
var cid=d.matched_client_id||null;
if(!cid){var aa=adList.find(function(a){return a.id===d.ad_account_id;});if(aa){var asg=getAssign(d.ad_account_id,d.report_date);cid=asg.length?asg[0].client_id:aa.client_id;}}
if(cid&&cs[cid])cs[cid].spend+=d.spend_amount;});
// Ad accounts with comparable spend-cap usage
var tkAlerts=[];adList.forEach(function(a){if(hasComparableSpendCap(a)){var pct=Math.round(a.amount_spent/a.spend_cap*100);if(pct>=80)tkAlerts.push({name:a.account_name,spent:a.amount_spent,cap:a.spend_cap,pct:pct});}});
// Finance
var inc=0,exp=0;txnData.forEach(function(t){if(t.month===cm){if(t.txn_type==='income')inc+=t.amount;else exp+=t.amount;}});
var summary='Dữ liệu HC Agency — T'+parseInt(cm.split('-')[1])+'/'+cm.split('-')[0]+' ('+nd+' ngày có data, tháng '+dim+' ngày):\n';
summary+='\n== NHÂN SỰ ==\n';
Object.keys(st).forEach(function(id){var s=st[id];summary+=s.name+': chi '+ff(s.spend)+', ngân sách '+ff(s.budget)+', đạt '+Math.round(s.spend/(s.budget||1)*100)+'%, TB/ngày '+ff(Math.round(s.spend/nd))+'\n';});
var activeClientsForAI=clientList.filter(function(c){return c.status!=='prospect';});
var prospectCountAI=clientList.length-activeClientsForAI.length;
summary+='\n== KHÁCH HÀNG ('+activeClientsForAI.length+' chính thức'+(prospectCountAI?', '+prospectCountAI+' tiềm năng':'')+') ==\n';
var cArr=Object.keys(cs).map(function(id){return cs[id];}).sort(function(a,b){return b.spend-a.spend;});
cArr.forEach(function(c){if(c.spend>0||c.fee>0)summary+=c.name+': chi tiêu '+ff(c.spend)+', phí Dịch vụ '+ff(c.fee)+', Thanh toán: '+(c.payment==='paid'?'đã thanh toán':(c.payment==='invoice_sent'?'đã gửi phiếu':'chưa thanh toán'))+', '+c.tkCount+' Tài khoản, '+c.status+'\n';});
if(tkAlerts.length){summary+='\n== CẢNH BÁO NGÂN SÁCH Tài khoản ==\n';tkAlerts.sort(function(a,b){return b.pct-a.pct;}).forEach(function(a){summary+=a.name+': đã chi '+ff(a.spent)+'/'+ff(a.cap)+' ('+a.pct+'%)\n';});}
summary+='\n== TÀI CHÍNH ==\nDoanh thu phí Dịch vụ: '+ff(inc)+'\nChi phí (lương+VH): '+ff(exp)+'\nLợi nhuận: '+ff(inc-exp)+'\n';
summary+='Tổng Tài khoản: '+adList.length+' ('+adList.filter(function(a){return a.account_status===1;}).length+' hoạt động)\n';
var messAlerts=getMessAlerts(),leadAlerts=getLeadAlerts();
if(messAlerts.length){summary+='\n== CẢNH BÁO GIÁ MESS (trung bình 3 ngày D-3..D-1) ==\n';
messAlerts.forEach(function(al){summary+=al.campaign_name+' ('+al.client_name+'): giá Messenger '+ff(al.cost_per_mess)+'đ, ngưỡng '+ff(al.max_cost)+'đ, Nhân sự '+(al.staff?al.staff.short_name:'—')+', spend 3 ngày '+ff(al.spend_4d)+', '+al.mess_4d+' mess\n';});}
else{summary+='\n== GIÁ MESS ==\nKhông có chiến dịch nào vượt ngưỡng giá Messenger.\n';}
if(leadAlerts.length){summary+='\n== CẢNH BÁO GIÁ FORM (trung bình 3 ngày D-3..D-1) ==\n';
leadAlerts.forEach(function(al){summary+=al.campaign_name+' ('+al.client_name+'): giá form '+ff(al.cost_per_lead)+'đ, ngưỡng '+ff(al.max_cost)+'đ, Nhân sự '+(al.staff?al.staff.short_name:'—')+', spend 3 ngày '+ff(al.spend_4d)+', '+al.leads_4d+' form\n';});}
else{summary+='\n== GIÁ FORM ==\nKhông có chiến dịch nào vượt ngưỡng giá form.\n';}
// Bảng lương tháng hiện tại
var smo=lm();
summary+='\n== BẢNG LƯƠNG THÁNG '+smo+' ==\n';
var sumTotal=0;
staffList.forEach(function(s){
var isCEO=(Number(s.default_base_salary)===0)||/hưng coaching|hung coaching|ceo/i.test((s.full_name||'')+' '+(s.short_name||''));
var comm=isCEO?{total:0,detail:[]}:computeStaffCommission(s.id,smo);
var row=salaryData.find(function(x){return x.staff_id===s.id&&x.month===smo;});
var base=row&&row.base_salary!=null?Number(row.base_salary):(isCEO?0:(Number(s.default_base_salary)||4000000));
var bonus=row&&row.bonus!=null?Number(row.bonus):0;
var t=base+comm.total+bonus;sumTotal+=t;
summary+=s.short_name+(isCEO?' (CEO)':'')+': cứng '+ff(base)+' + hoa hồng '+ff(comm.total)+' + thưởng '+ff(bonus)+' = '+ff(t)+(row&&row.note?' ['+row.note+']':'')+'\n';
});
summary+='Tổng chi lương: '+ff(sumTotal)+'\n';
// Sổ phạt tháng hiện tại
var penByStaff={};penaltyData.filter(function(p){return(p.penalty_date||'').substring(0,7)===smo;}).forEach(function(p){
var sid=p.staff_id||'_raw_'+p.staff_name_raw;if(!penByStaff[sid])penByStaff[sid]={name:p.staff_id?((allStaff.find(function(s){return s.id===p.staff_id;})||{}).short_name||'?'):p.staff_name_raw,total:0,entries:[]};
penByStaff[sid].total+=Number(p.amount)||0;penByStaff[sid].entries.push(fd(p.penalty_date)+' '+ff(p.amount)+(p.reason?' ('+p.reason+')':''));});
var penKeys=Object.keys(penByStaff);
if(penKeys.length){summary+='\n== SỔ PHẠT THÁNG '+smo+' (đã trừ vào lương) ==\n';penKeys.forEach(function(k){var p=penByStaff[k];summary+=p.name+': '+ff(p.total)+' ('+p.entries.length+' lần) — '+p.entries.slice(0,3).join('; ')+(p.entries.length>3?'…':'')+'\n';});}
else summary+='\n== SỔ PHẠT ==\nKhông có phạt nào trong tháng.\n';
var balAlerts=getBalanceAlerts();
if(balAlerts.length){summary+='\n== CẢNH BÁO Tài khoản SẮP HẾT TIỀN (số dư < '+ff(BALANCE_ALERT_THRESHOLD)+'đ) ==\n';
balAlerts.forEach(function(al){var dl=al.days_left===null?'chưa xác định':(al.days_left<1?'<1 ngày':'~'+al.days_left.toFixed(1)+' ngày');summary+=al.account_name+' ('+(al.client_name||'chưa gán Khách hàng')+'): còn '+ff(al.balance)+'đ, chi TB '+ff(Math.round(al.avg_daily))+'đ/ngày → còn chạy '+dl+', Nhân sự '+(al.staff?al.staff.short_name:'—')+'\n';});}
else{summary+='\n== SỐ DƯ Tài khoản ==\nKhông có Tài khoản nào sắp hết tiền.\n';}
return summary;}

function addAIMsg(role,html){
var msgs=document.getElementById('ai-msgs');
var div=document.createElement('div');
div.className='ai-msg ai-msg-'+role;
if(role==='bot'){div.innerHTML='<div class="ai-dot"><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5z" fill="var(--bg2)"/></svg></div><div class="ai-bubble">'+html+'</div>';}
else{div.innerHTML='<div class="ai-bubble">'+esc(html)+'</div>';}
msgs.appendChild(div);msgs.scrollTop=msgs.scrollHeight;}

function addTyping(){
var msgs=document.getElementById('ai-msgs');
var div=document.createElement('div');div.className='ai-msg ai-msg-bot';div.id='ai-typing';
div.innerHTML='<div class="ai-dot"><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5z" fill="var(--bg2)"/></svg></div><div class="ai-bubble"><div class="ai-typing"><span></span><span></span><span></span></div></div>';
msgs.appendChild(div);msgs.scrollTop=msgs.scrollHeight;}
function removeTyping(){var t=document.getElementById('ai-typing');if(t)t.remove();}

async function callGPT(userMsg){
var systemPrompt='Bạn là trợ lý phân tích quảng cáo của HC Agency. Trả lời bằng tiếng Việt, ngắn gọn, dùng emoji cho dễ đọc. Khi phân tích, hãy đưa ra nhận xét cụ thể, số liệu rõ ràng, và gợi ý hành động. Dữ liệu hiện tại:\n\n'+getDataSummary();
// Always refresh system prompt with latest data summary so AI doesn't reuse a stale snapshot from when chat was first opened
if(!aiMessages.length||aiMessages[0].role!=='system'){aiMessages.unshift({role:'system',content:systemPrompt});}
else{aiMessages[0].content=systemPrompt;}
aiMessages.push({role:'user',content:userMsg});
var model=getAIModel();
try{
if(isChatGPTOAuth(model)){
// ChatGPT Plus qua OAuth — proxy qua serverless function. Không gửi model name,
// để server tự pick model tương thích Codex (gpt-5-codex hoặc model mới hơn).
var resp=await fetch('/api/chatgpt-chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:aiMessages})});
var data=await resp.json();
if(!resp.ok||data.error){return'⚠ Lỗi ChatGPT OAuth: '+(data.error||('HTTP '+resp.status));}
var reply=data.content||'(trống)';
aiMessages.push({role:'assistant',content:reply});
return reply;
}else if(isClaude(model)){
// Anthropic Claude API
var claudeMsgs=aiMessages.filter(function(m){return m.role!=='system';});
var resp=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':CLAUDE_KEY,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:model,system:systemPrompt,messages:claudeMsgs,max_tokens:1500})});
var data=await resp.json();
if(data.error){
if(JSON.stringify(data.error).indexOf('api_key')>=0||JSON.stringify(data.error).indexOf('auth')>=0){localStorage.removeItem('hc_claude_key');CLAUDE_KEY='';}
return'⚠ Lỗi: '+(data.error.message||JSON.stringify(data.error));}
var reply=data.content[0].text;
aiMessages.push({role:'assistant',content:reply});
return reply;
}else{
// OpenAI API
var resp=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+OPENAI_KEY},body:JSON.stringify({model:model,messages:aiMessages,max_completion_tokens:1500})});
var data=await resp.json();
if(data.error){
if(data.error.message&&data.error.message.indexOf('API key')>=0){localStorage.removeItem('hc_openai_key');OPENAI_KEY='';}
return'⚠ Lỗi: '+data.error.message;}
var reply=data.choices[0].message.content;
aiMessages.push({role:'assistant',content:reply});
return reply;
}
}catch(e){return'⚠ Lỗi kết nối: '+e.message;}}

function formatAIReply(text){
return esc(text).replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>').replace(/• /g,'<span style="color:var(--teal);">•</span> ');}

async function autoAnalyze(){
addTyping();
var reply=await callGPT('Phân tích tổng quan tình hình quảng cáo tháng này. Tập trung vào: 1) Cảnh báo Tài khoản sắp hết ngân sách, 2) Khách hàng chưa thanh toán phí Dịch vụ, 3) Top Khách hàng chi tiêu cao nhất, 4) Nhận xét hiệu suất nhân viên. Trình bày ngắn gọn.');
removeTyping();addAIMsg('bot',formatAIReply(reply));}

async function sendAI(){
var input=document.getElementById('ai-input');var msg=input.value.trim();if(!msg)return;
if(!ensureKey())return;
input.value='';addAIMsg('user',msg);
document.getElementById('ai-send-btn').disabled=true;
addTyping();var reply=await callGPT(msg);removeTyping();
addAIMsg('bot',formatAIReply(reply));
document.getElementById('ai-send-btn').disabled=false;}

function askAI(q){document.getElementById('ai-input').value=q;sendAI();}

function resetAIKey(){
// Ưu tiên mở Admin > Cài đặt (tab 3) cho Admin. Nếu không phải Admin → fallback prompt như cũ.
if(isAdmin()){
if(aiOpen)toggleAI();
curPage=5;adminTab=3;render();
toast('Cập nhật API key ở mục "Cấu hình API Key AI"',true);
return;}
var m=getAIModel();
if(isClaude(m)){CLAUDE_KEY='';localStorage.removeItem('hc_claude_key');CLAUDE_KEY=prompt('Nhập Anthropic API key mới:')||'';if(CLAUDE_KEY)localStorage.setItem('hc_claude_key',CLAUDE_KEY);}
else{OPENAI_KEY='';localStorage.removeItem('hc_openai_key');OPENAI_KEY=prompt('Nhập OpenAI API key mới:')||'';if(OPENAI_KEY)localStorage.setItem('hc_openai_key',OPENAI_KEY);}
if(OPENAI_KEY||CLAUDE_KEY){aiMessages=[];aiInitDone=false;document.getElementById('ai-msgs').innerHTML='';aiInitDone=true;autoAnalyze();}}

// ═══ AUTO SYNC ON PAGE LOAD ═══
function showSyncBar(msg,done){var bar=document.getElementById('sync-bar');var txt=document.getElementById('sync-text');if(!bar)return;bar.classList.remove('hidden');if(done)bar.classList.add('done');else bar.classList.remove('done');txt.textContent=msg;}
function hideSyncBar(){var bar=document.getElementById('sync-bar');if(bar){bar.classList.add('hidden');setTimeout(function(){bar.classList.remove('done');},500);}}

async function syncOneDate(date,mapped){
var normal=mapped.filter(function(a){return!a.is_shared;});
var shared=mapped.filter(function(a){return a.is_shared;});
var saved=0,errors=0,errorSamples=[];
function pushErr(accId,phase,msg,code){
errors++;
if(errorSamples.length<3)errorSamples.push({accId:accId,phase:phase,msg:msg,code:code});
console.warn('[Spend sync]',date,phase,'acc='+accId,'code='+code,msg);
}
// Batch 50 Tài khoản thường
for(var b=0;b<normal.length;b+=50){
var chunk=normal.slice(b,b+50);
var batchReqs=chunk.map(function(a){return{method:'GET',relative_url:a.fb_account_id+'/insights?fields=spend&time_range={"since":"'+date+'","until":"'+date+'"}'};});
try{
var bResults=await metaBatch(batchReqs);
// Batch-level failure (token invalid, app block, …) — KHÔNG xoá data cũ
if(!Array.isArray(bResults)){
var em=(bResults&&bResults.error&&bResults.error.message)||'Batch không phải mảng';
var ec=(bResults&&bResults.error&&bResults.error.code)||0;
chunk.forEach(function(a){pushErr(a.fb_account_id,'batch',em,ec);});
continue;
}
var upsertRows=[];
for(var j=0;j<bResults.length;j++){
var accId=chunk[j].fb_account_id;
try{
var body=JSON.parse((bResults[j]&&bResults[j].body)||'{}');
if(body.error){pushErr(accId,'insights',body.error.message,body.error.code);continue;}
var spend=0;if(body.data&&body.data.length)spend=Math.round(parseFloat(body.data[0].spend));
upsertRows.push({ad_account_id:chunk[j].id,report_date:date,spend_amount:spend});
}catch(e){pushErr(accId,'parse',e.message,0);}}
if(upsertRows.length){
await sb2.from('daily_spend').delete().in('ad_account_id',upsertRows.map(function(r){return r.ad_account_id;})).eq('report_date',date).is('staff_id',null);
var ubatches=chunkArray(upsertRows,200);
for(var ub=0;ub<ubatches.length;ub++){var ur=await sb2.from('daily_spend').insert(ubatches[ub]);if(!ur.error)saved+=ubatches[ub].length;else errors+=ubatches[ub].length;}}
}catch(e){chunk.forEach(function(a){pushErr(a.fb_account_id,'network',e.message,0);});}}
// Tài khoản dùng chung: batch Meta API + insert DB theo lô
var sharedResult=await replaceSharedSpendRows(shared,date);
saved+=sharedResult.saved;errors+=sharedResult.errors;
return{saved:saved,errors:errors,errorSamples:errorSamples};}

// Check xem cron 15p vừa sync xong chưa — nếu < 5p thì autoSync skip để khỏi gọi Meta thừa
async function isSyncFresh(){
  try{
    var r=await sb2.from('ad_daily_post').select('synced_at').order('synced_at',{ascending:false}).limit(1);
    if(r.error||!r.data||!r.data.length)return null;
    var lastSync=new Date(r.data[0].synced_at);
    var minsAgo=Math.round((Date.now()-lastSync.getTime())/60000);
    if(minsAgo<5)return{minsAgo:minsAgo};
    return null;
  }catch(e){return null;}
}
async function autoSync(){
try{
if(authUser){
// Smart sync: nếu cron mới chạy < 5p, skip toàn bộ Meta calls để đỡ tốn API
var fresh=await isSyncFresh();
if(fresh){
showSyncBar('✓ Data mới (cron sync '+fresh.minsAgo+'p trước)',true);
setTimeout(hideSyncBar,2500);
return;
}
showSyncBar('Đang cập nhật Meta...');
await loadMetaAndSync({silent:true,skipAuth:true,refreshAfter:false});
}
var mapped=adList.filter(function(a){return a.fb_account_id;});
if(!mapped.length){
console.log('[AutoSync] No mapped accounts');
if(authUser){showSyncBar('✓ Đã cập nhật Meta',true);setTimeout(hideSyncBar,1800);}
return;
}
// ═══ QUY TẮC ĐỒNG BỘ THÔNG MINH ═══
// 1) HÔM NAY: luôn đồng bộ NGAY mỗi lần mở trang (data còn chạy, cần realtime)
// 2) HÔM QUA: đồng bộ lại tối đa 4 lần/ngày — mỗi 6 tiếng (Meta vẫn cắn thêm tiền sau)
// 3) MESSENGER + form: 1 lần/ngày — lần đầu mở trang trong ngày
var today=td();
var yest=yesterday();
var now=Date.now();
var SIX_HOURS=6*3600*1000;
var lastYestTs=parseInt(localStorage.getItem('hc_last_yest_sync_ts')||'0',10);
var lastMessDate=localStorage.getItem('hc_last_mess_sync_date')||'';
var shouldSyncYest=(now-lastYestTs)>SIX_HOURS;
var shouldSyncMess=lastMessDate!==today;
// 1. HÔM NAY — luôn đồng bộ
showSyncBar('Đang đồng bộ chi tiêu hôm nay...');
var rToday=await syncOneDate(today,mapped);
// 2. HÔM QUA — chỉ khi đã quá 6 tiếng từ lần đồng bộ trước
var rYest={saved:0,errors:0,errorSamples:[]};
if(shouldSyncYest){
showSyncBar('Đang chốt lại chi tiêu hôm qua (chính xác hơn)...');
rYest=await syncOneDate(yest,mapped);
localStorage.setItem('hc_last_yest_sync_ts',String(now));
}
var totalSaved=rToday.saved+rYest.saved,totalErrors=rToday.errors+rYest.errors;
// Nếu có lỗi, lấy mẫu đầu tiên để gợi ý nguyên nhân
var spendHint='';
var firstSample=(rToday.errorSamples&&rToday.errorSamples[0])||(rYest.errorSamples&&rYest.errorSamples[0]);
if(totalErrors&&firstSample){
var codeHint='';
if(firstSample.code===190)codeHint=' — Token hết hạn/thu hồi';
else if(firstSample.code===200||firstSample.code===100)codeHint=' — Thiếu quyền ads_read';
else if(firstSample.code===17||firstSample.code===4||firstSample.code===32||firstSample.code===613)codeHint=' — Rate limit';
else if(firstSample.code===803)codeHint=' — Tài khoản không truy cập được';
spendHint=' ('+firstSample.phase+(firstSample.code?' #'+firstSample.code:'')+codeHint+')';
console.warn('[Spend sync] Mẫu lỗi today:',rToday.errorSamples,'yest:',rYest.errorSamples);
}
// 3. MESSENGER + form — chỉ 1 lần/ngày (lần đầu mở trang trong ngày)
if(shouldSyncMess){
showSyncBar('Đang quét giá Messenger + form (lần đầu trong ngày)...');
await syncCampaignMess(null,true);
localStorage.setItem('hc_last_mess_sync_date',today);
}
// Tóm tắt
var skipNote='';
if(!shouldSyncYest){var minsAgo=Math.round((now-lastYestTs)/60000);skipNote+=' · hôm qua đã sync '+minsAgo+'p trước';}
if(!shouldSyncMess)skipNote+=' · Messenger đã sync hôm nay';
showSyncBar('✓ Đồng bộ: '+totalSaved+' OK'+(totalErrors?', '+totalErrors+' lỗi'+spendHint:'')+skipNote,true);
await loadAll();
setTimeout(hideSyncBar,3500);
}catch(e){showSyncBar('⚠ Lỗi đồng bộ: '+e.message);setTimeout(hideSyncBar,5000);}}

async function init(){try{
  // Khôi phục state subnav-collapsed từ localStorage
  try{if(localStorage.getItem('hcSubnavCollapsed')==='1'){var _app=document.getElementById('app');if(_app)_app.classList.add('subnav-collapsed');}}catch(e){}
  // Public form thu lead — URL ?form=lead (Phase 1.1 CRM)
  if(initPublicLeadFormMode()){
    renderLeadFormPage();
    return;
  }
  // Public ledger mode — khách rental xem qua URL ?ledger=<id>&token=<x>
  if(initPublicLedgerMode()){
    await loadPublicLedger();
    return;
  }
  // Public report mode — khách xem báo cáo Ads daily qua URL ?report=<id>&token=<x>
  if(initPublicReportMode()){
    await loadPublicReport();
    return;
  }
  // Public penalty mode — nhân sự xem sổ phạt riêng qua URL ?penalty=<staff_id>&token=<x>
  if(initPublicPenaltyMode()){
    await loadPublicPenalty();
    return;
  }
  await checkAuth();
  if(!authUser){render();return;}
  await loadAppSettings();
  if(isAdmin())await loadAllUserRoles();
  await loadAll();
  if(authUser&&userAllowedPages&&userAllowedPages.length){var fp=permKeyToPage(userAllowedPages[0]);if(!canAccessPage(curPage))curPage=fp;}
  autoSync();
  render();
}catch(e){document.getElementById('page').innerHTML='<div style="padding:40px;text-align:center;color:var(--tx2);"><div style="font-size:16px;font-weight:500;margin-bottom:8px;">Không thể kết nối</div><div style="font-size:13px;margin-bottom:16px;">'+esc(e.message)+'</div><button class="btn btn-primary" onclick="location.reload()">Thử lại</button></div>';}}
init();
