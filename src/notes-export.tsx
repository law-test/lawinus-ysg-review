import {useEffect,useRef,useState} from 'react';
import {exportNotes,type PreparedNotesExport} from './review-api';
import './notes-export.css';

export default function NotesExportControls(){
  const [file,setFile]=useState<PreparedNotesExport|null>(null);
  const [preparing,setPreparing]=useState<'md'|'csv'|null>(null);
  const [error,setError]=useState('');
  const alive=useRef(true),busy=useRef(false),generation=useRef(0),current=useRef<PreparedNotesExport|null>(null);
  useEffect(()=>{
    alive.current=true;
    return()=>{alive.current=false;generation.current++;busy.current=false;current.current?.dispose();current.current=null;};
  },[]);

  async function prepare(format:'md'|'csv'){
    if(busy.current)return;
    busy.current=true;
    const request=++generation.current;
    setPreparing(format);setError('');
    current.current?.dispose();current.current=null;setFile(null);
    try{
      const next=await exportNotes(format);
      if(!alive.current||request!==generation.current){next.dispose();return;}
      current.current=next;setFile(next);
    }catch(e:unknown){
      if(alive.current&&request===generation.current)setError(e instanceof Error?e.message:'메모 파일을 준비하지 못했습니다. 다시 시도해 주세요.');
    }finally{
      if(alive.current&&request===generation.current){busy.current=false;setPreparing(null);}
    }
  }
  const label=file?.format==='csv'?'CSV':'Markdown';
  return <>
    <button disabled={!!preparing} onClick={()=>void prepare('md')}>Markdown ↓</button>
    <button disabled={!!preparing} onClick={()=>void prepare('csv')}>Excel용 CSV ↓</button>
    {preparing&&<div className="notes-export-state" role="status">{preparing==='csv'?'CSV':'Markdown'} 파일을 준비하고 있습니다…</div>}
    {error&&<div className="notes-export-state notes-export-error" role="alert">{error}</div>}
    {file&&<div className="notes-export-state" role="status">
      <span>메모 {file.count}개의 {label} 파일을 준비했습니다. 아래 링크를 눌러 저장해 주세요.</span>
      <a className="notes-export-download" href={file.url} download={file.fileName} type={file.mime}>{label} 파일 저장</a>
      <small>저장된 파일은 브라우저의 다운로드 목록에서 확인해 주세요.</small>
    </div>}
  </>;
}
