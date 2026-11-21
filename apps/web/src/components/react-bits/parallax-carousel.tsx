"use client";

import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { cn } from "@/lib/utils";

export interface ParallaxCarouselItem {
  src: string;
  label?: string;
  /** описание — запекается в текстуру плоскости (внутри карточки) */
  description?: string;
  href?: string;
}

export interface ParallaxCarouselProps {
  /** Ordered list of image URLs. Each becomes a plane in the carousel. */
  images?: string[];
  /** Richer variant: image + caption + link per plane (2026-11-21, адаптация под тренды). */
  items?: ParallaxCarouselItem[];
  /** Центральная плоскость сменилась (для подписи над каруселью). */
  onActiveChange?: (index: number) => void;
  /** Клик по плоскости (навигация). */
  onItemClick?: (index: number) => void;
  /** Пауза рендера/автоплея (секция вне вьюпорта) — экономия батареи. */
  paused?: boolean;
  /** Plane width in CSS pixels. */
  imageWidth?: number;
  /** Plane height in CSS pixels. */
  imageHeight?: number;
  /** Horizontal gap between planes in CSS pixels. */
  gap?: number;
  /**
   * UV-space horizontal shift applied as planes drift away from screen
   * centre. Higher = more dramatic counter-motion inside each plane.
   * Range: roughly 0..0.6.
   */
  parallaxIntensity?: number;
  /**
   * Maximum normalised parallax travel (as a fraction of viewport
   * width). The texture is automatically zoomed in by this much so the
   * plane never shows empty space, regardless of how the parallax
   * shifts the texture. Higher = more pronounced parallax sweep, but
   * also more zoom on the source image. Range: 0.1..1.0.
   */
  uvScale?: number;
  /** Smoothing factor applied to the scroll lerp each frame (0..1). */
  lerp?: number;
  /** Multiplier on wheel deltas. */
  wheelSensitivity?: number;
  /** Multiplier on pointer-drag deltas. */
  dragSensitivity?: number;
  /** Loop endlessly horizontally (planes wrap around the strip). */
  loop?: boolean;
  /** Fixed border radius applied to each plane (CSS pixels). */
  borderRadius?: number;
  /** Idle drift speed in CSS px/s when the user is not interacting. 0 = none. */
  autoplaySpeed?: number;
  /** Pause autoplay while hovering. */
  pauseOnHover?: boolean;
  /** Show a subtle progress indicator at the bottom. Loop mode hides it. */
  showProgress?: boolean;
  /** Container class names. */
  className?: string;
  /** Container inline styles. */
  style?: React.CSSProperties;
}

export interface ParallaxCarouselRef {
  /** Scroll to a specific image index (0-based). */
  scrollToIndex: (index: number) => void;
  /** Reset scroll position to the start. */
  reset: () => void;
}

const PLANE_VERTEX = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const PLANE_FRAGMENT = `
precision highp float;

varying vec2 vUv;

uniform sampler2D uMap;
uniform vec2 uPlanePx;
uniform vec2 uTexPx;
uniform float uShift;
uniform float uIntensity;
uniform float uMaxShift;
uniform float uRadiusPx;
uniform float uHasTexture;

vec2 coverFit(vec2 uv, vec2 planeSize, vec2 texSize) {
  float planeAspect = planeSize.x / max(planeSize.y, 1.0);
  float texAspect = texSize.x / max(texSize.y, 1.0);
  vec2 ratio = vec2(
    min(planeAspect / max(texAspect, 0.0001), 1.0),
    min((1.0 / planeAspect) / max(1.0 / texAspect, 0.0001), 1.0)
  );
  return uv * ratio + (1.0 - ratio) * 0.5;
}

float roundedBoxAlpha(vec2 uv, vec2 sizePx, float radiusPx) {
  vec2 p = (uv - 0.5) * sizePx;
  vec2 half_ = sizePx * 0.5 - vec2(radiusPx);
  vec2 d = abs(p) - half_;
  float outside = length(max(d, 0.0));
  float inside = min(max(d.x, d.y), 0.0);
  float dist = outside + inside - radiusPx;
  return clamp(0.5 - dist, 0.0, 1.0);
}

void main() {
  vec2 uv = coverFit(vUv, uPlanePx, uTexPx);

  float zoom = 1.0 / (1.0 + 2.0 * uMaxShift);
  uv = (uv - 0.5) * zoom + 0.5;

  uv.x += uShift * uIntensity * zoom;

  vec4 tex;
  if (uHasTexture > 0.5) {
    tex = texture2D(uMap, uv);
  } else {
    tex = vec4(mix(vec3(0.07), vec3(0.12), vUv.y), 1.0);
  }

  float mask = uRadiusPx > 0.5 ? roundedBoxAlpha(vUv, uPlanePx, uRadiusPx) : 1.0;
  gl_FragColor = vec4(tex.rgb, tex.a * mask);
}
`;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/** Подпись (название + описание) запечена внутрь текстуры — как на старых карточках трендов. */
interface CardCaption {
  title?: string;
  text?: string;
}

