const CARDS = [
  { text: 'The heart has four', blank: 'chambers', top: '8%', left: '6%', rotate: -12, delay: 0 },
  { text: 'Insulin is made in the', blank: 'pancreas', top: '70%', left: '4%', rotate: 8, delay: 1.5 },
  { text: 'Normal pH is', blank: '7.4', top: '14%', left: '72%', rotate: 10, delay: 0.8 },
  { text: 'The femur is the longest', blank: 'bone', top: '76%', left: '68%', rotate: -8, delay: 2.2 },
  { text: 'Neurons transmit', blank: 'impulses', top: '44%', left: '84%', rotate: 5, delay: 3 },
]

export function FloatingCards() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
      {CARDS.map((c) => (
        <div
          key={c.text}
          className="float-card absolute w-52 rounded-2xl border bg-card/60 p-4 text-sm shadow-lg backdrop-blur-sm"
          style={
            {
              top: c.top,
              left: c.left,
              '--r': `${c.rotate}deg`,
              animationDelay: `${c.delay}s`,
            } as React.CSSProperties
          }
        >
          <span className="text-muted-foreground">{c.text} </span>
          <span className="blank-pulse rounded-md bg-highlight px-1.5 font-semibold text-highlight-foreground">
            {c.blank}
          </span>
        </div>
      ))}
    </div>
  )
}
