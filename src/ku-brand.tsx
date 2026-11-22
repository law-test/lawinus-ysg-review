import React from 'react';
import './ku-brand.css';

export default function KuBrand() {
  return (
    <a
      className="ku-brand"
      href={window.location.href}
      aria-label="논문 사이트 새로고침"
      title="논문 사이트 새로고침"
      onClick={event => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        window.location.reload();
      }}
    >
      <img src="./korea-law-logo.svg" alt="고대법대 KU Law" width="244" height="100" />
    </a>
  );
}
