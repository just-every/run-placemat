/** A minimal text-only PDF 1.4 (US Letter, Helvetica, WinAnsi encoding) so reports download as PDF without a dependency. Every byte is ASCII (other WinAnsi characters are octal escapes), so the string's length is its byte length. */
export type PdfLine={text:string;bold?:boolean;size?:number}
const replacements:Record<string,string>={'\u2013':'-','\u2014':'-','\u2018':"'",'\u2019':"'",'\u201c':'"','\u201d':'"','\u2026':'...','\u2192':'->','\u00a0':' ','\u2264':'<=','\u2265':'>='}
const winAnsi=(text:string)=>[...text].map(c=>replacements[c]??(c.charCodeAt(0)<=255&&c.charCodeAt(0)>=32?c:'?')).join('')
const literal=(text:string)=>winAnsi(text).replace(/[\\()]/g,m=>'\\'+m).replace(/[\u0080-\u00ff]/g,c=>'\\'+c.charCodeAt(0).toString(8).padStart(3,'0'))
function wrap(text:string,max:number):string[]{
 const out:string[]=[];let line=''
 for(const word of text.split(' ')){
  if(line&&(line+' '+word).length>max){out.push(line);line=''}
  line=line?line+' '+word:word
  while(line.length>max){out.push(line.slice(0,max));line=line.slice(max)}
 }
 return [...out,line]
}
export function textPdf(lines:PdfLine[]):string{
 const pages:string[][]=[[]],top=750,bottom=54;let y=top
 for(const line of lines){
  const size=line.size??10,step=Math.round(size*1.4)
  for(const part of wrap(line.text,Math.floor(504/(size*0.5)))){
   if(y-step<bottom){pages.push([]);y=top}
   y-=step;pages.at(-1)!.push(`BT /${line.bold?'F2':'F1'} ${size} Tf 54 ${y} Td (${literal(part)}) Tj ET`)
  }
 }
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>']
 const kids:string[]=[]
 for(const page of pages){
  const stream=page.join('\n'),pageId=objects.length+1
  objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageId+1} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  kids.push(`${pageId} 0 R`)
 }
 objects[1]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`
 let body='%PDF-1.4\n';const offsets:number[]=[]
 objects.forEach((object,i)=>{offsets.push(body.length);body+=`${i+1} 0 obj\n${object}\nendobj\n`})
 const xref=body.length
 body+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
 return body
}
