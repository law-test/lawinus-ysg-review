import editions from './law-editions-data.json';
export const LAW_VERSIONS: {key:string;name:string;status:string;effectiveDate?:string;officialUrl?:string;currentKey?:string|null}[]=editions.map(edition=>({...edition,effectiveDate:edition.effectiveDate??undefined}));
