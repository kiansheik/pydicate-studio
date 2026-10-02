"use strict";
const fields=Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
history.replaceState(null,"",location.pathname);
fetch("/api/sso/finish",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(fields)}).then(async response=>{const result=await response.json();if(!response.ok)throw new Error(result.error?.message||"Não foi possível entrar.");location.replace(result.returnTo||"/");}).catch(error=>{document.getElementById("message").textContent=error.message;});
