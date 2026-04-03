const CSS = `
:host{
  all:initial;
  color-scheme:dark;
  -webkit-font-smoothing:antialiased;
  text-rendering:optimizeLegibility;
  --lmsx-font-ui:'Segoe UI Variable','Segoe UI',system-ui,-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;
  --lmsx-font-mono:'JetBrains Mono','Cascadia Code','Consolas','Segoe UI',monospace;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
button,input,select{font:inherit}

.scene{position:fixed;top:16px;right:16px;width:300px;perspective:900px;z-index:2147483647}
.scene.is-dragging{user-select:none}
.scene.docked{top:auto!important;right:16px!important;bottom:16px!important;left:auto!important;width:auto;perspective:none}
.card{width:300px;position:relative;transform-style:preserve-3d;transition:transform 0.55s cubic-bezier(.4,0,.2,1)}
.card.flipped{transform:rotateY(180deg)}
.scene.docked .card{display:none}
.face{
  width:300px;background:#0D0D10;
  border-radius:14px;border:.5px solid rgba(255,255,255,.07);
  overflow:hidden;backface-visibility:hidden;-webkit-backface-visibility:hidden;
  font-family:var(--lmsx-font-ui);transition:border-radius .3s
}
.face.back{position:absolute;top:0;left:0;transform:rotateY(180deg)}

.titlebar{display:flex;align-items:center;padding:10px 13px;border-bottom:.5px solid rgba(255,255,255,.05);cursor:grab}
.titlebar:active{cursor:grabbing}
.dots{display:flex;gap:6px}
.dot{width:11px;height:11px;border-radius:50%;cursor:pointer;flex-shrink:0;transition:filter .15s,opacity .15s;position:relative}
.dot::before{content:'';position:absolute;top:-5px;bottom:-5px;left:-3px;right:-3px;border-radius:50%}
.dot:hover{filter:brightness(1.35)}
.dot.r{background:#FF5F57}
.dot.y{background:#FEBC2E}
.dot.g{background:#28C840}
.dot.g.glow{animation:gpulse 2s ease-in-out infinite}
@keyframes gpulse{0%,100%{box-shadow:0 0 0 0 rgba(40,200,64,.55)}50%{box-shadow:0 0 0 5px rgba(40,200,64,0)}}
.dot.r::after,.dot.y::after,.dot.g::after{content:'';position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .15s;border-radius:50%}
.dot.r:hover::after{content:'×';font-size:9px;color:rgba(0,0,0,.6);opacity:1}
.dot.y:hover::after{content:'−';font-size:9px;color:rgba(0,0,0,.6);opacity:1}
.dot.g:hover::after{content:'▶';font-size:6px;color:rgba(0,0,0,.6);opacity:1}

.panel-title{flex:1;text-align:center;font-size:11.5px;font-weight:500;color:rgba(255,255,255,.34);letter-spacing:.09em;font-family:var(--lmsx-font-mono)}
.gear-btn{background:none;border:none;cursor:pointer;padding:8px;margin:-6px;display:flex;align-items:center;color:rgba(255,255,255,.28);transition:color .15s}
.gear-btn:hover{color:rgba(255,255,255,.65)}

.collapsible{transition:max-height .35s cubic-bezier(.4,0,.2,1),opacity .3s;overflow:hidden}
.collapsible.collapsed{max-height:0!important;opacity:0;pointer-events:none}

.log-wrap{padding:11px 13px;min-height:105px;display:flex;flex-direction:column;max-height:200px;overflow:hidden}
.log-line{display:flex;align-items:baseline;gap:6px;font-family:var(--lmsx-font-mono);font-size:11px;line-height:1.85;opacity:0;transform:translateY(3px);transition:opacity .2s,transform .2s}
.log-line.vis{opacity:1;transform:none}
.log-line.dim{opacity:.18}
.lt{flex-shrink:0;width:13px;text-align:center;font-size:11px}
.lt.ok{color:#28C840}.lt.spin{color:#FEBC2E}.lt.err{color:#FF5F57}.lt.d{color:rgba(255,255,255,.15)}
.lm{color:rgba(255,255,255,.68);font-size:11px}
.lm.hi{color:rgba(255,255,255,.82)}
.lm.lo{color:rgba(255,255,255,.34)}

.sep{height:.5px;background:rgba(255,255,255,.05);margin:0 13px}
.footer{display:flex;align-items:center;justify-content:space-between;padding:8px 13px 11px}
.status-left{display:flex;align-items:center;gap:7px}

.live-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0;transition:background .3s}
.live-dot.idle{background:#252525}
.live-dot.running{background:#FEBC2E;animation:lp .9s ease-in-out infinite}
.live-dot.done{background:#28C840;animation:lp 2.2s ease-in-out infinite}
@keyframes lp{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.2;transform:scale(.6)}}

.slabel{font-size:10.5px;color:rgba(255,255,255,.34);transition:color .3s;letter-spacing:.03em}
.slabel.running{color:rgba(254,188,46,.72)}
.slabel.done{color:rgba(40,200,64,.72)}

.toggle-row{display:flex;align-items:center;gap:7px}
.tlabel{font-size:11px;color:rgba(255,255,255,.52)}
.tog{width:30px;height:17px;border-radius:9px;background:#1a1a1a;border:.5px solid rgba(255,255,255,.08);cursor:pointer;position:relative;transition:background .2s,border-color .2s}
.tog.on{background:#172e1a;border-color:rgba(40,200,64,.25)}
.tog-thumb{position:absolute;top:2.5px;left:2.5px;width:12px;height:12px;border-radius:50%;background:#383838;transition:transform .2s,background .2s}
.tog.on .tog-thumb{transform:translateX(13px);background:#28C840}

.back-body{padding:14px 13px 13px}
.section-label{font-size:10px;font-weight:500;color:rgba(255,255,255,.44);letter-spacing:.1em;margin-bottom:10px}
.api-block{margin-bottom:10px}
.api-provider{display:flex;align-items:center;gap:6px;margin-bottom:5px}
.pdot{width:5px;height:5px;border-radius:50%;flex-shrink:0}
.pdot.gr{background:#F55036}
.pname{font-size:11px;color:rgba(255,255,255,.56);font-weight:500;letter-spacing:.04em}
.api-row{display:flex;gap:6px;align-items:center}
.api-input{flex:1;background:#0a0a0d;border:.5px solid rgba(255,255,255,.08);border-radius:6px;padding:7px 9px;color:rgba(255,255,255,.72);font-size:11px;font-family:var(--lmsx-font-mono);outline:none;transition:border-color .15s;min-width:0}
.api-input:focus{border-color:rgba(255,255,255,.22)}
.api-input::placeholder{color:rgba(255,255,255,.12)}
.eye-btn{background:#0a0a0d;border:.5px solid rgba(255,255,255,.08);border-radius:6px;cursor:pointer;padding:6px 8px;color:rgba(255,255,255,.22);transition:all .15s;flex-shrink:0;display:flex;align-items:center}
.eye-btn:hover{border-color:rgba(255,255,255,.18);color:rgba(255,255,255,.55)}
.divline{height:.5px;background:rgba(255,255,255,.04);margin:10px 0}
.save-btn{width:100%;background:#172e1a;border:.5px solid rgba(40,200,64,.2);border-radius:7px;padding:8px;color:rgba(40,200,64,.75);font-size:11.5px;font-family:var(--lmsx-font-mono);font-weight:500;cursor:pointer;transition:all .15s;letter-spacing:.04em}
.save-btn:hover{background:#1d3820;border-color:rgba(40,200,64,.4);color:#28C840}
.saved-hint{text-align:center;font-size:10.5px;color:rgba(40,200,64,.72);margin-top:7px;opacity:0;transition:opacity .25s;height:16px}
.back-footer{display:flex;align-items:center;justify-content:space-between;margin-top:11px;padding-top:10px;border-top:.5px solid rgba(255,255,255,.04)}
.back-btn{background:none;border:none;cursor:pointer;font-size:11px;color:rgba(255,255,255,.44);font-family:var(--lmsx-font-mono);display:flex;align-items:center;gap:4px;padding:0;transition:color .15s}
.back-btn:hover{color:rgba(255,255,255,.5)}
.key-links{display:flex;gap:10px;align-items:center}
.klink{font-size:10.5px;color:rgba(255,255,255,.44);text-decoration:none;display:flex;align-items:center;gap:3px;transition:color .15s}
.klink:hover{color:rgba(255,255,255,.45)}

.mini-dock{display:none;align-items:center;gap:7px;padding:8px 12px;border-radius:999px;background:#0D0D10;border:.5px solid rgba(255,255,255,.08);color:rgba(255,255,255,.78);font-family:var(--lmsx-font-mono);font-size:11px;cursor:pointer;box-shadow:0 8px 18px rgba(0,0,0,.35);transition:transform .15s,box-shadow .15s,color .15s,border-color .15s}
.mini-dock:hover{transform:translateY(-1px);border-color:rgba(255,255,255,.2);color:rgba(255,255,255,.9)}
.mini-dock:active{transform:translateY(0)}
.mini-dot{width:6px;height:6px;border-radius:50%;background:#FF5F57;box-shadow:0 0 6px rgba(255,95,87,.6)}
.mini-label{letter-spacing:.08em}
.scene.docked .mini-dock{display:flex}

@media (max-width:420px){
  .scene{right:8px;left:8px;width:auto}
  .card,.face{width:100%}
}
`;
