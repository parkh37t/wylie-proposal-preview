/* Local document reading and transparent, rule-based evidence indexing. No API calls. */
(function(root){
  'use strict';
  const MAX=8*1024*1024;
  function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
  async function documentXml(buffer){
    const bytes=new Uint8Array(buffer),v=new DataView(buffer);let end=-1;
    for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(v.getUint32(i,true)===0x06054b50 && i+22+v.getUint16(i+20,true)===bytes.length){end=i;break;}}
    if(end<0)throw Error('정상 DOCX ZIP 구조가 아닙니다.');
    if(v.getUint16(end+4,true)||v.getUint16(end+6,true))throw Error('분할 ZIP은 지원하지 않습니다.');
    const count=v.getUint16(end+10,true),size=v.getUint32(end+12,true),start=v.getUint32(end+16,true);
    if(count>5000||start+size>end)throw Error('문서 구조 또는 압축 한도를 확인해 주세요.');
    let p=start,found=null;
    for(let i=0;i<count;i++){
      if(p+46>start+size||v.getUint32(p,true)!==0x02014b50)throw Error('손상된 DOCX 목록입니다.');
      const n=v.getUint16(p+28,true),extra=v.getUint16(p+30,true),comment=v.getUint16(p+32,true),next=p+46+n+extra+comment;
      if(next>start+size)throw Error('손상된 DOCX 항목입니다.');
      const name=new TextDecoder().decode(bytes.subarray(p+46,p+46+n));
      if(name==='word/document.xml'){
        if(found)throw Error('중복 본문 항목이 있습니다.');
        found={flags:v.getUint16(p+8,true),method:v.getUint16(p+10,true),crc:v.getUint32(p+16,true),packed:v.getUint32(p+20,true),length:v.getUint32(p+24,true),offset:v.getUint32(p+42,true)};
      }
      p=next;
    }
    if(!found)throw Error('Word 본문이 없습니다. 암호화 파일인지 확인해 주세요.');
    const f=found;
    if(f.flags&1||f.length>MAX||f.packed>MAX||![0,8].includes(f.method))throw Error('암호화·대용량 또는 지원하지 않는 압축 문서입니다.');
    if(f.offset+30>start||v.getUint32(f.offset,true)!==0x04034b50)throw Error('손상된 본문 위치입니다.');
    const begin=f.offset+30+v.getUint16(f.offset+26,true)+v.getUint16(f.offset+28,true);
    if(begin+f.packed>start)throw Error('본문 크기가 올바르지 않습니다.');
    let output=bytes.slice(begin,begin+f.packed);
    if(f.method===8){
      if(typeof DecompressionStream==='undefined')throw Error('최신 Edge 또는 Chrome에서 열어 주세요.');
      const reader=new Blob([output]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
      let total=0;const chunks=[];
      try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>MAX||total>f.length)throw Error('압축 해제 한도를 초과했습니다.');chunks.push(value);}}
      catch(error){await reader.cancel().catch(()=>{});throw error;}
      output=new Uint8Array(total);let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.length;}
    }
    if(output.length!==f.length||crc32(output)!==f.crc)throw Error('본문 무결성 검사에 실패했습니다.');
    const xml=new TextDecoder('utf-8',{fatal:true}).decode(output);
    if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('외부 엔터티를 포함하는 문서는 지원하지 않습니다.');
    return xml;
  }
  async function read(file){
    let paragraphs;
    if(/\.docx$/i.test(file.name)){
      const xml=await documentXml(await file.arrayBuffer());
      const dom=new DOMParser().parseFromString(xml,'application/xml');
      if(dom.getElementsByTagName('parsererror').length)throw Error('Word XML을 읽을 수 없습니다.');
      const ns=dom.documentElement.namespaceURI;
      if(!['http://schemas.openxmlformats.org/wordprocessingml/2006/main','http://purl.oclc.org/ooxml/wordprocessingml/main'].includes(ns))throw Error('지원하는 Word 본문 형식이 아닙니다.');
      paragraphs=Array.from(dom.getElementsByTagNameNS(ns,'p')).map(p=>Array.from(p.getElementsByTagNameNS(ns,'t')).map(t=>t.textContent).join(''));
    }else{
      if(file.size>MAX)throw Error('텍스트 읽기 한도는 8 MiB입니다.');
      paragraphs=(await file.text()).split(/\r?\n/);
    }
    const rows=paragraphs.map((text,i)=>({text:text.trim(),source:file.name,paragraph:i+1})).filter(x=>x.text);
    if(!rows.length)throw Error('읽을 수 있는 본문이 없습니다. 이미지·스캔 문서는 OCR 연결이 필요합니다.');
    if(rows.length>20000)throw Error('본문 문단 수 한도를 초과했습니다.');
    return rows;
  }
  function analyze(rows){
    const groups={goals:[],requirements:[],constraints:[],questions:[],statements:[]};
    const patterns={goals:/목적|목표|배경|지향|추진/,requirements:/요구|필수|해야|하여야|구축|제공|지원|구현|연계|개선|고도화/,constraints:/일정|기간|예산|납기|보안|인증|개인정보|준수|제약/,questions:/미정|미확인|추후|협의|확인 필요|별도|검토 필요|\?/};
    for(const row of rows){
      if(row.role==='meeting')groups.statements.push(row);
      for(const [key,pattern] of Object.entries(patterns))if(pattern.test(row.text))groups[key].push(row);
    }
    const terms=['커머스','재고','픽업','예약','결제','멤버십','마일리지','자동차','금융','검색','추천','배송','상담','인증','접근성'];
    const keywords=terms.map(term=>({term,hits:rows.filter(row=>row.text.includes(term))})).filter(x=>x.hits.length).sort((a,b)=>b.hits.length-a.hits.length).slice(0,5);
    return {groups,keywords,paragraphCount:rows.length};
  }
  const api={documentXml,read,analyze};if(typeof module==='object'&&module.exports)module.exports=api;else root.WylieDocuments=api;
})(typeof window!=='undefined'?window:globalThis);
