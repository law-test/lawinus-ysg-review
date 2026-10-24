export const COMPARISON_HEADERS=['【Before】','【After】','【상세이유】'] as const;
const AFTER_BOUNDARY='\n\n---\n【After】\n';
const REASON_BOUNDARY='\n\n---\n【상세이유】\n';
export type RevisionComparisonParts={before:string;after:string;reason:string};
export type RevisionComparisonParse={ok:true;parts:RevisionComparisonParts}|{ok:false;message:string};

export function formatRevisionComparison({before,after,reason}:RevisionComparisonParts):string{
 return `【Before】\n${before}${AFTER_BOUNDARY}${after}${REASON_BOUNDARY}${reason}`;
}

export function parseRevisionComparison(value:string):RevisionComparisonParse{
 const text=value.replace(/\r\n/g,'\n');
 const fail=():RevisionComparisonParse=>({ok:false,message:'【Before】·【After】·【상세이유】와 구분선을 원래 순서대로 유지해 주세요. After 부분만 저장됩니다.'});
 if(!text.startsWith('【Before】\n'))return fail();
 const lines=text.split('\n');
 if(COMPARISON_HEADERS.some(header=>lines.filter(line=>line===header).length!==1))return fail();
 const afterAt=text.indexOf(AFTER_BOUNDARY),reasonAt=text.indexOf(REASON_BOUNDARY);
 if(afterAt<0||reasonAt<afterAt+AFTER_BOUNDARY.length)return fail();
 return {ok:true,parts:{before:text.slice('【Before】\n'.length,afterAt),after:text.slice(afterAt+AFTER_BOUNDARY.length,reasonAt),reason:text.slice(reasonAt+REASON_BOUNDARY.length)}};
}
