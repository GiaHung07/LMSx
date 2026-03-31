const CSS = `
:host{all:initial;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;outline:none;border:none;}

.lms-panel{
  --bg:#0D0D10;--s1:#131316;--s2:#17171B;--s3:#1D1D23;--s4:#23232A;
  --bd:#26262E;--bd2:#30303A;
  --red:#E8271A;--red2:#C01F15;--red-a:rgba(232,39,26,.08);--red-b:rgba(232,39,26,.18);
  --green:#1DB954;--grn-a:rgba(29,185,84,.08);--grn-b:rgba(29,185,84,.18);
  --amber:#D97706;--amb-a:rgba(217,119,6,.08);--amb-b:rgba(217,119,6,.18);
  --t1:#F0F0F4;--t2:#9090A0;--t3:#606072;
  --r:14px;--r2:11px;--r3:9px;--r4:7px;
  position:fixed;top:16px;right:16px;width:252px;min-width:200px;
  background:var(--bg);border:1px solid var(--bd);border-radius:var(--r);
  color:var(--t1);z-index:2147483647;display:flex;flex-direction:column;
  box-shadow:0 8px 32px rgba(0,0,0,.55);font-size:13px;line-height:1.4;
  overflow:visible;
}
.lms-panel.is-dragging{user-select:none;}
.P-hidden{display:none!important;}

/* HEADER */
.H{padding:10px 12px;display:flex;align-items:center;justify-content:space-between;
  border-bottom:1px solid var(--bd);background:var(--s1);border-radius:var(--r) var(--r) 0 0;
  cursor:grab;user-select:none;flex-shrink:0;}
.H:active{cursor:grabbing;}
.H-wm{font-size:15px;font-weight:800;letter-spacing:-.5px;color:var(--t1);display:flex;align-items:center;gap:0;}
.H-wm em{color:var(--red);font-style:normal;}
.H-meta{font-size:9px;color:var(--t3);font-weight:500;margin-left:8px;padding-left:8px;border-left:1px solid var(--bd2);letter-spacing:.2px;}
.H-dots{display:flex;gap:5px;align-items:center;}
.H-dot{width:11px;height:11px;border-radius:50%;cursor:pointer;flex-shrink:0;transition:filter .12s;}
.H-dot:hover{filter:brightness(1.5);}
.H-dot--min{background:var(--s4);border:1px solid var(--bd2);}
.H-dot--cls{background:var(--red);opacity:.7;}

/* BODY */
.B{padding:13px 12px;display:flex;flex-direction:column;gap:11px;flex:1;background:var(--bg);}

/* PROGRESS */
.P{background:var(--s2);border:1px solid var(--bd);border-radius:var(--r2);padding:13px 13px 11px;}
.P-top{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:9px;}
.P-num{font-size:34px;font-weight:800;letter-spacing:-1.5px;line-height:1;color:var(--t1);}
.P-num sup{font-size:14px;font-weight:700;color:var(--t2);vertical-align:super;margin-left:1px;}
.P-rt{text-align:right;}
.P-lbl{font-size:8px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--t2);}
.P-val{font-size:11px;font-weight:700;color:var(--t2);margin-top:3px;}
.P-track{height:5px;background:var(--s4);border-radius:3px;overflow:hidden;}
.P-fill{height:100%;border-radius:3px;background:var(--red);width:0%;transition:width .5s cubic-bezier(.4,0,.2,1);}
.P-tags{display:flex;gap:8px;margin-top:7px;}
.P-tag{font-size:8px;font-weight:700;letter-spacing:.4px;color:var(--t3);display:flex;align-items:center;gap:3px;}
.P-tag::before{content:'';width:5px;height:5px;border-radius:50%;background:var(--s4);border:1px solid var(--bd2);flex-shrink:0;}
.P-tag.done{color:var(--green);}
.P-tag.done::before{background:var(--green);border-color:var(--green);}

/* TOGGLE */
.T{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-radius:var(--r3);
  border:1px solid var(--bd);background:var(--s2);cursor:pointer;user-select:none;
  transition:border-color .15s,background .15s;}
.T.on{border-color:var(--red-b);background:var(--red-a);}
.T-left{display:flex;align-items:center;gap:9px;}
.T-dot{width:6px;height:6px;border-radius:50%;background:var(--t3);flex-shrink:0;transition:background .2s;}
.T-dot.on{background:var(--green);animation:glow 1.8s ease-in-out infinite;}
@keyframes glow{0%,100%{box-shadow:0 0 0 0 rgba(29,185,84,.5);}60%{box-shadow:0 0 0 5px rgba(29,185,84,0);}}
.T-name{font-size:12px;font-weight:700;color:var(--t2);transition:color .15s;}
.T-name.on{color:var(--t1);}
.T-sub{font-size:9px;color:var(--t3);margin-top:2px;transition:color .15s;}
.T-sub.on{color:rgba(232,39,26,.6);}
.T-sw{width:34px;height:19px;background:var(--s4);border:1px solid var(--bd2);border-radius:10px;
  position:relative;flex-shrink:0;transition:background .2s,border-color .2s;}
.T-sw::after{content:'';position:absolute;top:2px;left:2px;width:13px;height:13px;
  background:var(--t3);border-radius:50%;transition:transform .2s,background .2s;}
.T-sw.on{background:var(--red);border-color:var(--red2);}
.T-sw.on::after{transform:translateX(15px);background:#fff;}

/* API KEY */
.A-lbl{font-size:8px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--t2);margin-bottom:5px;display:block;}
.A-row{display:flex;gap:5px;}
.A-inp{flex:1;height:33px;padding:0 9px;background:var(--s2);border:1px solid var(--bd)!important;
  border-radius:var(--r4);color:var(--t1);font-size:10px;font-family:monospace;transition:border-color .15s!important;}
.A-inp::placeholder{color:var(--t3);font-size:9px;}
.A-inp:focus{border-color:var(--red)!important;}
.A-btn{height:33px;padding:0 12px;border-radius:var(--r4);background:var(--s4);border:1px solid var(--bd2);
  color:var(--t2);font-size:9px;font-weight:800;letter-spacing:1px;cursor:pointer;transition:all .15s;flex-shrink:0;}
.A-btn:hover{background:var(--s3);color:var(--t1);}
.A-btn.ok{background:var(--grn-a);border-color:var(--grn-b);color:var(--green);}
.A-sel{height:20px;padding:0 4px;background:var(--bg);border:1px solid var(--bd);border-radius:3px;color:var(--t2);font-size:9px;font-weight:700;font-family:inherit;outline:none;}
.A-sel:focus{border-color:var(--red);color:var(--t1);}

/* LOG */
.L{display:flex;align-items:center;gap:7px;padding:8px 10px;border-radius:var(--r4);background:var(--s2);border:1px solid var(--bd);}
.L-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0;}
.L-dot.on{background:var(--green);animation:glow 1.8s ease-in-out infinite;}
.L-dot.off{background:var(--t3);}
.L-txt{font-size:10px;font-weight:600;color:var(--t2);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.L-tm{font-size:8px;color:var(--t3);flex-shrink:0;font-variant-numeric:tabular-nums;}

/* FOOTER */
.F{padding:7px 12px;border-top:1px solid var(--bd);display:flex;align-items:center;justify-content:space-between;
  flex-shrink:0;background:var(--s1);border-radius:0 0 var(--r) var(--r);}
.F-left{font-size:8px;color:var(--t3);font-weight:700;letter-spacing:.5px;}
.F-right{display:flex;align-items:center;gap:8px;}
.F-ver{font-size:8px;color:var(--t3);font-weight:600;background:var(--s3);border:1px solid var(--bd);border-radius:3px;padding:2px 5px;letter-spacing:.3px;}
.F-grip{width:12px;height:12px;opacity:.4;cursor:nwse-resize;flex-shrink:0;}
.F-grip svg{display:block;width:100%;height:100%;}
.F-grip:hover{opacity:.8;}

/* RESIZE HANDLES */
.RZ{position:absolute;z-index:20;background:transparent;}
.RZ-e{right:0;top:14px;bottom:14px;width:6px;cursor:ew-resize;}
.RZ-s{bottom:0;left:14px;right:14px;height:6px;cursor:ns-resize;}
.RZ-se{right:0;bottom:0;width:18px;height:18px;cursor:nwse-resize;}
.RZ-w{left:0;top:14px;bottom:14px;width:6px;cursor:ew-resize;}

/* FAB */
.FAB{position:fixed;bottom:16px;right:16px;width:40px;height:40px;background:#E8271A;border-radius:11px;
  display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:2147483647;
  opacity:0;transform:scale(0);transition:transform .15s,opacity .15s;
  box-shadow:0 4px 14px rgba(232,39,26,.35);}
.FAB svg{width:18px;height:18px;fill:#fff;}
.FAB:hover{transform:scale(1.07)!important;}
.FAB:active{transform:scale(.94)!important;}
.FAB.show{opacity:1;transform:scale(1);}

/* TOASTS */
.TT{position:fixed;bottom:64px;right:16px;display:flex;flex-direction:column-reverse;gap:5px;z-index:2147483648;pointer-events:none;}
.TT-item{pointer-events:auto;display:flex;align-items:center;gap:8px;padding:9px 11px;border-radius:8px;
  border:1px solid transparent;max-width:240px;opacity:0;transform:translateX(40px);transition:opacity .2s,transform .2s;}
.TT-item.show{opacity:1;transform:translateX(0);}
.TT-item.info{background:rgba(59,130,246,.08);border-color:rgba(59,130,246,.18);}
.TT-item.ok{background:rgba(29,185,84,.08);border-color:rgba(29,185,84,.18);}
.TT-item.warn{background:rgba(217,119,6,.08);border-color:rgba(217,119,6,.18);}
.TT-item.error{background:rgba(232,39,26,.08);border-color:rgba(232,39,26,.18);}
.TT-icn{width:14px;height:14px;flex-shrink:0;display:flex;align-items:center;}
.TT-icn svg{width:100%;height:100%;}
.TT-item.info .TT-icn{color:#3B82F6;}
.TT-item.ok .TT-icn{color:#1DB954;}
.TT-item.warn .TT-icn{color:#D97706;}
.TT-item.error .TT-icn{color:#E8271A;}
.TT-msg{font-size:10px;font-weight:600;color:#F0F0F4;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.TT-ts{font-size:8px;color:#606072;flex-shrink:0;font-variant-numeric:tabular-nums;}
`;
