import { Problem } from '../model'

export const CSV_LIMIT=64*1024
export const ROW_LIMIT=100
export const HEADER=['guest_id','name','email','phone','notes','visit_date','party_size','visit_status']

/** Bounded RFC 4180 parser: quoted commas/newlines and doubled quotes are accepted. */
export function parseCsv(csv:string):string[][] {
 if(new TextEncoder().encode(csv).length>CSV_LIMIT) throw new Problem(413,'CSV exceeds 64 KiB.')
 if(csv.includes('\0')) throw new Problem(400,'CSV contains a NUL character.')
 const text=csv.charCodeAt(0)===0xfeff?csv.slice(1):csv, rows:string[][]=[]
 let row:string[]=[],field='',quoted=false,closed=false
 const cell=()=>{row.push(field);field='';closed=false;if(row.length>HEADER.length)throw new Problem(400,'CSV has too many columns.')}
 const line=()=>{cell();if(row.some(value=>value!==''))rows.push(row);row=[];if(rows.length>ROW_LIMIT+1)throw new Problem(413,'CSV exceeds 100 data rows.')}
 for(let i=0;i<text.length;i++){
  const c=text[i]
  if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++}else{quoted=false;closed=true}}else field+=c;continue}
  if(c===','){cell();continue}
  if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;line();continue}
  if(closed)throw new Problem(400,'Unexpected text after a closing CSV quote.')
  if(c==='"'){if(field)throw new Problem(400,'Unexpected quote in an unquoted CSV field.');quoted=true}else field+=c
 }
 if(quoted)throw new Problem(400,'Unclosed CSV quote.')
 if(field||row.length||closed)line()
 if(!rows.length||rows[0].length!==HEADER.length||rows[0].some((v,i)=>v!==HEADER[i]))throw new Problem(400,'CSV header must be '+HEADER.join(',')+'.')
 return rows.slice(1)
}
