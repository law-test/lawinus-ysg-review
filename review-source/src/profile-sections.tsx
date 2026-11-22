import React from 'react';
import ProfileRow from './profile-row';
import './profile-sections.css';

type Entry = Record<string, string | undefined>;
type Profile = Record<string, any> | null;

export default function ProfileSections({profile}: {profile: Profile}) {
  const sections = [
    ['education','학력'], ['experience','주요 경력'], ['awards','수상'],
    ['research','연구업적'], ['projects','주요 작품'], ['press','언론'],
    ['service','공익·자문 활동(역임 포함)'],
    ['professionalActivities','학회·전문단체 활동(역임 포함)'],
    ['qualifications','자격·전문 등록']
  ];
  return <>{sections.map(([key,title]) => {
    const rows: Entry[] = Array.isArray(profile?.[key]) ? profile[key] : [];
    if (!rows.length) return null;
    return <section key={key}><h3>{title}</h3>{rows.map((row,i) => <ProfileRow key={i} section={key} row={row}/>)}</section>;
  })}</>;
}
