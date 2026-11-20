/**
 * Горизонтальная карусель как у донора: карточки 3:4, прокрутка с snap.
 * + drag мышью (pointer events) — зажал и тянешь, как в нативных каруселях.
 */
import { useRef, useState } from 'react';

export function Carousel({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startScroll: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // только мышь/перо; тач-скролл нативный
    if (e.pointerType === 'touch') return;
    const el = ref.current;
    if (!el) return;
    drag.current = { startX: e.clientX, startScroll: el.scrollLeft, moved: false };
    // setPointerCapture НЕ делаем здесь: при захвате click ретаргетится на контейнер
    // карусели и ссылки-карточки перестают получать клики (баг 2026-11-18: «нажимаю
    // на новость — не открывается»). Захватываем пойнтер только когда драг реально
    // начался (см. onPointerMove) — обычный клик тогда идёт по настоящей цели.
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    const d = drag.current;
    if (!el || !d) return;
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) > 6) {
      d.moved = true;
      setDragging(true);
      el.setPointerCapture(e.pointerId); // драг начался — теперь захват уместен
      // snap-mandatory конфликтует с программной прокруткой: пока тянем,
      // браузер дёргает scrollLeft обратно к snap-точке (баг «карусель
      // откатывается назад при листании»). На время драга snap отключаем
      // инлайн-стилем (перекрывает классы tailwind), на release — вернётся
      // и браузер доснапит к ближайшей точке.
      el.style.scrollSnapType = 'none';
    }
    if (d.moved) {
      el.scrollLeft = d.startScroll - dx;
    }
  };

  const endDrag = () => {
    const el = ref.current;
    if (el && drag.current?.moved) el.style.scrollSnapType = ''; // snap обратно → доснап к карточке
    drag.current = null;
    setDragging(false);
  };

  // после реального перетаскивания гасим клик по карточке (иначе уйдём по ссылке)
  const onClickCapture = (e: React.MouseEvent) => {
    if (drag.current?.moved || dragging) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <div
      ref={ref}
      className={`carousel-scroll flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 ${dragging ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClickCapture={onClickCapture}
      onDragStartCapture={(e) => e.preventDefault()}
    >
      {children}
    </div>
  );
}

export const CAROUSEL_ITEM = 'w-[240px] shrink-0 snap-start sm:w-[280px]';
