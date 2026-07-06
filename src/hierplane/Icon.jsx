export default function Icon({ symbol, wrapperClass }) {
  return (
    <svg className={`icon ${wrapperClass}`}>
      <use xlinkHref={`#icon__${symbol}`} />
    </svg>
  )
}
