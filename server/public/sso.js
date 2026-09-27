"use strict";
const fields=Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
history.replaceState(null,"",location.pathname);
fetch("/api/sso/finish",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(fields)}).then(async response=>{if(!response.ok)throw new Error((await response.json()).error?.message||"Não foi possível entrar.");location.replace("/");}).catch(error=>{document.getElementById("message").textContent=error.message;});