/** Canvas 3:4: только обложка (cover-fit) + тёмный фон-заглушка. Параллаксится. */
async function composeCardCanvas(
  src: string,
  aspectW: number,
  aspectH: number,
): Promise<HTMLCanvasElement> {
  const W = 520; // на экране плоскость 240px — 520 хватает с mipmaps, экономим ~50% GPU-памяти
  const H = Math.round((W * aspectH) / aspectW);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#18181b");
  bg.addColorStop(1, "#09090b");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  if (src) {
    await new Promise<void>((resolve) => {
      const img = new Image();
      const timer = setTimeout(() => resolve(), 8000); // зависший запрос — тёмная заглушка, не вечное ожидание
      img.crossOrigin = "anonymous";
      img.onload = () => {
        clearTimeout(timer);
        const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
        const w = img.naturalWidth * scale;
        const h = img.naturalHeight * scale;
        ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
        resolve();
      };
      img.onerror = () => {
        clearTimeout(timer);
        resolve();
      };
      img.src = src;
    });
  }
  return canvas;
}

/**
 * Прозрачный canvas с градиентом + названием/описанием. НЕ параллаксится —
 * кладётся вторым слоем поверх изображения (без UV-сдвига), текст статичен внутри карточки.
 */
async function composeCaptionCanvas(
  caption: CardCaption | undefined,
  aspectW: number,
  aspectH: number,
): Promise<HTMLCanvasElement> {
  const W = 520;
  const H = Math.round((W * aspectH) / aspectW);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  if (!caption?.title) return canvas;

  // метрики шрифта без загруженного шрифта дают неверный перенос — дожидаемся
  try {
    await document.fonts.ready;
  } catch {
    /* старые браузеры — рисуем системным */
  }

  const g = ctx.createLinearGradient(0, H * 0.45, 0, H);
  g.addColorStop(0, "rgba(9,9,11,0)");
  g.addColorStop(1, "rgba(9,9,11,0.94)");
  ctx.fillStyle = g;
  ctx.fillRect(0, H * 0.45, W, H * 0.55);

  const pad = Math.round(W * 0.06);
  const font = (px: number, weight: number) =>
    `${weight} ${Math.round(px)}px Inter, -apple-system, 'Segoe UI', Roboto, sans-serif`;

  // ФИКСИРОВАННАЯ сетка: у всех карточек заголовок на одной базовой линии,
  // описание — в двух фиксированных слотах под ним (не прыгает от карточки к карточке)
  const titleY = H - pad - 2 * W * 0.056 - W * 0.075;

  if (caption.text) {
    ctx.fillStyle = "#d4d4d8";
    ctx.font = font(W * 0.042, 400);
    const maxW = W - pad * 2;
    const words = caption.text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(t).width > maxW && cur) {
        lines.push(cur);
        cur = w;
        if (lines.length === 2) {
          cur = "";
          break;
        }
      } else {
        cur = t;
      }
    }
    if (cur && lines.length < 2) lines.push(cur);
    const truncated = lines.length === 2 && (cur === "" || words.join(" ").length > lines.join(" ").length + 1);
    if (truncated && lines[1]) {
      let last = `${lines[1]}…`;
      while (ctx.measureText(last).width > maxW && last.length > 2) {
        last = `${last.slice(0, -2)}…`;
      }
      lines[1] = last;
    }
    // слоты жёстко прибиты: первая строка сразу под заголовком, вторая — ниже
    const slot1 = titleY + W * 0.075;
    if (lines[0]) ctx.fillText(lines[0], pad, slot1);
    if (lines[1]) ctx.fillText(lines[1], pad, slot1 + W * 0.056);
  }

  ctx.fillStyle = "#c9ff2a";
  ctx.font = font(W * 0.058, 700);
  ctx.fillText(caption.title.toUpperCase(), pad, titleY);
  return canvas;
}

