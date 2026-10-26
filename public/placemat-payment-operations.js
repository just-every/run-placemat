document.addEventListener('submit',async event=>{
 const form=event.target.closest('form[data-operation]');if(!form)return
 event.preventDefault()
 const data=Object.fromEntries(new FormData(form)),status=document.querySelector('#operation-status'),button=form.querySelector('button')
 if('acknowledged' in data)data.acknowledged=data.acknowledged==='on'
 if(form.dataset.operation==='export'){data.accounts={clearing:data.clearing,revenue:data.revenue,disputes:data.disputes};delete data.clearing;delete data.revenue;delete data.disputes}
 button.disabled=true;status.textContent='Recording your decision…'
 try{
  const response=await fetch('/api/payments/operations/'+form.dataset.operation,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)}),result=await response.json()
  if(!response.ok)throw Error(result.error??'The decision could not be saved.')
  location.reload()
 }catch(error){status.textContent=error.message;button.disabled=false;status.focus()}
})
