import React, {useEffect, useState} from 'react';
import {applyTextSize, DEFAULT_TEXT_SIZE, normalizeTextSize, readTextSize, TEXT_SIZE_OPTIONS, TEXT_SIZE_STORAGE_KEY} from './text-size';

export function TextSizeControl() {
  const [size, setSize] = useState(readTextSize);
  useEffect(() => {
    applyTextSize(size, false);
    const onStorage = (event: StorageEvent) => {
      if (event.key === TEXT_SIZE_STORAGE_KEY) setSize(normalizeTextSize(event.newValue));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [size]);
  return <label className="text-size-control">
    <span>글자 크기</span>
    <select aria-label="화면 글자 크기" value={size} onChange={event => setSize(applyTextSize(Number(event.target.value)))}>
      {TEXT_SIZE_OPTIONS.map(option => <option key={option} value={option}>{option}%{option === DEFAULT_TEXT_SIZE ? ' · 기본' : ''}</option>)}
    </select>
  </label>;
}
