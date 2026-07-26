/* Fluid metallic backgrounds.
   Domain-warped noise drives a fake liquid-chrome reflection; the mouse
   nudges the flow field. Any <canvas class="fluid"> gets its own instance —
   data-vignette (0..1) controls how hard the bottom is darkened for text.
   Falls back to a CSS gradient (.no-gl on the parent) without WebGL, and
   only animates while on screen. */

(function () {
  const canvases = document.querySelectorAll("canvas.fluid");
  if (!canvases.length) return;

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const vert = `
    attribute vec2 aPos;
    void main() {
      gl_Position = vec4(aPos, 0.0, 1.0);
    }
  `;

  const frag = `
    precision highp float;

    uniform vec2  uRes;
    uniform float uTime;
    uniform vec2  uMouse;
    uniform float uVignette;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
        u.y
      );
    }

    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 5; i++) {
        v += a * noise(p);
        p = p * 2.03 + vec2(11.3, 7.9);
        a *= 0.5;
      }
      return v;
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / uRes;
      vec2 p = uv * vec2(uRes.x / uRes.y, 1.0) * 2.2;

      float t = uTime * 0.06;

      // pull the field gently toward the pointer
      vec2 m = (uMouse - uv) * 0.6;
      p += m * exp(-dot(m, m) * 4.0);

      // two rounds of domain warping give the liquid folds
      vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
      vec2 r = vec2(fbm(p + 2.6 * q + vec2(1.7, 9.2) + t * 0.7),
                    fbm(p + 2.6 * q + vec2(8.3, 2.8) - t * 0.4));
      float h = fbm(p + 2.4 * r);

      // pseudo-normal from the height field
      float e = 0.012;
      float hx = fbm(p + 2.4 * r + vec2(e, 0.0)) - h;
      float hy = fbm(p + 2.4 * r + vec2(0.0, e)) - h;
      vec3 n = normalize(vec3(-hx / e, -hy / e, 1.6));

      // banded vertical "environment" = the chrome look
      float band = n.y * 0.5 + 0.5;
      float env = 0.0;
      env += smoothstep(0.28, 0.34, band) * smoothstep(0.52, 0.40, band);
      env += smoothstep(0.62, 0.68, band) * smoothstep(0.86, 0.72, band) * 0.7;
      env += pow(max(n.z, 0.0), 6.0) * 0.35;

      vec3 dark  = vec3(0.028, 0.028, 0.032);
      vec3 steel = vec3(0.52, 0.53, 0.56);
      vec3 metal = dark + steel * env;

      // faint gradient wash so it isn't pure grayscale
      vec3 tintA = vec3(0.23, 0.23, 0.56);
      vec3 tintB = vec3(0.48, 0.23, 0.84);
      vec3 tint = mix(tintA, tintB, uv.x + 0.25 * sin(t * 2.0));
      metal += tint * env * 0.16;
      metal += tint * 0.03;

      // darken toward the bottom so overlaid text stays readable;
      // uVignette scales how hard (hero 1.0, banners much softer)
      float floorLevel = mix(1.0, 0.18, uVignette);
      metal *= mix(1.0, floorLevel, smoothstep(0.62, 0.06, uv.y));

      gl_FragColor = vec4(metal, 1.0);
    }
  `;

  function init(canvas) {
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false });

    if (!gl) {
      canvas.parentElement.classList.add("no-gl");
      return;
    }

    function compile(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    }

    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vert));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(program);
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, "uRes");
    const uTime = gl.getUniformLocation(program, "uTime");
    const uMouse = gl.getUniformLocation(program, "uMouse");
    const uVignette = gl.getUniformLocation(program, "uVignette");

    gl.uniform1f(uVignette, parseFloat(canvas.dataset.vignette || "1"));

    // render at reduced resolution; the shader is soft anyway and this
    // keeps laptops cool
    const scale = Math.min(devicePixelRatio, 2) * 0.6;

    function resize() {
      canvas.width = Math.round(canvas.clientWidth * scale);
      canvas.height = Math.round(canvas.clientHeight * scale);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
    }
    resize();
    addEventListener("resize", resize);

    let mx = 0.5, my = 0.5;      // eased pointer position
    let tx = 0.5, ty = 0.5;      // target

    addEventListener("pointermove", (e) => {
      const rect = canvas.getBoundingClientRect();
      tx = (e.clientX - rect.left) / rect.width;
      ty = 1.0 - (e.clientY - rect.top) / rect.height;
    });

    const start = performance.now();
    let raf = null;

    function draw(now) {
      mx += (tx - mx) * 0.05;
      my += (ty - my) * 0.05;
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.uniform2f(uMouse, mx, my);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function loop(now) {
      draw(now);
      raf = requestAnimationFrame(loop);
    }

    function play() {
      if (raf === null && !reduceMotion && !document.hidden) {
        raf = requestAnimationFrame(loop);
      }
    }

    function pause() {
      if (raf !== null) {
        cancelAnimationFrame(raf);
        raf = null;
      }
    }

    // always paint one frame so paused/reduced-motion canvases aren't black
    draw(start);

    // only animate while on screen
    let onScreen = false;
    new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      onScreen ? play() : pause();
    }).observe(canvas);

    document.addEventListener("visibilitychange", () => {
      document.hidden ? pause() : (onScreen && play());
    });
  }

  canvases.forEach(init);
})();
