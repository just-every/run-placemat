document.querySelector('#refresh-kitchen').addEventListener('click',()=>location.reload())
let version=Number(document.body.dataset.version)
setInterval(async()=>{
 try{
  const response=await fetch('/api/floor-version',{cache:'no-store'});if(!response.ok)throw Error()
  const next=(await response.json()).version
  if(version!==undefined&&version!==next)location.reload()
  version=next;document.querySelector('#kitchen-sync').textContent='Live view'
 }catch{document.querySelector('#kitchen-sync').textContent='Live updates unavailable. Refresh before preparing service.'}
},3000)
