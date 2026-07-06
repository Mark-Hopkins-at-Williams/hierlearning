export default function LinkSvg({ capPos, viewBox, fillPoints, strokePoints }) {
  return (
    <div className={`node__word__link__tab__${capPos}-cap`}>
      <svg viewBox={viewBox} preserveAspectRatio="none">
        <polyline points={fillPoints} className="node__word__link__tab__svg__fill" />
        <polyline points={strokePoints} className="node__word__link__tab__svg__stroke" />
      </svg>
    </div>
  )
}
