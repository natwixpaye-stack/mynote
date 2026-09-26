// ==UserScript==
// @name         MyNote Auto Sync - Anita Conti
// @namespace    https://mynote-k8am.onrender.com
// @version      1.1
// @description  Auto-sync Pronote vers MyNote comme Papillon - extrait loginState et envoie à MyNote, auto-actualisation
// @author       MyNote
// @match        https://*.index-education.net/pronote/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';
    console.log('[MyNote] Auto-sync script chargé sur', location.href);
    
    let lastToken=null;
    
    function tryExtract(){
        try{
            const state=window.loginState;
            if(!state || !state.login || !state.mdp) return;
            
            const tokenKey=state.login+':'+state.mdp;
            if(tokenKey===lastToken) return;
            lastToken=tokenKey;
            
            console.log('[MyNote] loginState trouvé', state.login);
            
            const data={
                url: location.origin + '/pronote/',
                login: state.login,
                token: state.mdp,
                deviceUUID: 'mynote-'+Math.random().toString(36).slice(2),
                time: Date.now()
            };
            
            localStorage.setItem('mynote_papillon_token', JSON.stringify(data));
            
            fetch('https://mynote-k8am.onrender.com/api/ent-callback',{
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({url:data.url, login:data.login, token:data.token, deviceUUID:data.deviceUUID})
            }).then(r=>r.json()).then(j=>{
                if(j.success){
                    console.log('[MyNote] Sync OK', j.user.name);
                    localStorage.setItem('mynote_real_data', JSON.stringify(j));
                    localStorage.setItem('mynote_last_sync', Date.now().toString());
                    
                    let banner=document.createElement('div');
                    banner.style.cssText='position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:9999999;background:#2ECC71;color:black;padding:16px 24px;border-radius:12px;font-family:Inter,sans-serif;font-weight:800;box-shadow:0 8px 32px rgba(0,0,0,0.4);text-align:center';
                    banner.innerHTML='✅ MyNote Auto-Sync: '+j.user.name+'<br><span style="font-size:12px">'+j.timetable.classes.length+' cours - <a href="https://mynote-k8am.onrender.com" target="_blank" style="color:black;text-decoration:underline">Ouvrir MyNote</a></span>';
                    document.body.appendChild(banner);
                    setTimeout(()=>banner.remove(), 6000);
                }
            }).catch(e=>console.log('[MyNote] Erreur sync', e));
        }catch(e){ console.log('[MyNote] Erreur', e); }
    }
    
    setInterval(tryExtract, 2000);
    window.addEventListener('load', ()=>setTimeout(tryExtract, 2000));
    setTimeout(tryExtract, 1000);
    console.log('[MyNote] Auto-sync en attente de loginState...');
})();
