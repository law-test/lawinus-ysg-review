import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const DATASET_ID='ysg-20261023';
export const BUCKET_ID='ysg-review-documents';
export const EXPECTED_PROJECT_REF='cefaekvclooytgjkcqum';
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value);

export function validateMetadata(meta){
  if(!meta||typeof meta!=='object'||!hash(meta.pdfSha256)||!hash(meta.sourceHwpxSha256)||
    !Number.isInteger(meta.pageCount)||meta.pageCount<1||meta.pageCount>10000||
    !Number.isInteger(meta.footnoteCount)||meta.footnoteCount<1||meta.footnoteCount>999||
    typeof meta.title!=='string'||!meta.title.trim()||meta.title.length>500)
    throw Error('Verified title, PDF/HWPX hashes, page count and footnote count are required.');
  return {...meta,pdfSha256:meta.pdfSha256.toLowerCase(),sourceHwpxSha256:meta.sourceHwpxSha256.toLowerCase()};
}

export function buildProvisioningSql(input){
  const meta=validateMetadata(input);
  let suffix=0;
  while(meta.title.includes(`$ysg${suffix}$`))suffix++;
  const delimiter=`$ysg${suffix}$`;
  return `-- Additive provisioning only. Existing project: ${EXPECTED_PROJECT_REF}.
-- Never apply the archived new-project schema to this shared project.
begin;
select pg_advisory_xact_lock(hashtextextended('ysg-20261023-provisioning',0));
do ${delimiter}
declare d public.paper_review_datasets;
begin
  if to_regprocedure('paper_review_private.seed_shared_catalog(text,jsonb)') is null then
    raise exception 'Existing shared-review API is missing; do not replace it automatically.';
  end if;
  select * into d from public.paper_review_datasets where id=${literal(DATASET_ID)};
  if found then
    if d.title is distinct from ${literal(meta.title)}
      or lower(d.thesis_sha256) is distinct from ${literal(meta.pdfSha256)}
      or lower(d.source_hwp_sha256) is distinct from ${literal(meta.sourceHwpxSha256)}
      or d.page_count is distinct from ${meta.pageCount}
      or d.footnote_count is distinct from ${meta.footnoteCount} then
      raise exception 'YSG dataset already exists with different metadata; no rows changed.';
    end if;
  else
    insert into public.paper_review_datasets(id,title,thesis_sha256,source_hwp_sha256,page_count,footnote_count)
    values(${literal(DATASET_ID)},${literal(meta.title)},${literal(meta.pdfSha256)},${literal(meta.sourceHwpxSha256)},${meta.pageCount},${meta.footnoteCount});
  end if;
  if exists(select 1 from storage.buckets where id=${literal(BUCKET_ID)} and (not public or name<>${literal(BUCKET_ID)})) then
    raise exception 'YSG bucket exists with incompatible settings; no rows changed.';
  end if;
  insert into storage.buckets(id,name,public) values(${literal(BUCKET_ID)},${literal(BUCKET_ID)},true) on conflict(id) do nothing;
end;
${delimiter};
commit;
`;
}

export function validateCatalog(rows,input){
  const meta=validateMetadata(input);
  if(!Array.isArray(rows)||!rows.length||rows.length>5000)throw Error('The complete verified original-text catalog (1–5,000 rows) is required.');
  const seen=new Set();
  for(const row of rows){
    if(!row||!['paragraph','footnote'].includes(row.kind)||typeof row.targetId!=='string'||
      !(row.kind==='paragraph'?/^P\d{4,6}$/:/^fn-\d{3}$/).test(row.targetId)||
      typeof row.originalText!=='string'||row.originalText.length>100000||
      !Number.isInteger(row.page)||row.page<1||row.page>meta.pageCount||
      (row.printedPage!=null&&typeof row.printedPage!=='string')||
      (row.label!=null&&(typeof row.label!=='string'||row.label.length>500)))
      throw Error('Invalid original-text catalog row.');
    if(row.kind==='footnote'&&(Number(row.targetId.slice(3))<1||Number(row.targetId.slice(3))>meta.footnoteCount))
      throw Error('Footnote number is outside the verified manuscript.');
    const key=row.kind+':'+row.targetId;if(seen.has(key))throw Error('Duplicate original-text target.');seen.add(key);
  }
  if(rows.filter(row=>row.kind==='footnote').length!==meta.footnoteCount)throw Error('The complete footnote catalog is required.');
  return rows;
}

export function buildCatalogSeedSql(rows,input){
  validateCatalog(rows,input);
  return `-- Immutable catalog seed through the existing administrative function only.\nbegin;\nselect paper_review_private.seed_shared_catalog(${literal(DATASET_ID)},${literal(JSON.stringify(rows))}::jsonb) as inserted_targets;\ncommit;\n`;
}

export function prepareAdditiveSeed(metadataPath,catalogPath,outputDirectory){
  const meta=validateMetadata(JSON.parse(readFileSync(metadataPath,'utf8')));
  const rows=validateCatalog(JSON.parse(readFileSync(catalogPath,'utf8')),meta);
  const out=resolve(outputDirectory);mkdirSync(out,{recursive:true});
  writeFileSync(resolve(out,'ysg-provisioning.sql'),buildProvisioningSql(meta));
  writeFileSync(resolve(out,'ysg-catalog-seed.sql'),buildCatalogSeedSql(rows,meta));
  const report={expectedProjectRef:EXPECTED_PROJECT_REF,datasetId:DATASET_ID,bucketId:BUCKET_ID,paragraphs:rows.filter(r=>r.kind==='paragraph').length,footnotes:meta.footnoteCount,pageCount:meta.pageCount,pdfSha256:meta.pdfSha256,sourceHwpxSha256:meta.sourceHwpxSha256};
  writeFileSync(resolve(out,'seed-plan.json'),JSON.stringify(report,null,2)+'\n');
  return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [metadataPath,catalogPath,outputDirectory]=process.argv.slice(2);
  if(!metadataPath||!catalogPath||!outputDirectory)throw Error('Usage: node supabase/prepare-additive-seed.mjs metadata.json catalog.json output-directory');
  console.log(JSON.stringify(prepareAdditiveSeed(metadataPath,catalogPath,outputDirectory),null,2));
}
