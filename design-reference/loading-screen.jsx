// loading-screen.jsx — HoloAcademy simulation build loading screen
// Canvas particle engine + status messages + progress. Exports window.HoloLoadingScreen.

(function () {
  const { React } = window;

  const STEPS = [
    'מאתחל מנוע ההדמיה…',
    'בונה את עולם הסימולציה…',
    'יוצר דמויות ומשימות…',
    'מכייל רמת קושי…',
    'בודק לוגיקה פדגוגית…',
    'מגדיר חידות ואתגרים…',
    'מחבר ד"ר הולו לתרחיש…',
    'בדיקה סופית ועיצוב…',
    'ההדמיה מוכנה!',
  ];

  function useParticleCanvas(canvasRef, active) {
    React.useEffect(() => {
      if (!active || !canvasRef.current) return;
      const canvas = canvasRef.current;
      const ctx    = canvas.getContext('2d');
      let raf;

      const resize = () => {
        canvas.width  = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
      };
      resize();
      window.addEventListener('resize', resize);

      const W = () => canvas.width;
      const H = () => canvas.height;

      // Orbital particles
      const orbs = Array.from({ length: 120 }, (_, i) => ({
        angle:  (i / 120) * Math.PI * 2,
        radius: 80 + Math.sin(i * 0.7) * 60,
        speed:  0.003 + Math.random() * 0.006,
        size:   1.5 + Math.random() * 3,
        color:  ['#2ff3ff','#ff45e6','#ff9a2e','#ffffff'][i % 4],
        alpha:  0.3 + Math.random() * 0.7,
        layer:  Math.floor(Math.random() * 3),
      }));

      // Inward-streaming data particles
      const streams = Array.from({ length: 40 }, () => ({
        x:     Math.random() * 2000 - 1000,
        y:     Math.random() * 2000 - 1000,
        speed: 1.5 + Math.random() * 3,
        size:  2 + Math.random() * 4,
        color: ['#2ff3ff','#ff45e6','#ff9a2e'][Math.floor(Math.random() * 3)],
        alpha: 0,
      }));

      let t = 0;

      const draw = () => {
        const w = W(), h = H(), cx = w / 2, cy = h / 2;
        ctx.clearRect(0, 0, w, h);
        t += 0.016;

        // ── Central hex glow ──────────────────────────────────────────────
        const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 120);
        grd.addColorStop(0,   'rgba(47,243,255,.18)');
        grd.addColorStop(0.5, 'rgba(255,69,230,.08)');
        grd.addColorStop(1,   'transparent');
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(cx, cy, 120, 0, Math.PI * 2); ctx.fill();

        // ── Hexagon core ──────────────────────────────────────────────────
        const drawHex = (r, stroke, lw, rot) => {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(rot);
          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2;
            k === 0 ? ctx.moveTo(Math.cos(a)*r, Math.sin(a)*r) : ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
          }
          ctx.closePath();
          ctx.strokeStyle = stroke;
          ctx.lineWidth   = lw;
          ctx.stroke();
          ctx.restore();
        };
        drawHex(44, 'rgba(47,243,255,.6)',  1.5, t * 0.4);
        drawHex(34, 'rgba(255,69,230,.4)',  1,   -t * 0.6);
        drawHex(24, 'rgba(47,243,255,.35)', 0.8,  t * 0.9);

        // ── Rotating rings ────────────────────────────────────────────────
        [[130,1.2,'rgba(47,243,255,.35)',.5],
         [165,0.8,'rgba(255,69,230,.25)',.35],
         [200,0.6,'rgba(255,154,46,.2)',.25]].forEach(([r, lw, col, sp], ri) => {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(t * sp * (ri % 2 === 0 ? 1 : -1));
          ctx.beginPath();
          // dashed ring
          ctx.setLineDash([12, 8]);
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.strokeStyle = col;
          ctx.lineWidth   = lw;
          ctx.stroke();
          ctx.setLineDash([]);
          // tick marks
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            const x1 = Math.cos(a) * (r - 4), y1 = Math.sin(a) * (r - 4);
            const x2 = Math.cos(a) * (r + 4), y2 = Math.sin(a) * (r + 4);
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
            ctx.strokeStyle = col.replace(/[\d.]+\)$/, '1)');
            ctx.lineWidth   = 1.2;
            ctx.stroke();
          }
          ctx.restore();
        });

        // ── Orbital particles ─────────────────────────────────────────────
        orbs.forEach(o => {
          o.angle += o.speed * (o.layer === 0 ? 1 : o.layer === 1 ? -0.7 : 0.5);
          const r  = o.radius + Math.sin(t * 1.5 + o.angle) * 12;
          const x  = cx + Math.cos(o.angle) * r;
          const y  = cy + Math.sin(o.angle) * r;
          const pulse = (Math.sin(t * 3 + o.angle) + 1) / 2;
          ctx.save();
          ctx.globalAlpha = o.alpha * (0.4 + pulse * 0.6);
          ctx.fillStyle   = o.color;
          ctx.shadowColor = o.color;
          ctx.shadowBlur  = 8;
          ctx.beginPath(); ctx.arc(x, y, o.size * (0.8 + pulse * 0.4), 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        });

        // ── Data streams flowing inward ───────────────────────────────────
        streams.forEach(s => {
          const dx = cx - (cx + s.x);
          const dy = cy - (cy + s.y);
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          s.x += (dx / dist) * s.speed;
          s.y += (dy / dist) * s.speed;
          const d2 = Math.sqrt(s.x * s.x + s.y * s.y);
          s.alpha = Math.min(1, d2 / 200);
          if (d2 < 20) {
            const a = Math.random() * Math.PI * 2;
            const r = 200 + Math.random() * 200;
            s.x = Math.cos(a) * r;
            s.y = Math.sin(a) * r;
          }
          ctx.save();
          ctx.globalAlpha = s.alpha * 0.7;
          ctx.fillStyle   = s.color;
          ctx.shadowColor = s.color;
          ctx.shadowBlur  = 6;
          ctx.fillRect(cx + s.x - s.size / 2, cy + s.y - s.size / 2, s.size, s.size);
          ctx.restore();
        });

        // ── Central dot ───────────────────────────────────────────────────
        const dotPulse = (Math.sin(t * 4) + 1) / 2;
        ctx.save();
        ctx.globalAlpha = 0.9 + dotPulse * 0.1;
        ctx.fillStyle   = '#fff';
        ctx.shadowColor = '#2ff3ff';
        ctx.shadowBlur  = 20 + dotPulse * 20;
        ctx.beginPath(); ctx.arc(cx, cy, 5 + dotPulse * 2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        raf = requestAnimationFrame(draw);
      };

      draw();
      return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
    }, [active]);
  }

  window.HoloLoadingScreen = function HoloLoadingScreen({ title, onDone }) {
    const canvasRef  = React.useRef(null);
    const [step,     setStep]     = React.useState(0);
    const [progress, setProgress] = React.useState(0);
    const [exiting,  setExiting]  = React.useState(false);

    useParticleCanvas(canvasRef, true);

    React.useEffect(() => {
      const total  = 4000; // ms
      const steps  = STEPS.length;
      const perStep = total / steps;
      let elapsed  = 0;
      const interval = setInterval(() => {
        elapsed += 80;
        setProgress(Math.min(100, (elapsed / total) * 100));
        setStep(Math.min(steps - 1, Math.floor(elapsed / perStep)));
        if (elapsed >= total) {
          clearInterval(interval);
          setTimeout(() => { setExiting(true); setTimeout(onDone, 500); }, 400);
        }
      }, 80);
      return () => clearInterval(interval);
    }, []);

    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'radial-gradient(120% 90% at 50% -10%, #0c1430 0%, #070a18 50%, #04060f 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Rubik', sans-serif", direction: 'rtl', overflow: 'hidden',
        opacity: exiting ? 0 : 1, transition: 'opacity .5s ease',
      }}>
        <style>{`
          @keyframes ld-scanline { 0%{top:0%;opacity:1} 100%{top:100%;opacity:0} }
          @keyframes ld-blink    { 0%,49%{opacity:1} 50%,100%{opacity:0} }
          @keyframes ld-fadein   { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
          @keyframes ld-progress { from{box-shadow:0 0 8px rgba(47,243,255,.4)} to{box-shadow:0 0 22px rgba(47,243,255,.9),0 0 40px rgba(47,243,255,.3)} }
        `}</style>

        {/* bg grid */}
        <div style={{ position:'absolute', inset:0, backgroundImage:'linear-gradient(rgba(80,150,210,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(80,150,210,.04) 1px,transparent 1px)', backgroundSize:'40px 40px', pointerEvents:'none' }} />

        {/* scan line */}
        <div style={{ position:'absolute', left:0, right:0, height:2, background:'linear-gradient(90deg,transparent,rgba(47,243,255,.5),transparent)', animation:'ld-scanline 2.4s linear infinite', pointerEvents:'none' }} />

        {/* particle canvas */}
        <canvas ref={canvasRef} style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none' }} />

        {/* content */}
        <div style={{ position:'relative', zIndex:2, display:'flex', flexDirection:'column', alignItems:'center', gap:0, width: 420 }}>

          {/* sim title */}
          <div style={{ fontFamily:"'Space Mono',monospace", fontSize:10, letterSpacing:'.28em', textTransform:'uppercase', color:'rgba(47,243,255,.55)', marginBottom:14 }}>◇ יוצר הדמיה</div>
          <div style={{ fontSize:22, fontWeight:800, color:'#fff', marginBottom:36, textAlign:'center', textShadow:'0 0 20px rgba(47,243,255,.3)' }}>{title || 'ההדמיה שלך'}</div>

          {/* hologram circle placeholder */}
          <div style={{ width:240, height:240, marginBottom:36 }} />

          {/* status */}
          <div key={step} style={{ fontFamily:"'Space Mono',monospace", fontSize:12, letterSpacing:'.16em', color:'#2ff3ff', marginBottom:18, textAlign:'center', animation:'ld-fadein .3s ease both', minHeight:20, textShadow:'0 0 14px rgba(47,243,255,.6)' }}>
            {STEPS[step]}
            <span style={{ animation:'ld-blink .8s infinite' }}>_</span>
          </div>

          {/* progress bar */}
          <div style={{ width:'100%', height:4, borderRadius:4, background:'rgba(47,243,255,.1)', border:'1px solid rgba(47,243,255,.15)', overflow:'hidden', marginBottom:10 }}>
            <div style={{ height:'100%', borderRadius:4, background:'linear-gradient(90deg,#ff45e6,#2ff3ff)', width: progress + '%', transition:'width .1s linear', animation:'ld-progress 1s ease-in-out infinite alternate' }} />
          </div>

          {/* pct */}
          <div style={{ fontFamily:"'Space Mono',monospace", fontSize:11, color:'rgba(47,243,255,.5)', letterSpacing:'.12em' }}>
            {Math.round(progress)}<span style={{ fontSize:8 }}>%</span>
          </div>
        </div>
      </div>
    );
  };
})();