function buildUniforms() {
  return {
    uMap: { value: null as THREE.Texture | null },
    uPlanePx: { value: new THREE.Vector2(1, 1) },
    uTexPx: { value: new THREE.Vector2(1, 1) },
    uShift: { value: 0 },
    uIntensity: { value: 0.4 },
    uMaxShift: { value: 0.2 },
    uRadiusPx: { value: 0 },
    uHasTexture: { value: 0 },
  };
}

interface ScrollState {
  current: number;
  target: number;
  limit: number;
}

interface PlaneProps {
  src: string;
  index: number;
  caption?: CardCaption;
  /** разнообразие глубины: ±25% к интенсивности параллакса (2026-11-21) */
  variance: number;
  /** вертикальное смещение плоскости — «лесенка» вместо конвейера */
  yOffset: number;
  onItemClick?: (index: number) => void;
  imageWidth: number;
  imageHeight: number;
  gap: number;
  parallaxIntensity: number;
  uvScale: number;
  borderRadius: number;
  loop: boolean;
  totalCount: number;
  scrollRef: React.RefObject<ScrollState>;
}

const Plane: React.FC<PlaneProps> = ({
  src,
  index,
  caption,
  variance,
  yOffset,
  onItemClick,
  imageWidth,
  imageHeight,
  gap,
  parallaxIntensity,
  uvScale,
  borderRadius,
  loop,
  totalCount,
  scrollRef,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const capMeshRef = useRef<THREE.Mesh>(null);
  const textureRef = useRef<THREE.Texture | null>(null);
  const capTextureRef = useRef<THREE.Texture | null>(null);
  // meshBasicMaterial берёт map из пропа — нужен ре-рендер, когда подпись готова
  const [capTex, setCapTex] = React.useState<THREE.Texture | null>(null);
  const { size } = useThree();

  const [uniforms] = React.useState(buildUniforms);

  const propsRef = useRef({
    parallaxIntensity,
    uvScale,
    borderRadius,
    imageWidth,
    imageHeight,
    gap,
    loop,
  });
  useEffect(() => {
    propsRef.current = {
      parallaxIntensity,
      uvScale,
      borderRadius,
      imageWidth,
      imageHeight,
      gap,
      loop,
    };
  }, [
    parallaxIntensity,
    uvScale,
    borderRadius,
    imageWidth,
    imageHeight,
    gap,
    loop,
  ]);

  // caption — inline-объект от родителя: сравниваем по содержимому, иначе текстуры
  // всех плоскостей пересоздаются на каждый ре-рендер HomePage
  const capKey = `${caption?.title ?? ""}|${caption?.text ?? ""}`;

  useEffect(() => {
    // ДВА слоя: изображение (параллаксится через UV-сдвиг в шейдере) и подпись
    // (отдельная полупрозрачная текстура БЕЗ сдвига — текст статичен внутри карточки)
    let cancelled = false;
    const makeTex = (canvas: HTMLCanvasElement) => {
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      // мипмапы: без них даунскейл 720×960 → 240×320 «резал» мелкий текст
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      return tex;
    };
    void (async () => {
      const pr = propsRef.current;
      const [imgCanvas, capCanvas] = await Promise.all([
        composeCardCanvas(src, pr.imageWidth, pr.imageHeight),
        composeCaptionCanvas(caption, pr.imageWidth, pr.imageHeight),
      ]);
      if (cancelled) return;
      textureRef.current = makeTex(imgCanvas);
      capTextureRef.current = makeTex(capCanvas);
      setCapTex(capTextureRef.current);
    })().catch(() => {
      if (!cancelled) {
        textureRef.current = null;
        capTextureRef.current = null;
      }
    });
    return () => {
      cancelled = true;
      for (const t of [textureRef.current, capTextureRef.current]) t?.dispose();
      textureRef.current = null;
      capTextureRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, capKey]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const mat = mesh.material as THREE.ShaderMaterial;
    const u = mat.uniforms;
    const p = propsRef.current;
    const scroll = scrollRef.current;
    if (!scroll) return;

    const planeStride = p.imageWidth + p.gap;
    let offsetPx = index * planeStride - scroll.current;

    if (p.loop && totalCount > 0) {
      const stripLength = totalCount * planeStride;
      const halfStrip = stripLength * 0.5;
      offsetPx =
        ((((offsetPx + halfStrip) % stripLength) + stripLength) % stripLength) -
        halfStrip;
    }

    mesh.position.x = offsetPx;
    mesh.position.y = yOffset;

    // слой подписи двигается ВМЕСТЕ с карточкой, но без UV-сдвига — текст не «плывёт»
    const cap = capMeshRef.current;
    if (cap) {
      cap.position.x = offsetPx;
      cap.position.y = yOffset;
    }

    const viewport = Math.max(size.width, 1);
    const norm = clamp(offsetPx / viewport, -p.uvScale, p.uvScale);
    u.uShift.value = -norm;
    // глубина разная у каждой плоскости — параллакс не «конвейерный»
    u.uIntensity.value = p.parallaxIntensity * variance;
    u.uMaxShift.value = p.uvScale * p.parallaxIntensity * variance;
    // уклон в центр: крайние плоскости чуть меньше (до −8%)
    const scaleMul = 1 - 0.08 * Math.min(1, Math.abs(offsetPx) / viewport);
    mesh.scale.set(p.imageWidth * scaleMul, p.imageHeight * scaleMul, 1);
    // подпись чуть меньше (внутри скруглённых углов)
    if (cap) {
      const inset = Math.min(10, p.borderRadius * 0.8) * scaleMul;
      cap.scale.set(
        Math.max(1, p.imageWidth * scaleMul - inset),
        Math.max(1, p.imageHeight * scaleMul - inset),
        1,
      );
    }
    u.uRadiusPx.value = p.borderRadius;
    (u.uPlanePx.value as THREE.Vector2).set(p.imageWidth, p.imageHeight);

    if (textureRef.current?.image) {
      u.uMap.value = textureRef.current;
      const img = textureRef.current.image as HTMLImageElement;
      (u.uTexPx.value as THREE.Vector2).set(
        img.naturalWidth || img.width || 1,
        img.naturalHeight || img.height || 1,
      );
      u.uHasTexture.value = 1;
    } else {
      u.uHasTexture.value = 0;
    }
  });

  return (
    <>
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          onItemClick?.(index);
        }}
      >
        <planeGeometry args={[1, 1, 1, 1]} />
        <shaderMaterial
          vertexShader={PLANE_VERTEX}
          fragmentShader={PLANE_FRAGMENT}
          uniforms={uniforms}
          transparent
        />
      </mesh>
      {/* слой подписи: монтируем ТОЛЬКО с готовой текстурой — без map материал
          рисует белый непрозрачный квад поверх карточки (белые заглушки) */}
      {capTex && (
        <mesh ref={capMeshRef} renderOrder={1}>
          <planeGeometry args={[1, 1, 1, 1]} />
          <meshBasicMaterial
            map={capTex}
            transparent
            depthWrite={false}
          />
        </mesh>
      )}
    </>
  );
};

