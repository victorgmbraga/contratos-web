(() => {
  'use strict';

  const root = document.documentElement;
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const toast = $('#toast');
  let toastTimer = 0;
  let orbit = null;

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2800);
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Sem permissão de clipboard: tenta o caminho antigo abaixo.
    }

    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand('copy');
      area.remove();
      return copied;
    } catch {
      return false;
    }
  }

  /* ---------- tema ---------- */

  const themeToggle = $('#theme-toggle');
  const themeMeta = $('meta[name="theme-color"]');

  function syncThemeUI() {
    const dark = root.dataset.theme === 'dark';
    if (themeToggle) {
      themeToggle.setAttribute('aria-pressed', String(dark));
      themeToggle.setAttribute('aria-label', dark ? 'Ativar modo claro' : 'Ativar modo escuro');
    }
    if (themeMeta) {
      const background = getComputedStyle(root).getPropertyValue('--bg').trim();
      if (background) themeMeta.setAttribute('content', background);
    }
    if (orbit) orbit.refreshColors();
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('sitezinho:theme', root.dataset.theme);
      } catch {
        // Tema continua funcionando apenas nesta visita.
      }
      syncThemeUI();
      showToast(root.dataset.theme === 'dark' ? 'Modo escuro ativado.' : 'Modo claro ativado.');
    });
  }

  /* ---------- entrada em cena ---------- */

  const revealElements = $$('.reveal');
  if (!('IntersectionObserver' in window) || reduceMotion.matches) {
    revealElements.forEach((element) => element.classList.add('is-visible'));
  } else {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px' });

    revealElements.forEach((element) => revealObserver.observe(element));
  }

  /* ---------- confete ---------- */

  const confettiCanvas = $('#confetti');
  const confettiContext = confettiCanvas ? confettiCanvas.getContext('2d') : null;
  let confettiPieces = [];
  let confettiFrame = 0;
  const confettiColors = ['#ff5c39', '#ffd166', '#c6f432', '#4f7cff', '#9b6bff', '#28c98a'];

  function sizeConfetti() {
    if (!confettiCanvas) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    confettiCanvas.width = Math.round(window.innerWidth * ratio);
    confettiCanvas.height = Math.round(window.innerHeight * ratio);
    confettiContext.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function confettiLoop() {
    confettiFrame = 0;
    if (!confettiContext) return;
    confettiContext.clearRect(0, 0, window.innerWidth, window.innerHeight);

    confettiPieces = confettiPieces.filter((piece) => piece.life > 0);

    confettiPieces.forEach((piece) => {
      piece.vy += 0.16;
      piece.vx *= 0.995;
      piece.vy *= 0.995;
      piece.x += piece.vx;
      piece.y += piece.vy;
      piece.rotation += piece.spin;
      piece.life -= 0.008;

      confettiContext.save();
      confettiContext.translate(piece.x, piece.y);
      confettiContext.rotate(piece.rotation);
      confettiContext.globalAlpha = clamp(piece.life, 0, 1);
      confettiContext.fillStyle = piece.color;
      confettiContext.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2);
      confettiContext.restore();
    });

    if (confettiPieces.length) {
      confettiFrame = requestAnimationFrame(confettiLoop);
    } else {
      confettiContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  }

  function burstConfetti(originX = window.innerWidth / 2, originY = window.innerHeight / 2, count = 90) {
    if (!confettiCanvas || !confettiContext || reduceMotion.matches) return;

    sizeConfetti();
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 9;
      confettiPieces.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 4,
        size: 5 + Math.random() * 8,
        color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
        rotation: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.3,
        life: 1
      });
    }

    if (!confettiFrame) confettiFrame = requestAnimationFrame(confettiLoop);
  }

  /* ---------- constelação do hero ---------- */

  class OrbitField {
    constructor(canvas) {
      this.canvas = canvas;
      this.context = canvas.getContext('2d');
      this.particles = [];
      this.pulses = [];
      this.pointer = { x: 0, y: 0, active: false };
      this.colors = {
        dot: '#ff5c39',
        alt: '#4f7cff',
        line: 'rgba(23,23,21,.18)'
      };
      this.width = 0;
      this.height = 0;
      this.frame = 0;
      this.resizeObserver = null;

      this.loop = this.loop.bind(this);
      this.bindEvents();
      this.resize();
      this.refreshColors();

      if ('ResizeObserver' in window) {
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(canvas);
      } else {
        window.addEventListener('resize', () => this.resize());
      }

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.stop();
        else this.start();
      });

      if (reduceMotion.addEventListener) {
        reduceMotion.addEventListener('change', () => {
          this.stop();
          this.draw();
          if (!reduceMotion.matches) this.start();
        });
      }

      this.start();
    }

    bindEvents() {
      this.canvas.addEventListener('pointermove', (event) => {
        const rect = this.canvas.getBoundingClientRect();
        this.pointer.x = event.clientX - rect.left;
        this.pointer.y = event.clientY - rect.top;
        this.pointer.active = true;
        if (reduceMotion.matches) this.draw();
      });

      this.canvas.addEventListener('pointerleave', () => {
        this.pointer.active = false;
        if (reduceMotion.matches) this.draw();
      });

      this.canvas.addEventListener('pointerdown', (event) => {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        this.pointer.x = x;
        this.pointer.y = y;
        this.pointer.active = true;
        this.pulses.push({ x, y, radius: 6, alpha: 0.75 });
        if (this.pulses.length > 6) this.pulses.shift();
        if (reduceMotion.matches) this.draw();
      });
    }

    refreshColors() {
      if (!this.canvas) return;
      const styles = getComputedStyle(this.canvas);
      this.colors.dot = styles.getPropertyValue('--orbit-dot').trim() || '#ff5c39';
      this.colors.alt = styles.getPropertyValue('--orbit-alt').trim() || '#4f7cff';
      this.colors.line = styles.getPropertyValue('--orbit-line').trim() || 'rgba(23,23,21,.18)';
      this.draw();
    }

    resize() {
      if (!this.canvas) return;
      const rect = this.canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      if (Math.abs(rect.width - this.width) < 2 && Math.abs(rect.height - this.height) < 2 && this.particles.length) return;

      this.width = rect.width;
      this.height = rect.height;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(this.width * ratio);
      this.canvas.height = Math.round(this.height * ratio);
      this.context.setTransform(ratio, 0, 0, ratio, 0, 0);

      const quantity = clamp(Math.round((this.width * this.height) / 8200), 26, 62);
      this.particles = Array.from({ length: quantity }, (_, index) => ({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.28,
        radius: 1.2 + Math.random() * 2.2,
        alt: index % 5 === 0
      }));

      this.pulses = [];
      this.draw();
    }

    step() {
      const pointer = this.pointer;
      this.particles.forEach((particle) => {
        if (pointer.active) {
          const dx = pointer.x - particle.x;
          const dy = pointer.y - particle.y;
          const distance = Math.hypot(dx, dy);
          if (distance > 0.1 && distance < 170) {
            const force = (1 - distance / 170) * 0.035;
            particle.vx += (dx / distance) * force;
            particle.vy += (dy / distance) * force;
          }
        }

        particle.vx = clamp(particle.vx * 0.994, -0.9, 0.9);
        particle.vy = clamp(particle.vy * 0.994, -0.9, 0.9);
        particle.x += particle.vx;
        particle.y += particle.vy;

        if (particle.x < -10) particle.x = this.width + 10;
        if (particle.x > this.width + 10) particle.x = -10;
        if (particle.y < -10) particle.y = this.height + 10;
        if (particle.y > this.height + 10) particle.y = -10;
      });

      this.pulses.forEach((pulse) => {
        pulse.radius += 1.6;
        pulse.alpha *= 0.965;
      });
      this.pulses = this.pulses.filter((pulse) => pulse.alpha > 0.02);
    }

    draw() {
      const context = this.context;
      if (!context) return;

      context.clearRect(0, 0, this.width, this.height);

      for (let first = 0; first < this.particles.length; first += 1) {
        for (let second = first + 1; second < this.particles.length; second += 1) {
          const a = this.particles[first];
          const b = this.particles[second];
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          if (distance > 118) continue;

          context.globalAlpha = (1 - distance / 118) * 0.62;
          context.strokeStyle = this.colors.line;
          context.lineWidth = 1;
          context.beginPath();
          context.moveTo(a.x, a.y);
          context.lineTo(b.x, b.y);
          context.stroke();
        }
      }

      this.particles.forEach((particle) => {
        context.globalAlpha = particle.alt ? 0.82 : 0.72;
        context.fillStyle = particle.alt ? this.colors.alt : this.colors.dot;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fill();
      });

      this.pulses.forEach((pulse) => {
        context.globalAlpha = Math.max(pulse.alpha, 0);
        context.strokeStyle = this.colors.dot;
        context.lineWidth = 1.4;
        context.beginPath();
        context.arc(pulse.x, pulse.y, pulse.radius, 0, Math.PI * 2);
        context.stroke();
      });

      if (this.pointer.active) {
        context.globalAlpha = 0.35;
        context.strokeStyle = this.colors.alt;
        context.lineWidth = 1;
        context.beginPath();
        context.arc(this.pointer.x, this.pointer.y, 22, 0, Math.PI * 2);
        context.stroke();

        context.globalAlpha = 0.18;
        context.beginPath();
        context.arc(this.pointer.x, this.pointer.y, 7, 0, Math.PI * 2);
        context.fillStyle = this.colors.alt;
        context.fill();
      }

      context.globalAlpha = 1;
    }

    loop() {
      if (document.hidden || reduceMotion.matches) {
        this.frame = 0;
        return;
      }
      this.step();
      this.draw();
      this.frame = requestAnimationFrame(this.loop);
    }

    start() {
      if (this.frame || reduceMotion.matches || document.hidden) return;
      this.frame = requestAnimationFrame(this.loop);
    }

    stop() {
      if (!this.frame) return;
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
  }

  const orbitCanvas = $('#orbits');
  if (orbitCanvas) {
    orbit = new OrbitField(orbitCanvas);
    syncThemeUI();
  }

  /* ---------- pintura em pixels ---------- */

  const pixelCanvas = $('#pixel-canvas');

  if (pixelCanvas) {
    const pixelContext = pixelCanvas.getContext('2d');
    const pixelPalette = $('#pixel-palette');
    const eraserButton = $('#pixel-eraser');
    const pixelClear = $('#pixel-clear');
    const pixelRandom = $('#pixel-random');
    const pixelDownload = $('#pixel-download');
    const pixelColors = ['#ff5c39', '#ffd166', '#28c98a', '#4f7cff', '#9b6bff', '#fff7e6'];
    let currentColor = '#ff5c39';
    let erasing = false;
    let drawing = false;
    let previousCell = null;

    function fillCell(x, y, color) {
      if (color === null) {
        pixelContext.clearRect(x, y, 1, 1);
        return;
      }
      pixelContext.fillStyle = color;
      pixelContext.fillRect(x, y, 1, 1);
    }

    function paintLine(from, to, color) {
      let x0 = from.x;
      let y0 = from.y;
      const x1 = to.x;
      const y1 = to.y;
      const dx = Math.abs(x1 - x0);
      const sx = x0 < x1 ? 1 : -1;
      const dy = -Math.abs(y1 - y0);
      const sy = y0 < y1 ? 1 : -1;
      let error = dx + dy;

      while (true) {
        fillCell(x0, y0, color);
        if (x0 === x1 && y0 === y1) break;
        const doubled = 2 * error;
        if (doubled >= dy) {
          error += dy;
          x0 += sx;
        }
        if (doubled <= dx) {
          error += dx;
          y0 += sy;
        }
      }
    }

    function cellFromEvent(event) {
      const rect = pixelCanvas.getBoundingClientRect();
      return {
        x: clamp(Math.floor(((event.clientX - rect.left) / rect.width) * 16), 0, 15),
        y: clamp(Math.floor(((event.clientY - rect.top) / rect.height) * 16), 0, 15)
      };
    }

    function paint(event) {
      const cell = cellFromEvent(event);
      const color = erasing ? null : currentColor;
      if (previousCell) paintLine(previousCell, cell, color);
      else fillCell(cell.x, cell.y, color);
      previousCell = cell;
    }

    function drawHeart() {
      pixelContext.clearRect(0, 0, 16, 16);
      const rows = [
        '................',
        '................',
        '..###....###....',
        '.#####..#####...',
        '.#############..',
        '################',
        '################',
        '.##############.',
        '..############..',
        '...##########...',
        '....########....',
        '.....######.....',
        '......####......',
        '.......##.......',
        '................',
        '................'
      ];

      rows.forEach((row, y) => {
        row.split('').forEach((cell, x) => {
          if (cell === '#') fillCell(x, y, '#ff5c39');
        });
      });

      fillCell(4, 4, '#ffd166');
      fillCell(5, 4, '#ffd166');
      fillCell(5, 5, '#ffd166');
      fillCell(10, 4, '#fff7e6');
    }

    drawHeart();

    pixelCanvas.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      drawing = true;
      previousCell = null;
      pixelCanvas.setPointerCapture(event.pointerId);
      paint(event);
    });

    pixelCanvas.addEventListener('pointermove', (event) => {
      if (!drawing) return;
      paint(event);
    });

    const stopDrawing = () => {
      drawing = false;
      previousCell = null;
    };

    pixelCanvas.addEventListener('pointerup', stopDrawing);
    pixelCanvas.addEventListener('pointercancel', stopDrawing);

    function setToolColor(color) {
      currentColor = color;
      erasing = false;
      $$('.color-chip', pixelPalette).forEach((chip) => {
        const active = chip.dataset.color === color;
        chip.classList.toggle('is-active', active);
        chip.setAttribute('aria-pressed', String(active));
      });
      if (eraserButton) {
        eraserButton.classList.remove('is-active');
        eraserButton.setAttribute('aria-pressed', 'false');
      }
    }

    if (pixelPalette) {
      pixelPalette.addEventListener('click', (event) => {
        const chip = event.target.closest('.color-chip');
        if (!chip) return;
        setToolColor(chip.dataset.color);
      });
    }

    if (eraserButton) {
      eraserButton.addEventListener('click', () => {
        erasing = !erasing;
        eraserButton.classList.toggle('is-active', erasing);
        eraserButton.setAttribute('aria-pressed', String(erasing));
        $$('.color-chip', pixelPalette).forEach((chip) => {
          chip.classList.remove('is-active');
          chip.setAttribute('aria-pressed', 'false');
        });
        if (!erasing) setToolColor(currentColor);
      });
    }

    if (pixelRandom) {
      pixelRandom.addEventListener('click', () => {
        pixelContext.clearRect(0, 0, 16, 16);
        const randomColors = pixelColors.slice(0, 5);
        for (let y = 0; y < 16; y += 1) {
          for (let x = 0; x < 8; x += 1) {
            if (Math.random() < 0.44) continue;
            const color = randomColors[Math.floor(Math.random() * randomColors.length)];
            fillCell(x, y, color);
            fillCell(15 - x, y, color);
          }
        }
        showToast('Sprite surpresa criado.');
      });
    }

    if (pixelClear) {
      pixelClear.addEventListener('click', () => {
        pixelContext.clearRect(0, 0, 16, 16);
        showToast('Tela limpa. Hora de começar de novo.');
      });
    }

    if (pixelDownload) {
      pixelDownload.addEventListener('click', () => {
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = 512;
        exportCanvas.height = 512;
        const exportContext = exportCanvas.getContext('2d');
        exportContext.imageSmoothingEnabled = false;
        exportContext.fillStyle = '#fffaf0';
        exportContext.fillRect(0, 0, 512, 512);
        exportContext.drawImage(pixelCanvas, 0, 0, 512, 512);

        exportCanvas.toBlob((blob) => {
          if (!blob) {
            showToast('Não foi possível gerar o PNG.');
            return;
          }
          const link = document.createElement('a');
          const url = URL.createObjectURL(blob);
          link.href = url;
          link.download = 'sitezinho-pixel.png';
          link.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 1500);
          showToast('PNG salvo. Agora é só enquadrar.');
        }, 'image/png');
      });
    }
  }

  /* ---------- copiar código ---------- */

  $$('.code-copy').forEach((button) => {
    button.addEventListener('click', async () => {
      const panel = button.closest('.code-body');
      const code = panel ? $('code', panel) : null;
      if (!code) return;
      const copied = await copyText(code.textContent.trim());
      const original = button.textContent;
      button.textContent = copied ? 'copiado!' : 'tente de novo';
      showToast(copied ? 'Código copiado.' : 'O navegador não liberou a cópia.');
      window.setTimeout(() => { button.textContent = original; }, 1800);
    });
  });

  syncThemeUI();

  /* ---------- sintetizador ---------- */

  const pads = $$('.pad');

  if (pads.length) {
    const waveSelect = $('#synth-wave');
    const volumeInput = $('#synth-volume');
    const volumeOutput = $('#synth-volume-value');
    const synthStatus = $('#synth-status');
    const synthLed = $('.synth-led');
    const synthBars = $('#synth-bars');
    const barColors = ['#ff8a6b', '#ffc25c', '#d8ed64', '#8fe3ad', '#7bd7d1', '#8bb8f7', '#b39af5', '#f4a1cc'];
    const barElements = [];
    let barsTimer = 0;
    let audioContext = null;
    let masterGain = null;
    let audioFilter = null;
    let statusTimer = 0;

    if (synthBars) {
      for (let index = 0; index < 22; index += 1) {
        const bar = document.createElement('i');
        bar.style.setProperty('--level', `${28 + Math.random() * 66}%`);
        bar.style.setProperty('--delay', `${index * 9}ms`);
        bar.style.setProperty('--bar-color', barColors[index % barColors.length]);
        synthBars.append(bar);
        barElements.push(bar);
      }
    }

    function animateBars() {
      if (!synthBars || !barElements.length) return;
      barElements.forEach((bar, index) => {
        bar.style.setProperty('--level', `${26 + Math.random() * 70}%`);
        bar.style.setProperty('--delay', `${index * 7}ms`);
      });
      synthBars.classList.remove('is-live');
      void synthBars.offsetWidth;
      synthBars.classList.add('is-live');
      window.clearTimeout(barsTimer);
      barsTimer = window.setTimeout(() => synthBars.classList.remove('is-live'), 900);
    }

    function ensureAudio() {
      if (audioContext) {
        if (audioContext.state === 'suspended') audioContext.resume();
        return true;
      }

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return false;

      try {
        audioContext = new AudioContextClass();

        masterGain = audioContext.createGain();
        masterGain.gain.value = (Number(volumeInput.value) / 100) * 0.7;

        audioFilter = audioContext.createBiquadFilter();
        audioFilter.type = 'lowpass';
        audioFilter.frequency.value = 3400;
        audioFilter.Q.value = 0.4;

        const delay = audioContext.createDelay(0.6);
        delay.delayTime.value = 0.23;
        const feedback = audioContext.createGain();
        feedback.gain.value = 0.16;
        const wet = audioContext.createGain();
        wet.gain.value = 0.24;
        const compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.knee.value = 18;
        compressor.ratio.value = 6;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;

        masterGain.connect(audioFilter);
        masterGain.connect(delay);
        delay.connect(feedback);
        feedback.connect(delay);
        delay.connect(wet);
        wet.connect(audioFilter);
        audioFilter.connect(compressor);
        compressor.connect(audioContext.destination);

        if (audioContext.state === 'suspended') audioContext.resume();
        return true;
      } catch {
        audioContext = null;
        return false;
      }
    }

    function playNote(frequency, noteName, pad) {
      if (!ensureAudio()) {
        showToast('Este navegador não conseguiu ligar o áudio.');
        return;
      }

      const now = audioContext.currentTime + 0.01;
      const oscillator = audioContext.createOscillator();
      const envelope = audioContext.createGain();

      oscillator.type = waveSelect ? waveSelect.value : 'triangle';
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.detune.setValueAtTime((Math.random() - 0.5) * 5, now);

      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.exponentialRampToValueAtTime(0.2, now + 0.015);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.95);

      oscillator.connect(envelope);
      envelope.connect(masterGain);
      oscillator.start(now);
      oscillator.stop(now + 1.05);

      pad.classList.add('is-playing');
      window.setTimeout(() => pad.classList.remove('is-playing'), 170);
      animateBars();

      if (synthLed) {
        synthLed.classList.remove('is-playing');
        void synthLed.offsetWidth;
        synthLed.classList.add('is-playing');
      }

      if (synthStatus) {
        synthStatus.textContent = `tocando ${noteName.toLowerCase()}`;
        window.clearTimeout(statusTimer);
        statusTimer = window.setTimeout(() => {
          synthStatus.textContent = 'pronto para tocar';
        }, 1200);
      }
    }

    pads.forEach((pad, index) => {
      pad.setAttribute('aria-label', `Tocar a nota ${pad.dataset.note}`);
      pad.addEventListener('click', () => {
        playNote(Number(pad.dataset.freq), pad.dataset.note, pad);
      });
      pad.dataset.index = String(index);
    });

    if (waveSelect) {
      waveSelect.addEventListener('change', () => {
        showToast(`Onda ${waveSelect.options[waveSelect.selectedIndex].text} selecionada.`);
      });
    }

    if (volumeInput) {
      const updateVolume = () => {
        const value = Number(volumeInput.value);
        if (volumeOutput) volumeOutput.textContent = `${value}%`;
        if (masterGain && audioContext) {
          masterGain.gain.setTargetAtTime((value / 100) * 0.7, audioContext.currentTime, 0.02);
        }
      };
      volumeInput.addEventListener('input', updateVolume);
      updateVolume();
    }

    window.addEventListener('keydown', (event) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.matches('input, select, textarea') || target.isContentEditable)) return;
      if (!/^[1-8]$/.test(event.key)) return;

      const pad = pads[Number(event.key) - 1];
      if (!pad) return;
      event.preventDefault();
      playNote(Number(pad.dataset.freq), pad.dataset.note, pad);
    });
  }

  /* ---------- máquina de paletas ---------- */

  const paletteGrid = $('#palette-swatches');

  if (paletteGrid) {
    const paletteKind = $('#palette-kind');
    const paletteGenerate = $('#palette-generate');
    const schemes = {
      análoga: [-36, -18, 0, 18, 36],
      tríade: [0, 120, 240, 60, 180],
      complementar: [0, 180, 20, 200, 40],
      'split-complementar': [0, 150, 210, 30, 180]
    };
    const schemeNames = Object.keys(schemes);
    const locked = new Set();
    let paletteColors = [];

    function hslToHex(hue, saturation, lightness) {
      const s = saturation / 100;
      const l = lightness / 100;
      const k = (n) => (n + hue / 30) % 12;
      const a = s * Math.min(l, 1 - l);
      const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
      return `#${[0, 8, 4].map((n) => Math.round(255 * f(n)).toString(16).padStart(2, '0')).join('')}`;
    }

    function lockIcon(isLocked) {
      return isLocked
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 7-2.6"></path></svg>';
    }

    function buildSwatches() {
      paletteGrid.innerHTML = '';

      paletteColors.forEach((hex, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = `swatch-wrap${locked.has(index) ? ' is-locked' : ''}`;
        wrapper.style.setProperty('--swatch', hex);

        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.className = 'swatch-copy';
        copyButton.setAttribute('aria-label', `Copiar a cor ${hex}`);
        copyButton.innerHTML = `<span class="swatch-hex">${hex}</span>`;

        copyButton.addEventListener('click', async () => {
          const copied = await copyText(hex);
          if (copied) copyButton.classList.add('is-copied');
          showToast(copied ? `Cor ${hex} copiada.` : `A cor é ${hex}, mas a cópia foi bloqueada.`);
          window.setTimeout(() => copyButton.classList.remove('is-copied'), 1400);
        });

        const lockButton = document.createElement('button');
        const isLocked = locked.has(index);
        lockButton.type = 'button';
        lockButton.className = `swatch-lock${isLocked ? ' is-locked' : ''}`;
        lockButton.setAttribute('aria-pressed', String(isLocked));
        lockButton.setAttribute('aria-label', `${isLocked ? 'Liberar' : 'Fixar'} a cor ${hex}`);
        lockButton.innerHTML = lockIcon(isLocked);

        lockButton.addEventListener('click', () => {
          if (locked.has(index)) locked.delete(index);
          else locked.add(index);
          const lockedNow = locked.has(index);
          wrapper.classList.toggle('is-locked', lockedNow);
          lockButton.classList.toggle('is-locked', lockedNow);
          lockButton.setAttribute('aria-pressed', String(lockedNow));
          lockButton.setAttribute('aria-label', `${lockedNow ? 'Liberar' : 'Fixar'} a cor ${hex}`);
          lockButton.innerHTML = lockIcon(lockedNow);
          showToast(lockedNow ? 'Cor fixada para a próxima paleta.' : 'Cor liberada.');
        });

        wrapper.append(copyButton, lockButton);
        paletteGrid.append(wrapper);
      });
    }

    function generatePalette(initial = false) {
      const name = schemeNames[Math.floor(Math.random() * schemeNames.length)];
      const baseHue = Math.random() * 360;
      const offsets = schemes[name];

      paletteColors = offsets.map((offset, index) => {
        if (locked.has(index) && paletteColors[index]) return paletteColors[index];
        const hue = (baseHue + offset + 360) % 360;
        const saturation = 56 + Math.random() * 24;
        const lightness = 46 + Math.random() * 20;
        return hslToHex(hue, saturation, lightness);
      });

      if (paletteKind) paletteKind.textContent = name;
      buildSwatches();

      if (!initial && !reduceMotion.matches) {
        paletteGrid.animate(
          [{ opacity: 0.35, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' }
        );
      }
    }

    if (paletteGenerate) {
      paletteGenerate.addEventListener('click', () => {
        generatePalette();
        showToast('Nova paleta sorteada.');
      });
    }

    generatePalette(true);
  }

  /* ---------- jogo da memória ---------- */

  const memoryBoard = $('#memory-board');

  if (memoryBoard) {
    const movesLabel = $('#memory-moves');
    const bestLabel = $('#memory-best');
    const memoryStatus = $('#memory-status');
    const resetButton = $('#memory-reset');
    const pairs = [
      { symbol: '🍄', name: 'Cogumelo' },
      { symbol: '🌵', name: 'Cacto' },
      { symbol: '🪐', name: 'Planeta' },
      { symbol: '🍉', name: 'Melancia' },
      { symbol: '🎈', name: 'Balão' },
      { symbol: '🦊', name: 'Raposa' },
      { symbol: '🌞', name: 'Sol' },
      { symbol: '🫧', name: 'Bolha' }
    ];
    let firstCard = null;
    let secondCard = null;
    let boardLocked = false;
    let moves = 0;
    let found = 0;
    let gameId = 0;
    let timers = [];
    let best = null;

    try {
      const saved = Number(localStorage.getItem('sitezinho:memoria'));
      if (Number.isFinite(saved) && saved > 0) best = saved;
    } catch {
      best = null;
    }

    function updateBestLabel() {
      if (bestLabel) bestLabel.textContent = best === null ? '—' : String(best);
    }

    function shuffle(items) {
      for (let index = items.length - 1; index > 0; index -= 1) {
        const random = Math.floor(Math.random() * (index + 1));
        [items[index], items[random]] = [items[random], items[index]];
      }
      return items;
    }

    function clearTimers() {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers = [];
    }

    function flipBack(card) {
      card.classList.remove('is-flipped');
      card.setAttribute('aria-label', 'Carta virada');
    }

    function finishGame() {
      if (memoryStatus) {
        memoryStatus.textContent = `Você encontrou os oito pares em ${moves} jogadas!`;
        memoryStatus.classList.add('is-win');
      }

      if (best === null || moves < best) {
        best = moves;
        updateBestLabel();
        try {
          localStorage.setItem('sitezinho:memoria', String(best));
        } catch {
          // Recorde vale só para esta visita.
        }
      }

      const rect = memoryBoard.getBoundingClientRect();
      burstConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2, 80);
      showToast(`Memória de elefante! ${moves} jogadas.`);
    }

    function onCardClick(event) {
      const card = event.target.closest('.memory-card');
      if (!card || boardLocked) return;
      if (card.classList.contains('is-flipped') || card.classList.contains('is-matched')) return;

      card.classList.add('is-flipped');
      card.setAttribute('aria-label', card.dataset.pair);

      if (!firstCard) {
        firstCard = card;
        return;
      }

      secondCard = card;
      moves += 1;
      if (movesLabel) movesLabel.textContent = String(moves);
      boardLocked = true;
      const currentGame = gameId;

      if (firstCard.dataset.pair === secondCard.dataset.pair) {
        const matchedCards = [firstCard, secondCard];
        timers.push(window.setTimeout(() => {
          if (currentGame !== gameId) return;
          matchedCards.forEach((matched) => {
            matched.classList.add('is-matched');
            matched.setAttribute('aria-label', `${matched.dataset.pair}, encontrado`);
          });
          found += 1;
          firstCard = null;
          secondCard = null;
          boardLocked = false;
          if (found === pairs.length) finishGame();
        }, 430));
      } else {
        const cardsToFlip = [firstCard, secondCard];
        timers.push(window.setTimeout(() => {
          if (currentGame !== gameId) return;
          cardsToFlip.forEach(flipBack);
          firstCard = null;
          secondCard = null;
          boardLocked = false;
        }, 900));
      }
    }

    function newMemoryGame() {
      gameId += 1;
      clearTimers();
      firstCard = null;
      secondCard = null;
      boardLocked = false;
      moves = 0;
      found = 0;
      memoryBoard.innerHTML = '';
      if (movesLabel) movesLabel.textContent = '0';
      if (memoryStatus) {
        memoryStatus.textContent = 'Encontre os oito pares.';
        memoryStatus.classList.remove('is-win');
      }

      const deck = shuffle(pairs.flatMap((pair) => [{ ...pair }, { ...pair }]));

      deck.forEach((card) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'memory-card';
        button.dataset.pair = card.name;
        button.setAttribute('aria-label', 'Carta virada');
        button.innerHTML = `
          <span class="memory-inner">
            <span class="memory-face memory-back" aria-hidden="true"><span class="memory-back-mark">?</span></span>
            <span class="memory-face memory-front" aria-hidden="true">${card.symbol}</span>
          </span>
        `;
        memoryBoard.append(button);
      });

      updateBestLabel();
    }

    memoryBoard.addEventListener('click', onCardClick);

    if (resetButton) {
      resetButton.addEventListener('click', () => {
        newMemoryGame();
        showToast('Cartas embaralhadas de novo.');
      });
    }

    newMemoryGame();
  }

  /* ---------- código secreto ---------- */

  const secret = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let secretProgress = 0;
  let secretUnlocked = false;
  const hintButton = $('#hint-button');

  window.addEventListener('keydown', (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && (target.matches('input, select, textarea') || target.isContentEditable)) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (key === secret[secretProgress]) {
      secretProgress += 1;
      if (secretProgress === secret.length) {
        secretProgress = 0;
        if (!secretUnlocked) {
          secretUnlocked = true;
          burstConfetti(window.innerWidth / 2, window.innerHeight * 0.35, 150);
          showToast('Código secreto desbloqueado! ✳');
        }
      }
    } else {
      secretProgress = key === secret[0] ? 1 : 0;
    }
  });

  if (hintButton) {
    hintButton.addEventListener('click', () => {
      showToast('É o clássico: ↑ ↑ ↓ ↓ ← → ← → B A.');
    });
  }

  console.log(
    '%csitezinho.',
    'font-size: 38px; font-weight: 900; color: #ff5c39;',
    '\nOi! O código está em script.js. Sem bundler, sem pressa. ✳'
  );

})();
