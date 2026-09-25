/* Presentation-only intake UI. No source upload, remote request or simulated analysis. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const model = window.WylieIntake;
  const state = { rfp: null, meetingFiles: [], urls: [{id:1, value:''}], nextUrl:2, prepared:null, demo:false };
  const countryNames = {kr:'대한민국', jp:'일본', us:'미국'};
  let toastTimer;
  let autoProjectName = '';
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function icon(name) { return window.wylieIcon(name); }
  function notify(text, warning=false) {
    clearTimeout(toastTimer);
    $('toast').textContent = text;
    $('toast').className = 'toast' + (warning ? ' warning' : '');
    $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5500);
  }
  function inputs() {
    return { projectName:$('project-name').value.trim(), rfp:state.rfp, meetingFiles:state.meetingFiles,
      meetingText:$('meeting-text').value, urls:state.urls.map(row=>row.value), keywords:$('keywords').value, country:$('country').value };
  }
  function fieldError(id, message) {
    $(id).textContent = message || '';
    $(id).hidden = !message;
  }
  function invalidate() { state.prepared = null; }
  function syncSummary() {
    invalidate();
    const data = inputs();
    const validUrls = data.urls.filter(value => value.trim() && model.parseServiceUrl(value).ok);
    const keywords = data.keywords.split(/[,，\n]/).map(x=>x.trim()).filter(Boolean);
    const meetingCount = state.meetingFiles.length;
    const hasMeeting = meetingCount > 0 || data.meetingText.trim().length > 0;
    $('readiness-count').textContent = `필수 자료 ${state.rfp ? 1 : 0} / 1`;
    $('readiness-fill').classList.toggle('ready', !!state.rfp);
    $('rfp-status').textContent = state.rfp ? '파일 선택 완료 · 본문 분석 전' : '제안요청서를 등록해 주세요';
    $('rfp-chip').textContent = state.rfp ? '등록' : '필수';
    $('meeting-status').textContent = hasMeeting ? [meetingCount ? `파일 ${meetingCount}개` : '', data.meetingText.trim() ? '직접 입력 있음' : ''].filter(Boolean).join(' · ') : '회의록 등록 시 함께 검토';
    $('url-status').textContent = validUrls.length ? `${validUrls.length}개 주소 등록 · 방문 전` : 'URL 등록 시 범위에 포함';
    $('research-status').textContent = keywords.length ? `키워드 ${keywords.length}개 · ${countryNames[data.country]}` : '키워드 입력 후 연계 준비';
    $('url-count').textContent = `${validUrls.length} / 5`;
    $('meeting-character-count').textContent = `${Array.from(data.meetingText).length.toLocaleString()} / 20,000자`;
    $('scope-summary').textContent = `${countryNames[data.country]} · 초기 탐색`;
    $('start-hint').textContent = state.rfp && data.projectName ? '분석할 자료와 조사 범위를 확인할 준비가 됐습니다.' : 'RFP와 프로젝트 이름을 입력하면 분석 요청 범위를 확인할 수 있습니다.';
    [['rfp',state.rfp],['meeting',hasMeeting],['url',validUrls.length],['research',keywords.length]].forEach(([key,ready]) => $(key+'-symbol').classList.toggle('ready',!!ready));
    $('add-url').disabled = state.urls.length >= 5;
  }
  function sizeLabel(size) { return size >= 1024*1024 ? `${(size/1024/1024).toFixed(1)} MiB` : `${Math.max(1,Math.round(size/1024))} KiB`; }
  function fileRow(file, remove, isExample=false) {
    const row = el('div','file-row');
    const info = el('div','file-info');
    info.append(el('strong','',file.name),el('small','',`${sizeLabel(file.size)} · ${isExample ? '합성 예시 파일' : '선택됨, 업로드 전'}`));
    const button = el('button','icon-button'); button.type='button'; button.setAttribute('aria-label',file.name+' 삭제');
    button.append(icon('X')); button.addEventListener('click',remove);
    row.append(icon('FileCheck2'), info, button); return row;
  }
  function renderFiles() {
    $('rfp-selection').replaceChildren();
    if (state.rfp) $('rfp-selection').append(fileRow(state.rfp, () => {state.rfp=null; state.demo=false; $('rfp-file').value=''; renderFiles(); syncSummary();},state.demo));
    $('meeting-selection').replaceChildren(...state.meetingFiles.map((file,index) => fileRow(file,()=>{state.meetingFiles.splice(index,1); renderFiles(); syncSummary();})));
  }
  function addFiles(files, role) {
    const list = Array.from(files);
    if (!list.length) return;
    const target = role === 'rfp' ? 'rfp-error' : 'meeting-error';
    const errors = [];
    if (role === 'rfp' && list.length > 1) { fieldError(target,'RFP는 1개만 선택해 주세요. 기존 입력은 유지됩니다.'); return; }
    for (const file of list) {
      const validation = model.validateFile(file,role);
      if (!validation.ok) { errors.push(validation.error); continue; }
      if (role === 'rfp') {
        state.rfp = file; state.demo = false;
        if (!$('project-name').value.trim() || $('project-name').value === autoProjectName) {
          autoProjectName = file.name.replace(/\.docx$/i,'').replace(/_/g,' ').slice(0,100);
          $('project-name').value = autoProjectName;
          fieldError('project-error','');
          $('project-name').removeAttribute('aria-invalid');
        }
      } else {
        if (state.meetingFiles.length >= 3) {errors.push('회의록은 최대 3개까지 등록할 수 있습니다.'); continue;}
        if (state.meetingFiles.some(f=>f.name===file.name && f.size===file.size && f.lastModified===file.lastModified)) {errors.push('동일한 이름·크기·수정 시각의 파일이 이미 선택되어 있습니다.'); continue;}
        state.meetingFiles.push(file);
      }
    }
    fieldError(target,errors.join(' ')); renderFiles(); syncSummary();
  }
  function bindDropzone(id, role) {
    const node = $(id);
    ['dragenter','dragover'].forEach(event => node.addEventListener(event,e=>{e.preventDefault();node.classList.add('dragover');}));
    ['dragleave','drop'].forEach(event => node.addEventListener(event,e=>{e.preventDefault();node.classList.remove('dragover');}));
    node.addEventListener('drop', e=>addFiles(e.dataTransfer.files,role));
  }
  function renderUrls() {
    $('url-rows').replaceChildren();
    state.urls.forEach((item,index) => {
      const row = el('div','url-row');
      const wrapper = el('div','url-input-wrap');
      const input = el('input'); input.type='url'; input.id=`service-url-${item.id}`; input.value=item.value; input.placeholder=index===0 ? 'https://고객사-서비스-주소' : 'https://추가-서비스-또는-앱-주소'; input.maxLength=2048;
      input.setAttribute('aria-label',`서비스 URL ${index+1}`); input.setAttribute('aria-describedby',`url-message-${item.id} urls-error`); input.autocomplete='off'; input.spellcheck=false;
      const message = el('span','url-kind'); message.id=`url-message-${item.id}`;
      function showValidation() {
        if (!item.value.trim()) {message.textContent='';input.removeAttribute('aria-invalid');return;}
        const parsed = model.parseServiceUrl(item.value);
        message.className=parsed.ok?'url-kind':'url-error';
        const kinds={website:'웹사이트',google_play:'Google Play',apple_app_store:'App Store'};
        message.textContent=parsed.ok ? `${kinds[parsed.kind] || '웹사이트'} · 주소 형식 확인, 방문 전` : parsed.error;
        input.setAttribute('aria-invalid',String(!parsed.ok));
      }
      input.addEventListener('input',()=>{item.value=input.value;message.textContent='';fieldError('urls-error','');input.removeAttribute('aria-invalid');syncSummary();});
      input.addEventListener('blur',showValidation);
      wrapper.append(icon('Link'),input,message);
      const remove=el('button','icon-button');remove.type='button';remove.setAttribute('aria-label',`서비스 URL ${index+1} 삭제`);remove.append(icon('X'));
      remove.addEventListener('click',()=>{if(state.urls.length===1)item.value='';else state.urls=state.urls.filter(x=>x.id!==item.id); renderUrls();syncSummary();});
      row.append(wrapper,remove);$('url-rows').append(row);showValidation();
    });
  }
  $('add-url').addEventListener('click',()=>{if(state.urls.length>=5)return;const id=state.nextUrl++;state.urls.push({id,value:''});renderUrls();syncSummary();$(`service-url-${id}`).focus();});
  $('rfp-file').addEventListener('change',e=>{addFiles(e.target.files,'rfp');e.target.value='';});
  $('meeting-files').addEventListener('change',e=>{addFiles(e.target.files,'meeting');e.target.value='';});
  bindDropzone('rfp-drop','rfp');bindDropzone('meeting-drop','meeting');
  ['project-name','meeting-text','keywords','country'].forEach(id=>$(id).addEventListener('input',()=>{
    if(id==='project-name'){fieldError('project-error','');$(id).removeAttribute('aria-invalid');}
    if(id==='keywords'){fieldError('keywords-error','');$(id).removeAttribute('aria-invalid');}
    if(id==='meeting-text'){fieldError('meeting-error','');$(id).removeAttribute('aria-invalid');}
    syncSummary();
  }));
  function setMeetingTab(mode) {
    const files=mode==='file';
    $('meeting-file-tab').classList.toggle('selected',files);$('meeting-file-tab').setAttribute('aria-pressed',String(files));
    $('meeting-text-tab').classList.toggle('selected',!files);$('meeting-text-tab').setAttribute('aria-pressed',String(!files));
    $('meeting-file-panel').hidden=!files;$('meeting-text-panel').hidden=files;
  }
  $('meeting-file-tab').addEventListener('click',()=>setMeetingTab('file'));
  $('meeting-text-tab').addEventListener('click',()=>setMeetingTab('text'));
  function openPrepared() {
    const data=inputs(); const checked=model.validateInputs(data);
    ['project-error','rfp-error','meeting-error','urls-error','keywords-error'].forEach(id=>fieldError(id,''));
    $('project-name').removeAttribute('aria-invalid');$('keywords').removeAttribute('aria-invalid');
    if(!checked.valid) {
      for(const error of checked.errors){
        const field=error.field;
        let target = /project/.test(field)?'project-error':/rfp/.test(field)?'rfp-error':/meeting/.test(field)?'meeting-error':/url/.test(field)?'urls-error':'keywords-error';
        fieldError(target,[$(target).textContent,error.message].filter(Boolean).join(' '));
        if(target==='project-error')$('project-name').setAttribute('aria-invalid','true');
        if(target==='keywords-error')$('keywords').setAttribute('aria-invalid','true');
      }
      const first=checked.errors[0].field;
      const urlIndex=Number((first.match(/^urls\[(\d+)\]/)||[])[1]||0);
      if(first==='meetingText')setMeetingTab('text');
      const target=/project/.test(first)?$('project-name'):/rfp/.test(first)?$('rfp-file'):first==='meetingText'?$('meeting-text'):/meeting/.test(first)?$('meeting-files'):/url/.test(first)?$('url-rows').querySelectorAll('input')[urlIndex]:$('keywords');
      target.focus();notify('필수 자료와 입력 형식을 확인해 주세요.',true);return;
    }
    state.prepared=model.createBrief(data);
    $('download-status').textContent='';
    const urlCount=data.urls.filter(x=>x.trim()).length;
    const keywordCount=data.keywords.split(/[,，\n]/).filter(x=>x.trim()).length;
    $('prepared-summary').replaceChildren(el('strong','',data.projectName),el('span','',`RFP 1개 · 회의록 파일 ${data.meetingFiles.length}개${data.meetingText.trim()?' + 직접 입력':''} · 서비스 URL ${urlCount}개 · ${countryNames[data.country]}`));
    const steps=[['문서 요구사항과 제약조건 정리','분석 연결 필요'],['고객 발언·잠정 합의 검토',data.meetingFiles.length||data.meetingText.trim()?'분석 연결 필요':'자료 없음 · 제외'],['현재 서비스의 사용자 과업 관찰',urlCount?'관찰 연결 필요':'URL 없음 · 제외'],['ListeningMind 검색 데이터 조사',keywordCount?'연결 후 실행':'키워드 입력 필요']];
    $('prepared-steps').replaceChildren(...steps.map(([label,status])=>{const li=el('li','',label);li.append(el('span','',status));return li;}));
    $('prepared-dialog').showModal();
  }
  $('intake-form').addEventListener('submit',e=>{e.preventDefault();openPrepared();});
  ['close-prepared','edit-inputs'].forEach(id=>$(id).addEventListener('click',()=>$('prepared-dialog').close()));
  $('help-button').addEventListener('click',()=>$('help-dialog').showModal());
  $('close-help').addEventListener('click',()=>$('help-dialog').close());
  $('download-brief').addEventListener('click',()=>{
    if(!state.prepared)return;
    const blob=new Blob([JSON.stringify(state.prepared,null,2)+'\n'],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob);const link=el('a');link.href=url;link.download='wylie-research-brief.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    $('download-status').textContent='다운로드를 요청했습니다. 실제 분석은 아직 시작하지 않았습니다.';
  });
  $('load-demo').addEventListener('click',()=>{
    const current=inputs();
    if(current.projectName || state.rfp || current.meetingFiles.length || current.meetingText || current.urls.some(x=>x.trim()) || current.keywords){notify('현재 입력을 유지했습니다. 예시는 입력이 비어 있을 때 불러올 수 있습니다.',true);return;}
    const bytes=Uint8Array.from(atob(window.WYLIE_DEMO_RFP),character=>character.charCodeAt(0));
    state.rfp=new File([bytes],'리테일_앱_RFP_예시.docx',{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',lastModified:0});state.demo=true;
    $('project-name').value='리테일 앱 경험 고도화';autoProjectName='리테일 앱 경험 고도화';
    $('meeting-text').value='[합성 예시 회의록]\n고객 발언: 매장에 가기 전에 상품을 쉽게 찾는 경험이 중요합니다.\n잠정 논의: 재고 확인과 픽업 동선을 우선 살펴봅니다.\n미확인: 재고 갱신 주기와 외부 연계 범위는 담당자 확인이 필요합니다.';
    $('keywords').value='편의점 앱, 상품 재고, 편의점 픽업';
    state.urls=[{id:state.nextUrl++,value:'https://example.com'}];
    ['project-error','rfp-error','meeting-error','urls-error','keywords-error'].forEach(id=>fieldError(id,''));
    $('project-name').removeAttribute('aria-invalid');$('keywords').removeAttribute('aria-invalid');
    setMeetingTab('text');renderFiles();renderUrls();syncSummary();notify('합성 예시를 불러왔습니다. example.com은 실제 고객 서비스가 아닌 예시 주소입니다.');
  });
  renderUrls();renderFiles();syncSummary();
})();
