import React, {useMemo, useState} from 'react';
import toc from './thesis-toc-data.json';
import {currentTocId, visibleToc} from './thesis-toc-model';
import './thesis-contents.css';

type Props = {
  page: number;
  onNavigate: (page: number) => void;
  pdfSha256?: string;
};

export default function ThesisContents({page, onNavigate, pdfSha256}: Props) {
  const [query, setQuery] = useState('');
  const [detailed, setDetailed] = useState(true);
  const [selectedId, setSelectedId] = useState<string>();
  const entries = useMemo(() => visibleToc(toc.entries, query, detailed), [query, detailed]);
  const currentId = currentTocId(entries, page, selectedId);

  if (pdfSha256 && pdfSha256.toLowerCase() !== toc.pdfSha256) {
    return <p className="thesis-toc-error" role="status">현재 논문과 목차의 기준이 달라 목차를 표시할 수 없습니다.</p>;
  }

  return <nav className="thesis-contents" aria-label="논문 세부목차">
    <div className="thesis-toc-controls">
      <div className="thesis-toc-modes" aria-label="목차 표시 범위">
        <button type="button" aria-pressed={!detailed} onClick={() => setDetailed(false)}>장·절</button>
        <button type="button" aria-pressed={detailed} onClick={() => setDetailed(true)}>세부목차</button>
      </div>
      <div className="thesis-toc-search">
        <input type="search" aria-label="목차 검색" placeholder="목차 검색" value={query} onChange={event => setQuery(event.target.value)}/>
      </div>
      <div className="thesis-toc-caption"><span>{entries.length}개 항목</span><span>PDF 쪽</span></div>
    </div>
    <div className="thesis-toc-scroll">
      <ol className="thesis-toc-list">
        {entries.map(entry => <li key={entry.id} className={`thesis-toc-level-${entry.level}`}>
          <button type="button" aria-current={entry.id === currentId ? 'location' : undefined}
            title={`${entry.title} · PDF ${entry.page}쪽${entry.printedPage ? ` / 인쇄 ${entry.printedPage}면` : ''}`}
            onClick={() => {setSelectedId(entry.id); onNavigate(entry.page);}}>
            <span className="thesis-toc-title">{entry.title}</span>
            <span className="thesis-toc-page" aria-label={`PDF ${entry.page}쪽`}>{entry.page}</span>
          </button>
        </li>)}
      </ol>
      {!entries.length && <p className="thesis-toc-empty" role="status">일치하는 목차가 없습니다.</p>}
    </div>
  </nav>;
}