const CameraRig: React.FC = () => {
  const camRef = useRef<THREE.OrthographicCamera>(null);
  const { size, set } = useThree();

  useEffect(() => {
    const cam = camRef.current;
    if (!cam) return;
    cam.left = -size.width / 2;
    cam.right = size.width / 2;
    cam.top = size.height / 2;
    cam.bottom = -size.height / 2;
    cam.near = 0.1;
    cam.far = 1000;
    cam.position.set(0, 0, 10);
    cam.updateProjectionMatrix();
    set({ camera: cam });
  }, [size.width, size.height, set]);

  return <orthographicCamera ref={camRef} />;
};

const ParallaxCarousel = React.forwardRef<
  ParallaxCarouselRef,
  ParallaxCarouselProps
>(
  (
    {
      images,
      items,
      onActiveChange,
      onItemClick,
      paused = false,
      imageWidth = 420,
      imageHeight = 560,
      gap = 32,
      parallaxIntensity = 0.4,
      uvScale = 0.85,
      lerp = 0.08,
      wheelSensitivity = 1,
      dragSensitivity = 1.4,
      loop = false,
      borderRadius = 16,
      autoplaySpeed = 0,
      pauseOnHover = true,
      showProgress = true,
      className,
      style,
    },
    ref,
  ) => {
    // ресолв: items приоритетнее images (каждая плоскость = src+label+href)
    const resolvedItems: ParallaxCarouselItem[] =
      items && items.length ? items : (images ?? []).map((src) => ({ src }));
    const resolvedImages = resolvedItems.map((i) => i.src);
    const onActiveChangeRef = useRef(onActiveChange);
    const onItemClickRef = useRef(onItemClick);
    useEffect(() => {
      onActiveChangeRef.current = onActiveChange;
      onItemClickRef.current = onItemClick;
    }, [onActiveChange, onItemClick]);

    const containerRef = useRef<HTMLDivElement>(null);
    const rafRef = useRef<number | null>(null);
    const hoverRef = useRef(false);
    const draggingRef = useRef(false);
    const lastPointerXRef = useRef(0);
    const lastFrameTsRef = useRef<number | null>(null);
    const progressBarRef = useRef<HTMLDivElement>(null);

    const scrollRef = useRef<ScrollState>({
      current: 0,
      target: 0,
      limit: 0,
    });

    const settingsRef = useRef({
      lerp,
      wheelSensitivity,
      dragSensitivity,
      autoplaySpeed,
      loop,
      pauseOnHover,
      imageWidth,
      gap,
      count: resolvedImages.length,
    });
    useEffect(() => {
      settingsRef.current = {
        lerp,
        wheelSensitivity,
        dragSensitivity,
        autoplaySpeed,
        loop,
        pauseOnHover,
        imageWidth,
        gap,
        count: resolvedImages.length,
      };
    }, [
      lerp,
      wheelSensitivity,
      dragSensitivity,
      autoplaySpeed,
      loop,
      pauseOnHover,
      imageWidth,
      gap,
      resolvedImages.length,
    ]);

    const recomputeLimit = useCallback(() => {
      const node = containerRef.current;
      if (!node) return;
      const total = resolvedImages.length * (imageWidth + gap) - gap;
      const visible = node.clientWidth;
      scrollRef.current.limit = loop
        ? Number.POSITIVE_INFINITY
        : Math.max(0, total - visible);
    }, [resolvedImages.length, imageWidth, gap, loop]);

    useEffect(() => {
      recomputeLimit();
      const node = containerRef.current;
      if (!node || typeof ResizeObserver === "undefined") return;
      const ro = new ResizeObserver(recomputeLimit);
      ro.observe(node);
      return () => ro.disconnect();
    }, [recomputeLimit]);

    const tickRef = useRef<((now: number) => void) | null>(null);
    const lastActiveRef = useRef(0);
    const pausedRef = useRef(paused);
    useEffect(() => {
      pausedRef.current = paused;
    }, [paused]);
    useEffect(() => {
      const tick = (now: number) => {
        const s = scrollRef.current;
        const settings = settingsRef.current;

        const last = lastFrameTsRef.current ?? now;
        const dt = Math.max(0, (now - last) / 1000);
        lastFrameTsRef.current = now;

        if (
          !pausedRef.current &&
          settings.autoplaySpeed !== 0 &&
          !draggingRef.current &&
          !(settings.pauseOnHover && hoverRef.current)
        ) {
          s.target += settings.autoplaySpeed * dt;
        }

        if (!settings.loop) {
          s.target = clamp(s.target, 0, s.limit);
        }

        const k = clamp(settings.lerp, 0.001, 1);
        s.current += (s.target - s.current) * k;

        if (progressBarRef.current && !settings.loop && s.limit > 0) {
          const ratio = clamp(s.current / s.limit, 0, 1);
          progressBarRef.current.style.transform = `scaleX(${ratio})`;
        }

        // активная (центральная) плоскость — для подписи/ссылки над каруселью
        const stride = settings.imageWidth + settings.gap;
        let active = stride > 0 ? Math.round(s.current / stride) : 0;
        if (settings.count > 0) {
          active = ((active % settings.count) + settings.count) % settings.count;
          if (active !== lastActiveRef.current) {
            lastActiveRef.current = active;
            onActiveChangeRef.current?.(active);
          }
        }

        rafRef.current = requestAnimationFrame(tick);
      };
      tickRef.current = tick;
      rafRef.current = requestAnimationFrame(tick);
      return () => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        tickRef.current = null;
        lastFrameTsRef.current = null;
      };
    }, []);

    useEffect(() => {
      const node = containerRef.current;
      if (!node) return;

      // колесо: перехватываем ТОЛЬКО горизонтальный жест (трекпад) — иначе страницу
      // невозможно проскроллить мимо карусели; вертикальный скролл идёт как обычно
      const onWheel = (e: WheelEvent) => {
        if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
        e.preventDefault();
        const settings = settingsRef.current;
        scrollRef.current.target += e.deltaX * settings.wheelSensitivity;
      };

      let captured = false;
      let downX = 0;
      const onPointerDown = (e: PointerEvent) => {
        if (e.button !== 0) return; // правый клик — не драг
        draggingRef.current = true;
        captured = false;
        downX = e.clientX;
        lastPointerXRef.current = e.clientX;
        node.style.cursor = "grabbing";
      };

      const onPointerMove = (e: PointerEvent) => {
        if (!draggingRef.current) return;
        // захват пойнтера только когда реально начался драг — иначе capture ретаргетит
        // click на контейнер и onItemClick плоскости (клик по карточке) не срабатывает
        if (!captured && Math.abs(e.clientX - downX) > 4) {
          captured = true;
          node.setPointerCapture(e.pointerId);
        }
        const settings = settingsRef.current;
        const dx = e.clientX - lastPointerXRef.current;
        lastPointerXRef.current = e.clientX;
        scrollRef.current.target -= dx * settings.dragSensitivity;
      };

      const onPointerUp = (e: PointerEvent) => {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        if (captured) {
          try {
            node.releasePointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
          captured = false;
        }
        node.style.cursor = "grab";
      };

      const onEnter = () => {
        hoverRef.current = true;
      };
      const onLeave = () => {
        hoverRef.current = false;
      };

      node.addEventListener("wheel", onWheel, { passive: false });
      node.addEventListener("pointerdown", onPointerDown);
      node.addEventListener("pointermove", onPointerMove);
      node.addEventListener("pointerup", onPointerUp);
      node.addEventListener("pointercancel", onPointerUp);
      node.addEventListener("pointerleave", onPointerUp);
      node.addEventListener("mouseenter", onEnter);
      node.addEventListener("mouseleave", onLeave);

      return () => {
        node.removeEventListener("wheel", onWheel);
        node.removeEventListener("pointerdown", onPointerDown);
        node.removeEventListener("pointermove", onPointerMove);
        node.removeEventListener("pointerup", onPointerUp);
        node.removeEventListener("pointercancel", onPointerUp);
        node.removeEventListener("pointerleave", onPointerUp);
        node.removeEventListener("mouseenter", onEnter);
        node.removeEventListener("mouseleave", onLeave);
      };
    }, []);

    const scrollToIndex = useCallback((idx: number) => {
      const settings = settingsRef.current;
      const target = idx * (settings.imageWidth + settings.gap);
      scrollRef.current.target = settings.loop
        ? target
        : clamp(target, 0, scrollRef.current.limit);
    }, []);

    const reset = useCallback(() => {
      scrollRef.current.target = 0;
      scrollRef.current.current = 0;
    }, []);

    useImperativeHandle(ref, () => ({ scrollToIndex, reset }), [
      scrollToIndex,
      reset,
    ]);

    const planeKeys = useMemo(
      () => resolvedImages.map((src, i) => `${i}-${src}`),
      [resolvedImages],
    );

    return (
      <div
        ref={containerRef}
        className={cn(
          "relative w-full h-full overflow-hidden select-none",
          className,
        )}
        style={{
          cursor: "grab",
          touchAction: "pan-y",
          ...style,
        }}
      >
        <Canvas frameloop={paused ? "never" : "always"}
          gl={{ antialias: true, alpha: true }}
          dpr={[1, 2]}
          className="absolute! inset-0 w-full h-full"
        >
          <CameraRig />
          {resolvedImages.map((src, i) => (
            <Plane
              key={planeKeys[i]}
              src={src}
              index={i}
              imageWidth={imageWidth}
              imageHeight={imageHeight}
              gap={gap}
              parallaxIntensity={parallaxIntensity}
              uvScale={uvScale}
              borderRadius={borderRadius}
              loop={loop}
              variance={0.75 + 0.5 * (((i * 7919) % 97) / 97)}
              yOffset={0}
              caption={resolvedItems[i] ? { title: resolvedItems[i].label, text: resolvedItems[i].description } : undefined}
              totalCount={resolvedImages.length}
              scrollRef={scrollRef}
            />
          ))}
        </Canvas>

        {showProgress && !loop && (
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 h-[2px] w-32 bg-white/15 rounded-full overflow-hidden pointer-events-none"
            aria-hidden
          >
            <div
              ref={progressBarRef}
              className="h-full w-full bg-white/80 origin-left"
              style={{ transform: "scaleX(0)" }}
            />
          </div>
        )}
      </div>
    );
  },
);

ParallaxCarousel.displayName = "ParallaxCarousel";

export default ParallaxCarousel;
