/**
 * Горизонтальная карусель как у донора: карточки 3:4, прокрутка с snap.
 */
export function Carousel({ children }: { children: React.ReactNode }) {
  return (
    <div className="carousel-scroll flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
      {children}
    </div>
  );
}

export const CAROUSEL_ITEM = 'w-[240px] shrink-0 snap-start sm:w-[280px]';
