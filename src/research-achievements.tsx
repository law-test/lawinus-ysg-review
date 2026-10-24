import React from 'react';
import groups from './research-achievements.json';

type ResearchItem = {title: string; publication: string; authors?: string; role?: string; url?: string};
type ResearchGroup = {title:string;items:ResearchItem[]};

export default function ResearchAchievements() {
  return <section className="profile-research" aria-labelledby="profile-research-title">
    <h3 id="profile-research-title">연구업적</h3>
    {(groups as ResearchGroup[]).map(group => <div className="research-group" key={group.title}>
      <h4>{group.title}</h4>
      <ul className="research-list">{group.items.map((item: ResearchItem) => <li key={item.title}>
        {item.url ? <a className="research-title" href={item.url} target="_blank" rel="noopener noreferrer" aria-label={`${item.title} (새 창에서 열기)`}>{item.title}<span aria-hidden="true"> ↗</span></a>
          : <span className="research-title">{item.title}</span>}
        <p>{[item.publication,item.authors,item.role].filter(Boolean).join(' · ')}</p>
      </li>)}</ul>
    </div>)}
  </section>;
}
